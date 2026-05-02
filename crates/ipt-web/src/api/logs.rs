//! Firewall log SSE stream.
//!
//! We tail kernel-level log output and forward only lines that contain
//! iptables-related keywords. NFLOG via `libnetfilter_log` is more
//! structured but pulls in a Linux-only dependency; that is left for a
//! follow-up.
//!
//! Source selection at runtime:
//! 1. Prefer `journalctl -kf` when available — it gives accurate ISO
//!    timestamps and survives kernel ring-buffer wrap.
//! 2. Fall back to `dmesg --follow` — works in minimal containers (Alpine)
//!    that don't have journald.
//! 3. If neither is available the stream is empty (still keeps the SSE
//!    connection open so the UI's "实时" badge can render).

use axum::extract::State;
use axum::response::sse::{Event, KeepAlive, Sse};
use futures::stream::Stream;
use std::convert::Infallible;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;

use crate::state::AppState;

pub async fn stream(
    State(_app): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let (tx, rx) = mpsc::channel::<String>(256);

    tokio::spawn(async move {
        // Try journalctl first; on failure try dmesg. We deliberately do
        // NOT run both in parallel because they read the same kernel ring
        // buffer and would emit duplicates.
        let (mut child, source) = match spawn_journalctl() {
            Some(c) => (c, "journalctl"),
            None => match spawn_dmesg() {
                Some(c) => (c, "dmesg"),
                None => {
                    tracing::warn!(
                        "neither journalctl nor dmesg --follow is available; \
                         log stream will be empty"
                    );
                    return;
                }
            },
        };
        tracing::debug!(source, "log tailer started");

        let Some(stdout) = child.stdout.take() else {
            return;
        };
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if !is_iptables_line(&line) {
                continue;
            }
            if tx.send(line).await.is_err() {
                break;
            }
        }
    });

    let stream = ReceiverStream::new(rx)
        .map(|line| Ok::<Event, Infallible>(Event::default().event("log").data(line)));
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

fn spawn_journalctl() -> Option<Child> {
    Command::new("journalctl")
        .args([
            "-k",            // kernel messages
            "-f",            // follow
            "--no-pager",
            "-o",
            "short-iso",
            "--since",
            "now",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

fn spawn_dmesg() -> Option<Child> {
    Command::new("dmesg")
        .args(["--follow", "--time-format", "iso"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

fn is_iptables_line(line: &str) -> bool {
    line.contains("iptables") || line.contains("ip_tables") || line.contains("nf_tables")
}
