//! ipt-executor — abstraction over running iptables/ip6tables commands.
//!
//! Two implementations are planned:
//! - [`local::LocalExec`]: spawn `iptables-save` / `iptables-restore` etc. via
//!   `tokio::process::Command` against the local kernel netfilter.
//! - `SshExec` (future): ship the same commands over SSH for centralized
//!   multi-host management.
//!
//! Anything that touches the kernel goes through this abstraction so the rest
//! of the codebase remains testable without privileges.

pub mod executor;
pub mod local;

pub use executor::{ExecError, Executor, IptablesBackend, Mode};
pub use local::LocalExec;
