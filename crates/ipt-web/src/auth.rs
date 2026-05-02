//! axum-login backend implementation backed by the SQLite users table.

use crate::db::repo::users::{self, UserRecord};
use async_trait::async_trait;
use axum_login::{AuthUser, AuthnBackend, UserId};
use password_auth::{generate_hash, verify_password, VerifyError};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::fmt;

#[derive(Clone, Serialize, Deserialize)]
pub struct AuthUserModel {
    pub id: i64,
    pub username: String,
    /// Bytes hashed once and reused as session_auth_hash.
    #[serde(skip)]
    pub password_hash: String,
    /// True for users bootstrapped with a random initial password —
    /// blocks all write operations until they change it.
    #[serde(default)]
    pub must_change_password: bool,
}

impl fmt::Debug for AuthUserModel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AuthUserModel")
            .field("id", &self.id)
            .field("username", &self.username)
            .field("password_hash", &"<redacted>")
            .field("must_change_password", &self.must_change_password)
            .finish()
    }
}

impl From<UserRecord> for AuthUserModel {
    fn from(u: UserRecord) -> Self {
        Self {
            id: u.id,
            username: u.username,
            password_hash: u.password_hash,
            must_change_password: u.must_change_password,
        }
    }
}

impl AuthUser for AuthUserModel {
    type Id = i64;
    fn id(&self) -> Self::Id {
        self.id
    }
    fn session_auth_hash(&self) -> &[u8] {
        self.password_hash.as_bytes()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Credentials {
    pub username: String,
    pub password: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("password verify error: {0}")]
    Verify(String),
}

#[derive(Clone)]
pub struct AuthBackend {
    pub pool: SqlitePool,
}

impl AuthBackend {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl AuthnBackend for AuthBackend {
    type User = AuthUserModel;
    type Credentials = Credentials;
    type Error = AuthError;

    async fn authenticate(
        &self,
        creds: Self::Credentials,
    ) -> Result<Option<Self::User>, Self::Error> {
        let Some(user) = users::find_by_username(&self.pool, &creds.username).await? else {
            // Run a verify against a dummy hash to keep timing roughly equal.
            let _ = verify_password(&creds.password, &generate_hash("dummy"));
            return Ok(None);
        };
        match verify_password(&creds.password, &user.password_hash) {
            Ok(()) => Ok(Some(user.into())),
            Err(VerifyError::PasswordInvalid) => Ok(None),
            Err(e) => Err(AuthError::Verify(e.to_string())),
        }
    }

    async fn get_user(&self, id: &UserId<Self>) -> Result<Option<Self::User>, Self::Error> {
        Ok(users::find_by_id(&self.pool, *id).await?.map(Into::into))
    }
}

pub type AuthSession = axum_login::AuthSession<AuthBackend>;

/// argon2 password hashing wrapper exposed for the bootstrap flow.
pub fn hash_password(plain: &str) -> String {
    generate_hash(plain)
}

/// Reject the request when the authenticated user still has the
/// `must_change_password` flag set. Call this at the top of every write
/// endpoint other than `change_password` itself.
pub fn require_password_changed(user: &AuthUserModel) -> Result<(), crate::error::AppError> {
    if user.must_change_password {
        Err(crate::error::AppError::Forbidden)
    } else {
        Ok(())
    }
}
