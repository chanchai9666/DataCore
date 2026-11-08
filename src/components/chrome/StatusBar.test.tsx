import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from './StatusBar';
import { useStatusStore } from '../../stores/statusStore';
import { useConnectionStore } from '../../stores/connectionStore';

describe('StatusBar Component', () => {
  beforeEach(() => {
    useStatusStore.getState().reset();
    useConnectionStore.setState({
      connections: [],
      activeConnectionId: null,
      loading: false,
      error: null,
    });
  });

  it('renders default Ready state and Disconnected status', () => {
    render(<StatusBar />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('renders last query and execution metrics when present', () => {
    useStatusStore.getState().setStatus({
      lastQuery: 'SELECT * FROM users LIMIT 10;',
      executionTimeMs: 42,
      rowCount: 10,
    });
    render(<StatusBar />);

    expect(screen.getByText('SELECT * FROM users LIMIT 10;')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
    expect(screen.getByText('10 rows')).toBeInTheDocument();
  });

  it('copies SQL query to clipboard when copy button is clicked', () => {
    const writeTextMock = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    useStatusStore.getState().setStatus({
      lastQuery: 'SELECT id FROM orders;',
    });
    render(<StatusBar />);

    const copyBtn = screen.getByRole('button', { name: /copy sql/i });
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith('SELECT id FROM orders;');
  });

  it('displays Connected status when an active connection exists', () => {
    useConnectionStore.setState({
      connections: [{ id: 'c1', name: 'Local DB', driver: 'sqlite', database: 'main.db' }],
      activeConnectionId: 'c1',
    });
    render(<StatusBar />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});
