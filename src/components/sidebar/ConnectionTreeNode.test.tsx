import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectionTreeNode, type BrowserTreeNode } from './ConnectionTreeNode';
import type { NodeRendererProps } from 'react-arborist';

function createMockNode(data: BrowserTreeNode): NodeRendererProps<BrowserTreeNode>['node'] {
  return {
    id: data.id,
    data,
    level: 0,
    rowIndex: 0,
    isOpen: false,
    isClosed: true,
    isLeaf: false,
    isSelected: false,
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
});
