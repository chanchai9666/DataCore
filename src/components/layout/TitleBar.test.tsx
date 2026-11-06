import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TitleBar } from './TitleBar';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import type { ConnectionConfig } from '../../types/db';

describe('TitleBar', () => {
  const mockConn: ConnectionConfig = {
    id: 'c1',
    name: 'Production Postgres',
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

  it('renders application branding and macOS drag region', () => {
    render(<TitleBar />);
    expect(screen.getByText('DataCore')).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(header).toHaveAttribute('data-tauri-drag-region');
    expect(screen.getByText(/no connection selected/i)).toBeInTheDocument();
  });

  it('displays active connection badge with driver information', () => {
    useConnectionStore.setState({ activeConnectionId: 'c1' });
    render(<TitleBar />);
    expect(screen.getByText('Production Postgres')).toBeInTheDocument();
    expect(screen.getByText('postgres')).toBeInTheDocument();
  });

  it('triggers onNewConnection callback when button is clicked', () => {
    const onNewConnection = vi.fn();
    render(<TitleBar onNewConnection={onNewConnection} />);

    const newBtn = screen.getByRole('button', { name: /new connection/i });
    fireEvent.click(newBtn);
    expect(onNewConnection).toHaveBeenCalledTimes(1);
  });

  it('toggles theme when theme toggle button is clicked', () => {
    const onToggleTheme = vi.fn();
    const { rerender } = render(
      <TitleBar theme="dark" onToggleTheme={onToggleTheme} />
    );

    const toggleBtn = screen.getByRole('button', { name: /switch to light mode/i });
    fireEvent.click(toggleBtn);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);

    rerender(<TitleBar theme="light" onToggleTheme={onToggleTheme} />);
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
  });
});
