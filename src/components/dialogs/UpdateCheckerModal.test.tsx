import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateCheckerModal } from './UpdateCheckerModal';
import * as updaterPlugin from '@tauri-apps/plugin-updater';

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

describe('UpdateCheckerModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<UpdateCheckerModal isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders checking state initially and transitions to up-to-date', async () => {
    vi.mocked(updaterPlugin.check).mockResolvedValue(null as any);

    render(<UpdateCheckerModal isOpen={true} onClose={vi.fn()} currentVersion="0.1.0" />);
    expect(screen.getByText('Software Update')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("You're up to date!")).toBeInTheDocument();
    });
    expect(screen.getByText(/DataCore v0.1.0 is currently the newest version/)).toBeInTheDocument();
  });

  it('renders available update with version and install button', async () => {
    const mockUpdate = {
      available: true,
      version: '0.2.0',
      body: 'Bug fixes and performance improvements.',
      date: '2026-11-16',
      downloadAndInstall: vi.fn(),
    };
    vi.mocked(updaterPlugin.check).mockResolvedValue(mockUpdate as any);

    render(<UpdateCheckerModal isOpen={true} onClose={vi.fn()} currentVersion="0.1.0" />);

    await waitFor(() => {
      expect(screen.getByText('New Version Available')).toBeInTheDocument();
      expect(screen.getByText('DataCore v0.2.0')).toBeInTheDocument();
      expect(screen.getByText('Bug fixes and performance improvements.')).toBeInTheDocument();
    });

    const installBtn = screen.getByText('Download & Install');
    expect(installBtn).toBeInTheDocument();
    fireEvent.click(installBtn);
    expect(mockUpdate.downloadAndInstall).toHaveBeenCalled();
  });

  it('handles check error gracefully and displays notice', async () => {
    vi.mocked(updaterPlugin.check).mockRejectedValue(new Error('Network timeout'));

    render(<UpdateCheckerModal isOpen={true} onClose={vi.fn()} currentVersion="0.1.0" />);

    await waitFor(() => {
      expect(screen.getByText('Update Check Notice')).toBeInTheDocument();
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
