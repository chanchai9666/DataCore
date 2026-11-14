import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DisconnectedTableScreen } from './DisconnectedTableScreen';

describe('DisconnectedTableScreen', () => {
  const defaultProps = {
    tableName: 'categories',
    connectionId: 'conn-pos-v2',
    connectionName: 'POS V2',
    schemaName: 'public',
    driver: 'postgres',
    environment: 'production' as const,
    host: 'localhost',
    port: 5432,
    database: 'pos_db',
    theme: 'dark' as const,
    isConnecting: false,
    onConnect: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders table context information correctly', () => {
    render(<DisconnectedTableScreen {...defaultProps} />);

    expect(screen.getByText('Connection is Disconnected')).toBeInTheDocument();
    expect(screen.getByText('categories')).toBeInTheDocument();
    expect(screen.getByText('POS V2')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText('postgres')).toBeInTheDocument();
    expect(screen.getByText('localhost:5432')).toBeInTheDocument();
  });

  it('calls onConnect when "Connect & Load" is clicked', () => {
    const onConnect = vi.fn();
    render(<DisconnectedTableScreen {...defaultProps} onConnect={onConnect} />);

    const connectBtn = screen.getByTestId('btn-connect-and-load');
    fireEvent.click(connectBtn);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when "Close Tab" is clicked', () => {
    const onClose = vi.fn();
    render(<DisconnectedTableScreen {...defaultProps} onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /close tab/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows connecting state and disables buttons while connecting', () => {
    render(<DisconnectedTableScreen {...defaultProps} isConnecting={true} />);

    expect(screen.getByText(/connecting\.\.\./i)).toBeInTheDocument();
    const connectBtn = screen.getByTestId('btn-connect-and-load');
    expect(connectBtn).toBeDisabled();
    const closeBtn = screen.getByRole('button', { name: /close tab/i });
    expect(closeBtn).toBeDisabled();
  });

  it('renders correctly in light mode', () => {
    const { container } = render(<DisconnectedTableScreen {...defaultProps} theme="light" />);
    expect(container.querySelector('.bg-slate-50')).toBeInTheDocument();
  });
});
