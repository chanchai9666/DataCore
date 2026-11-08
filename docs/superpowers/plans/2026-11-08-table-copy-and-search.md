# Table Copy & In-Grid Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement comprehensive data copying (cells, ranges, rows, vertical columns, Select All, with/without headers) and in-grid search (`Cmd+F`) with floating find bar and cell traversal in DataCore.

**Architecture:** A standalone TSV formatting engine (`clipboardUtils.ts`) formats active grid selections into clean tabular text (or newline-separated vertical lists for single columns). In `DataGrid.tsx`, Glide Data Grid's selection blending is set to exclusive to prevent state conflicts, column headers support single-click column selection and Alt-click sorting, keyboard shortcuts (`Cmd+A`, `Cmd+C`, `Cmd+Shift+C`, `Cmd+F`) and a context menu trigger clipboard copying and Glide's built-in search engine (`getCellsForSelection={true}`).

**Tech Stack:** React 18, TypeScript, `@glideapps/glide-data-grid`, Vitest, `@testing-library/react`, `sonner` (Toast), Radix UI Context Menu.

**Spec:** `docs/superpowers/specs/2026-11-08-table-copy-and-search-design.md`

## Global Constraints
- Target platform: macOS Apple Silicon (Tauri 2 + React 18)
- Keyboard conventions: macOS shortcuts (`Cmd` instead of `Ctrl`, `Cmd+Shift+C`, `Alt+Click`, `Esc`)
- All tests must pass with `pnpm test` and build with `pnpm build`
- Zero regressions in existing grid editing, filtering, and pagination capabilities

## Review Focus
1. Empty/Null cell copying: Ensure null values format as empty string `""` or `"NULL"` consistently without throwing undefined errors.
2. Single column copy formatting: Copying a single vertical column must use `\n` delimiters without trailing tabs.
3. Multi-row selection copy: Multi-row selection must preserve column order and format as TSV (`\t` between columns, `\n` between rows).
4. Column selection vs Alt-click sort: Regular click on column header must select the column; only Alt+click must trigger column sort.
5. In-grid search shortcut isolation: `Cmd+F` inside DataGrid must prevent browser default find and toggle Glide Data Grid's search bar.

---

### Task 1: Clipboard Formatter Utility (`clipboardUtils.ts`)

**Files:**
- Create: `src/components/grid/clipboardUtils.ts`
- Test: `src/components/grid/clipboardUtils.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function formatSelectionAsText(
    selection: GridSelection,
    data: QueryResult,
    includeHeaders?: boolean
  ): string;
  ```

- [ ] **Step 1: Write the failing unit tests for `clipboardUtils.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CompactSelection, GridSelection } from '@glideapps/glide-data-grid';
import { formatSelectionAsText } from './clipboardUtils';
import { QueryResult } from '../../types/db';

const mockData: QueryResult = {
  columns: [
    { name: 'id', data_type: 'INTEGER', nullable: false, is_primary_key: true, is_auto_increment: true },
    { name: 'name', data_type: 'VARCHAR', nullable: true, is_primary_key: false, is_auto_increment: false },
    { name: 'age', data_type: 'INTEGER', nullable: true, is_primary_key: false, is_auto_increment: false },
  ],
  rows: [
    [1, 'Alice', 25],
    [2, 'Bob', null],
    [3, 'Charlie', 30],
  ],
  execution_time_ms: 10,
};

describe('formatSelectionAsText', () => {
  it('formats single cell selection without headers', () => {
    const selection: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: { cell: [1, 0], range: { x: 1, y: 0, width: 1, height: 1 }, rangeStack: [] },
    };
    expect(formatSelectionAsText(selection, mockData, false)).toBe('Alice');
  });

  it('formats single column vertical selection with newline delimiters', () => {
    const selection: GridSelection = {
      columns: CompactSelection.fromSingleSelection(1),
      rows: CompactSelection.empty(),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, false)).toBe('Alice\nBob\nCharlie');
  });

  it('formats single column vertical selection with header', () => {
    const selection: GridSelection = {
      columns: CompactSelection.fromSingleSelection(1),
      rows: CompactSelection.empty(),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, true)).toBe('name\nAlice\nBob\nCharlie');
  });

  it('formats multi-row selection as TSV', () => {
    const selection: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.fromSingleSelection(0).add(2),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, false)).toBe('1\tAlice\t25\n3\tCharlie\t30');
  });

  it('formats multi-row selection with headers as TSV', () => {
    const selection: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.fromSingleSelection(0).add(1),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, true)).toBe('id\tname\tage\n1\tAlice\t25\n2\tBob\tNULL');
  });

  it('formats rectangular range selection as TSV', () => {
    const selection: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: { cell: [0, 0], range: { x: 0, y: 0, width: 2, height: 2 }, rangeStack: [] },
    };
    expect(formatSelectionAsText(selection, mockData, false)).toBe('1\tAlice\n2\tBob');
  });

  it('formats full selection (Select All)', () => {
    const selection: GridSelection = {
      columns: CompactSelection.fromSingleSelection(0).add(1).add(2),
      rows: CompactSelection.fromSingleSelection(0).add(1).add(2),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, true)).toBe(
      'id\tname\tage\n1\tAlice\t25\n2\tBob\tNULL\n3\tCharlie\t30'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/grid/clipboardUtils.test.ts`
