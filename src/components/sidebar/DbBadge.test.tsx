import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DbBadge } from './DbBadge';

describe('DbBadge Component', () => {
  it('renders nothing when driver is undefined', () => {
    const { container } = render(<DbBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders PG badge for postgres driver', () => {
    render(<DbBadge driver="postgres" />);
    const badge = screen.getByTestId('db-badge');
    expect(badge).toHaveTextContent('PG');
    expect(badge).toHaveAttribute('data-driver', 'postgres');
  });

  it('renders MY badge for mysql driver', () => {
    render(<DbBadge driver="mysql" />);
    const badge = screen.getByTestId('db-badge');
    expect(badge).toHaveTextContent('MY');
    expect(badge).toHaveAttribute('data-driver', 'mysql');
  });

  it('renders SQ badge for sqlite driver', () => {
    render(<DbBadge driver="sqlite" />);
    const badge = screen.getByTestId('db-badge');
    expect(badge).toHaveTextContent('SQ');
    expect(badge).toHaveAttribute('data-driver', 'sqlite');
  });
});
