import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ExplorerBreadcrumb } from './ExplorerBreadcrumb';

describe('ExplorerBreadcrumb', () => {
  it('renders null when connectionName is missing', () => {
    const { container } = render(<ExplorerBreadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it('renders connection name and driver badge', () => {
    render(
      <ExplorerBreadcrumb
        connectionName="POS V2"
        driver="postgres"
      />
    );

    expect(screen.getByTestId('explorer-breadcrumb')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-connection')).toHaveTextContent('POS V2');
    expect(screen.getByText('PG')).toBeInTheDocument();
  });

  it('renders database and schema segments when provided', () => {
    render(
      <ExplorerBreadcrumb
        connectionName="POS V2"
        driver="postgres"
        databaseName="postgres"
        schemaName="public"
        tableName="sale_lines"
      />
    );

    expect(screen.getByTestId('breadcrumb-connection')).toHaveTextContent('POS V2');
    expect(screen.getByTestId('breadcrumb-database')).toHaveTextContent('postgres');
    expect(screen.getByTestId('breadcrumb-schema')).toHaveTextContent('public');
    expect(screen.getByTestId('breadcrumb-table')).toHaveTextContent('sale_lines');
  });

  it('calls onSelectNode with correct target when segments are clicked', () => {
    const handleSelectNode = vi.fn();

    render(
      <ExplorerBreadcrumb
        connectionName="POS V2"
        driver="postgres"
        databaseName="postgres"
        schemaName="public"
        tableName="sale_lines"
        onSelectNode={handleSelectNode}
      />
    );

    fireEvent.click(screen.getByTestId('breadcrumb-connection'));
    expect(handleSelectNode).toHaveBeenCalledWith('connection');

    fireEvent.click(screen.getByTestId('breadcrumb-database'));
    expect(handleSelectNode).toHaveBeenCalledWith('database');

    fireEvent.click(screen.getByTestId('breadcrumb-schema'));
    expect(handleSelectNode).toHaveBeenCalledWith('schema');

    fireEvent.click(screen.getByTestId('breadcrumb-table'));
    expect(handleSelectNode).toHaveBeenCalledWith('table');
  });

  it('calls onLocateActive when locate button is clicked', () => {
    const handleLocate = vi.fn();

    render(
      <ExplorerBreadcrumb
        connectionName="POS V2"
        driver="postgres"
        tableName="sale_lines"
        onLocateActive={handleLocate}
      />
    );

    const locateBtn = screen.getByTestId('breadcrumb-locate-btn');
    expect(locateBtn).toBeInTheDocument();
    fireEvent.click(locateBtn);
    expect(handleLocate).toHaveBeenCalledTimes(1);
  });
});