Expected: FAIL ("Cannot find module './clipboardUtils'")

- [ ] **Step 3: Implement `formatSelectionAsText` in `src/components/grid/clipboardUtils.ts`**

Format cell values (null -> `"NULL"` or empty string based on header inclusion), extract rows and columns based on selection type (columns, rows, cell range, or single cell), and join columns with `\t` and rows with `\n`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/grid/clipboardUtils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/grid/clipboardUtils.ts src/components/grid/clipboardUtils.test.ts
git commit -m "feat(grid): implement clipboard formatting utility with tests (#30)"
```

---

### Task 2: DataGrid Column Selection & Alt-Click Sorting

**Files:**
- Modify: `src/components/grid/DataGrid.tsx:150-180, 510-535`
- Test: `src/components/grid/DataGrid.test.tsx`

**Interfaces:**
- Consumes: `@glideapps/glide-data-grid` props `columnSelect`, `columnSelectionBlending`, `rowSelectionBlending`, `rangeSelectionBlending`

- [ ] **Step 1: Write unit tests in `DataGrid.test.tsx` for column selection and Alt-click sort**

Add tests:
- Regular click on header sets column selection without calling `onSortChange`.
- Alt+click on header triggers `onSortChange` with ASC/DESC cycle.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `DataGrid.tsx` for column selection and Alt-click sort**

1. Set `<DataEditor columnSelect="multi" columnSelectionBlending="exclusive" rowSelectionBlending="exclusive" rangeSelectionBlending="exclusive" />`.
2. Update `handleHeaderClicked = useCallback((colIndex: number, event?: any) => { ... })`:
   - If `event?.altKey`: perform sort toggling as before.
   - Else: select the column (`setGridSelection({ columns: CompactSelection.fromSingleSelection(colIndex), rows: CompactSelection.empty(), current: undefined })`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/grid/DataGrid.tsx src/components/grid/DataGrid.test.tsx
git commit -m "feat(grid): enable column selection and Alt-click sorting (#30)"
```

---

### Task 3: DataGrid Keyboard Shortcuts (Cmd+C, Cmd+Shift+C, Cmd+A) & Copying

**Files:**
- Modify: `src/components/grid/DataGrid.tsx`
- Test: `src/components/grid/DataGrid.test.tsx`

**Interfaces:**
- Consumes: `formatSelectionAsText` from `./clipboardUtils`, `navigator.clipboard.writeText`, `toast` from `sonner`

- [ ] **Step 1: Write unit tests in `DataGrid.test.tsx` for copy shortcuts**

Add tests:
- Pressing `Cmd+A` updates `gridSelection` to select all rows and all columns.
- Pressing `Cmd+C` formats current selection without headers and calls `navigator.clipboard.writeText`.
- Pressing `Cmd+Shift+C` formats current selection with headers and calls `navigator.clipboard.writeText`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement copy and select all handlers in `DataGrid.tsx`**

