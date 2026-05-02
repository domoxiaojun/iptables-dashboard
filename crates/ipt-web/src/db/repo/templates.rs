use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateRecord {
    pub id: i64,
    pub name: String,
    pub category: Option<String>,
    pub description: Option<String>,
    pub rules_json: String,
    pub built_in: bool,
}

fn from_row(row: SqliteRow) -> TemplateRecord {
    let bi: i64 = row.get("built_in");
    TemplateRecord {
        id: row.get("id"),
        name: row.get("name"),
        category: row.get("category"),
        description: row.get("description"),
        rules_json: row.get("rules_json"),
        built_in: bi != 0,
    }
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<TemplateRecord>, sqlx::Error> {
    let rows = sqlx::query("SELECT * FROM templates ORDER BY built_in DESC, name ASC")
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(from_row).collect())
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Option<TemplateRecord>, sqlx::Error> {
    let row = sqlx::query("SELECT * FROM templates WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(from_row))
}

pub async fn create(
    pool: &SqlitePool,
    name: &str,
    category: Option<&str>,
    description: Option<&str>,
    rules_json: &str,
    built_in: bool,
) -> Result<i64, sqlx::Error> {
    let r = sqlx::query(
        "INSERT INTO templates (name, category, description, rules_json, built_in)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(name)
    .bind(category)
    .bind(description)
    .bind(rules_json)
    .bind(if built_in { 1 } else { 0 })
    .execute(pool)
    .await?;
    Ok(r.last_insert_rowid())
}

/// Insert built-in templates if they don't yet exist (idempotent by name).
pub async fn seed_builtin(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let _ = Utc::now(); // touch
    for t in crate::templates_builtin::all() {
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT id FROM templates WHERE name = ? AND built_in = 1")
                .bind(t.name)
                .fetch_optional(pool)
                .await?;
        if row.is_none() {
            create(
                pool,
                t.name,
                Some(t.category),
                Some(t.description),
                t.rules_json,
                true,
            )
            .await?;
        }
    }
    Ok(())
}
