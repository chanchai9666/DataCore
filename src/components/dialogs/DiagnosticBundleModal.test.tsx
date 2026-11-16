import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DiagnosticBundleModal } from './DiagnosticBundleModal';
import { useConnectionStore } from '../../stores/connectionStore';

describe('DiagnosticBundleModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: [
        {
          id: 'conn-1',
          name: 'Prod Postgres',
          driver: 'postgres',
          host: 'db.internal',
          port: 5432,
          database: 'production',
          username: 'admin',
          password: 'super-secret-password',
        } as any,
      ],
    });

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('renders modal when isOpen is true', () => {
    render(<DiagnosticBundleModal isOpen={true} onClose={mockOnClose} appVersion="1.0.0" />);

    expect(screen.getByText('Export Diagnostic Bundle')).toBeInTheDocument();
    expect(screen.getByText(/100% Privacy Protected/i)).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-app-version')).toHaveTextContent('v1.0.0');
    expect(screen.getByText('1 profiles')).toBeInTheDocument();

    const textarea = screen.getByTestId('diagnostic-json-preview') as HTMLTextAreaElement;
    expect(textarea.value).toContain('"appVersion": "1.0.0"');
    expect(textarea.value).not.toContain('super-secret-password');
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <DiagnosticBundleModal isOpen={false} onClose={mockOnClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('copies sanitized json to clipboard when Copy button is clicked', async () => {
    render(<DiagnosticBundleModal isOpen={true} onClose={mockOnClose} />);

    const copyBtn = screen.getByTestId('diagnostic-copy-btn');
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  it('triggers download when Download File button is clicked', () => {
    render(<DiagnosticBundleModal isOpen={true} onClose={mockOnClose} />);

    const downloadBtn = screen.getByTestId('diagnostic-download-btn');
    fireEvent.click(downloadBtn);

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    render(<DiagnosticBundleModal isOpen={true} onClose={mockOnClose} />);

    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
