//! Counters one-shot + SSE stream.

use crate::error::AppResult;
use crate::state::AppState;
use axum::extract::State;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::Json;
use futures::stream::Stream;
use std::convert::Infallible;
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

pub async fn counters_now(
    State(app): State<AppState>,
) -> AppResult<Json<Vec<crate::stats::CounterSample>>> {
    Ok(Json(crate::stats::StatsBroadcaster::snapshot(&app.executor).await))
}

pub async fn stream(
    State(app): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = app.stats.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| {
        let sample = res.ok()?;
        let payload = serde_json::to_string(&sample).ok()?;
        Some(Ok::<Event, Infallible>(
            Event::default().event("counter").data(payload),
        ))
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
