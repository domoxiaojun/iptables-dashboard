//! Unified error type that maps cleanly to HTTP responses.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Exec(#[from] ipt_executor::ExecError),

    #[error(transparent)]
    Parse(#[from] ipt_core::ParseError),

    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error("unauthorized")]
    Unauthorized,

    #[error("forbidden")]
    Forbidden,

    #[error("not found: {0}")]
    NotFound(String),

    #[error("validation: {0}")]
    Validation(String),

    /// Validation failure with structured per-field error messages so the
    /// frontend can call react-hook-form's `setError(field, ...)` directly.
    #[error("validation failed")]
    #[allow(dead_code)]
    FieldValidation {
        message: String,
        field_errors: HashMap<String, String>,
    },

    #[error("guard: {0}")]
    Guard(String),

    #[error("safety lock active — finish or abort the pending apply first")]
    SafetyLock,

    /// Optimistic-concurrency / TOCTOU mismatch. The kernel ruleset has
    /// changed between preview and apply; the caller must re-preview.
    #[error("conflict: {0}")]
    Conflict(String),

    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Debug, Serialize)]
struct ApiError {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    field_errors: Option<HashMap<String, String>>,
}

impl AppError {
    fn status_and_code(&self) -> (StatusCode, &'static str) {
        match self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Validation(_) => (StatusCode::BAD_REQUEST, "validation"),
            AppError::FieldValidation { .. } => (StatusCode::BAD_REQUEST, "field_validation"),
            AppError::Guard(_) => (StatusCode::FORBIDDEN, "guard"),
            AppError::SafetyLock => (StatusCode::CONFLICT, "safety_lock"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            AppError::Parse(_) => (StatusCode::BAD_REQUEST, "parse"),
            AppError::Exec(ipt_executor::ExecError::MissingCapability(_)) => {
                (StatusCode::FORBIDDEN, "missing_capability")
            }
            AppError::Exec(ipt_executor::ExecError::BinaryNotFound(_)) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "binary_not_found")
            }
            AppError::Exec(_) => (StatusCode::INTERNAL_SERVER_ERROR, "exec_failure"),
            AppError::Sqlx(_) => (StatusCode::INTERNAL_SERVER_ERROR, "db_error"),
            AppError::Io(_) => (StatusCode::INTERNAL_SERVER_ERROR, "io_error"),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = self.status_and_code();
        if status.is_server_error() {
            tracing::error!(error = %self, "server error");
        } else {
            tracing::debug!(error = %self, "client error");
        }
        let (message, field_errors) = match &self {
            AppError::FieldValidation { message, field_errors } => {
                (message.clone(), Some(field_errors.clone()))
            }
            other => (other.to_string(), None),
        };
        let body = Json(ApiError {
            code,
            message,
            field_errors,
        });
        (status, body).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
