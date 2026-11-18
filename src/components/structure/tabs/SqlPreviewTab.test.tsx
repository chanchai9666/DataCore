import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SqlPreviewTab, hasDestructiveDdl } from './SqlPreviewTab';

describe('SqlPreviewTab', () => {
  it('renders DDL SQL, copies to clipboard, and opens in Query Editor', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onOpenInEditor = vi.fn();

    render(
      <SqlPreviewTab
        sql="CREATE TABLE users (id INT PRIMARY KEY);"
        connectionId="conn-1"
        tableName="users"
        onOpenInEditor={onOpenInEditor}
      />
    );

    expect(screen.getByText('CREATE TABLE users (id INT PRIMARY KEY);')).toBeInTheDocument();
    expect(screen.queryByTestId('sql-preview-destructive-warning')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sql-preview-copy-btn'));
    expect(writeText).toHaveBeenCalledWith('CREATE TABLE users (id INT PRIMARY KEY);');

    fireEvent.click(screen.getByTestId('sql-preview-open-editor-btn'));
    expect(onOpenInEditor).toHaveBeenCalledWith('CREATE TABLE users (id INT PRIMARY KEY);');
  });

  it('shows destructive DDL warning for DROP COLUMN and ALTER COLUMN TYPE', () => {
    expect(hasDestructiveDdl('ALTER TABLE users DROP COLUMN legacy;')).toBe(true);
    expect(hasDestructiveDdl('ALTER TABLE users ALTER COLUMN age TYPE BIGINT;')).toBe(true);
    expect(hasDestructiveDdl('CREATE TABLE users (id INT);')).toBe(false);

    render(
      <SqlPreviewTab
        sql="ALTER TABLE users DROP COLUMN legacy;"
        connectionId="conn-1"
        tableName="users"
      />
    );

    expect(screen.getByTestId('sql-preview-destructive-warning')).toBeInTheDocument();
  });
});
