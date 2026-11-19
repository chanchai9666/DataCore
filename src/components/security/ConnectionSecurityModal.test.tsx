import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ConnectionSecurityModal } from './ConnectionSecurityModal';
import { dbApi } from '../../api/db';
import { usePrivacyStore } from '../../stores/privacyStore';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn(),
    isVaultKeychainEnabled: vi.fn(),
    setVaultKeychainEnabled: vi.fn(),
    hasVaultMasterPassword: vi.fn(),
    setVaultMasterPassword: vi.fn(),
    changeVaultMasterPassword: vi.fn(),
    removeVaultMasterPassword: vi.fn(),
    setScreenProtection: vi.fn(),
  },
  setScreenProtection: vi.fn(),
}));

describe('ConnectionSecurityModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(
      <ConnectionSecurityModal
        isOpen={false}
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders TLS and At-Rest security details when open', async () => {
    vi.mocked(dbApi.executeDirectQuery)
      .mockResolvedValueOnce({
        columns: [],
        rows: [
          [
            { Boolean: true }, // ssl
            { Text: 'TLSv1.3' }, // version
            { Text: 'TLS_AES_256_GCM_SHA384' }, // cipher
            { Integer: 256 }, // bits
          ],
        ],
        execution_time_ms: 10,
      })
      .mockResolvedValueOnce({
        columns: [],
        rows: [
          [{ Text: 'data_encryption' }, { Text: 'on' }],
          [{ Text: 'ssl' }, { Text: 'on' }],
        ],
        execution_time_ms: 5,
      });

    render(
      <ConnectionSecurityModal
        isOpen={true}
        connectionId="conn-1"
        driver="postgres"
        connectionName="Production DB"
        sslMode="require"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Connection Encryption & Security')).toBeDefined();
      expect(screen.getByText('In-Transit Encryption (TLS / SSL)')).toBeDefined();
      expect(screen.getByText('TLS Encrypted')).toBeDefined();
      expect(screen.getByText('At-Rest Encryption (การจัดเก็บข้อมูล)')).toBeDefined();
      expect(screen.getByText('Encrypted (TDE Active)')).toBeDefined();
    });
  });

  it('renders unencrypted at-rest badge when TDE is off in database', async () => {
    vi.mocked(dbApi.executeDirectQuery)
      .mockResolvedValueOnce({
        columns: [],
        rows: [],
        execution_time_ms: 1,
      })
      .mockResolvedValueOnce({
        columns: [],
        rows: [[{ Text: 'innodb_encrypt_tables' }, { Text: 'OFF' }]],
        execution_time_ms: 2,
      });

    render(
      <ConnectionSecurityModal
        isOpen={true}
        connectionId="conn-mysql"
        driver="mysql"
        connectionName="MySQL Unencrypted"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Unencrypted at Rest')).toBeDefined();
      expect(screen.getByText(/InnoDB tablespace encryption is disabled/i)).toBeDefined();
    });
  });

  it('renders macOS Keychain toggle and handles opt-in state switching', async () => {
    vi.mocked(dbApi.executeDirectQuery).mockResolvedValue({
      columns: [],
      rows: [],
      execution_time_ms: 1,
    });
    vi.mocked(dbApi.isVaultKeychainEnabled).mockResolvedValue(false);
    vi.mocked(dbApi.hasVaultMasterPassword).mockResolvedValue(true);
    vi.mocked(dbApi.setVaultKeychainEnabled).mockResolvedValue(undefined);

    render(
      <ConnectionSecurityModal
        isOpen={true}
        connectionId="conn-1"
        driver="sqlite"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /toggle macos keychain sync/i })).toBeInTheDocument();
    });

    const toggle = screen.getByRole('switch', { name: /toggle macos keychain sync/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Disabled \(Isolated Vault\)/i)).toBeInTheDocument();

    // Click toggle to enable
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(dbApi.setVaultKeychainEnabled).toHaveBeenCalledWith(true);
      expect(toggle).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByText(/Enabled \(Keychain Synced\)/i)).toBeInTheDocument();
    });
  });

  it('shows Unknown / Unverified instead of guessing TLSv1.3 when TLS query fails', async () => {
    vi.mocked(dbApi.executeDirectQuery).mockRejectedValue(new Error('permission denied'));
    vi.mocked(dbApi.isVaultKeychainEnabled).mockResolvedValue(false);
    vi.mocked(dbApi.hasVaultMasterPassword).mockResolvedValue(false);

    render(
      <ConnectionSecurityModal
        isOpen={true}
        connectionId="conn-pg"
        driver="postgres"
        sslMode="require"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Unknown / Unverified')).toBeInTheDocument();
      expect(screen.getByText('Unknown (Unable to Verify)')).toBeInTheDocument();
      expect(screen.queryByText('TLSv1.3')).toBeNull();
    });
  });

  it('allows setting Master Password from UI when not yet configured', async () => {
    vi.mocked(dbApi.executeDirectQuery).mockResolvedValue({
      columns: [],
      rows: [],
      execution_time_ms: 1,
    });
    vi.mocked(dbApi.isVaultKeychainEnabled).mockResolvedValue(false);
    vi.mocked(dbApi.hasVaultMasterPassword).mockResolvedValue(false);
    vi.mocked(dbApi.setVaultMasterPassword).mockResolvedValue(undefined);

    render(
      <ConnectionSecurityModal
        isOpen={true}
        connectionId="conn-1"
        driver="sqlite"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set master password/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /set master password/i }));
    const input = screen.getByPlaceholderText(/enter new master password/i);
    fireEvent.change(input, { target: { value: 'StrongMaster123!' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(dbApi.setVaultMasterPassword).toHaveBeenCalledWith('StrongMaster123!');
      expect(screen.getByText(/Master Password \(DCV2 Argon2id\)/i)).toBeInTheDocument();
    });
  });

  it('toggles Screen Sharing Protection switch and updates privacyStore', async () => {
    const { setScreenProtection } = await import('../../api/db');
    vi.mocked(setScreenProtection).mockResolvedValue(undefined);
    usePrivacyStore.setState({ screenProtectionEnabled: false, isUpdating: false, error: null });

    vi.mocked(dbApi.executeDirectQuery).mockResolvedValue({
      columns: [],
      rows: [],
      rows_affected: 0,
      execution_time_ms: 1,
    });
    vi.mocked(dbApi.isVaultKeychainEnabled).mockResolvedValue(false);

    render(
      <ConnectionSecurityModal
        isOpen={true}
        connectionId="conn-1"
        driver="sqlite"
        onClose={onClose}
      />
    );

    const switchBtn = screen.getByRole('switch', { name: /toggle screen sharing protection/i });
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Disabled \(Visible to Screen Share\)/i)).toBeInTheDocument();

    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(setScreenProtection).toHaveBeenCalledWith(true);
      expect(switchBtn).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByText(/Protected \(Hidden from Screen Share\)/i)).toBeInTheDocument();
    });
  });
});