1. Provide `getCellsForSelection={true}` to `<DataEditor>`.
2. Add `handleCopy(includeHeaders: boolean)` function: formats active selection using `formatSelectionAsText(gridSelection, data, includeHeaders)`, writes to `navigator.clipboard.writeText(text)`, and shows toast notification (`Copied to clipboard`).
3. Add `handleSelectAll()`: selects all rows (`CompactSelection.fromSingleSelection(0).addRange(0, rowsCount)`) and all columns.
4. Attach `onKeyDown` to the container div (with `tabIndex={0}`):
   - `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a'`: preventDefault, call `handleSelectAll()`.
   - `(e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c'`: preventDefault, call `handleCopy(true)`.
   - `(e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'c'`: preventDefault, call `handleCopy(false)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/grid/DataGrid.tsx src/components/grid/DataGrid.test.tsx
git commit -m "feat(grid): implement Cmd+A, Cmd+C, and Cmd+Shift+C copy shortcuts (#30)"
```

---

### Task 4: In-Grid Search Integration (`Cmd+F` & Glide Search)

**Files:**
- Modify: `src/components/grid/DataGrid.tsx`
- Test: `src/components/grid/DataGrid.test.tsx`

**Interfaces:**
- Consumes: `<DataEditor showSearch={...} onSearchClose={...} searchValue={...} onSearchValueChange={...} />`

- [ ] **Step 1: Write unit tests in `DataGrid.test.tsx` for In-Grid Search**

Add tests:
- Pressing `Cmd+F` sets `showSearch` to true on `DataEditor`.
- Search box can be closed via `onSearchClose` which sets `showSearch` to false.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement In-Grid Search state in `DataGrid.tsx`**

1. State: `const [showSearch, setShowSearch] = useState(false);` and `const [searchValue, setSearchValue] = useState('');`
2. Pass props to `<DataEditor showSearch={showSearch} onSearchClose={() => { setShowSearch(false); setSearchValue(''); }} searchValue={searchValue} onSearchValueChange={setSearchValue} />`
3. In `onKeyDown`:
   - `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f'`: preventDefault, `setShowSearch((prev) => !prev)`.
   - `e.key === 'Escape' && showSearch`: `setShowSearch(false); setSearchValue('');`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/grid/DataGrid.tsx src/components/grid/DataGrid.test.tsx
git commit -m "feat(grid): integrate Cmd+F In-Grid Search with Glide Data Grid (#30)"
```

---

### Task 5: Context Menu for DataGrid (Copy, Copy with Headers, Select All, Find)

**Files:**
- Modify: `src/components/grid/DataGrid.tsx`
- Test: `src/components/grid/DataGrid.test.tsx`

**Interfaces:**
- Consumes: Radix UI ContextMenu primitive (`@radix-ui/react-context-menu`)

- [ ] **Step 1: Write unit tests in `DataGrid.test.tsx` for Context Menu actions**

Add tests:
- Context menu exposes "Copy", "Copy with Headers", "Select All", and "Find in Table".
- Clicking "Copy" calls `handleCopy(false)`.
- Clicking "Copy with Headers" calls `handleCopy(true)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: FAIL

- [ ] **Step 3: Wrap `DataEditor` with ContextMenu in `DataGrid.tsx`**

Use Radix UI Context Menu:
```tsx
<ContextMenu.Root>
  <ContextMenu.Trigger asChild>
    <div style={{ width: '100%', height: '100%' }}>
      <DataEditor ... />
    </div>
  </ContextMenu.Trigger>
  <ContextMenu.Portal>
    <ContextMenu.Content className="desktop-context-menu">
      <ContextMenu.Item onSelect={() => handleCopy(false)}>Copy (⌘C)</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => handleCopy(true)}>Copy with Headers (⇧⌘C)</ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={handleSelectAll}>Select All (⌘A)</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => setShowSearch(true)}>Find in Table (⌘F)</ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/grid/DataGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/grid/DataGrid.tsx src/components/grid/DataGrid.test.tsx
git commit -m "feat(grid): add right-click context menu for table copy and search (#30)"
```

---

### Task 6: End-to-End Verification & Test Suite Check

**Files:**
- Test: entire test suite

- [ ] **Step 1: Run complete test suite and type check**

Run: `pnpm test && pnpm build`
Expected: 100% test pass with zero errors.

- [ ] **Step 2: Commit any remaining adjustments and push**

```bash
git push origin feature/new-features
```
