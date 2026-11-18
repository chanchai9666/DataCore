import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MainToolbar } from './MainToolbar';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import i18n from '../../i18n';
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
      connectedConnectionIds: [],
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

  it('disables query, table, backup, import, export when no active connection is present, keeping tools clickable', () => {
    render(<MainToolbar onOpenMetrics={vi.fn()} onCheckUpdates={vi.fn()} onExportDiagnosticBundle={vi.fn()} />);
    expect(screen.getByRole('button', { name: /new query/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /table/i })).toBeDisabled();
    const toolsBtn = screen.getByRole('button', { name: /tools/i });
    expect(toolsBtn).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /backup/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /import/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();

    fireEvent.click(toolsBtn);
    expect(screen.getByTestId('toolbar-tools-metrics-btn')).toBeDisabled();
    expect(screen.getByTestId('toolbar-tools-check-updates-btn')).not.toBeDisabled();
    expect(screen.getByTestId('toolbar-tools-diagnostic-bundle-btn')).not.toBeDisabled();
  });

  it('disables query, table, backup, import, export when connection is selected but not connected to database', () => {
    useConnectionStore.setState({
      activeConnectionId: 'c1',
      connectedConnectionIds: [],
    });
    render(<MainToolbar />);
    expect(screen.getByRole('button', { name: /new query/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /table/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /tools/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /backup/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /import/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();

    // Check status dot and disconnected text in connection pill
    const statusDot = screen.getByTestId('toolbar-connection-status-dot');
    expect(statusDot.className).toContain('bg-muted/40');
    expect(screen.getByText('(Disconnected)')).toBeInTheDocument();
  });

  it('enables buttons and displays active connected badge when connected', () => {
    useConnectionStore.setState({
      activeConnectionId: 'c1',
      connectedConnectionIds: ['c1'],
    });
    render(<MainToolbar />);
    expect(screen.getByRole('button', { name: /new query/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /table/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /tools/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /backup/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /import/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled();

    expect(screen.getByText('Production DB')).toBeInTheDocument();
    expect(screen.getByTestId('db-badge')).toHaveTextContent('PG');
    const statusDot = screen.getByTestId('toolbar-connection-status-dot');
    expect(statusDot.className).toContain('bg-emerald-500');
    expect(screen.queryByText('(Disconnected)')).not.toBeInTheDocument();
  });

  it('toggles theme when theme button is clicked', () => {
    const onToggleTheme = vi.fn();
    render(<MainToolbar theme="dark" onToggleTheme={onToggleTheme} />);
    const toggleBtn = screen.getByRole('button', { name: /switch to light mode/i });
    fireEvent.click(toggleBtn);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenTable when Table button is clicked', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1', connectedConnectionIds: ['c1'] });
    const onOpenTable = vi.fn();
    render(<MainToolbar onOpenTable={onOpenTable} />);
    const tableBtn = screen.getByTestId('toolbar-table-btn');
    fireEvent.click(tableBtn);
    expect(onOpenTable).toHaveBeenCalledTimes(1);
  });

  it('triggers onBackup when Backup button is clicked', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1', connectedConnectionIds: ['c1'] });
    const onBackup = vi.fn();
    render(<MainToolbar onBackup={onBackup} />);
    const backupBtn = screen.getByTestId('toolbar-backup-btn');
    fireEvent.click(backupBtn);
    expect(onBackup).toHaveBeenCalledTimes(1);
  });

  it('opens Import dropdown and triggers onImportData and onImportSql', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1', connectedConnectionIds: ['c1'] });
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
    useConnectionStore.setState({ activeConnectionId: 'c1', connectedConnectionIds: ['c1'] });
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
    useConnectionStore.setState({ activeConnectionId: 'c1', connectedConnectionIds: ['c1'] });
    const onOpenMetrics = vi.fn();
    const onOpenLocks = vi.fn();
    const onOpenAuditLog = vi.fn();
    const onOpenSecurity = vi.fn();
    const onOpenHistory = vi.fn();
    const onOpenERDiagram = vi.fn();
    const onOpenSchemaDiff = vi.fn();
    const onOpenActivityMonitor = vi.fn();
    const onOpenUserManager = vi.fn();

    render(
      <MainToolbar
        onOpenMetrics={onOpenMetrics}
        onOpenLocks={onOpenLocks}
        onOpenAuditLog={onOpenAuditLog}
        onOpenSecurity={onOpenSecurity}
        onOpenHistory={onOpenHistory}
        onOpenERDiagram={onOpenERDiagram}
        onOpenSchemaDiff={onOpenSchemaDiff}
        onOpenActivityMonitor={onOpenActivityMonitor}
        onOpenUserManager={onOpenUserManager}
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

    // 6. ER Diagram
    fireEvent.click(toolsBtn);
    fireEvent.click(screen.getByTestId('toolbar-tools-er-diagram-btn'));
    expect(onOpenERDiagram).toHaveBeenCalledTimes(1);

    // 7. Schema Diff
    fireEvent.click(toolsBtn);
    fireEvent.click(screen.getByTestId('toolbar-tools-schema-diff-btn'));
    expect(onOpenSchemaDiff).toHaveBeenCalledTimes(1);

    // 8. Activity Monitor
    fireEvent.click(toolsBtn);
    fireEvent.click(screen.getByTestId('toolbar-tools-activity-monitor-btn'));
    expect(onOpenActivityMonitor).toHaveBeenCalledTimes(1);

    // 9. User & Privilege Manager
    fireEvent.click(toolsBtn);
    fireEvent.click(screen.getByTestId('toolbar-tools-user-manager-btn'));
    expect(onOpenUserManager).toHaveBeenCalledTimes(1);
  });

  it('triggers onCheckUpdates and onExportDiagnosticBundle from tools dropdown when connected', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1', connectedConnectionIds: ['c1'] });
    const onCheckUpdates = vi.fn();
    const onExportDiagnosticBundle = vi.fn();

    render(
      <MainToolbar
        onCheckUpdates={onCheckUpdates}
        onExportDiagnosticBundle={onExportDiagnosticBundle}
      />
    );

    const toolsBtn = screen.getByRole('button', { name: /tools/i });

    // Check updates
    fireEvent.click(toolsBtn);
    const checkUpdatesBtn = screen.getByTestId('toolbar-tools-check-updates-btn');
    expect(checkUpdatesBtn).toBeInTheDocument();
    fireEvent.click(checkUpdatesBtn);
    expect(onCheckUpdates).toHaveBeenCalledTimes(1);

    // Export diagnostic bundle
    fireEvent.click(toolsBtn);
    const diagnosticBtn = screen.getByTestId('toolbar-tools-diagnostic-bundle-btn');
    expect(diagnosticBtn).toBeInTheDocument();
    fireEvent.click(diagnosticBtn);
    expect(onExportDiagnosticBundle).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenShortcuts when Keyboard Shortcuts button is clicked', () => {
    const onOpenShortcuts = vi.fn();
    render(<MainToolbar onOpenShortcuts={onOpenShortcuts} />);
    const shortcutsBtn = screen.getByTestId('toolbar-shortcuts-btn');
    expect(shortcutsBtn).toBeInTheDocument();
    expect(shortcutsBtn).toHaveAttribute('aria-label', 'Keyboard Shortcuts (⌘?)');
    fireEvent.click(shortcutsBtn);
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('orders toolbar buttons by workflow groups with visual dividers and renders 2-column Bento tools menu', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1', connectedConnectionIds: ['c1'] });
    render(
      <MainToolbar
        onOpenMetrics={vi.fn()}
        onOpenERDiagram={vi.fn()}
        onOpenAuditLog={vi.fn()}
        onOpenHistory={vi.fn()}
        onCheckUpdates={vi.fn()}
        onExportDiagnosticBundle={vi.fn()}
      />
    );

    const expectedOrder = [
      'toolbar-connect-btn',
      'toolbar-query-btn',
      'toolbar-table-btn',
      'toolbar-import-btn',
      'toolbar-export-btn',
      'toolbar-backup-btn',
      'toolbar-tools-btn',
    ];
    const buttons = expectedOrder.map((id) => screen.getByTestId(id));
    for (let i = 0; i < buttons.length - 1; i++) {
      expect(
        buttons[i].compareDocumentPosition(buttons[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }

    // Group dividers between connection|workspace (idx 1), workspace|transfer (idx 3), transfer|tools (idx 6)
    expect(screen.getByTestId('toolbar-divider-1')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-divider-3')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-divider-6')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toolbar-tools-btn'));
    const bentoGrid = screen.getByTestId('toolbar-tools-bento-grid');
    expect(bentoGrid).toBeInTheDocument();
    expect(bentoGrid.className).toContain('sm:grid-cols-2');
  });

  it('renders localized Thai strings for System & Diagnostics and Import/Export descriptions', async () => {
    useConnectionStore.setState({ activeConnectionId: 'c1', connectedConnectionIds: ['c1'] });
    await act(async () => {
      await i18n.changeLanguage('th');
    });

    try {
      render(
        <MainToolbar
          onImportData={vi.fn()}
          onImportSql={vi.fn()}
          onExportData={vi.fn()}
          onExportSql={vi.fn()}
          onOpenMetrics={vi.fn()}
          onCheckUpdates={vi.fn()}
          onExportDiagnosticBundle={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('toolbar-tools-btn'));
      expect(screen.getByText('ระบบและการวินิจฉัย')).toBeInTheDocument();
      expect(screen.getByText('ตรวจสอบอัปเดต...')).toBeInTheDocument();
      expect(screen.getByText('ส่งออกข้อมูลวินิจฉัยระบบ...')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('toolbar-import-btn'));
      expect(screen.getByText('นำเข้าข้อมูลจากไฟล์ CSV, TSV หรือ JSON เข้าสู่ตาราง')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('toolbar-export-btn'));
      expect(screen.getByText('ส่งออกข้อมูลตารางหรือผลลัพธ์เป็น CSV, JSON, Gzip/Zstd')).toBeInTheDocument();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });
});
