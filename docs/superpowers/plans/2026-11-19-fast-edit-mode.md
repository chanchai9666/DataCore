# Fast Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Excel-like Fast Edit Mode for table data grids with per-connection persistence (default OFF), forced Auto-Commit OFF (Staging Mode), inline cell editing, multi-cell/multi-row paste with auto-row-append & column truncation, data type validation alerts, and `Cmd+S` / `Ctrl+S` commit shortcut.

**Architecture:** Extract per-connection Fast Edit preference into a persisted Zustand store (`fastEditStore.ts`) and pure TSV/type-validation helpers into `fastEditUtils.ts`. Update `pendingChangesStore.ts` to support updating cells inside staged `addedRows`, update `gridUtils.ts` / `tableEditHelpers.ts` for Boolean/Bytes/Masked-PII cell rules, and wire `GridBottomBar.tsx` + `DataGrid.tsx` together with EN/TH localization.

**Tech Stack:** React 18, TypeScript, Zustand (`localStorage`), `@glideapps/glide-data-grid`, `react-i18next`, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-19-fast-edit-mode-design.md`

## Global Constraints

- **Default OFF & Per-Connection Persistence:** `isFastEditEnabled(connectionId)` returns `false` unless explicitly enabled for that `connectionId`; persisted across restarts in `localStorage`.
- **Forced Staging Mode:** When Fast Edit Mode is ON, `Auto-Commit` is forced OFF and its toggle button is disabled with an explanatory tooltip.
- **Explicit Commit Only:** No edits or pasted cells are persisted to the DB until the user clicks Commit or presses `Cmd+S` / `Ctrl+S`.
- **Read-Only Guard:** Fast Edit Mode is unavailable when `effectiveReadOnly` is true or `!effectiveIsEditable`.
- **PII Masking Guard:** Masked PII cells (`activeIsMasked && isSensitiveColumn(...)`) are `readonly: true` for inline edits and skipped during paste with a toast prompting to un-mask first.
- **Bytes Guard:** Binary/`Bytes` columns are `readonly: true` for inline edits/paste.
- **Empty Table Paste:** Pressing `Cmd+V` / `Ctrl+V` when `rowsCount === 0` in Fast Edit Mode pastes starting at `[0, 0]` and appends staged rows.
- **Extra Columns & Rows on Paste:** Extra pasted columns beyond `data.columns.length - startCol` are truncated; pasted rows beyond `baseRowsCount + addedRows.length` append new staged rows with unpasted columns left `undefined`.
- **Localization Parity:** All new translation keys must exist in both `src/locales/en.json` and `src/locales/th.json` and pass `i18nParity.test.ts`.

## Review Focus

- **Masked PII overwrite:** Clicking/typing/pasting onto a masked column when `activeIsMasked` is true must not stage `••••••••` and must alert the user to un-mask first.
- **Invalid type paste (e.g., text or timestamp into numeric column):** Must reject the invalid cell(s), keep existing cell data intact, and show a warning toast identifying the invalid column/value.
- **Trailing empty newline from Excel/Sheets TSV copy:** Excel copies `"a\tb\r\n"` with a trailing newline; pasting must not append a phantom blank row at the bottom.
- **Empty 0-row table paste:** Pasting into a table with `0` rows when Fast Edit Mode is ON must create staged `addedRows` starting at row `0` without crashing.
- **Toggling Fast Edit Mode ON while Auto-Commit was ON:** Must immediately switch the grid to Staging Mode and lock the Auto-Commit toggle until Fast Edit Mode is turned OFF.

---

### Task 1: Per-Connection Fast Edit Store & Added-Row Cell Updates

**Files:**
- Create: `src/stores/fastEditStore.ts`
- Create: `src/stores/fastEditStore.test.ts`
- Modify: `src/stores/pendingChangesStore.ts:18-115`
- Modify: `src/stores/pendingChangesStore.test.ts` (or create if absent)

**Interfaces:**
- Produces in `src/stores/fastEditStore.ts`:
  - `useFastEditStore`: Zustand store with `fastEditByConnection: Record<string, boolean>`, `isFastEditEnabled(connectionId?: string): boolean`, `setFastEditEnabled(connectionId: string, enabled: boolean): void`, `toggleFastEdit(connectionId: string): boolean`, `reset(): void`.
- Produces in `src/stores/pendingChangesStore.ts`:
  - `updateAddedRowCell(tableKey: string, addedRowIndex: number, colName: string, value: unknown): void`.

- [ ] **Step 1: Write the failing test for `fastEditStore` and `updateAddedRowCell`**

```ts
// src/stores/fastEditStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useFastEditStore } from './fastEditStore';

