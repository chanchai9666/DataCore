import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { toast } from 'sonner';
import i18n from '../../i18n';
import { AuditLogDrawer } from './AuditLogDrawer';
import { useAuditLogStore } from '../../stores/auditLogStore';

describe('AuditLogDrawer', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuditLogStore.getState().clearLogs();
    useAuditLogStore.setState({ integrity: null });
    useAuditLogStore.getState().addLog({
      action: 'QUERY',
      user: 'root',
      connectionName: 'Production Postgres',
      database: 'app_db',
      query: 'SELECT * FROM users WHERE active = true',
      executionTimeMs: 45,
      rowsAffected: 120,
      status: 'SUCCESS',
    });
    useAuditLogStore.getState().addLog({
      action: 'DDL',
      user: 'admin',
      connectionName: 'Production Postgres',
      database: 'app_db',
      query: 'DROP TABLE deprecated_logs',
      status: 'FAILURE',
      errorMessage: 'Permission denied',
    });
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders nothing when isOpen is false', () => {
    render(<AuditLogDrawer isOpen={false} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders audit entries when open', () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Security & Audit Log')).toBeDefined();
    expect(screen.getAllByText('Production Postgres / app_db').length).toBe(2);
    expect(screen.getByText('QUERY')).toBeDefined();
    expect(screen.getByText('DDL')).toBeDefined();
  });

  it('expands entry to show full query statement', () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    const entryHeader = screen.getByText('QUERY');
    fireEvent.click(entryHeader);

    expect(screen.getByText(/SELECT \* FROM users WHERE active = true/)).toBeDefined();
  });

  it('filters by search input', () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    const searchInput = screen.getByPlaceholderText(/Search queries, users/);
    fireEvent.change(searchInput, { target: { value: 'deprecated_logs' } });

    expect(screen.getByText('DDL')).toBeDefined();
    expect(screen.queryByText('QUERY')).toBeNull();
  });

  it('calls onClose when close button clicked', () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close Audit Log');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('triggers integrity check when clicking Verify Chain button', async () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    const verifyBtn = screen.getByLabelText('Verify Chain Integrity');
    expect(verifyBtn).toBeDefined();
    await act(async () => {
      fireEvent.click(verifyBtn);
    });
  });

  it('renders search input and dropdown selects with matching h-[34px] height', () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    const searchInput = screen.getByPlaceholderText(/Search queries, users/);
    expect(searchInput.className).toContain('h-[34px]');

    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect(selects[0].className).toContain('h-[34px]');
    expect(selects[1].className).toContain('h-[34px]');
  });

  it('renders Thai audit verification messages', async () => {
    await i18n.changeLanguage('th');
    const successSpy = vi.spyOn(toast, 'success');

    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    expect(screen.getByText(/บันทึกความปลอดภัยและ Audit Log/)).toBeDefined();
    expect(screen.getByText('ตรวจสอบ Chain')).toBeDefined();
    expect(screen.getByText('ส่งออก CSV')).toBeDefined();

    const verifyBtn = screen.getByLabelText('ตรวจสอบความถูกต้องของ Chain');
    await act(async () => {
      fireEvent.click(verifyBtn);
    });

    expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('ตรวจสอบห่วงโซ่ Audit Log แล้ว'));

    // Also render Thai recovery hint when integrity fails
    act(() => {
      useAuditLogStore.setState({
        integrity: {
          isValid: false,
          totalEntries: 2,
          verifiedAt: '2026-11-20T00:00:00Z',
          error: 'Audit anchor file is corrupted (fail-closed)',
        },
      });
    });

    expect(screen.getByText('ตรวจพบการแก้ไขผิดปกติ')).toBeDefined();
    expect(screen.getByText(/หากไฟล์ anchor หรือบันทึกเกิดความเสียหาย/)).toBeDefined();
  });

  it('contains no hardcoded English literals outside t()', () => {
    const filesToCheck = ['AuditLogDrawer.tsx', 'VaultUnlockModal.tsx'];
    const literalToastOrDialog = /(?:toast\.(?:success|error|info|warning)|showConfirmDialog)\(\s*['"`]/;
    const literalAttr = /\b(?:placeholder|aria-label)=['"][A-Za-z][^'"]*['"]/;
    const literalJsxText = />[A-Z][a-zA-Z0-9\s,&.:/()-]{2,}</;

    for (const fileName of filesToCheck) {
      const filePath = path.resolve(process.cwd(), 'src/components/security', fileName);
      const source = fs.readFileSync(filePath, 'utf-8');
      expect(source, `${fileName} has hardcoded toast/dialog string`).not.toMatch(literalToastOrDialog);
      expect(source, `${fileName} has hardcoded placeholder/aria-label`).not.toMatch(literalAttr);
      expect(source, `${fileName} has hardcoded JSX text outside t()`).not.toMatch(literalJsxText);
    }
  });
});
