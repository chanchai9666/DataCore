import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AboutModal } from './AboutModal';
import { changeLanguage } from '../../i18n';

describe('AboutModal', () => {
  beforeEach(async () => {
    await act(async () => {
      await changeLanguage('en');
    });
  });

  it('renders nothing when closed', () => {
    render(<AboutModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('about-modal')).not.toBeInTheDocument();
  });

  it('renders app info, version, engines and GitHub link', () => {
    render(<AboutModal isOpen={true} onClose={vi.fn()} version="1.2.3" />);
    expect(screen.getByText('About DataCore')).toBeInTheDocument();
    expect(screen.getByTestId('about-version')).toHaveTextContent('v1.2.3');
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('DuckDB')).toBeInTheDocument();
    expect(screen.getByTestId('about-github-link')).toHaveAttribute(
      'href',
      'https://github.com/chanchai9666/DataCore'
    );
  });

  it('copies info to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AboutModal isOpen={true} onClose={vi.fn()} version="1.2.3" />);
    fireEvent.click(screen.getByTestId('about-copy-btn'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain('DataCore v1.2.3');
  });

  it('calls onCheckUpdates and onClose', () => {
    const onClose = vi.fn();
    const onCheckUpdates = vi.fn();
    render(
      <AboutModal isOpen={true} onClose={onClose} onCheckUpdates={onCheckUpdates} version="1.0.0" />
    );
    fireEvent.click(screen.getByTestId('about-check-updates-btn'));
    expect(onCheckUpdates).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('about-close-btn'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders Thai title when language is th', async () => {
    await act(async () => {
      await changeLanguage('th');
    });
    render(<AboutModal isOpen={true} onClose={vi.fn()} version="1.0.0" />);
    expect(screen.getByText('เกี่ยวกับ DataCore')).toBeInTheDocument();
  });
});
