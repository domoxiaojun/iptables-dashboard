//! The Executor trait & shared error type.

use async_trait::async_trait;
use ipt_core::Family;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IptablesBackend {
    /// /sbin/iptables-legacy — direct kernel xt_match interface.
    Legacy,
    /// /sbin/iptables-nft — nftables backend behind an iptables-compatible CLI.
    Nft,
}

impl IptablesBackend {
    pub fn as_str(&self) -> &'static str {
        match self {
            IptablesBackend::Legacy => "legacy",
            IptablesBackend::Nft => "nft",
        }
    }
}

#[derive(Debug, Error)]
pub enum ExecError {
    #[error("command `{cmd}` failed (exit code {code:?}): {stderr}")]
    NonZeroExit {
        cmd: String,
        code: Option<i32>,
        stderr: String,
    },
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("missing capability — the process is not allowed to manipulate netfilter ({0})")]
    MissingCapability(String),
    #[error("timed out after {0:?}")]
    Timeout(std::time::Duration),
    #[error("binary `{0}` not found in PATH")]
    BinaryNotFound(String),
}

/// What does the binary do — read-only or potentially mutating?
#[derive(Debug, Clone, Copy)]
pub enum Mode {
    ReadOnly,
    Mutating,
}

#[async_trait]
pub trait Executor: Send + Sync {
    /// Detect which iptables backend (legacy vs nft) is active on the target.
    async fn detect_backend(&self) -> Result<IptablesBackend, ExecError>;

    /// Verify that the process has the necessary capabilities to operate.
    async fn check_capabilities(&self) -> Result<(), ExecError>;

    /// Run `iptables-save` / `ip6tables-save` and return its full output.
    async fn save(&self, family: Family) -> Result<String, ExecError>;

    /// Feed a save dump to `iptables-restore` / `ip6tables-restore`. When
    /// `test_only` is true uses `--test` so nothing is committed.
    async fn restore(
        &self,
        family: Family,
        content: &str,
        test_only: bool,
    ) -> Result<(), ExecError>;

    /// Run an arbitrary iptables/ip6tables sub-command. Used by the
    /// safety subsystem for emergency reset scripts.
    async fn run(
        &self,
        family: Family,
        args: &[&str],
        mode: Mode,
    ) -> Result<String, ExecError>;
}
