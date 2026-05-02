//! Counter polling + SSE broadcast.

use ipt_core::{parse_save, Family};
use ipt_executor::Executor;
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::Duration;

#[derive(Debug, Clone, Serialize)]
pub struct CounterSample {
    pub ts: i64,
    pub family: Family,
    pub table: String,
    pub chain: String,
    pub seq: u32,
    pub packets: u64,
    pub bytes: u64,
}

pub struct StatsBroadcaster {
    tx: broadcast::Sender<CounterSample>,
}

impl StatsBroadcaster {
    pub fn start(executor: Arc<dyn Executor>, period: Duration) -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(1024);
        let me = Arc::new(Self { tx: tx.clone() });
        let me_clone = Arc::clone(&me);
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(period);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                ticker.tick().await;
                if let Err(e) = me_clone.tick(&executor).await {
                    tracing::debug!(error = %e, "stats tick failed");
                }
            }
        });
        me
    }

    async fn tick(&self, executor: &Arc<dyn Executor>) -> Result<(), Box<dyn std::error::Error>> {
        for family in [Family::V4, Family::V6] {
            let dump = match executor.save(family).await {
                Ok(s) => s,
                Err(_) => continue,
            };
            let parsed = match parse_save(&dump, family) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let ts = chrono::Utc::now().timestamp();
            for (kind, table) in &parsed.tables {
                for r in &table.rules {
                    if let Some(c) = r.counters {
                        let sample = CounterSample {
                            ts,
                            family,
                            table: kind.to_string(),
                            chain: r.chain.clone(),
                            seq: r.seq,
                            packets: c.packets,
                            bytes: c.bytes,
                        };
                        let _ = self.tx.send(sample);
                    }
                }
            }
        }
        Ok(())
    }

    pub fn subscribe(&self) -> broadcast::Receiver<CounterSample> {
        self.tx.subscribe()
    }

    /// Take a single counter snapshot synchronously (one-shot endpoint).
    pub async fn snapshot(executor: &Arc<dyn Executor>) -> Vec<CounterSample> {
        let mut out = Vec::new();
        let ts = chrono::Utc::now().timestamp();
        for family in [Family::V4, Family::V6] {
            let dump = match executor.save(family).await {
                Ok(s) => s,
                Err(_) => continue,
            };
            let parsed = match parse_save(&dump, family) {
                Ok(p) => p,
                Err(_) => continue,
            };
            for (kind, table) in &parsed.tables {
                for r in &table.rules {
                    if let Some(c) = r.counters {
                        out.push(CounterSample {
                            ts,
                            family,
                            table: kind.to_string(),
                            chain: r.chain.clone(),
                            seq: r.seq,
                            packets: c.packets,
                            bytes: c.bytes,
                        });
                    }
                }
            }
        }
        out
    }
}
