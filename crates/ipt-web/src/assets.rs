//! Serve the embedded frontend bundle. In debug builds files are read from
//! disk so frontend hot-reload works; in release builds they're embedded.

use axum::body::Body;
use axum::http::{header, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "static"]
struct StaticAsset;

/// Handler for `GET /*path` — serves embedded files with SPA fallback.
pub async fn serve(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let candidate = if path.is_empty() { "index.html" } else { path };

    if let Some(file) = StaticAsset::get(candidate) {
        return build_response(candidate, file.data.as_ref());
    }

    // SPA fallback — anything not matching an asset returns index.html so
    // client-side routes work on direct navigation.
    if let Some(file) = StaticAsset::get("index.html") {
        return build_response("index.html", file.data.as_ref());
    }

    (StatusCode::NOT_FOUND, "frontend bundle missing").into_response()
}

fn build_response(path: &str, bytes: &[u8]) -> Response {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let mut resp = Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            HeaderValue::from_str(mime.essence_str()).unwrap(),
        )
        .body(Body::from(bytes.to_vec()))
        .unwrap();
    if path != "index.html" {
        resp.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=86400"),
        );
    } else {
        resp.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-cache"),
        );
    }
    resp
}
