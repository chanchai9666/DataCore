use crate::drivers::DatabaseConnection;
use crate::error::AppError;
use crate::models::transfer::DuplicateTableOptions;
use crate::models::{CellValue, DatabaseDriver};

pub async fn duplicate_table_impl(
    conn: &dyn DatabaseConnection,
    driver: DatabaseDriver,
    options: &DuplicateTableOptions,
) -> Result<(), AppError> {
    let source = &options.source_table;
    let target = &options.new_table_name;

    if source.trim().is_empty() {
        return Err(AppError::Other(
            "Source table name cannot be empty".to_string(),
        ));
    }
    if target.trim().is_empty() {
        return Err(AppError::Other(
            "Target table name cannot be empty".to_string(),
        ));
    }
    if source.trim() == target.trim() {
        return Err(AppError::Other(
            "Target table name must be different from source table name".to_string(),
        ));
    }

    match driver {
        DatabaseDriver::Sqlite => {
            // Retrieve source table DDL from sqlite_schema to preserve PK and constraint definitions
            let schema_query = format!(
                "SELECT sql FROM sqlite_schema WHERE type='table' AND name = '{}';",
                source.replace('\'', "''")
            );
            let result = conn.execute_query(&schema_query).await?;

            let mut ddl_opt = None;
            for row in &result.rows {
                if let Some(CellValue::Text(s)) = row.first() {
                    ddl_opt = Some(s.clone());
                    break;
                }
            }

            let ddl = match ddl_opt {
                Some(sql) => sql,
                None => {
                    return Err(AppError::NotFound(format!(
                        "Source table '{}' does not exist",
                        source
                    )));
                }
            };

            // Replace table name in DDL: CREATE TABLE "source" or CREATE TABLE `source` or CREATE TABLE source
            let source_escaped_quote = format!("\"{}\"", source);
            let target_escaped_quote = format!("\"{}\"", target);

            let new_ddl = if ddl.contains(&source_escaped_quote) {
                ddl.replacen(&source_escaped_quote, &target_escaped_quote, 1)
            } else {
                let source_escaped_backtick = format!("`{}`", source);
                let target_escaped_backtick = format!("`{}`", target);
                if ddl.contains(&source_escaped_backtick) {
                    ddl.replacen(&source_escaped_backtick, &target_escaped_backtick, 1)
                } else {
                    ddl.replacen(source, target, 1)
                }
            };

            conn.execute_query(&new_ddl).await?;

            if options.copy_data {
                let copy_sql = format!(
                    "INSERT INTO \"{}\" SELECT * FROM \"{}\";",
                    target.replace('"', "\"\""),
                    source.replace('"', "\"\"")
                );
                conn.execute_query(&copy_sql).await?;
            }
        }
        DatabaseDriver::Mysql => {
            let schema_prefix = match &options.schema {
                Some(s) if !s.is_empty() => format!("`{}`.", s.replace('`', "``")),
                _ => String::new(),
            };

            let create_sql = format!(
                "CREATE TABLE {schema_prefix}`{}` LIKE {schema_prefix}`{}`;",
                target.replace('`', "``"),
                source.replace('`', "``")
            );

            conn.execute_query(&create_sql).await?;

            if options.copy_data {
                let copy_sql = format!(
                    "INSERT INTO {schema_prefix}`{}` SELECT * FROM {schema_prefix}`{}`;",
                    target.replace('`', "``"),
                    source.replace('`', "``")
                );
                conn.execute_query(&copy_sql).await?;
            }
        }
        DatabaseDriver::Postgres => {
            let schema_name = options
                .schema
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("public");

            let escaped_schema = schema_name.replace('"', "\"\"");
            let escaped_source = source.replace('"', "\"\"");
            let escaped_target = target.replace('"', "\"\"");

            let create_sql = format!(
                "CREATE TABLE \"{}\".\"{}\" (LIKE \"{}\".\"{}\" INCLUDING ALL);",
                escaped_schema, escaped_target, escaped_schema, escaped_source
            );

            conn.execute_query(&create_sql).await?;

            if options.copy_data {
                let copy_sql = format!(
                    "INSERT INTO \"{}\".\"{}\" SELECT * FROM \"{}\".\"{}\";",
                    escaped_schema, escaped_target, escaped_schema, escaped_source
                );
                conn.execute_query(&copy_sql).await?;
            }
        }
    }

    Ok(())
}
