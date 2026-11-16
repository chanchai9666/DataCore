import { describe, it, expect } from 'vitest';
import {
  sanitizeConnections,
  gatherSystemInfo,
  generateDiagnosticBundle,
} from './diagnosticBundle';
import type { ConnectionConfig } from '../types/db';

describe('diagnosticBundle', () => {
  const mockConnections: ConnectionConfig[] = [
    {
      id: 'conn-1',
      name: 'Prod Postgres',
      driver: 'postgres',
      database: 'customer_db',
      host: '10.0.0.12',
      port: 5432,
      user: 'admin_user',
      read_only: false,
      ssl_mode: 'verify-full',
      ssh_tunnel: {
        enabled: true,
        host: 'bastion.internal',
        port: 22,
        user: 'tunnel_user',
        passphrase: 'SUPER_SECRET_PASSPHRASE',
        private_key_path: '/path/to/key',
      },
    },
    {
      id: 'conn-2',
      name: 'Local DuckDB',
      driver: 'duckdb',
      database: '/Users/secretuser/private_data.duckdb',
    },
  ];

  it('sanitizes connection credentials and redacts local file paths and passwords', () => {
    const sanitized = sanitizeConnections(mockConnections);
    expect(sanitized).toHaveLength(2);

    // Postgres check
    expect(sanitized[0].name).toBe('Prod Postgres');
    expect(sanitized[0].hasSshTunnel).toBe(true);
    // Assure secret passphrase, key path, and user credentials are NOT in sanitized output
    expect((sanitized[0] as any).user).toBeUndefined();
    expect((sanitized[0] as any).password).toBeUndefined();
    expect((sanitized[0] as any).passphrase).toBeUndefined();
    expect((sanitized[0] as any).ssh_tunnel).toBeUndefined();

    // Local Duckdb check
    expect(sanitized[1].database).toBe('[LOCAL_DATABASE_FILE]');
    expect(sanitized[1].driver).toBe('duckdb');
  });

  it('gathers system info with platform, timezone and app version', () => {
    const info = gatherSystemInfo('1.2.3');
    expect(info.appVersion).toBe('1.2.3');
    expect(info.timestamp).toBeTruthy();
    expect(info.timezone).toBeTruthy();
  });

  it('generates complete diagnostic bundle with metadata', () => {
    const bundle = generateDiagnosticBundle({
      appVersion: '0.1.0',
      connections: mockConnections,
      activeConnectionId: 'conn-1',
      activeTabsCount: 3,
    });

    expect(bundle.app.name).toBe('DataCore');
    expect(bundle.app.version).toBe('0.1.0');
    expect(bundle.activeConnectionId).toBe('conn-1');
    expect(bundle.activeTabsCount).toBe(3);
    expect(bundle.connections).toHaveLength(2);
    expect(bundle.system.platform).toBeTruthy();
  });
});
