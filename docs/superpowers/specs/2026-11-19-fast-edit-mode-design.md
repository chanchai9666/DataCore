# Design Document: Fast Edit Mode (Excel-like Grid Editing & Multi-Cell Paste)

**Date:** 2026-11-19  
**Status:** Ready for Approval

## 1. Intent & Why
Currently, editing table data in DataCore opens the `CellDetailDrawer` side panel one cell at a time whenever a cell is double-clicked or activated with `Enter`. While convenient for inspecting long text or JSON, it slows down bulk data entry and quick corrections. Users familiar with Excel or Google Sheets expect to click a cell, type immediately to edit inline, paste single or multi-cell/multi-row ranges, and commit all changes safely in one batch.

## 2. Goals, Non-Goals, and Anti-Goals
### Goals
- Provide a **Fast Edit Mode** toggle in the table data grid bottom bar (`GridBottomBar`).
- **Per-Connection Persistence:** Default to **OFF** for every database connection that has not explicitly enabled it. Once enabled for a connection, remember and keep it **ON** across tab switches and app restarts.
- **Forced Staging (Auto-Commit OFF):** When Fast Edit Mode is ON, Auto-Commit is automatically forced OFF (Staging Mode) and locked off while Fast Edit Mode remains active, preventing accidental direct writes and eliminating confusion.
- **Excel-like Inline Editing:** When Fast Edit Mode is ON, selecting a cell and typing, pressing `Enter`, or double-clicking edits the cell inline inside the grid instead of opening `CellDetailDrawer`.
- **Excel-like Paste (`Cmd+V` / `Ctrl+V`):** Support pasting a single value, a 1D row/column, or a 2D multi-cell/multi-row block (tab-separated values from Excel/Sheets or the grid itself) starting from the active cell (or `[0, 0]` on an empty 0-row table):
  - **Auto-Append Rows:** If pasted rows extend beyond existing rows in the table, automatically append new staged rows (`addedRows`) via `stageAddRow`.
  - **Truncate Extra Columns:** If a pasted row has more columns than remain in the table from the target column, truncate/discard the extra columns cleanly.
  - **Type Validation & Alert:** Validate pasted/edited values against the target column's `data_type` (e.g., numeric column receiving text or timestamp). Reject invalid values and show a clear warning/error notification instead of staging corrupted data.
- **Keyboard Shortcut to Commit (`Cmd+S` / `Ctrl+S`):** Allow committing staged changes from the grid via `Cmd+S` / `Ctrl+S` in addition to clicking the **Commit** button.
- **Explicit Commit Only:** No edits or pasted cells are persisted to the database until the user explicitly clicks **Commit** or presses `Cmd+S` / `Ctrl+S`.

### Non-Goals
- Spreadsheet formulas (`=SUM(...)`), drag-fill handles, or column-level formatting.
- Enabling Fast Edit Mode on Read-Only connections or non-editable query result tabs.

### Anti-Goals
- Silently persisting edits directly to the database when Fast Edit Mode is ON.
- Overwriting masked PII data with placeholder mask characters (`••••••••`).
- Breaking existing `CellDetailDrawer` inspection when Fast Edit Mode is OFF (or when explicitly clicking the Inspect Cell button / context menu).

## 3. Constraints
- **Platform:** Tauri 2 Desktop App (React 18 + TypeScript + Zustand + `@glideapps/glide-data-grid`).
- **Existing Staging Architecture:** All staged cell edits and added rows must go through `usePendingChangesStore` (`stageCellEdit`, `stageAddRow`) and commit through the existing `onCommitChanges` batch transaction pipeline in `DockLayout.tsx`.
- **Localization:** All new UI labels, tooltips, and toast messages must be added to both `src/locales/en.json` and `src/locales/th.json` and pass `i18nParity.test.ts`.
- **Read-Only Guard:** If `effectiveReadOnly` is true or the tab is not editable (`!effectiveIsEditable`), Fast Edit Mode must remain disabled/off.

## 4. Detailed Behavior & Builder Decisions

### 4.1 Per-Connection Preference Store
- Add a persisted map `fastEditByConnection: Record<string, boolean>` (stored in `localStorage` under `datacore-fast-edit-mode` via a dedicated Zustand store or `pendingChangesStore`).
- `isFastEditEnabled(connectionId)` returns `Boolean(fastEditByConnection[connectionId])`, defaulting to `false` for any connection not yet configured.

