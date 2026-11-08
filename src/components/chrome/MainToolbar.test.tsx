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
});
