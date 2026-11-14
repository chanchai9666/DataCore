import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Folder, Check } from 'lucide-react';
import { FOLDER_COLORS } from '../../stores/folderStore';

export interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'rename' | 'color';
  initialFolderName?: string;
  initialColor?: string;
  existingFolders: string[];
  onSubmit: (data: { name: string; color: string }) => void;
}

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  onClose,
  mode,
  initialFolderName = '',
  initialColor = '#eab308',
  existingFolders,
  onSubmit,
}) => {
  const [folderName, setFolderName] = useState(initialFolderName);
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFolderName(initialFolderName);
      setSelectedColor(initialColor || '#eab308');
      setError(null);
    }
  }, [isOpen, initialFolderName, initialColor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = folderName.trim();

    if (mode !== 'color') {
      if (!trimmed) {
        setError('Folder name is required');
        return;
      }
      if (
        trimmed.toLowerCase() !== initialFolderName.toLowerCase() &&
        existingFolders.some((f) => f.toLowerCase() === trimmed.toLowerCase())
      ) {
        setError('A folder with this name already exists');
        return;
      }
    }

    onSubmit({
      name: mode === 'color' ? initialFolderName : trimmed,
      color: selectedColor,
    });
    onClose();
  };

  const title =
    mode === 'create'
      ? 'Create New Connection Folder'
      : mode === 'rename'
      ? 'Rename Folder'
      : 'Change Folder Color';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm animate-in fade-in duration-150" />
        <Dialog.Content
          role="dialog"
          aria-labelledby="folder-modal-title"
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl p-5 z-50 text-zinc-900 dark:text-zinc-100 animate-in zoom-in-95 duration-150 focus:outline-none"
        >
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-4">
            <div className="flex items-center gap-2">
              <Folder style={{ color: selectedColor }} className="w-5 h-5 shrink-0" />
              <Dialog.Title id="folder-modal-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {title}
              </Dialog.Title>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors rounded p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode !== 'color' && (
              <div>
                <label htmlFor="folder-name-input" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Folder Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="folder-name-input"
                  type="text"
                  value={folderName}
                  onChange={(e) => {
                    setFolderName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. Production, Staging, Client DBs"
                  autoFocus
                  className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-blue-500 rounded text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none transition-colors"
                />
                {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
              </div>
            )}

            {mode !== 'rename' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">Folder Color</label>
                <div className="grid grid-cols-5 gap-2.5">
                  {FOLDER_COLORS.map((c) => {
                    const isSelected = selectedColor.toLowerCase() === c.value.toLowerCase();
                    return (
                      <button
                        key={c.value}
                        type="button"
                        title={c.name}
                        onClick={() => setSelectedColor(c.value)}
                        className={`h-7 rounded flex items-center justify-center transition-all ${
                          isSelected ? 'ring-2 ring-blue-500 dark:ring-white scale-105 shadow-md' : 'hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.value }}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors border border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
              >
                {mode === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