### 4.2 Auto-Commit Lock Interaction
- When Fast Edit Mode is ON:
  - `activeIsAutoCommit` is forced to `false` (Staging Mode).
  - The Auto-Commit toggle button in `GridBottomBar` is disabled while Fast Edit Mode is active, with a clear tooltip explaining that Auto-Commit is disabled in Fast Edit Mode.
- When Fast Edit Mode is toggled OFF:
  - Normal Auto-Commit toggle control is restored (retaining Staging Mode if uncommitted changes remain).

### 4.3 Grid Editing, PII Guard & Column Types (`DataGrid.tsx`, `gridUtils.ts`)
- **When Fast Edit Mode is OFF (default):**
  - Preserves current behavior: `onCellActivated` opens `CellDetailDrawer`.
- **When Fast Edit Mode is ON (and `!effectiveReadOnly && effectiveIsEditable`):**
  - `onCellActivated` does **not** open `CellDetailDrawer`, allowing Glide Data Grid's inline overlay editor to open on double-click, `Enter`, or typing (`editOnType={true}`).
  - Users can still open `CellDetailDrawer` via the **Inspect Cell** button or context menu.
  - **Masked PII Guard *(Builder Call)*:** Cells in PII-masked columns (`activeIsMasked && isSensitiveColumn(...)`) are marked `readonly: true` for inline editing and skipped during paste, displaying a toast prompting the user to un-mask before editing. This prevents `••••••••` placeholders from overwriting real secrets/PII.
  - **Boolean & Binary Columns *(Builder Call)*:**
    - `Boolean` columns allow inline text overlay (`allowOverlay: true`) in Fast Edit Mode and coerce `"true"`, `"false"`, `"1"`, `"0"`, `"NULL"` in `sanitizeEditedCellValue`.
    - `Bytes` (Binary) columns remain `readonly: true` for inline editing/pasting so `[Binary: N bytes]` placeholders cannot corrupt binary data.

### 4.4 Excel-like Paste (`onPaste`) & Type Validation
- Active when Fast Edit Mode is ON and `!effectiveReadOnly && effectiveIsEditable`.
- **Empty 0-Row Table Support *(Builder Call)*:** When `rowsCount === 0` and Fast Edit Mode is ON, render the `DataEditor` header (with `rows={0}`) or container paste handler so pressing `Cmd+V` / `Ctrl+V` pastes starting at `[0, 0]` and appends staged rows immediately.
- **Column Truncation:** If a pasted row contains more cells than `data.columns.length - startCol`, extra cells beyond the last table column are truncated/ignored.
- **Row Auto-Append & Defaults *(Builder Call)*:**
  - Rows within `baseRowsCount` update existing rows via `stageCellEdit` (skipping rows in `deletedRowIndices`).
  - Rows within `baseRowsCount + addedRows.length` update existing staged `addedRows`.
  - Rows beyond `baseRowsCount + addedRows.length` append new staged rows via `stageAddRow`. Unpasted columns on newly appended rows are **omitted (`undefined`)** rather than set to explicit `null` so database `DEFAULT` / `NOT NULL DEFAULT` constraints work properly on Commit (while still displaying as `NULL` in the grid).
- **Data Type Validation:**
  - Before staging a cell edit or pasted value, validate against `colMeta.data_type`:
    - Integer / BigInt / SmallInt / Serial: must be a valid integer (or `NULL`/empty if nullable).
    - Float / Double / Numeric / Decimal / Real: must be a valid finite number (or `NULL`/empty if nullable).
    - Boolean: must be `"true"`, `"false"`, `"1"`, `"0"`, `"t"`, `"f"` (case-insensitive) or `NULL`.
    - Date / Timestamp / Time: must not be arbitrary non-date text (basic date/ISO/time check) or `NULL`.
    - JSON / JSONB: must be valid JSON or `NULL`.
  - Invalid values are rejected (not staged) and trigger a warning toast explaining the type mismatch (e.g., `"Invalid value for numeric column 'amount': 'abc'"`).

### 4.5 Keyboard Commit Shortcut (`Cmd+S` / `Ctrl+S`)
- In `DataGrid.tsx` `handleContainerKeyDown`, pressing `Cmd+S` / `Ctrl+S` prevents default browser save and invokes `onCommitChanges()` if `!effectiveReadOnly && hasPendingChanges && onCommitChanges`.

## 5. Left to the Builder
- Exact icon choice and visual styling for the Fast Edit Mode toggle pill in `GridBottomBar.tsx`.
- Extracting pure TSV paste parsing & type validation helpers into a testable module (e.g. `src/components/grid/fastEditUtils.ts`).