describe('fastEditStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useFastEditStore.getState().reset();
  });

  it('defaults to false for unknown connections and persists enabled state per connection', () => {
    expect(useFastEditStore.getState().isFastEditEnabled('conn-1')).toBe(false);
    expect(useFastEditStore.getState().isFastEditEnabled(undefined)).toBe(false);

    useFastEditStore.getState().setFastEditEnabled('conn-1', true);
    expect(useFastEditStore.getState().isFastEditEnabled('conn-1')).toBe(true);
    expect(useFastEditStore.getState().isFastEditEnabled('conn-2')).toBe(false);

    const saved = JSON.parse(localStorage.getItem('datacore-fast-edit-mode') || '{}');
    expect(saved['conn-1']).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/stores/fastEditStore.test.ts`
Expected: FAIL (module `./fastEditStore` not found)

- [ ] **Step 3: Implement `useFastEditStore` in `src/stores/fastEditStore.ts` and `updateAddedRowCell` in `src/stores/pendingChangesStore.ts`**
  - Read initial `fastEditByConnection` safely from `localStorage.getItem('datacore-fast-edit-mode')` and write back on `setFastEditEnabled` / `toggleFastEdit`.
  - Add `updateAddedRowCell` to `usePendingChangesStore` to immutably update `tables[tableKey].addedRows[addedRowIndex][colName]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/stores/fastEditStore.test.ts src/stores/pendingChangesStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/fastEditStore.ts src/stores/fastEditStore.test.ts src/stores/pendingChangesStore.ts
git commit -m "feat(store): add per-connection fastEditStore and updateAddedRowCell"
```

---

### Task 2: Type Validation, Boolean Coercion & TSV Paste Utilities

**Files:**
- Modify: `src/components/grid/tableEditHelpers.ts:19-73`
- Modify: `src/components/grid/tableEditHelpers.test.ts`
- Create: `src/components/grid/fastEditUtils.ts`
- Create: `src/components/grid/fastEditUtils.test.ts`

**Interfaces:**
- Produces in `src/components/grid/tableEditHelpers.ts`:
  - `isBooleanType(dataType: string): boolean`
  - Updated `sanitizeEditedCellValue(val: unknown, column?: ColumnMeta): unknown` supporting boolean string coercion (`true`/`false`/`1`/`0`/`t`/`f`).
- Produces in `src/components/grid/fastEditUtils.ts`:
  - `validateCellValueForColumn(rawText: string, column: ColumnMeta): { valid: true; value: unknown } | { valid: false; reason: string }`
  - `parseClipboardTsv(text: string): string[][]` (handles `\r\n` / `\n`, strips single trailing newline from Excel/Sheets)
  - `computePasteOperations(params: { startCol: number; startRow: number; matrix: readonly (readonly string[])[]; columns: ColumnMeta[]; baseRowsCount: number; existingAddedRowsCount: number; deletedRowIndices: number[]; isMasked: boolean; getOriginalValue: (rowIdx: number, colIdx: number) => unknown }): { cellEdits: CellChange[]; addedRowUpdates: Array<{ addedRowIndex: number; colName: string; value: unknown }>; newRows: Array<Record<string, unknown>>; skippedMaskedCount: number; invalidCells: Array<{ row: number; colName: string; value: string; reason: string }> }`

- [ ] **Step 1: Write failing tests in `src/components/grid/fastEditUtils.test.ts` and `tableEditHelpers.test.ts`**
  - Test cases:
    - Numeric column rejects `"abc"` and `"2026-01-01 10:00:00"` (`valid: false`) and accepts `"42"`, `"-3.14"`, `"NULL"`.
    - Boolean column accepts `"true"`, `"FALSE"`, `"1"`, `"0"` and rejects `"maybe"`.
    - JSON column rejects `"{bad json"` and accepts `'{"a":1}'`.
    - Date/Time column rejects `"hello world"` and accepts `"2026-11-19"` / `"2026-11-19T10:00:00Z"` / `"NOW()"`.
    - `parseClipboardTsv("a\tb\r\n1\t2\r\n")` returns `[["a", "b"], ["1", "2"]]` (no phantom empty row).
    - `computePasteOperations` truncates extra columns past `columns.length`, appends `newRows` when pasting past `baseRowsCount + existingAddedRowsCount` (leaving unpasted columns `undefined`), skips masked PII columns (`skippedMaskedCount > 0`), and works on `baseRowsCount === 0` at `[0, 0]`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/components/grid/fastEditUtils.test.ts src/components/grid/tableEditHelpers.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `isBooleanType` + coercion in `tableEditHelpers.ts` and `fastEditUtils.ts`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/components/grid/fastEditUtils.test.ts src/components/grid/tableEditHelpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/grid/tableEditHelpers.ts src/components/grid/tableEditHelpers.test.ts src/components/grid/fastEditUtils.ts src/components/grid/fastEditUtils.test.ts
git commit -m "feat(grid): add fast edit TSV paste and type validation utilities"
```

---

### Task 3: Grid Cell Capabilities (`gridUtils.ts`) & GridBottomBar Toggle + Auto-Commit Lock

**Files:**
- Modify: `src/components/grid/gridUtils.ts:125-220`
- Modify: `src/components/grid/GridBottomBar.tsx:15-195`
- Modify: `src/components/grid/GridBottomBar.test.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/th.json`

**Interfaces:**
- Consumes: `isBooleanType` from `./tableEditHelpers`, `isSensitiveColumn` from `../../utils/piiDetector`.
- Produces in `src/components/grid/gridUtils.ts`:
  - `createCellContent(val: CellValue, column?: ColumnMeta, maskSensitive = false, fastEditMode = false): GridCell`:
    - When `fastEditMode === true`:
      - If `maskSensitive && column && isSensitiveColumn(column.name)`: set `readonly: true, allowOverlay: false`.
      - If `val` is `Bytes`: set `readonly: true, allowOverlay: false`.
      - If `column` is boolean (`isBooleanType(column.data_type)`): set `allowOverlay: true, readonly: false` so user can type `true`/`false`.
- Produces in `src/components/grid/GridBottomBar.tsx`:
  - New optional props: `isFastEdit?: boolean`, `onToggleFastEdit?: () => void`.
  - Renders Fast Edit toggle button (when `onToggleFastEdit` is provided and `!isReadOnly`) and disables Auto-Commit toggle button when `isFastEdit` is true.

- [ ] **Step 1: Write failing tests in `src/components/grid/GridBottomBar.test.tsx` and `gridUtils` test**
  - Test that `GridBottomBar` renders the Fast Edit toggle button (`data-testid="fast-edit-toggle-btn"`), calls `onToggleFastEdit` on click, and disables the Auto-Commit button (`aria-label="Toggle Auto-Commit Mode"`) when `isFastEdit={true}`.
  - Test `createCellContent` with `fastEditMode = true` for masked PII (`readonly: true`), `Bytes` (`readonly: true`), and `Boolean` (`allowOverlay: true, readonly: false`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/components/grid/GridBottomBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement updates in `gridUtils.ts`, `GridBottomBar.tsx`, `src/locales/en.json`, and `src/locales/th.json`**

- [ ] **Step 4: Run tests including `i18nParity.test.ts`**

Run: `pnpm test src/components/grid/GridBottomBar.test.tsx src/test/i18nParity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/grid/gridUtils.ts src/components/grid/GridBottomBar.tsx src/components/grid/GridBottomBar.test.tsx src/locales/en.json src/locales/th.json
git commit -m "feat(grid): add Fast Edit toggle in GridBottomBar and cell edit guards"
```

---

### Task 4: Wire Fast Edit Mode, Paste, Type Validation & `Cmd+S` in `DataGrid.tsx`

**Files:**
- Modify: `src/components/grid/DataGrid.tsx`
- Modify: `src/components/grid/DataGrid.test.tsx`

**Interfaces:**
- Consumes: `useFastEditStore`, `validateCellValueForColumn`, `parseClipboardTsv`, `computePasteOperations`, `usePendingChangesStore.updateAddedRowCell`.

- [ ] **Step 1: Write failing tests in `src/components/grid/DataGrid.test.tsx`**
  - Test cases:
    1. When Fast Edit Mode is OFF (default), `onCellActivated` opens `CellDetailDrawer` as before.
    2. When Fast Edit Mode is ON (`useFastEditStore.getState().setFastEditEnabled('conn-1', true)`):
       - `Auto-Commit` is forced OFF (`Staging Mode`) and Auto-Commit toggle is disabled.
       - `DataEditor` receives `editOnType={true}` and `onPaste`.
       - `onCellActivated` does **not** open `CellDetailDrawer`.
       - Editing an invalid value in a numeric column (e.g. `"abc"`) via `onCellEdited` does not stage it and calls `toast.error`.
       - Editing an added row (`row >= baseRowsCount`) via `onCellEdited` updates `addedRows` in `usePendingChangesStore`.
       - Pasting a 2D block (`onPaste`) stages edits, appends new rows when exceeding existing rows (leaving unpasted columns `undefined`), truncates extra columns, skips masked PII with toast, and rejects invalid typed cells with toast.
       - Pasting into an empty 0-row table via container `onPaste` event stages new `addedRows` starting at `[0, 0]`.
       - Pressing `Cmd+S` / `Ctrl+S` on `data-grid-container` calls `onCommitChanges` when there are pending changes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Fast Edit Mode integration in `src/components/grid/DataGrid.tsx`**
  - Subscribe to `useFastEditStore` for `connectionId`; compute `activeIsFastEdit = Boolean(connectionId && effectiveIsEditable && !effectiveReadOnly && isFastEditEnabled)`.
  - Force `activeIsAutoCommit = activeIsFastEdit ? false : ...`.
  - Pass `editOnType={activeIsFastEdit}` and `onPaste={activeIsFastEdit ? handleGridPaste : undefined}` to `<DataEditor>`.
  - Update `handleCellActivated` to return early when `activeIsFastEdit` is true.
  - Update `handleCellEditedWithStaging` to validate via `validateCellValueForColumn`, guard masked PII / `Bytes`, and handle `rowIndex >= baseRowsCount` via `updateAddedRowCell`.
  - Render `DataEditor` header (`rows={0}`) + container `onPaste` handler when `rowsCount === 0 && activeIsFastEdit && data?.columns.length`.
  - Add `Cmd+S` / `Ctrl+S` handler in `handleContainerKeyDown` to trigger `onCommitChanges`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/grid/DataGrid.tsx src/components/grid/DataGrid.test.tsx
git commit -m "feat(grid): integrate Fast Edit Mode, Excel paste, validation, and Cmd+S commit"
```

---

### Task 5: Full Verification, Specification Update & Issue Tracking

**Files:**
- Modify: `docs/db-manager-plan.md`

- [ ] **Step 1: Update `docs/db-manager-plan.md` with Fast Edit Mode feature documentation**
- [ ] **Step 2: Run full frontend test suite, i18n parity check, and production build**

Run: `pnpm test && pnpm build`
Expected: 100% PASS, build succeeds with 0 errors.

- [ ] **Step 3: Commit & Push**

```bash
git add docs/db-manager-plan.md
git commit -m "docs: document Fast Edit Mode in db-manager-plan.md"
```
