import React from 'react';
import { Table as TableIcon, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface TableModeSwitcherProps {
  currentMode: 'data' | 'structure';
  onModeChange: (mode: 'data' | 'structure') => void;
}

export const TableModeSwitcher: React.FC<TableModeSwitcherProps> = ({
  currentMode,
  onModeChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center p-0.5 rounded-lg border border-line bg-sidebar">
      <button
        type="button"
        data-testid="table-mode-data-btn"
        onClick={() => onModeChange('data')}
        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
          currentMode === 'data'
            ? 'bg-panel text-text shadow-xs'
            : 'text-muted hover:text-text'
        }`}
      >
        <TableIcon className="w-3.5 h-3.5 text-blue-500" />
        <span>{t('structure.dataMode', 'Data')}</span>
      </button>
      <button
        type="button"
        data-testid="table-mode-structure-btn"
        onClick={() => onModeChange('structure')}
        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
          currentMode === 'structure'
            ? 'bg-panel text-text shadow-xs'
            : 'text-muted hover:text-text'
        }`}
      >
        <Wrench className="w-3.5 h-3.5 text-amber-500" />
        <span>{t('structure.structureMode', 'Structure')}</span>
      </button>
    </div>
  );
};
