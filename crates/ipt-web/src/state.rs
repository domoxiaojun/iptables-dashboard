//! Shared application state passed to every handler.

use crate::config::Config;
use crate::safety::TwoPhaseManager;
use crate::stats::StatsBroadcaster;
use ipt_core::{parse_save, Family, ParsedSave};
use ipt_executor::Executor;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: Arc<Config>,
    pub executor: Arc<dyn Executor>,
    pub two_phase: Arc<TwoPhaseManager>,
    pub stats: Arc<StatsBroadcaster>,
    /// Short-TTL cache for the parsed rule sets. Many UIs poll `/rules`
    /// every few seconds; without this each poll forks iptables-save +
    /// reparses several KB of text. See [`RulesCache::get_or_fetch`].
    pub rules_cache: RulesCache,
}

#[derive(Clone, Default)]
pub struct RulesCache {
    inner: Arc<RwLock<HashMap<Family, CachedRules>>>,
}

#[derive(Clone)]
struct CachedRules {
    parsed: ParsedSave,
    fetched_at: Instant,
}

impl RulesCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Return cached `ParsedSave` if it's younger than `ttl`; otherwise
    /// re-spawn iptables-save and re-parse. Single-flight is intentionally
    /// not enforced — for the brief expiry window a couple of duplicate
    /// fetches is cheaper than a global Mutex serializing all reads.
    pub async fn get_or_fetch(
        &self,
        family: Family,
        executor: &Arc<dyn Executor>,
        ttl: Duration,
    ) -> Result<ParsedSave, crate::error::AppError> {
        let now = Instant::now();
        {
            let read = self.inner.read().await;
            if let Some(cached) = read.get(&family) {
                if now.duration_since(cached.fetched_at) < ttl {
                    return Ok(cached.parsed.clone());
                }
            }
        }
        let dump = executor.save(family).await?;
        let parsed = parse_save(&dump, family)?;
        let mut write = self.inner.write().await;
        write.insert(
            family,
            CachedRules {
                parsed: parsed.clone(),
                fetched_at: now,
            },
        );
        Ok(parsed)
    }

    pub async fn invalidate(&self, family: Family) {
        self.inner.write().await.remove(&family);
    }

    pub async fn invalidate_all(&self) {
        self.inner.write().await.clear();
    }
}
