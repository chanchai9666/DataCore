import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataExportWizardModal } from './DataExportWizardModal';
import * as dataTransferApi from '../../api/dataTransferApi';

vi.mock('../../api/dataTransferApi', async () => {
  const actual = await vi.importActual<typeof dataTransferApi>('../../api/dataTransferApi');
  return {
    ...actual,
    pickExportFile: vi.fn(),
    exportData: vi.fn(),
  };
});

describe('DataExportWizardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataTransferApi.pickExportFile).mockResolvedValue('/exports/users.csv');
    vi.mocked(dataTransferApi.exportData).mockResolvedValue({
      total_rows: 50,
      file_size_bytes: 4096,
      elapsed_ms: 22,
    });
  });

  it('renders wizard steps and executes export', async () => {
    render(
      <DataExportWizardModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
        tableName="users"
        initialQuery="SELECT * FROM users WHERE active = 1"
        totalRows={50}
      />
    );

    expect(screen.getByText(/data export wizard/i)).toBeInTheDocument();
    expect(screen.getByText(/step 1: export scope & format/i)).toBeInTheDocument();
    expect(screen.getByText(/source target/i)).toBeInTheDocument();

    // Step 1 -> Step 2
    const nextBtn = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);

    expect(screen.getByText(/step 2: format options/i)).toBeInTheDocument();

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/step 3: destination & export/i)).toBeInTheDocument();

    // Execute Export
    const exportBtn = screen.getByRole('button', { name: /start export/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText(/export completed successfully/i)).toBeInTheDocument();
      expect(screen.getByText(/50 rows exported/i)).toBeInTheDocument();
    });
  });
});
