//! Configuration loading: defaults < TOML file < environment variables.

use figment::providers::{Env, Format, Serialized, Toml};
use figment::Figment;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub server: ServerConfig,
    pub paths: PathsConfig,
    pub security: SecurityConfig,
    pub logging: LoggingConfig,
    pub bootstrap: BootstrapConfig,
    pub cors: CorsConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            paths: PathsConfig::default(),
            security: SecurityConfig::default(),
            logging: LoggingConfig::default(),
            bootstrap: BootstrapConfig::default(),
            cors: CorsConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub listen: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            listen: "0.0.0.0:7642".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PathsConfig {
    pub data_dir: PathBuf,
}

impl Default for PathsConfig {
    fn default() -> Self {
        Self {
            data_dir: PathBuf::from("/var/lib/iptables-dashboard"),
        }
    }
}

impl PathsConfig {
    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join("data.sqlite")
    }
    pub fn pending_path(&self) -> PathBuf {
        self.data_dir.join("pending.json")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SecurityConfig {
    pub two_step_seconds: u64,
    pub max_login_attempts: u32,
    pub lockout_seconds: u64,
    /// IPs whose `X-Forwarded-For` header is trusted as the real client IP.
    /// Brute-force protection picks the right-most entry from connections
    /// whose ConnectInfo IP appears here. Empty = trust nobody.
    #[serde(default)]
    pub trusted_proxies: Vec<String>,
    /// IP allow-list for the entire HTTP surface. Each entry can be an
    /// exact IP (`10.0.0.5`) or a CIDR (`192.168.1.0/24`). Empty = allow
    /// every source (the conservative default keeps existing deployments
    /// unchanged after upgrade). The check runs **after** trusted-proxy
    /// resolution so the real client IP from `X-Forwarded-For` is what's
    /// matched, not the proxy peer.
    #[serde(default)]
    pub allowed_ips: Vec<String>,
    /// Session idle timeout in seconds. Users with no activity for this
    /// duration will be logged out. Default: 8 hours (28800s).
    #[serde(default = "default_session_idle")]
    pub session_idle_seconds: u64,
    /// Maximum write API requests per minute per IP. 0 = disabled.
    /// Default: 120.
    #[serde(default = "default_rate_limit")]
    pub api_rate_limit: u32,
}

fn default_session_idle() -> u64 {
    28800 // 8 hours
}

fn default_rate_limit() -> u32 {
    120
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            two_step_seconds: 30,
            max_login_attempts: 5,
            lockout_seconds: 900,
            trusted_proxies: Vec::new(),
            allowed_ips: Vec::new(),
            session_idle_seconds: default_session_idle(),
            api_rate_limit: default_rate_limit(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CorsConfig {
    /// Origins allowed to send credentialed cross-site requests.
    /// Default: empty (same-origin only).
    pub allowed_origins: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String,
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: "info".into(),
            format: "compact".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BootstrapConfig {
    pub username: String,
    /// Plaintext default password — only used when IPTD_BOOTSTRAP_PASSWORD
    /// is unset. Leaving this empty (the recommended default) causes the
    /// server to auto-generate a random 32-char initial password on first
    /// run and write it to `${IPTD_DATA_DIR}/initial-admin-password.txt`.
    pub password: String,
}

impl Default for BootstrapConfig {
    fn default() -> Self {
        Self {
            username: "admin".into(),
            // Empty triggers the auto-generated random-password path in
            // `bootstrap_admin`. Setting "changeme" here would be insecure
            // by default for users who forget to override the env var.
            password: String::new(),
        }
    }
}

impl Config {
    /// Load config in this order: built-in defaults < TOML at `path`
    /// (if present) < environment variables prefixed `IPTD_`.
    pub fn load(path: Option<&std::path::Path>) -> Result<Self, figment::Error> {
        let mut fig = Figment::from(Serialized::defaults(Config::default()));
        if let Some(p) = path {
            if p.exists() {
                fig = fig.merge(Toml::file(p));
            }
        }
        fig = fig.merge(Env::prefixed("IPTD_").split("__"));
        fig.extract()
    }
}
