import type { ConnectionConfig } from '../types/db';

export interface SystemInfo {
  platform: string;
  userAgent: string;
  appVersion: string;
  timestamp: string;
  timezone: string;
  screenResolution: string;
}

export interface SanitizedConnection {
  id: string;
  name: string;
  driver: string;
  database: string;
  host?: string;
  port?: number;
  environment?: string;
  readOnly?: boolean;
  sslMode?: string;
  hasSshTunnel: boolean;
  hasSslCerts: boolean;
}

export interface DiagnosticBundle {
  generatedAt: string;
  app: {
    name: string;
    version: string;
  };
  system: SystemInfo;
  connections: SanitizedConnection[];
  activeConnectionId: string | null;
  activeTabsCount: number;
}

/**
 * Sanitizes connection configs to ensure NO passwords, tokens, private keys,
 * or secret phrases can ever leak into the diagnostic bundle.
 */
export function sanitizeConnections(connections: ConnectionConfig[] = []): SanitizedConnection[] {
  return (connections || []).map((c) => {
    const hasSsh = Boolean(c.ssh_tunnel?.enabled || c.sshTunnel?.enabled);
    const sslCerts = c.ssl_certs || c.sslCerts;
    const hasSsl = Boolean(sslCerts?.ca_cert_path || sslCerts?.client_cert_path);

    return {
      id: c.id,
      name: c.name,
      driver: c.driver,
      database: c.driver === 'sqlite' || c.driver === 'duckdb' ? '[LOCAL_DATABASE_FILE]' : c.database,
      host: c.host ? c.host.replace(/\d+$/, '***') : undefined,
      port: c.port,
      environment: c.environment,
      readOnly: c.read_only ?? c.readOnly,
      sslMode: c.ssl_mode || c.sslMode,
      hasSshTunnel: hasSsh,
      hasSslCerts: hasSsl,
    };
  });
}

/**
 * Gathers system environment metrics safely
 */
export function gatherSystemInfo(appVersion: string = '0.1.0'): SystemInfo {
  const isBrowser = typeof window !== 'undefined';
  const ua = isBrowser ? window.navigator.userAgent : 'Unknown';
  const platform = isBrowser
    ? (window.navigator as any).userAgentData?.platform || window.navigator.platform || 'macOS'
    : 'macOS';

  const screenRes =
    isBrowser && window.screen
      ? `${window.screen.width}x${window.screen.height} (${window.devicePixelRatio || 1}x)`
      : 'Unknown';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return {
    platform,
    userAgent: ua,
    appVersion,
    timestamp: new Date().toISOString(),
    timezone: tz,
    screenResolution: screenRes,
  };
}

/**
 * Builds the complete sanitized diagnostic bundle
 */
export function generateDiagnosticBundle(params: {
  appVersion?: string;
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  activeTabsCount: number;
}): DiagnosticBundle {
  const system = gatherSystemInfo(params.appVersion);
  const connections = sanitizeConnections(params.connections);

  return {
    generatedAt: new Date().toISOString(),
    app: {
      name: 'DataCore',
      version: params.appVersion || '0.1.0',
    },
    system,
    connections,
    activeConnectionId: params.activeConnectionId,
    activeTabsCount: params.activeTabsCount,
  };
}
