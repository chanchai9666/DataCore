import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ConnectionSecurityModal } from './ConnectionSecurityModal';
import { dbApi } from '../../api/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn(),
  },
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
    vi.mocked(dbApi.executeDirectQuery).mockResolvedValueOnce({
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
    });
  });
});
