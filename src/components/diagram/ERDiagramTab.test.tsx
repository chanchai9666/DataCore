import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERDiagramTab } from './ERDiagramTab';
import * as erDiagramApi from '../../api/erDiagramApi';
import * as dataTransferApi from '../../api/dataTransferApi';
import * as dialog from '@tauri-apps/plugin-dialog';
import type { ERDiagramData } from '../../types/db';

vi.mock('../../api/erDiagramApi', async () => {
  const actual = await vi.importActual<typeof erDiagramApi>('../../api/erDiagramApi');
  return {
    ...actual,
    fetchERDiagramData: vi.fn(),
  };
});

vi.mock('../../api/dataTransferApi', () => ({
  saveTextFile: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

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
      expect(screen.getAllByText('customers').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('orders').length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getAllByText('customers').length).toBeGreaterThanOrEqual(1);
    });

    const searchInput = screen.getByPlaceholderText(/search tables/i);
    fireEvent.change(searchInput, { target: { value: 'order' } });

    // Matching count indicator
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
      expect(screen.getAllByText('customers').length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getAllByText('customers').length).toBeGreaterThanOrEqual(1);
    });

    const autoLayoutBtn = screen.getByTestId('er-auto-layout');
    fireEvent.click(autoLayoutBtn);

    expect(screen.getAllByText('customers').length).toBeGreaterThanOrEqual(1);
  });

  it('jumps to a selected table via quick-jump dropdown', async () => {
    render(
      <ERDiagramTab
        connectionId="conn_1"
        driver="sqlite"
        schemaName="main"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('er-jump-select')).toBeInTheDocument();
    });

    const jumpSelect = screen.getByTestId('er-jump-select');
    fireEvent.change(jumpSelect, { target: { value: 'orders' } });

    expect((jumpSelect as HTMLSelectElement).value).toBe('orders');
  });

  it('stops wheel propagation inside table columns container to prevent canvas zooming', async () => {
    render(
      <ERDiagramTab
        connectionId="conn_1"
        driver="sqlite"
        schemaName="main"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('table-columns-customers')).toBeInTheDocument();
    });

    const colContainer = screen.getByTestId('table-columns-customers');
    const wheelEvent = new WheelEvent('wheel', { deltaY: -50, bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(wheelEvent, 'stopPropagation');

    colContainer.dispatchEvent(wheelEvent);
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('toggles radar mini-map visibility', async () => {
    render(
      <ERDiagramTab
        connectionId="conn_1"
        driver="sqlite"
        schemaName="main"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('er-minimap-card')).toBeInTheDocument();
    });

    // Collapse mini-map
    const toggleBtn = screen.getByTestId('er-minimap-toggle');
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('er-minimap-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('er-minimap-open')).toBeInTheDocument();

    // Reopen mini-map
    fireEvent.click(screen.getByTestId('er-minimap-open'));
    expect(screen.getByTestId('er-minimap-card')).toBeInTheDocument();
  });

  it('exports SVG using native save dialog when destination is chosen', async () => {
    vi.mocked(dialog.save).mockResolvedValue('/Users/chanchai/Desktop/main_er_diagram.svg');
    vi.mocked(dataTransferApi.saveTextFile).mockResolvedValue(undefined);

    render(
      <ERDiagramTab
        connectionId="conn_1"
        driver="sqlite"
        schemaName="main"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('er-export-btn')).toBeInTheDocument();
    });

    // Open export menu
    fireEvent.click(screen.getByTestId('er-export-btn'));

    // Click export SVG
    const exportSvgOption = screen.getByText(/export as svg image/i);
    fireEvent.click(exportSvgOption);

    await waitFor(() => {
      expect(dialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'main_er_diagram.svg',
          filters: expect.arrayContaining([
            expect.objectContaining({ extensions: ['svg'] }),
          ]),
        })
      );
      expect(dataTransferApi.saveTextFile).toHaveBeenCalledWith(
        '/Users/chanchai/Desktop/main_er_diagram.svg',
        expect.stringContaining('<svg')
      );
    });
  });

  it('smoothly drags table card with window-level events and without transform transition', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    render(
      <ERDiagramTab
        connectionId="conn_1"
        driver="sqlite"
        schemaName="main"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('table-card-customers')).toBeInTheDocument();
    });

    const card = screen.getByTestId('table-card-customers');
    const header = card.querySelector('.table-card-header')!;

    // Initial position
    expect(card.style.transform).toBe('translate(50px, 50px)');

    // Start dragging
    fireEvent.mouseDown(header, { clientX: 100, clientY: 100, button: 0 });

    // Dragging state applied: elevated zIndex, transition-none, cursor-grabbing
    expect(card.className).toContain('transition-none');
    expect(card.style.zIndex).toBe('30');
    expect(card.style.willChange).toBe('transform');

    // Move mouse on window
    fireEvent.mouseMove(window, { clientX: 180, clientY: 150 });

    // Position updated smoothly to (50 + 80, 50 + 50) = (130, 100)
    expect(card.style.transform).toBe('translate(130px, 100px)');

    // Release mouse on window
    fireEvent.mouseUp(window);

    // Dragging state cleared
    expect(card.className).not.toContain('transition-none');
    expect(card.style.zIndex).toBe('20');
  });
});
