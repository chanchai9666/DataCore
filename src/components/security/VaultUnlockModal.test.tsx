import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VaultUnlockModal } from './VaultUnlockModal';
import { dbApi } from '../../api/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    unlockVault: vi.fn(),
  },
}));

describe('VaultUnlockModal', () => {
  const onUnlocked = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<VaultUnlockModal isOpen={false} onUnlocked={onUnlocked} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('unlocks vault with entered master password and invokes onUnlocked', async () => {
    vi.mocked(dbApi.unlockVault).mockResolvedValue(true);

    render(<VaultUnlockModal isOpen={true} onUnlocked={onUnlocked} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/master password/i), {
      target: { value: 'MyMasterSecret!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /unlock vault/i }));

    await waitFor(() => {
      expect(dbApi.unlockVault).toHaveBeenCalledWith('MyMasterSecret!');
      expect(onUnlocked).toHaveBeenCalled();
    });
  });

  it('shows error message when unlock fails or is rate-limited', async () => {
    vi.mocked(dbApi.unlockVault).mockRejectedValue(
      new Error('Too many failed unlock attempts. Please wait 30 seconds before retrying.')
    );

    render(<VaultUnlockModal isOpen={true} onUnlocked={onUnlocked} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/master password/i), {
      target: { value: 'WrongPassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /unlock vault/i }));

    await waitFor(() => {
      expect(screen.getByText(/Too many failed unlock attempts/i)).toBeInTheDocument();
      expect(onUnlocked).not.toHaveBeenCalled();
    });
  });
});
