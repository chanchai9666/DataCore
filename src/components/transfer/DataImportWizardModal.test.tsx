import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataImportWizardModal } from './DataImportWizardModal';
import * as dataTransferApi from '../../api/dataTransferApi';
import { dbApi } from '../../api/db';

vi.mock('../../api/dataTransferApi', async () => {
  const actual = await vi.importActual<typeof dataTransferApi>('../../api/dataTransferApi');
  return {
    ...actual,
    pickImportFile: vi.fn(),
    previewImportFile: vi.fn(),
    importData: vi.fn(),
    onTransferProgress: vi.fn().mockResolvedValue(() => {}),
  };
});

vi.mock('../../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn(),
  },
}));

describe('DataImportWizardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(dbApi.executeDirectQuery).mockImplementation(async (_conn, sql) => {
      if (sql.includes('sqlite_master') || sql.includes('information_schema.tables')) {
        return {
          columns: [{ name: 'name', data_type: 'TEXT', nullable: false }],
          rows: [[{ Text: 'users' }], [{ Text: 'orders' }]],
          execution_time_ms: 1,
        };
      }
      // Table column query
      return {
        columns: [
          { name: 'id', data_type: 'INTEGER', nullable: false },
          { name: 'username', data_type: 'TEXT', nullable: false },
        ],
        rows: [],
        execution_time_ms: 1,
      };
    });

    vi.mocked(dataTransferApi.previewImportFile).mockResolvedValue({
      detected_delimiter: ',',
      headers: ['id', 'username'],
      preview_rows: [
        ['1', 'alice'],
        ['2', 'bob'],
      ],
      total_preview_rows: 2,
    });

    vi.mocked(dataTransferApi.importData).mockResolvedValue({
      total_rows: 2,
      imported_rows: 2,
      skipped_rows: 0,
      elapsed_ms: 15,
    });
  });

  it('renders wizard steps and advances from Step 1 to Step 2 upon selecting file', async () => {
    vi.mocked(dataTransferApi.pickImportFile).mockResolvedValue('/data/users.csv');

    render(
      <DataImportWizardModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
        driver="sqlite"
        initialTableName="users"
      />
    );

    expect(screen.getByText(/data import wizard/i)).toBeInTheDocument();
    expect(screen.getByText(/step 1: source file/i)).toBeInTheDocument();
    expect(screen.getByText(/destination target/i)).toBeInTheDocument();

    const browseBtn = screen.getByRole('button', { name: /browse file/i });
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/data/users.csv')).toBeInTheDocument();
    });

    // Advance to Step 2
    const nextBtn = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);

    expect(screen.getByText(/step 2: destination table/i)).toBeInTheDocument();
  });

  it('navigates through column mapping step and executes import', async () => {
    vi.mocked(dataTransferApi.pickImportFile).mockResolvedValue('/data/users.csv');

    render(
      <DataImportWizardModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
        driver="sqlite"
        initialTableName="users"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /browse file/i }));
    await waitFor(() => expect(screen.getByDisplayValue('/data/users.csv')).toBeInTheDocument());

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/step 2: destination table/i)).toBeInTheDocument();

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(screen.getByText(/step 3: column mapping/i)).toBeInTheDocument();
    });

    // Step 3 -> Step 4 (Preview & Policy)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/step 4: preview & error policy/i)).toBeInTheDocument();

    // Start Import
    const startImportBtn = screen.getByRole('button', { name: /start import/i });
    fireEvent.click(startImportBtn);

    await waitFor(() => {
      expect(screen.getByText(/import completed successfully/i)).toBeInTheDocument();
      expect(screen.getByText('2 / 2 rows')).toBeInTheDocument();
    });
  });

  it('displays live percentage badge in Step 5 while importing', async () => {
    let progressCb: ((p: any) => void) | null = null;
    vi.mocked(dataTransferApi.onTransferProgress).mockImplementationOnce(async (cb) => {
      progressCb = cb;
      return () => {};
    });
    vi.mocked(dataTransferApi.pickImportFile).mockResolvedValue('/data/users.csv');

    let resolveImport!: (val: any) => void;
    vi.mocked(dataTransferApi.importData).mockReturnValueOnce(
      new Promise((res) => {
        resolveImport = res;
      })
    );

    render(
      <DataImportWizardModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
        driver="sqlite"
        initialTableName="users"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /browse file/i }));
    await waitFor(() => expect(screen.getByDisplayValue('/data/users.csv')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/step 3: column mapping/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /start import/i }));

    await waitFor(() => {
      expect(screen.getByTestId('wizard-import-percent')).toBeInTheDocument();
    });

    const jobId = vi.mocked(dataTransferApi.importData).mock.calls[0][2].job_id;
    act(() => {
      progressCb?.({
        job_id: jobId,
        current_row: 80,
        total_rows: 100,
        percent: 80,
        status: 'importing',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('wizard-import-percent')).toHaveTextContent('80%');
    });

    await act(async () => {
      resolveImport({ total_rows: 100, imported_rows: 100, skipped_rows: 0, elapsed_ms: 25 });
    });
  });
});
