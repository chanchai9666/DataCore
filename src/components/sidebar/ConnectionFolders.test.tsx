import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ObjectBrowser } from './ObjectBrowser';
import { useConnectionStore } from '../../stores/connectionStore';
import { useFolderStore } from '../../stores/folderStore';
import { dbApi } from '../../api/db';
import * as dialogUtils from '../../utils/dialog';
import type { ConnectionConfig } from '../../types/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    getConnections: vi.fn(),
    saveConnection: vi.fn().mockResolvedValue(undefined),
    deleteConnection: vi.fn().mockResolvedValue(undefined),
    fetchSchema: vi.fn().mockResolvedValue([]),
    closeTabsForConnection: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../utils/dialog', () => ({
  showConfirmDialog: vi.fn().mockResolvedValue(true),
}));

describe('Connection Folders in ObjectBrowser', () => {
  const mockConnections: ConnectionConfig[] = [
    {
      id: 'conn-prod',
      name: 'Prod Postgres',
      driver: 'postgres',
      database: 'prod_db',
      folder: 'Production',
    },
    {
      id: 'conn-dev',
      name: 'Dev SQLite',
      driver: 'sqlite',
      database: ':memory:',
      folder: 'Development',
    },
    {
      id: 'conn-root',
      name: 'Standalone DB',
      driver: 'sqlite',
      database: ':memory:',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useFolderStore.getState().clearAll();
    useConnectionStore.setState({
      connections: mockConnections,
      activeConnectionId: null,
      connectedConnectionIds: [],
      loading: false,
      error: null,
    });
  });

  it('renders connection folders and groups connections by folder', () => {
    render(<ObjectBrowser />);

    // Folders should be rendered
    expect(screen.getByText('Production')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
    // Root connection should also be rendered
    expect(screen.getByText('Standalone DB')).toBeInTheDocument();
  });

  it('applies custom folder color to the folder icon', () => {
    useFolderStore.getState().addFolder('Production', '#3b82f6');

    render(<ObjectBrowser />);

    const folderNode = screen.getByText('Production');
    expect(folderNode).toBeInTheDocument();
    const folderIcon = screen.getAllByTestId('icon-folder').find((el) => {
      return el.getAttribute('style')?.includes('rgb(59, 130, 246)') || el.getAttribute('style')?.includes('#3b82f6');
    });
    expect(folderIcon).toBeDefined();
  });

  it('opens FolderModal and creates a new folder when New Folder button is clicked', async () => {
    render(<ObjectBrowser />);

    const newFolderBtn = screen.getByRole('button', { name: /new folder/i });
    expect(newFolderBtn).toBeInTheDocument();

    fireEvent.click(newFolderBtn);

    // Folder modal should open
    expect(screen.getByText('Create New Connection Folder')).toBeInTheDocument();

    // Type folder name
    const input = screen.getByLabelText(/folder name/i);
    fireEvent.change(input, { target: { value: 'Analytics' } });

    // Choose color (e.g. Purple #a855f7)
    const purpleBtn = screen.getByTitle('Purple');
    fireEvent.click(purpleBtn);

    // Click Create
    const createBtn = screen.getByRole('button', { name: /^create$/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.queryByText('Create New Connection Folder')).not.toBeInTheDocument();
    });

    // Check store
    expect(useFolderStore.getState().customFolders).toContain('Analytics');
    expect(useFolderStore.getState().folderMetadata['Analytics']?.color).toBe('#a855f7');
    // Folder should now be visible in the tree
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('renames a folder and updates all connections inside it', async () => {
    render(<ObjectBrowser />);

    // Right-click on the Production folder
    const prodFolder = screen.getByText('Production');
    fireEvent.contextMenu(prodFolder);

    // Click Rename Folder...
    const renameMenuItem = screen.getByRole('button', { name: /rename folder\.\.\./i });
    expect(renameMenuItem).toBeInTheDocument();
    fireEvent.click(renameMenuItem);

    // Rename modal opens
    expect(screen.getByText('Rename Folder')).toBeInTheDocument();
    const input = screen.getByLabelText(/folder name/i);
    fireEvent.change(input, { target: { value: 'Production-EU' } });

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.queryByText('Rename Folder')).not.toBeInTheDocument();
    });

    // Folder should be renamed in store and connections
    expect(useFolderStore.getState().customFolders).toContain('Production-EU');
    expect(useConnectionStore.getState().connections.find((c) => c.id === 'conn-prod')?.folder).toBe('Production-EU');
    expect(dbApi.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conn-prod', folder: 'Production-EU' })
    );
  });

  it('deletes a folder and ungroups connections back to root level with confirmation', async () => {
    vi.mocked(dialogUtils.showConfirmDialog).mockResolvedValue(true);

    render(<ObjectBrowser />);

    const prodFolder = screen.getByText('Production');
    fireEvent.contextMenu(prodFolder);

    const deleteBtn = screen.getByRole('button', { name: /delete folder/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(dialogUtils.showConfirmDialog).toHaveBeenCalledWith(
        expect.stringContaining('Are you sure you want to delete folder "Production"'),
        expect.anything()
      );
    });

    // Connection should now have folder cleared to undefined
    expect(useConnectionStore.getState().connections.find((c) => c.id === 'conn-prod')?.folder).toBeUndefined();
    expect(dbApi.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conn-prod', folder: undefined })
    );
  });

  it('moves a connection into another folder via context menu', async () => {
    render(<ObjectBrowser />);

    const rootConn = screen.getByText('Standalone DB');
    fireEvent.contextMenu(rootConn);

    const moveFolderBtn = screen.getByTestId('connection-move-folder-btn');
    expect(moveFolderBtn).toBeInTheDocument();

    // Click on Development folder option
    const devFolderBtn = screen.getByRole('button', { name: /development/i });
    fireEvent.click(devFolderBtn);

    await waitFor(() => {
      expect(useConnectionStore.getState().connections.find((c) => c.id === 'conn-root')?.folder).toBe('Development');
    });
    expect(dbApi.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conn-root', folder: 'Development' })
    );
  });
});
