import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectionTreeNode, ObjectBrowserContext, type BrowserTreeNode } from './ConnectionTreeNode';
import type { NodeRendererProps } from 'react-arborist';

function createMockNode(data: BrowserTreeNode, isSelected = false): NodeRendererProps<BrowserTreeNode>['node'] {
  return {
    id: data.id,
    data,
    level: 0,
    rowIndex: 0,
    isOpen: false,
    isClosed: true,
    isLeaf: false,
    isSelected,
    isHovered: false,
    isFocused: false,
    isDragging: false,
    isWillReceiveFocus: false,
    state: {} as any,
    tree: {} as any,
    childIndex: 0,
    parent: null,
    children: [],
    select: vi.fn(),
    deselect: vi.fn(),
    selectMulti: vi.fn(),
    selectContiguous: vi.fn(),
    toggle: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    edit: vi.fn(),
    submit: vi.fn(),
    reset: vi.fn(),
    focus: vi.fn(),
  } as unknown as NodeRendererProps<BrowserTreeNode>['node'];
}

describe('ConnectionTreeNode Badges', () => {
  it('renders Production badge with red styling and RO badge when readOnly is true', () => {
    const data: BrowserTreeNode = {
      id: 'conn-prod',
      name: 'Prod Database',
      nodeType: 'connection',
      connectionId: 'conn-prod',
      driver: 'postgres',
      environment: 'production',
      readOnly: true,
    };

    const node = createMockNode(data);
    render(<ConnectionTreeNode node={node} style={{}} dragHandle={vi.fn()} tree={{} as any} />);

    const envBadge = screen.getByTestId('badge-environment');
    expect(envBadge).toBeInTheDocument();
    expect(envBadge).toHaveTextContent('PROD');
    expect(envBadge.className).toContain('text-red-400');

    const roBadge = screen.getByTestId('badge-readonly');
    expect(roBadge).toBeInTheDocument();
    expect(roBadge).toHaveTextContent('RO');
  });

  it('renders Staging badge with amber styling', () => {
    const data: BrowserTreeNode = {
      id: 'conn-stg',
      name: 'Staging Database',
      nodeType: 'connection',
      connectionId: 'conn-stg',
      driver: 'mysql',
      environment: 'staging',
      readOnly: false,
    };

    const node = createMockNode(data);
    render(<ConnectionTreeNode node={node} style={{}} dragHandle={vi.fn()} tree={{} as any} />);

    const envBadge = screen.getByTestId('badge-environment');
    expect(envBadge).toBeInTheDocument();
    expect(envBadge).toHaveTextContent('STAGING');
    expect(envBadge.className).toContain('text-amber-400');
    expect(screen.queryByTestId('badge-readonly')).not.toBeInTheDocument();
  });

  it('renders Development badge with emerald styling', () => {
    const data: BrowserTreeNode = {
      id: 'conn-dev',
      name: 'Dev Database',
      nodeType: 'connection',
      connectionId: 'conn-dev',
      driver: 'sqlite',
      environment: 'development',
    };

    const node = createMockNode(data);
    render(<ConnectionTreeNode node={node} style={{}} dragHandle={vi.fn()} tree={{} as any} />);

    const envBadge = screen.getByTestId('badge-environment');
    expect(envBadge).toBeInTheDocument();
    expect(envBadge).toHaveTextContent('DEV');
    expect(envBadge.className).toContain('text-emerald-400');
  });

  it('renders Show Columns button on table node and calls onLoadTableColumns and toggle on click', () => {
    const onLoadTableColumns = vi.fn();
    const data: BrowserTreeNode = {
      id: 'table-users',
      name: 'users',
      nodeType: 'table',
      connectionId: 'conn-1',
      tableName: 'users',
      driver: 'sqlite',
    };

    const node = createMockNode(data);
    render(
      <ObjectBrowserContext.Provider value={{ onLoadTableColumns }}>
        <ConnectionTreeNode node={node} style={{}} dragHandle={vi.fn()} tree={{} as any} />
      </ObjectBrowserContext.Provider>
    );

    const toggleColsBtn = screen.getByTestId('btn-toggle-columns');
    expect(toggleColsBtn).toBeInTheDocument();
    expect(toggleColsBtn).toHaveAttribute('title', 'Show Columns');

    fireEvent.click(toggleColsBtn);
    expect(onLoadTableColumns).toHaveBeenCalledWith(data);
    expect(node.toggle).toHaveBeenCalled();
  });

  it('does not toggle or load columns when table row is clicked', () => {
    const onLoadTableColumns = vi.fn();
    const data: BrowserTreeNode = {
      id: 'table-users',
      name: 'users',
      nodeType: 'table',
      connectionId: 'conn-1',
      tableName: 'users',
      driver: 'sqlite',
    };

    const node = createMockNode(data);
    render(
      <ObjectBrowserContext.Provider value={{ onLoadTableColumns }}>
        <ConnectionTreeNode node={node} style={{}} dragHandle={vi.fn()} tree={{} as any} />
      </ObjectBrowserContext.Provider>
    );

    const tableName = screen.getByText('users');
    fireEvent.click(tableName);

    expect(node.select).toHaveBeenCalled();
    expect(node.toggle).not.toHaveBeenCalled();
    expect(onLoadTableColumns).not.toHaveBeenCalled();
  });

  it('renders luminous active indicator symbol for active connection and table', () => {
    const connData: BrowserTreeNode = {
      id: 'conn-pg',
      name: 'POS V2',
      nodeType: 'connection',
      connectionId: 'conn-pg',
      driver: 'postgres',
    };

    const connNode = createMockNode(connData);
    const { rerender } = render(
      <ObjectBrowserContext.Provider value={{ activeConnectionId: 'conn-pg' }}>
        <ConnectionTreeNode node={connNode} style={{}} dragHandle={vi.fn()} tree={{} as any} />
      </ObjectBrowserContext.Provider>
    );

    const connIndicator = screen.getByTestId('indicator-active-connection');
    expect(connIndicator).toBeInTheDocument();
    expect(connIndicator.className).toContain('bg-emerald-500');
    expect(connIndicator.className).toContain('mr-2.5');

    const tableData: BrowserTreeNode = {
      id: 'table-credit',
      name: 'credit_accounts',
      nodeType: 'table',
      connectionId: 'conn-pg',
      tableName: 'credit_accounts',
      driver: 'postgres',
    };

    const tableNode = createMockNode(tableData);
    rerender(
      <ObjectBrowserContext.Provider value={{ activeConnectionId: 'conn-pg', activeTableName: 'credit_accounts' }}>
        <ConnectionTreeNode node={tableNode} style={{}} dragHandle={vi.fn()} tree={{} as any} />
      </ObjectBrowserContext.Provider>
    );

    const tableIndicator = screen.getByTestId('indicator-active-table');
    expect(tableIndicator).toBeInTheDocument();
    expect(tableIndicator.className).toContain('bg-emerald-500');
  });

  describe('Multi-Selection and Context Menu for Columns', () => {
    it('supports Cmd/Ctrl+click to multi-select or deselect column', () => {
      const colData: BrowserTreeNode = {
        id: 'col-id',
        name: 'id',
        nodeType: 'column',
        connectionId: 'conn-1',
        tableName: 'users',
        dataType: 'varchar',
      };

      const node = createMockNode(colData);
      const { rerender } = render(
        <ConnectionTreeNode node={node} style={{}} dragHandle={vi.fn()} tree={{} as any} />
      );

      const colElement = screen.getByText('id');
      // Cmd/Ctrl+Click when unselected -> selectMulti
      fireEvent.click(colElement, { metaKey: true });
      expect(node.selectMulti).toHaveBeenCalledTimes(1);

      // Cmd/Ctrl+Click when selected -> deselect
      const selectedNode = createMockNode(colData, true);
      rerender(
        <ConnectionTreeNode node={selectedNode} style={{}} dragHandle={vi.fn()} tree={{} as any} />
      );
      fireEvent.click(colElement, { metaKey: true });
      expect(selectedNode.deselect).toHaveBeenCalledTimes(1);
    });

    it('supports Shift+click to select contiguous range of nodes', () => {
      const colData: BrowserTreeNode = {
        id: 'col-name',
        name: 'name',
        nodeType: 'column',
        connectionId: 'conn-1',
        tableName: 'users',
        dataType: 'varchar',
      };

      const node = createMockNode(colData);
      render(<ConnectionTreeNode node={node} style={{}} dragHandle={vi.fn()} tree={{} as any} />);

      const colElement = screen.getByText('name');
      fireEvent.click(colElement, { shiftKey: true });
      expect(node.selectContiguous).toHaveBeenCalledTimes(1);
    });

    it('preserves multi-selection on context menu when node is already selected', () => {
      const colData: BrowserTreeNode = {
        id: 'col-email',
        name: 'email',
        nodeType: 'column',
        connectionId: 'conn-1',
        tableName: 'users',
        dataType: 'varchar',
      };

      const onContextMenuNode = vi.fn();
      const node = createMockNode(colData, true); // Already selected as part of multi-select

      render(
        <ObjectBrowserContext.Provider value={{ onContextMenuNode }}>
          <ConnectionTreeNode node={node} style={{}} dragHandle={vi.fn()} tree={{} as any} />
        </ObjectBrowserContext.Provider>
      );

      const colElement = screen.getByText('email');
      fireEvent.contextMenu(colElement);

      // Should not call node.select() to avoid blowing away other selected nodes
      expect(node.select).not.toHaveBeenCalled();
      expect(onContextMenuNode).toHaveBeenCalledWith(expect.anything(), colData);
    });

    it('selects unselected node on context menu', () => {
      const colData: BrowserTreeNode = {
        id: 'col-phone',
        name: 'phone',
        nodeType: 'column',
        connectionId: 'conn-1',
        tableName: 'users',
        dataType: 'varchar',
      };

      const onContextMenuNode = vi.fn();
      const node = createMockNode(colData, false);

      render(
        <ObjectBrowserContext.Provider value={{ onContextMenuNode }}>
          <ConnectionTreeNode node={node} style={{}} dragHandle={vi.fn()} tree={{} as any} />
        </ObjectBrowserContext.Provider>
      );

      const colElement = screen.getByText('phone');
      fireEvent.contextMenu(colElement);

      expect(node.select).toHaveBeenCalledTimes(1);
      expect(onContextMenuNode).toHaveBeenCalledWith(expect.anything(), colData);
    });
  });
});
