import { describe, it, expect } from 'vitest';
import { redactSensitiveSql, REDACTED_PASSWORD_PLACEHOLDER } from './sqlSanitizer';

describe('redactSensitiveSql', () => {
  it('exports REDACTED_PASSWORD_PLACEHOLDER constant', () => {
    expect(REDACTED_PASSWORD_PLACEHOLDER).toBe('***REDACTED***');
  });

  it('returns empty string for null, undefined, or empty input', () => {
    expect(redactSensitiveSql('')).toBe('');
    // @ts-expect-error test invalid inputs
    expect(redactSensitiveSql(null)).toBe('');
    // @ts-expect-error test invalid inputs
    expect(redactSensitiveSql(undefined)).toBe('');
  });

  describe('IDENTIFIED BY redaction (MySQL / MariaDB / Oracle)', () => {
    it('redacts simple IDENTIFIED BY single-quoted passwords', () => {
      const sql = "CREATE USER 'alice'@'localhost' IDENTIFIED BY 'SuperSecret123!';";
      const expected = "CREATE USER 'alice'@'localhost' IDENTIFIED BY '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('redacts IDENTIFIED BY with double-quoted passwords', () => {
      const sql = 'CREATE USER "bob"@"%" IDENTIFIED BY "mypassword";';
      const expected = "CREATE USER \"bob\"@\"%\" IDENTIFIED BY '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('handles case-insensitivity in identified by', () => {
      const sql = "ALTER USER 'carol'@'localhost' identified by 'newpass456';";
      const expected = "ALTER USER 'carol'@'localhost' identified by '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('handles multi-line IDENTIFIED BY clauses', () => {
      const sql = `CREATE USER 'admin'@'localhost'
  IDENTIFIED BY
  'MultiLinePass!#';`;
      const expected = `CREATE USER 'admin'@'localhost'
  IDENTIFIED BY
  '***REDACTED***';`;
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('handles IDENTIFIED WITH auth_plugin BY password syntax', () => {
      const sql = "CREATE USER 'app'@'%' IDENTIFIED WITH mysql_native_password BY 'authpass';";
      const expected = "CREATE USER 'app'@'%' IDENTIFIED WITH mysql_native_password BY '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('handles IDENTIFIED BY PASSWORD hash syntax', () => {
      const sql = "GRANT ALL ON *.* TO 'user'@'%' IDENTIFIED BY PASSWORD '*HASH123456';";
      const expected = "GRANT ALL ON *.* TO 'user'@'%' IDENTIFIED BY PASSWORD '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('handles escaped quotes inside password', () => {
      const sql = "CREATE USER 'dev' IDENTIFIED BY 'p@ss\\'word''escaped';";
      const expected = "CREATE USER 'dev' IDENTIFIED BY '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });
  });

  describe('PASSWORD keyword redaction (Postgres / MySQL)', () => {
    it('redacts Postgres CREATE USER WITH PASSWORD', () => {
      const sql = "CREATE USER test_user WITH PASSWORD 'myPostgresSecret';";
      const expected = "CREATE USER test_user WITH PASSWORD '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('redacts Postgres ALTER ROLE WITH ENCRYPTED PASSWORD', () => {
      const sql = "ALTER ROLE reporting_role WITH ENCRYPTED PASSWORD 'topSecret99';";
      const expected = "ALTER ROLE reporting_role WITH ENCRYPTED PASSWORD '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('redacts Postgres CREATE ROLE PASSWORD without WITH', () => {
      const sql = "CREATE ROLE reader LOGIN PASSWORD 'reader_pass';";
      const expected = "CREATE ROLE reader LOGIN PASSWORD '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('redacts MySQL SET PASSWORD = ... syntax', () => {
      const sql = "SET PASSWORD = 'newrootpassword';";
      const expected = "SET PASSWORD = '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('redacts MySQL SET PASSWORD FOR user = ... syntax', () => {
      const sql = "SET PASSWORD FOR 'root'@'localhost' = 'rootpass123';";
      const expected = "SET PASSWORD FOR 'root'@'localhost' = '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('redacts PASSWORD() function notation', () => {
      const sql = "SELECT * FROM users WHERE pass_hash = PASSWORD('secret123');";
      const expected = "SELECT * FROM users WHERE pass_hash = PASSWORD('***REDACTED***');";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('handles multi-line PASSWORD clauses', () => {
      const sql = `ALTER USER db_admin
  WITH PASSWORD
  'LineBreakedPass!';`;
      const expected = `ALTER USER db_admin
  WITH PASSWORD
  '***REDACTED***';`;
      expect(redactSensitiveSql(sql)).toBe(expected);
    });
  });

  describe('PRAGMA key / rekey redaction (SQLite / SQLCipher)', () => {
    it('redacts PRAGMA key = ...', () => {
      const sql = "PRAGMA key = 'my_sqlcipher_key';";
      const expected = "PRAGMA key = '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('redacts PRAGMA rekey = ...', () => {
      const sql = "PRAGMA rekey = 'new_sqlcipher_key';";
      const expected = "PRAGMA rekey = '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('redacts PRAGMA key without spacing around =', () => {
      const sql = "PRAGMA key='tight_key';";
      const expected = "PRAGMA key = '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);
    });

    it('handles case-insensitivity for pragma key / rekey', () => {
      const sql = "pragma key = 'lowercase_pragma';";
      const expected = "pragma key = '***REDACTED***';";
      expect(redactSensitiveSql(sql)).toBe(expected);

      const sqlRekey = "pragma rekey = 'lowercase_rekey';";
      const expectedRekey = "pragma rekey = '***REDACTED***';";
      expect(redactSensitiveSql(sqlRekey)).toBe(expectedRekey);
    });

    it('redacts PRAGMA key with function parentheses notation', () => {
      const sql = "PRAGMA key('func_key');";
      const expected = "PRAGMA key('***REDACTED***');";
      expect(redactSensitiveSql(sql)).toBe(expected);

      const sqlRekey = "PRAGMA rekey('func_rekey');";
      const expectedRekey = "PRAGMA rekey('***REDACTED***');";
      expect(redactSensitiveSql(sqlRekey)).toBe(expectedRekey);
    });
  });

  describe('Multiple statements and unaffected queries', () => {
    it('redacts multiple statements with multiple passwords in a script', () => {
      const script = `CREATE USER 'user1'@'%' IDENTIFIED BY 'pass1';
CREATE USER 'user2'@'%' IDENTIFIED BY 'pass2';
PRAGMA key = 'key3';`;
      const result = redactSensitiveSql(script);
      expect(result).toContain("IDENTIFIED BY '***REDACTED***';");
      expect(result).not.toContain('pass1');
      expect(result).not.toContain('pass2');
      expect(result).not.toContain('key3');
      expect(result).toContain("PRAGMA key = '***REDACTED***';");
    });

    it('leaves safe standard queries completely untouched', () => {
      const queries = [
        'SELECT id, username, email FROM users WHERE status = 1;',
        "UPDATE accounts SET balance = balance + 100 WHERE account_no = 'ACC-001';",
        "INSERT INTO audit_events (action, details) VALUES ('LOGIN_ATTEMPT', 'User signed in');",
        'SELECT * FROM system_keys WHERE key_name = primary_key;',
      ];

      for (const q of queries) {
        expect(redactSensitiveSql(q)).toBe(q);
      }
    });

    it('is idempotent when re-run on already redacted queries', () => {
      const sql = "CREATE USER 'u'@'localhost' IDENTIFIED BY 'secret';";
      const redactedOnce = redactSensitiveSql(sql);
      expect(redactedOnce).toBe("CREATE USER 'u'@'localhost' IDENTIFIED BY '***REDACTED***';");
      const redactedTwice = redactSensitiveSql(redactedOnce);
      expect(redactedTwice).toBe(redactedOnce);
    });
  });
});
