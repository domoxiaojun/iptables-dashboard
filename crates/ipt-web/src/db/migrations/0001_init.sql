-- 0001_init.sql — initial schema for iptables-dashboard.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    created_at      INTEGER NOT NULL,
    last_login_at   INTEGER
);

CREATE TABLE IF NOT EXISTS snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  INTEGER NOT NULL,
    label       TEXT    NOT NULL,
    author      TEXT    NOT NULL,
    v4_save     TEXT    NOT NULL,
    v6_save     TEXT    NOT NULL,
    kind        TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    category    TEXT,
    description TEXT,
    rules_json  TEXT    NOT NULL,
    built_in    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            INTEGER NOT NULL,
    user          TEXT    NOT NULL,
    action        TEXT    NOT NULL,
    target        TEXT,
    details_json  TEXT,
    result        TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);

CREATE TABLE IF NOT EXISTS pending_apply (
    token            TEXT PRIMARY KEY,
    user             TEXT NOT NULL,
    pre_snapshot_id  INTEGER NOT NULL,
    expires_at       INTEGER NOT NULL,
    FOREIGN KEY(pre_snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS login_attempts (
    ip          TEXT NOT NULL,
    ts          INTEGER NOT NULL,
    success     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_ts ON login_attempts(ip, ts DESC);
