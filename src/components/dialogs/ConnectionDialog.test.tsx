import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectionDialog } from './ConnectionDialog';
import { useConnectionStore } from '../../stores/connectionStore';
import { dbApi } from '../../api/db';
import type { ConnectionConfig } from '../../types/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    testConnection: vi.fn(),
    saveConnection: vi.fn(),
    getConnections: vi.fn(),
    deleteConnection: vi.fn(),
    getStoredPassword: vi.fn().mockResolvedValue(null),
    deleteStoredPassword: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('ConnectionDialog', () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: [],
      activeConnectionId: null,
      loading: false,
      error: null,
    });
  });

  describe('Modal Rendering and Visibility', () => {
    it('does not render when isOpen is false', () => {
      render(<ConnectionDialog isOpen={false} onClose={onClose} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders dialog elements when isOpen is true', () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('New Connection')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
    });

    it('renders "Edit Connection" when initialConnection is provided', () => {
      const initial: ConnectionConfig = {
        id: 'conn-1',
        name: 'My Postgres',
        driver: 'postgres',
        host: '192.168.1.100',
        port: 5432,
        database: 'mydb',
        user: 'admin',
      };
      render(<ConnectionDialog isOpen={true} onClose={onClose} initialConnection={initial} />);
      expect(screen.getByText('Edit Connection')).toBeInTheDocument();
      expect(screen.getByLabelText(/connection name/i)).toHaveValue('My Postgres');
      expect(screen.getByLabelText(/host/i)).toHaveValue('192.168.1.100');
      expect(screen.getByLabelText(/database/i)).toHaveValue('mydb');
      expect(screen.getByLabelText(/user/i)).toHaveValue('admin');
    });
  });

  describe('Driver Switching and Field Display', () => {
    it('defaults to SQLite driver with Database Path field and no Host/Port fields', () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);
      expect(screen.getByLabelText(/database path/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/host/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/port/i)).not.toBeInTheDocument();
    });

    it('switches to PostgreSQL tab and displays Host, Port, User, Password, SSL Mode', () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      // Switch to PostgreSQL
      const postgresTab = screen.getByRole('tab', { name: /postgres/i });
      fireEvent.click(postgresTab);

      expect(screen.queryByLabelText(/database path/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/host/i)).toHaveValue('127.0.0.1');
      expect(screen.getByLabelText(/port/i)).toHaveValue(5432);
      expect(screen.getByLabelText(/user/i)).toHaveValue('postgres');
      expect(screen.getByLabelText(/database/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/remember password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/remember password/i)).toBeChecked();
      expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/ssl mode/i)).toBeInTheDocument();
    });

    it('switches to MySQL tab and defaults Host to 127.0.0.1, Port to 3306, and User to root', () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      // Switch to MySQL
      const mysqlTab = screen.getByRole('tab', { name: /mysql/i });
      fireEvent.click(mysqlTab);

      expect(screen.getByLabelText(/host/i)).toHaveValue('127.0.0.1');
      expect(screen.getByLabelText(/port/i)).toHaveValue(3306);
      expect(screen.getByLabelText(/user/i)).toHaveValue('root');
      expect(screen.getByLabelText(/database/i)).toBeInTheDocument();
    });

    it('switches back to SQLite tab and restores SQLite-specific fields', () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      // Switch to Postgres then back to SQLite
      fireEvent.click(screen.getByRole('tab', { name: /postgres/i }));
      expect(screen.getByLabelText(/host/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('tab', { name: /sqlite/i }));
      expect(screen.getByLabelText(/database path/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/host/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('shows validation errors when saving with empty required fields in SQLite mode', async () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);

      expect(await screen.findByText(/connection name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/database path is required/i)).toBeInTheDocument();
      expect(dbApi.saveConnection).not.toHaveBeenCalled();
    });

    it('shows validation errors when saving with empty host and database in Postgres mode', async () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      fireEvent.click(screen.getByRole('tab', { name: /postgres/i }));

      // Set name but clear host and leave database empty
      fireEvent.change(screen.getByLabelText(/connection name/i), { target: { value: 'Test PG' } });
      fireEvent.change(screen.getByLabelText(/host/i), { target: { value: '' } });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      expect(await screen.findByText(/host is required/i)).toBeInTheDocument();
      expect(screen.getByText(/database name is required/i)).toBeInTheDocument();
      expect(screen.queryByText(/connection name is required/i)).not.toBeInTheDocument();
      expect(dbApi.saveConnection).not.toHaveBeenCalled();
    });

    it('shows validation error if port is invalid', async () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      fireEvent.click(screen.getByRole('tab', { name: /postgres/i }));
      fireEvent.change(screen.getByLabelText(/connection name/i), { target: { value: 'Test PG' } });
      fireEvent.change(screen.getByLabelText(/database/i), { target: { value: 'mydb' } });
      fireEvent.change(screen.getByLabelText(/port/i), { target: { value: '-1' } });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      expect(await screen.findByText(/port must be a valid positive integer/i)).toBeInTheDocument();
    });
  });

  describe('Test Connection', () => {
    it('validates fields before calling dbApi.testConnection', async () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      const testBtn = screen.getByRole('button', { name: /test connection/i });
      fireEvent.click(testBtn);

      expect(await screen.findByText(/database path is required/i)).toBeInTheDocument();
      expect(dbApi.testConnection).not.toHaveBeenCalled();
    });

    it('calls dbApi.testConnection and displays latency in green success badge on success', async () => {
      vi.mocked(dbApi.testConnection).mockResolvedValueOnce(14);

      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      fireEvent.change(screen.getByLabelText(/database path/i), {
        target: { value: '/tmp/test.db' },
      });

      const testBtn = screen.getByRole('button', { name: /test connection/i });
      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(dbApi.testConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            driver: 'sqlite',
            database: '/tmp/test.db',
          }),
          ''
        );
      });

      expect(await screen.findByText(/success \(14ms\)/i)).toBeInTheDocument();
      const badge = screen.getByText(/success \(14ms\)/i);
      expect(badge.className).toMatch(/bg-emerald|bg-green|text-emerald|text-green/);
    });

    it('displays error message in red banner/badge on test connection failure', async () => {
      vi.mocked(dbApi.testConnection).mockRejectedValueOnce(new Error('Connection refused: 127.0.0.1:5432'));

      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      fireEvent.click(screen.getByRole('tab', { name: /postgres/i }));
      fireEvent.change(screen.getByLabelText(/database/i), { target: { value: 'mydb' } });
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'secret123' } });

      const testBtn = screen.getByRole('button', { name: /test connection/i });
      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(dbApi.testConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            driver: 'postgres',
            host: '127.0.0.1',
            port: 5432,
            database: 'mydb',
            user: 'postgres',
          }),
          'secret123'
        );
      });

      expect(await screen.findByText(/connection refused: 127\.0\.0\.1:5432/i)).toBeInTheDocument();
    });
  });

  describe('Save Connection and Store Integration', () => {
    it('saves a valid SQLite connection and closes the dialog', async () => {
      vi.mocked(dbApi.saveConnection).mockResolvedValueOnce();

      render(<ConnectionDialog isOpen={true} onClose={onClose} onSaved={onSaved} />);

      fireEvent.change(screen.getByLabelText(/connection name/i), {
        target: { value: 'Local SQLite' },
      });
      fireEvent.change(screen.getByLabelText(/folder/i), {
        target: { value: 'Development' },
      });
      fireEvent.change(screen.getByLabelText(/database path/i), {
        target: { value: ':memory:' },
      });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(dbApi.saveConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Local SQLite',
            driver: 'sqlite',
            database: ':memory:',
            folder: 'Development',
          }),
          ''
        );
      });

      expect(useConnectionStore.getState().connections).toHaveLength(1);
      expect(useConnectionStore.getState().connections[0].name).toBe('Local SQLite');
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Local SQLite' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('saves PostgreSQL connection with password through connection store', async () => {
      vi.mocked(dbApi.saveConnection).mockResolvedValueOnce();

      render(<ConnectionDialog isOpen={true} onClose={onClose} />);

      fireEvent.click(screen.getByRole('tab', { name: /postgres/i }));

      fireEvent.change(screen.getByLabelText(/connection name/i), {
        target: { value: 'Production Postgres' },
      });
      fireEvent.change(screen.getByLabelText(/database/i), {
        target: { value: 'analytics' },
      });
      fireEvent.change(screen.getByLabelText(/^password$/i), {
        target: { value: 'pgpass' },
      });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(dbApi.saveConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Production Postgres',
            driver: 'postgres',
            host: '127.0.0.1',
            port: 5432,
            database: 'analytics',
            user: 'postgres',
          }),
          'pgpass'
        );
      });

      expect(onClose).toHaveBeenCalled();
    });

    it('preserves existing keychain password (passes undefined) when editing without changing password', async () => {
      vi.mocked(dbApi.saveConnection).mockResolvedValueOnce();

      const initial: ConnectionConfig = {
        id: 'conn-pg-1',
        name: 'Existing Postgres',
        driver: 'postgres',
        host: '10.0.0.1',
        port: 5432,
        database: 'proddb',
        user: 'produser',
      };

      render(<ConnectionDialog isOpen={true} onClose={onClose} initialConnection={initial} />);

      // Modify the name, leave password blank
      fireEvent.change(screen.getByLabelText(/connection name/i), {
        target: { value: 'Updated Postgres' },
      });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(dbApi.saveConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'conn-pg-1',
            name: 'Updated Postgres',
            driver: 'postgres',
            database: 'proddb',
          }),
          undefined
        );
      });

      expect(onClose).toHaveBeenCalled();
    });

    it('passes new password when editing an existing connection with changed password', async () => {
      vi.mocked(dbApi.saveConnection).mockResolvedValueOnce();

      const initial: ConnectionConfig = {
        id: 'conn-pg-1',
        name: 'Existing Postgres',
        driver: 'postgres',
        host: '10.0.0.1',
        port: 5432,
        database: 'proddb',
        user: 'produser',
      };

      render(<ConnectionDialog isOpen={true} onClose={onClose} initialConnection={initial} />);

      fireEvent.change(screen.getByLabelText(/^password$/i), {
        target: { value: 'new-secret-password' },
      });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(dbApi.saveConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'conn-pg-1',
            name: 'Existing Postgres',
          }),
          'new-secret-password'
        );
      });

      expect(onClose).toHaveBeenCalled();
    });

    it('deletes stored password from keychain when remember password checkbox is unchecked', async () => {
      const initial: ConnectionConfig = {
        id: 'conn-pg-2',
        name: 'Postgres Without Saved Pass',
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        database: 'testdb',
        user: 'postgres',
      };

      render(<ConnectionDialog isOpen={true} onClose={onClose} initialConnection={initial} />);

      const rememberCheckbox = screen.getByLabelText(/remember password/i);
      expect(rememberCheckbox).toBeChecked();

      fireEvent.click(rememberCheckbox);
      expect(rememberCheckbox).not.toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(dbApi.deleteStoredPassword).toHaveBeenCalledWith('conn-pg-2');
        expect(dbApi.saveConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'conn-pg-2',
          }),
          undefined
        );
      });
    });
  });

  describe('Close and Cancel Actions', () => {
    it('calls onClose when Cancel button is clicked', () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape key is pressed', () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is clicked', () => {
      render(<ConnectionDialog isOpen={true} onClose={onClose} />);
      const backdrop = screen.getByTestId('connection-dialog-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
