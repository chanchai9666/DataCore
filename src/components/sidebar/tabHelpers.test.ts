import { describe, it, expect, beforeEach } from 'vitest';
import { openQueryTab, openTableTab } from './tabHelpers';
import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ConnectionConfig } from '../../types/db';

describe('tabHelpers', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null });
    useConnectionStore.setState({
      connections: [
        {
          id: 'conn-mysql-1',
          name: 'MySQL DB',
          driver: 'mysql',
          database: 'testdb',
        } as ConnectionConfig,
        {
          id: 'conn-pg-1',
          name: 'Postgres DB',
          driver: 'postgres',
          database: 'testdb',
        } as ConnectionConfig,
      ],
      activeConnectionId: null,
      loading: false,
      error: null,
    });
  });

  describe('openTableTab', () => {
    it('opens a table tab with type table and empty query content', () => {
      openTableTab({
        connectionId: 'conn-1',
        tableName: 'users',
        schemaName: 'public',
      });

      const tabs = useTabStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].type).toBe('table');
      expect(tabs[0].tableName).toBe('users');
      expect(tabs[0].schemaName).toBe('public');
      expect(tabs[0].queryContent).toBe('');
    });
  });

  describe('openQueryTab', () => {
    it('quotes MySQL identifiers with backticks when driver is explicitly passed', () => {
      openQueryTab({
        connectionId: 'conn-mysql-1',
        tableName: 'order_items',
        schemaName: 'store',
        driver: 'mysql',
      });

      const tabs = useTabStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].queryContent).toBe('SELECT * FROM `store`.`order_items` LIMIT 100;\n');
    });

    it('quotes MySQL identifiers with backticks when driver is resolved from store', () => {
      openQueryTab({
        connectionId: 'conn-mysql-1',
        tableName: 'customers',
      });

      const tabs = useTabStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].queryContent).toBe('SELECT * FROM `customers` LIMIT 100;\n');
    });

    it('quotes Postgres identifiers with double quotes when driver is postgres', () => {
      openQueryTab({
        connectionId: 'conn-pg-1',
        tableName: 'users',
        schemaName: 'public',
        driver: 'postgres',
      });

      const tabs = useTabStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].queryContent).toBe('SELECT * FROM "public"."users" LIMIT 100;\n');
    });

    it('quotes with double quotes for default/unspecified non-mysql drivers', () => {
      openQueryTab({
        connectionId: 'conn-other',
        tableName: 'logs',
      });

      const tabs = useTabStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].queryContent).toBe('SELECT * FROM "logs" LIMIT 100;\n');
    });

    it('creates an empty queryContent when tableName is not provided (blank query tab)', () => {
      openQueryTab({
        connectionId: 'conn-pg-1',
        connectionName: 'Postgres DB',
      });

      const tabs = useTabStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].queryContent).toBe('');
      expect(tabs[0].title).toBe('Query (Postgres DB)');
    });
  });
});
