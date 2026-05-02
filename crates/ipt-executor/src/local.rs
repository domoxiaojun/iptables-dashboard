//! Local implementation of [`Executor`] that drives the host's
//! iptables/ip6tables binaries via `tokio::process::Command`.

use crate::executor::{ExecError, Executor, IptablesBackend, Mode};
use async_trait::async_trait;
use ipt_core::Family;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Debug, Clone)]
pub struct LocalExec {
    /// Optional override for the iptables binary path. By default the
    /// process searches PATH and assumes the runtime image has aligned the
    /// symlinks (see `docker/entrypoint.sh`).
    pub iptables_path: Option<String>,
    pub ip6tables_path: Option<String>,
    pub command_timeout: Duration,
    pub backend_hint: Option<IptablesBackend>,
}

impl Default for LocalExec {
    fn default() -> Self {
        Self {
            iptables_path: None,
            ip6tables_path: None,
            command_timeout: Duration::from_secs(15),
            backend_hint: None,
        }
    }
}

impl LocalExec {
    pub fn new() -> Self {
        Self::default()
    }

    fn resolve_save(&self, family: Family) -> &str {
        match family {
            Family::V4 => "iptables-save",
            Family::V6 => "ip6tables-save",
        }
    }

    fn resolve_restore(&self, family: Family) -> &str {
        match family {
            Family::V4 => "iptables-restore",
            Family::V6 => "ip6tables-restore",
        }
    }

    fn resolve_cli(&self, family: Family) -> &str {
        match family {
            Family::V4 => self.iptables_path.as_deref().unwrap_or(family.cli()),
            Family::V6 => self.ip6tables_path.as_deref().unwrap_or(family.cli()),
        }
    }

    async fn run_command(
        &self,
        program: &str,
        args: &[&str],
        stdin: Option<&str>,
    ) -> Result<String, ExecError> {
        let mut cmd = Command::new(program);
        cmd.args(args);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        if stdin.is_some() {
            cmd.stdin(Stdio::piped());
        }

        let cmd_label = format!("{} {}", program, args.join(" "));

        let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ExecError::BinaryNotFound(program.into())
            } else {
                ExecError::Io(e)
            }
        })?;

        if let Some(input) = stdin {
            if let Some(mut stdin_pipe) = child.stdin.take() {
                stdin_pipe
                    .write_all(input.as_bytes())
                    .await
                    .map_err(ExecError::Io)?;
                drop(stdin_pipe);
            }
        }

        let output = match timeout(self.command_timeout, child.wait_with_output()).await {
            Ok(r) => r.map_err(ExecError::Io)?,
            Err(_) => return Err(ExecError::Timeout(self.command_timeout)),
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
            // Surface a friendlier error for the common "not enough capability" case.
            if stderr.contains("Permission denied")
                || stderr.contains("you must be root")
                || stderr.contains("Operation not permitted")
            {
                return Err(ExecError::MissingCapability(stderr));
            }
            return Err(ExecError::NonZeroExit {
                cmd: cmd_label,
                code: output.status.code(),
                stderr,
            });
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }
}

#[async_trait]
impl Executor for LocalExec {
    async fn detect_backend(&self) -> Result<IptablesBackend, ExecError> {
        if let Some(hint) = self.backend_hint {
            return Ok(hint);
        }
        // Heuristic: ask iptables-save for output and inspect the first line.
        let out = match self.run_command("iptables-save", &[], None).await {
            Ok(s) => s,
            Err(_) => {
                // iptables-save unavailable; try iptables --version
                let v = self.run_command("iptables", &["--version"], None).await?;
                if v.contains("nf_tables") {
                    return Ok(IptablesBackend::Nft);
                }
                return Ok(IptablesBackend::Legacy);
            }
        };
        let first = out.lines().next().unwrap_or("");
        if first.contains("xtables") || first.contains("nf_tables") {
            Ok(IptablesBackend::Nft)
        } else {
            Ok(IptablesBackend::Legacy)
        }
    }

    async fn check_capabilities(&self) -> Result<(), ExecError> {
        // A quick read-only iptables-save attempt is the cheapest and most
        // accurate capability check.
        match self.run_command("iptables-save", &[], None).await {
            Ok(_) => Ok(()),
            Err(ExecError::MissingCapability(m)) => Err(ExecError::MissingCapability(m)),
            Err(ExecError::BinaryNotFound(n)) => Err(ExecError::BinaryNotFound(n)),
            // some environments allow read but not write; treat any other
            // error as missing capability for safety.
            Err(e) => Err(ExecError::MissingCapability(format!(
                "iptables-save probe failed: {e}"
            ))),
        }
    }

    async fn save(&self, family: Family) -> Result<String, ExecError> {
        self.run_command(self.resolve_save(family), &[], None).await
    }

    async fn restore(
        &self,
        family: Family,
        content: &str,
        test_only: bool,
    ) -> Result<(), ExecError> {
        let mut args = vec!["--noflush"];
        if test_only {
            args.push("--test");
        }
        // also accept counter prefixes when present
        args.push("--counters");
        let _ = self
            .run_command(self.resolve_restore(family), &args, Some(content))
            .await?;
        Ok(())
    }

    async fn run(
        &self,
        family: Family,
        args: &[&str],
        _mode: Mode,
    ) -> Result<String, ExecError> {
        self.run_command(self.resolve_cli(family), args, None).await
    }
}
