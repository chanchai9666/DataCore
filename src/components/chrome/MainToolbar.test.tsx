import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainToolbar } from './MainToolbar';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import type { ConnectionConfig } from '../../types/db';

describe('MainToolbar Component', () => {
  const mockConn: ConnectionConfig = {
    id: 'c1',
    name: 'Production DB',
    driver: 'postgres',
    database: 'analytics',
  };

  beforeEach(() => {
    useConnectionStore.setState({
      connections: [mockConn],
      activeConnectionId: null,
      loading: false,
      error: null,
    });
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });
  });

  it('renders standard desktop toolbar items', () => {
    render(<MainToolbar />);
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new query/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /backup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('triggers onConnect callback when Connect button is clicked', () => {
    const onConnect = vi.fn();
    render(<MainToolbar onConnect={onConnect} />);
    const connectBtn = screen.getByRole('button', { name: /connect/i });
    fireEvent.click(connectBtn);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('disables query and table buttons when no active connection is present', () => {
    render(<MainToolbar />);
    expect(screen.getByRole('button', { name: /new query/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /table/i })).toBeDisabled();
  });

  it('enables query button and displays active connection badge when connected', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1' });
    render(<MainToolbar />);
    expect(screen.getByRole('button', { name: /new query/i })).not.toBeDisabled();
    expect(screen.getByText('Production DB')).toBeInTheDocument();
    expect(screen.getByTestId('db-badge')).toHaveTextContent('PG');
  });

  it('toggles theme when theme button is clicked', () => {
    const onToggleTheme = vi.fn();
    render(<MainToolbar theme="dark" onToggleTheme={onToggleTheme} />);
    const toggleBtn = screen.getByRole('button', { name: /switch to light mode/i });
    fireEvent.click(toggleBtn);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenTable when Table button is clicked', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1' });
    const onOpenTable = vi.fn();
    render(<MainToolbar onOpenTable={onOpenTable} />);
    const tableBtn = screen.getByTestId('toolbar-table-btn');
    fireEvent.click(tableBtn);
    expect(onOpenTable).toHaveBeenCalledTimes(1);
  });

  it('triggers onBackup when Backup button is clicked', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1' });
    const onBackup = vi.fn();
    render(<MainToolbar onBackup={onBackup} />);
    const backupBtn = screen.getByTestId('toolbar-backup-btn');
    fireEvent.click(backupBtn);
    expect(onBackup).toHaveBeenCalledTimes(1);
  });

  it('opens Import dropdown and triggers onImportData and onImportSql', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1' });
    const onImportData = vi.fn();
    const onImportSql = vi.fn();
    render(<MainToolbar onImportData={onImportData} onImportSql={onImportSql} />);

    const importBtn = screen.getByTestId('toolbar-import-btn');
    fireEvent.click(importBtn);

    expect(screen.getByTestId('toolbar-import-dropdown')).toBeInTheDocument();
    const importDataBtn = screen.getByTestId('toolbar-import-data-btn');

    fireEvent.click(importDataBtn);
    expect(onImportData).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toolbar-import-dropdown')).not.toBeInTheDocument();

    // Reopen and click import SQL
    fireEvent.click(importBtn);
    const importSqlBtn = screen.getByTestId('toolbar-import-sql-btn');
    fireEvent.click(importSqlBtn);
    expect(onImportSql).toHaveBeenCalledTimes(1);
  });

  it('opens Export dropdown and triggers onExportData and onExportSql', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1' });
    const onExportData = vi.fn();
    const onExportSql = vi.fn();
    render(<MainToolbar onExportData={onExportData} onExportSql={onExportSql} />);

    const exportBtn = screen.getByTestId('toolbar-export-btn');
    fireEvent.click(exportBtn);

    expect(screen.getByTestId('toolbar-export-dropdown')).toBeInTheDocument();
    const exportDataBtn = screen.getByTestId('toolbar-export-data-btn');

    fireEvent.click(exportDataBtn);
    expect(onExportData).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toolbar-export-dropdown')).not.toBeInTheDocument();

    // Reopen and click export SQL
    fireEvent.click(exportBtn);
    const exportSqlBtn = screen.getByTestId('toolbar-export-sql-btn');
    fireEvent.click(exportSqlBtn);
    expect(onExportSql).toHaveBeenCalledTimes(1);
  });

  it('opens Tools dropdown and triggers diagnostics callbacks', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1' });
    const onOpenMetrics = vi.fn();
    const onOpenLocks = vi.fn();
    const onOpenAuditLog = vi.fn();
    const onOpenSecurity = vi.fn();
    const onOpenHistory = vi.fn();

    render(
      <MainToolbar
        onOpenMetrics={onOpenMetrics}
        onOpenLocks={onOpenLocks}
        onOpenAuditLog={onOpenAuditLog}
        onOpenSecurity={onOpenSecurity}
        onOpenHistory={onOpenHistory}
      />
    );

    const toolsBtn = screen.getByTestId('toolbar-tools-btn');
    expect(toolsBtn).not.toBeDisabled();
    fireEvent.click(toolsBtn);

    expect(screen.getByTestId('toolbar-tools-dropdown')).toBeInTheDocument();

    // 1. Metrics
    fireEvent.click(screen.getByTestId('toolbar-tools-metrics-btn'));
    expect(onOpenMetrics).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toolbar-tools-dropdown')).not.toBeInTheDocument();

    // 2. Locks
    fireEvent.click(toolsBtn);
    fireEvent.click(screen.getByTestId('toolbar-tools-locks-btn'));
    expect(onOpenLocks).toHaveBeenCalledTimes(1);

    // 3. Audit Log
    fireEvent.click(toolsBtn);
    fireEvent.click(screen.getByTestId('toolbar-tools-audit-btn'));
    expect(onOpenAuditLog).toHaveBeenCalledTimes(1);

    // 4. Connection Security
    fireEvent.click(toolsBtn);
    fireEvent.click(screen.getByTestId('toolbar-tools-security-btn'));
    expect(onOpenSecurity).toHaveBeenCalledTimes(1);

    // 5. History
    fireEvent.click(toolsBtn);
    fireEvent.click(screen.getByTestId('toolbar-tools-history-btn'));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });
});
