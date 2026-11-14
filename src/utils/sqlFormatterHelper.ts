import { format, type SqlLanguage } from 'sql-formatter';

/**
 * Maps DataCore database driver to sql-formatter dialect language.
 */
export function mapDriverToSqlLanguage(driver?: string): SqlLanguage {
  const d = (driver || '').toLowerCase();
  if (d.includes('postgres')) return 'postgresql';
  if (d.includes('mysql') || d.includes('mariadb')) return 'mysql';
  if (d.includes('sqlite')) return 'sqlite';
  return 'sql';
}

/**
 * Formats a SQL query string using sql-formatter with uppercase keywords and standardized indentation.
 */
export function formatSql(sql: string, driver?: string): string {
  if (!sql || !sql.trim()) {
    return sql;
  }

  const language = mapDriverToSqlLanguage(driver);

  try {
    return format(sql, {
      language,
      tabWidth: 2,
      keywordCase: 'upper',
      linesBetweenQueries: 2,
    });
  } catch (err) {
    console.warn('sql-formatter failed to format query, returning original SQL:', err);
    return sql;
  }
}
