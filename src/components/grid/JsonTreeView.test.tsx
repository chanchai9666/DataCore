import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JsonTreeView } from './JsonTreeView';

describe('JsonTreeView', () => {
  it('renders JSON primitives correctly', () => {
    const data = {
      name: 'Alice',
      age: 28,
      isAdmin: true,
      bio: null,
    };

    render(<JsonTreeView data={data} />);

    expect(screen.getByText('"name":')).toBeInTheDocument();
    expect(screen.getByText('"Alice"')).toBeInTheDocument();
    expect(screen.getByText('"age":')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('"isAdmin":')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('null')).toBeInTheDocument();
  });

  it('allows collapsing and expanding nested objects', () => {
    const data = {
      user: {
        profile: {
          city: 'Bangkok',
        },
      },
    };

    render(<JsonTreeView data={data} />);

    expect(screen.getByText('"city":')).toBeInTheDocument();

    // Find collapse toggle button for "user"
    const toggleButtons = screen.getAllByRole('button', { name: /toggle-node/i });
    expect(toggleButtons.length).toBeGreaterThan(0);

    // Click collapse on top level
    fireEvent.click(toggleButtons[0]);
    // The inner city node should no longer be visible
    expect(screen.queryByText('"city":')).not.toBeInTheDocument();

    // Click expand again
    fireEvent.click(toggleButtons[0]);
    expect(screen.getByText('"city":')).toBeInTheDocument();
  });
});
