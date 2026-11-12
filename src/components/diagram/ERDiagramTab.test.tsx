import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERDiagramTab } from './ERDiagramTab';
import * as erDiagramApi from '../../api/erDiagramApi';
import type { ERDiagramData } from '../../types/db';

vi.mock('../../api/erDiagramApi', async () => {
  const actual = await vi.importActual<typeof erDiagramApi>('../../api/erDiagramApi');
  return {
    ...actual,
    fetchERDiagramData: vi.fn(),
  };
});

describe('ERDiagramTab', () => {
  const mockDiagramData: ERDiagramData = {
    tables: [
      {
        id: 'customers',
        name: 'customers',
        x: 50,
        y: 50,
        columns: [
          { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
          { name: 'name', dataType: 'TEXT', isPrimaryKey: false, isNullable: false },
        ],
      },
      {
        id: 'orders',
        name: 'orders',
        x: 400,
        y: 50,
        columns: [
          { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
          { name: 'customer_id', dataType: 'INTEGER', isPrimaryKey: false, isNullable: false },
        ],
      },
    ],
    relationships: [
      {
        id: 'rel_orders_customers',
        fromTable: 'orders',
        fromColumn: 'customer_id',
        toTable: 'customers',
        toColumn: 'id',
        constraintName: 'fk_orders_customer',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(erDiagramApi.fetchERDiagramData).mockResolvedValue(mockDiagramData);
  });

  it('renders loading state initially and then displays tables and relationships', async () => {
    render(
      <ERDiagramTab
        connectionId="conn_1"
        driver="sqlite"
        schemaName="main"
      />
    );

    expect(screen.getByText(/loading er diagram/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('customers')).toBeInTheDocument();
      expect(screen.getByText('orders')).toBeInTheDocument();
      expect(screen.getByText('customer_id')).toBeInTheDocument();
    });

    // Check header badges
    expect(screen.getByText(/2 tables/i)).toBeInTheDocument();
    expect(screen.getByText(/1 relations/i)).toBeInTheDocument();
  });

  it('filters tables based on search query', async () => {
    render(
      <ERDiagramTab
        connectionId="conn_1"
        driver="sqlite"
        schemaName="main"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('customers')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search tables/i);
    fireEvent.change(searchInput, { target: { value: 'order' } });

    // Both tables exist in DOM, but filtered state highlights or counts
    expect(screen.getByText(/matching: 1/i)).toBeInTheDocument();
  });

  it('handles zoom controls', async () => {
    render(
      <ERDiagramTab
        connectionId="conn_1"
        driver="sqlite"
        schemaName="main"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('customers')).toBeInTheDocument();
    });

    const zoomInBtn = screen.getByTestId('er-zoom-in');
    const zoomOutBtn = screen.getByTestId('er-zoom-out');
    const zoomResetBtn = screen.getByTestId('er-zoom-reset');

    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(zoomInBtn);
    expect(screen.getByText('115%')).toBeInTheDocument();

    fireEvent.click(zoomOutBtn);
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(zoomResetBtn);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('triggers auto layout on button click', async () => {
    render(
      <ERDiagramTab
        connectionId="conn_1"
        driver="sqlite"
        schemaName="main"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('customers')).toBeInTheDocument();
    });

    const autoLayoutBtn = screen.getByTestId('er-auto-layout');
    fireEvent.click(autoLayoutBtn);

    expect(screen.getByText('customers')).toBeInTheDocument();
  });
});
