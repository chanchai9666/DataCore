# Comprehensive UI Localization (i18n) & Automated Parity Enforcement

*   **Author:** chanchai9666
*   **Status:** Approved
*   **Date:** 2026-11-15

--------------------------------------------------------------------------------

## Overview

DataCore is a native macOS desktop database management application engineered for SQLite, PostgreSQL, and MySQL. While the application provides an initial language switcher powered by `i18next` and `react-i18next` with local persistence, current coverage is fragmented: only ~126 root translation keys are defined, leaving over 80% of workspace components—including tree context menus, query execution plan drawers, modal dialogs, data transfer wizards, and error notifications—hardcoded in English.

This feature establishes 100% UI localization coverage across English (`en`) and Thai (`th`). To preserve developer ergonomics and prevent confusion among database engineers, Thai translations adhere strictly to industry-standard verbatim English database terminology (e.g., "รัน Query", "เลือก Schema", "ดู Execution Plan", "Primary Key", "Transaction"). Raw database engine errors and SQL diagnostic output remain untranslated to facilitate troubleshooting, while UI notification envelopes are localized. Automated Vitest parity suites guarantee that no keys, empty values, or parameter interpolation mismatches escape to production.

## The Problem

1. **Fragmented User Experience:** Users switching to Thai experience a mixed-language interface where primary toolbars are partially translated while context menus, table maintenance wizards, drawer panels, and toast alerts remain in English.
2. **Translation Quality vs. Technical Accuracy:** Literal or non-standard translations of database concepts (e.g., translating "Query" as "ข้อความสอบถาม" or "Schema" as "เค้าโครง") degrade technical usability and conflict with established software development practices.
3. **Lack of Automated Parity Safeguards:** There is currently no automated test enforcing parity between `en.json` and `th.json`. As new UI components are developed, untranslated keys easily slip into codebase branches without CI detection.
4. **Layout & Typography Degradation:** Thai script requires higher vertical line clearance for ascenders, descenders, and stacked tone marks (เช่น สระบน/ล่าง, วรรณยุกต์). Fixed row and button heights risk visual text clipping.

## Goals

*   Achieve 100% localization parity across English (`en`) and Thai (`th`) for all static and dynamic UI elements (toolbars, sidebars, context menus, query editors, results grids, diagnostic modals, transfer wizards, settings, and toast envelopes).
*   Enforce a strict technical glossary keeping database keywords and technical terms in verbatim English within Thai translations.
*   Preserve raw database engine and driver errors intact within localized user notification wrappers.
*   Implement end-to-end TypeScript type declarations (`i18next.d.ts`) to provide compile-time key validation during `pnpm check`.
*   Implement automated Vitest test suites (`src/test/i18nParity.test.ts`) that recursively check key parity, absence of empty strings, and variable interpolation matching between `en.json` and `th.json`.
*   Ensure UI layouts handle a 15–25% string expansion in Thai without horizontal clipping, visual overlap, or broken flex wrapping.
*   Structure delivery into two clean milestones (Phase 1: Core Chrome & Primary Surfaces; Phase 2: Secondary Modals & Wizards) to minimize review blast radius.

## Non-Goals

*   Translating raw database engine messages, SQLSTATE error codes, or driver protocol exceptions returned by SQLite, PostgreSQL, or MySQL.
*   Translating user data, database schemas, table names, column headers, or cell contents stored inside databases.
*   Translating SQL queries, DDL/DML statements, or query plan execution tree raw outputs.
*   Adding global keyboard shortcuts (e.g., `Cmd+Shift+L`) that clutter global hotkeys or conflict with SQL editor shortcuts.
*   Adding support for additional languages beyond English and Thai in this release.

## Open Questions

*   None (Resolved during EGM brainstorming & multi-lens review: UI/App error scope only, verbatim English technical terms, automated parity tests, 2-phase rollout).

## Critical User Journeys (CUJs)

### CUJ 1: Toggle Language to Thai via Status Bar, MainToolbar, or Command Palette

*   **Given**: DataCore is running with English (`en`) active.
*   **When**: The user clicks the language toggle button (`EN | TH`) in the Status Bar or MainToolbar, or opens the Command Palette (`Cmd+K`) and selects "Toggle Language / สลับภาษา".
*   **Then**: The entire application UI (MainToolbar, ObjectBrowser tree labels and context menus, TableList tabs, SqlEditor action buttons, drawer headers, and modals) immediately transitions to Thai without requiring an application restart. `localStorage` persists `datacore_language: 'th'`.

### CUJ 2: Database Connection Failure with Localized Notification Envelope

*   **Given**: DataCore is configured in Thai (`th`).
*   **When**: The user attempts to connect to an unreachable PostgreSQL host or inputs incorrect credentials.
*   **Then**: The `sonner` error toast displays a localized envelope with the verbatim database driver error embedded intact: `"เชื่อมต่อไม่สำเร็จ: connection to server at "127.0.0.1", port 5432 failed: FATAL: password authentication failed"`.

### CUJ 3: Developer Adds a New Feature with Missing Translations

*   **Given**: A developer introduces a new UI modal and adds keys to `src/locales/en.json` but forgets `src/locales/th.json`.
*   **When**: The developer or CI runs `pnpm test`.
*   **Then**: `src/test/i18nParity.test.ts` fails immediately with an explicit error detailing the missing leaf keys in `th.json`, preventing an incomplete translation merge.

--------------------------------------------------------------------------------

## Technical Plan (Architecture)

### 1. Domain Namespace Architecture

To balance modular organization with packaging simplicity, translations are maintained in a **single-file namespaced JSON hierarchy** (`src/locales/en.json` and `src/locales/th.json`), categorized into 11 strict top-level domain namespaces:

```text
src/locales/
├── en.json
└── th.json
```

Key Hierarchy (Strict 11 Domains):
*   `common`: Universal verbs, dialog affirmations, and generic states (`save`, `cancel`, `confirm`, `delete`, `edit`, `refresh`, `copy`, `copied`, `loading`, `close`, `filter`, `search`, `yes`, `no`).
*   `toolbar`: Actions, buttons, badges, and tooltips in `MainToolbar` (`connect`, `disconnect`, `newQuery`, `activeConnection`, `readOnlyBadge`, `searchTablesPlaceholder`).
*   `status`: Metrics and indicators in `StatusBar` (`ready`, `executing`, `selectedRows`, `selectedCells`, `connectedAs`, `toggleLanguage`).
*   `sidebar`: Database tree and object browser (`emptyTree`, `tablesGroup`, `viewsGroup`, `schemasGroup`, `renameConnection`, `dropTableContext`, `filterObjects`).
*   `connection`: Connection modal and driver options (`title`, `driverSelect`, `sqliteConfig`, `postgresConfig`, `mysqlConfig`, `sshTunnel`, `sslMode`, `testConnection`, `saveAndConnect`).
*   `editor`: Query editor, runner, and drawer panels (`runQuery`, `explainPlan`, `formatSql`, `historySnippets`, `savedSnippets`, `queryTime`, `rowsAffected`).
*   `results`: Data grid, cell detail drawer, and table export (`noRows`, `exportCsv`, `exportJson`, `inspectCell`, `copyRow`, `totalRows`, `pageIndicator`).
*   `tableList`: Table manager tab, schema browser, index inspector, and table maintenance (`tabTitle`, `rowCount`, `dataSize`, `engine`, `columnsTab`, `indexesTab`, `ddlTab`, `duplicateTable`, `dropTableConfirm`).
*   `tools`: Diagnostic tools (`databaseMetrics`, `lockInspector`, `schemaDiff`, `activityMonitor`, `auditLog`, `userPrivileges`).
*   `transfer`: Import and export wizards (`dataImportWizard`, `dataExportWizard`, `sqlImport`, `sqlExport`, `crossDbCopy`).
*   `notifications`: Localized toast notification envelopes with error interpolation (`connectionSuccess`, `connectionFailed`, `querySuccess`, `queryExecutionFailed`, `exportSuccess`, `exportFailed`, `saveSuccess`, `saveError`).

#### Legacy Namespace Migration
Existing keys from earlier prototypes are systematically migrated to preserve runtime behavior:
*   `layout.*` → Migrated into `sidebar.*` and `common.*`.
*   `contextMenu.*` → Migrated into respective feature domains (`sidebar.contextMenu.*`, `tableList.contextMenu.*`, `results.contextMenu.*`).
*   `modals.*` → Migrated into `connection.*`, `tableList.*`, and `tools.*`.

### 2. Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Storage ["Persistence Layer"]
        LS["localStorage ('datacore_language')"]
    end

    subgraph I18nEngine ["i18n Core Engine (src/i18n.ts)"]
        INIT["i18next.init()"]
        EN_RES["src/locales/en.json"]
        TH_RES["src/locales/th.json"]
        TYPINGS["src/types/i18next.d.ts (typeof en)"]
    end

    subgraph UI ["React 18 Desktop Presentation"]
        LANG_BTN["StatusBar / MainToolbar Language Switcher / CommandPalette"]
        COMPONENTS["React Components (useTranslation hook)"]
        TOAST["Sonner Toast System (src/App.tsx)"]
        ERROR_HELPER["formatTauriError (src/utils/error.ts)"]
    end

    subgraph CI ["Continuous Integration & Tests"]
        VITEST["src/test/i18nParity.test.ts"]
        TSC["TypeScript Compiler (pnpm check)"]
    end

    LS -->|Synchronous pre-mount read| INIT
    EN_RES --> INIT
    TH_RES --> INIT
    EN_RES -.->|Schema Contract| TYPINGS
    TYPINGS -.->|Type Validation| TSC
    INIT --> COMPONENTS
    LANG_BTN -->|changeLanguage('en'|'th')| INIT
    LANG_BTN -->|Persist state| LS
    COMPONENTS --> ERROR_HELPER
    ERROR_HELPER --> TOAST
    EN_RES --> VITEST
    TH_RES --> VITEST
```

### 3. TypeScript Type-Safe Translation Resources

To ensure compile-time key validation for both React hooks (`useTranslation`) and non-React files invoking `i18n.t()`, `src/types/i18next.d.ts` augments the core `'i18next'` module:

```typescript
import type en from '../locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
```

*Outcome:* When any component or utility invokes `t('toolbar.invalidKey')`, TypeScript flags a compile-time error during `pnpm check`.

### 4. Database Technical Terminology Lexicon (Thai Standard)

Thai translations strictly maintain English database keywords and concepts verbatim:

| Technical Database Term | Thai Translation Convention | Prohibited / Rejected Form |
| :--- | :--- | :--- |
| **Query** | `Query` (เช่น "รัน Query", "เขียน Query") | ข้อความสอบถาม, คิวรี |
| **Schema** | `Schema` (เช่น "เลือก Schema", "รีเฟรช Schema") | เค้าโครง, โครงร่าง |
| **Execution Plan** | `Execution Plan` (เช่น "ดู Execution Plan") | แผนการทำงาน |
| **Primary Key** | `Primary Key` (เช่น "สร้าง Primary Key") | คีย์หลัก |
| **Foreign Key** | `Foreign Key` (เช่น "แก้ไข Foreign Key") | คีย์นอก |
| **Index** | `Index` (เช่น "สร้าง Index", "สแกน Index") | ดัชนี |
| **Commit** | `Commit` (เช่น "Commit Transaction") | ยืนยันข้อมูล |
| **Rollback** | `Rollback` (เช่น "Rollback การเปลี่ยนแปลง") | ย้อนคืน |
| **Transaction** | `Transaction` (เช่น "เริ่ม Transaction") | ธุรกรรม |
| **Deadlock** | `Deadlock` (เช่น "ตรวจพบ Deadlock") | สภาวะชะงักงัน |
| **Connection Pool** | `Connection Pool` | สระการเชื่อมต่อ |
| **Driver** | `Driver` (เช่น "Driver SQLite") | ตัวขับ |
| **DDL / DML** | `DDL` / `DML` | - |

#### Pluralization Guidelines
*   In Thai prose, English database terms remain **uninflected** (singular form) as Thai grammar uses classifiers or counters rather than plural suffixes (e.g., "รายการ Schema", "สร้าง Index", "เลือก Driver").
*   In UI badges and group headers showing object counts, standard English plural headings are preserved for consistency (e.g., `"Schemas (4)"`, `"Tables (12)"`, `"Views (2)"`).

### 5. Safe Notification & Error Formatting Pattern

DataCore standardizes on `sonner` (`"sonner": "^2.0.8"`). To safely handle backend Tauri IPC error shapes without producing `"[object Object]"`, a deep utility `formatTauriError` is added to `src/utils/error.ts`:

```typescript
// src/utils/error.ts
export function formatTauriError(error: unknown): string {
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message).trim();
  }
  return JSON.stringify(error);
}
```

UI components invoke `sonner` directly with typed notification envelopes:

```typescript
import { toast } from 'sonner';
import i18n from '../i18n';
import { formatTauriError } from '../utils/error';

// Error Toast with Localized Envelope and Verbatim Engine Error
toast.error(
  i18n.t('notifications.queryExecutionFailed', {
    error: formatTauriError(err),
    defaultValue: `Query execution failed: ${formatTauriError(err)}`
  })
);

// Success Toast
toast.success(i18n.t('notifications.querySuccess', { defaultValue: 'Query executed successfully' }));
```

### 6. Clean Seams for Native Dialogs

The low-level OS bridge `src/utils/dialog.ts` remains **translation-agnostic**. It wraps `@tauri-apps/plugin-dialog` and receives pre-resolved strings:

```typescript
// Calling component resolves translation before invoking native dialog:
const confirmed = await showConfirmDialog(
  t('tableList.dropTableConfirm', { table: tableName }),
  {
    title: t('tableList.dropTableTitle'),
    okLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    kind: 'warning'
  }
);
```

### 7. Typography & Density Constraints for Thai Script

To avoid visual clipping of Thai tone marks and accommodate string expansion:
*   **Vertical Clearance:** Apply `min-h-[26px] py-0.5` and `leading-normal` to action button containers and status bar metric badges.
*   **Word Boundaries:** Insert single spaces before and after verbatim English database terms embedded in Thai sentences (e.g., `"กำลังรัน Query บนตาราง {{table}}..."`).
*   **Grid & Modal Flexibility:** Form rows and action bars use `flex-wrap` and `min-w-0` to gracefully accommodate 15–25% string expansion.

--------------------------------------------------------------------------------

## Alternatives Considered

### Alternative 1: Translating Technical Database Terms into Thai Words

*   **Pros**: Complete Thai linguistic purity across all sentences.
*   **Cons**:
    *   Creates confusing and unidiomatic phrases (e.g., translating "Query" to "ข้อความสอบถาม", "Schema" to "เค้าโครง/แบบร่าง", "Execution Plan" to "แผนการดำเนินงาน", "Rollback Transaction" to "ย้อนคืนธุรกรรม").
    *   Conflicts with established industry and professional conventions among software and database engineers in Thailand.
    *   Slows down experienced developers who look for recognizable database keywords when navigating UI controls.
*   **Reason for Rejection**: *Rejected by author*: Technical accuracy and developer velocity take precedence over linguistic literalism. Industry-standard English database keywords are preserved verbatim across Thai strings.

### Alternative 2: Translating Database Engine & Driver Error Messages

*   **Pros**: Displays 100% Thai text even when a query syntax error or connection fault occurs.
*   **Cons**:
    *   Masks SQLSTATE error codes and engine-specific diagnostic details returned by PostgreSQL, SQLite, or MySQL drivers.
    *   Prevents developers from copying and searching exact error strings in official documentation, StackOverflow, or issue trackers.
    *   High risk of inaccurate or misleading translations of complex driver protocol exceptions.
*   **Reason for Rejection**: *Rejected by author*: Raw database engine errors must remain untouched for accurate debugging. Only the application notification envelope surrounding the error is localized.

### Alternative 3: Global Shortcut (`Cmd+Shift+L`) for Language Switching

*   **Pros**: One keystroke language toggle.
*   **Cons**:
    *   Language switching is an infrequent configuration; consuming top-level global hotkeys causes shortcut bloat.
    *   Risks colliding with SQL code editor selections (CodeMirror / Monaco).
    *   Requires additional listener lifecycle management and Tauri global shortcut registration.
*   **Reason for Rejection**: *Rejected by author*: YAGNI. Access via `StatusBar`, `MainToolbar`, and Command Palette (`Cmd+K`) provides excellent ergonomics without shortcut collisions.

### Alternative 4: Shallow `notify.ts` Wrapper over `sonner`

*   **Pros**: Centralizes toast calls in one custom module.
*   **Cons**:
    *   Introduces a shallow pass-through wrapper that merely forwards to `sonner`.
    *   Hides `sonner` options and requires maintaining custom wrapper typings.
*   **Reason for Rejection**: *Rejected by author*: Keep modules deep. Factoring out `formatTauriError()` in `src/utils/error.ts` solves the only complex error extraction problem cleanly, while leaving toast calls transparent.

--------------------------------------------------------------------------------

## Non-Functional Requirements

### 1. Performance & Runtime Overhead
*   **Zero Network Latency:** All translation files (`en.json`, `th.json`) are bundled locally into the desktop application bundle; switching languages requires zero network fetches.
*   **Instant Switch Runtime:** Toggling languages updates React context via `i18next.changeLanguage()` in under 16ms (single frame), re-rendering active UI components without an application restart.
*   **Memory Footprint:** The combined size of both locale JSON files is under 150KB, adding negligible memory overhead to the renderer process.

### 2. Backward Compatibility & State Persistence
*   The active locale preference is stored in `localStorage` under `datacore_language` and seamlessly falls back to `'en'` if unconfigured or unrecognized.
*   Synchronous pre-mount language detection in `src/i18n.ts` prevents visual layout flashes (FOUC) during application startup.

### 3. Reliability & Build Safety
*   **100% Key Parity:** `src/test/i18nParity.test.ts` blocks `pnpm test` and `make check` if any key in `en.json` is missing or mismatched in `th.json`.
*   **Compile-Time Verification:** TypeScript custom type definitions (`src/types/i18next.d.ts`) flag nonexistent keys during `pnpm build`.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

The implementation is partitioned into two distinct phases to minimize blast radius and ensure atomic, thoroughly testable PR milestones.

### Phase 1: Core Infrastructure & Primary Workspace Surface

Focuses on type safety, CI parity enforcement, core desktop chrome, query editor, data grid, and connection management.

#### 1. `src/types/i18next.d.ts` (Create)
*   **Type / Scope**: TypeScript ambient declaration file.
*   **Proposed Changes**: Augment module `'i18next'` with `defaultNS: 'translation'` and `typeof en` from `src/locales/en.json`. Enforces strict type checking and IDE autocompletion for all `t()` key lookups throughout the codebase.

#### 2. `src/test/i18nParity.test.ts` (Create)
*   **Type / Scope**: Vitest unit test suite.
*   **Proposed Changes**:
    *   Recursively traverses and maps all leaf keys in `src/locales/en.json` and `src/locales/th.json`.
    *   Asserts zero missing keys in `th.json` relative to `en.json`, and zero orphan keys in `th.json`.
    *   Asserts no empty string translation values in either file.
    *   Asserts identical interpolation tokens (e.g., `{{error}}`, `{{count}}`, `{{table}}`) in corresponding translations across locales.

#### 3. `src/utils/error.ts` (Create)
*   **Type / Scope**: Error extraction helper.
*   **Proposed Changes**: Implement `formatTauriError(error: unknown): string` safely handling raw strings, standard `Error` instances, and Tauri IPC serializable error shapes (`{ message }`).

#### 4. `src/locales/en.json` & `src/locales/th.json` (Phase 1 Expansion)
*   **Type / Scope**: i18n JSON resource files.
*   **Proposed Changes**:
    *   Expand `common`, `toolbar`, `status`, `sidebar`, `connection`, `editor`, `results`, and `notifications` namespaces.
    *   Migrate legacy `layout` and `contextMenu` keys into the new domain namespaces.
    *   Thai translations strictly preserve verbatim English database terms.

#### 5. `src/components/chrome/MainToolbar.tsx` & `src/components/chrome/StatusBar.tsx` (Modify)
*   **Type / Scope**: React desktop chrome components.
*   **Proposed Changes**:
    *   Replace hardcoded tooltips, dropdown labels, and status badges with `t('toolbar.*')` and `t('status.*')`.
    *   Localize row/cell counter formatting and connection status tooltips.
    *   Apply `min-h-[26px] py-0.5` to button containers to prevent Thai tone mark clipping.

#### 6. `src/components/sidebar/ObjectBrowser.tsx` & `src/components/sidebar/ConnectionTreeNode.tsx` (Modify)
*   **Type / Scope**: Database navigation tree and context menu components.
*   **Proposed Changes**:
    *   Localize group headers (`Tables`, `Views`, `Schemas`), empty state indicators (`No tables or views`), and search/filter placeholders.
    *   Localize right-click context menu options (`New Query`, `Run SQL Script...`, `Duplicate Table...`, `Drop Table...`, `Rename Connection...`, `Move to Folder...`).

#### 7. `src/components/dialogs/ConnectionDialog.tsx` & `src/components/dialogs/DriverForm.tsx` (Modify)
*   **Type / Scope**: Database connection management modals.
*   **Proposed Changes**:
    *   Localize dialog headings, environment selection options (`Production`, `Staging`, `Development`), folder selectors, and read-only mode toggles.
    *   Localize driver-specific fields (host, port, database, username, password, file path for SQLite, SSH tunnel parameters, SSL modes).
    *   Ensure multi-column form layouts use `flex-wrap` and `min-w-0` to avoid layout breaks under Thai text expansion.

#### 8. `src/components/editor/SqlEditor.tsx`, `src/components/editor/ExecutionPlanDrawer.tsx`, and `src/components/editor/HistorySnippetsDrawer.tsx` (Modify)
*   **Type / Scope**: SQL query editor and drawer components.
*   **Proposed Changes**:
    *   Localize editor action bar buttons (`Run`, `Explain`, `Format`, `Snippets`, `History`).
    *   Localize execution plan drawer metrics (estimated cost, rows, node type, buffers) and snippet manager labels.

#### 9. `src/components/grid/DataGrid.tsx`, `src/components/grid/GridBottomBar.tsx`, and `src/components/grid/CellDetailDrawer.tsx` (Modify)
*   **Type / Scope**: Results table and cell viewer components.
*   **Proposed Changes**:
    *   Localize row count badges, elapsed query duration, pagination buttons, cell detail drawer title/copy buttons, and table right-click context menus.

#### 10. `src/components/palette/CommandPaletteModal.tsx` & `src/components/dialogs/KeyboardShortcutsModal.tsx` (Modify)
*   **Type / Scope**: Quick command palette and shortcut documentation modals.
*   **Proposed Changes**: Localize command search placeholders, command titles (including language toggle action), category groupings, and shortcut action labels.

---

### Phase 2: Secondary Surfaces, Table Designers & Data Transfer Wizards

Focuses on table structure editors, maintenance modals, performance monitors, and data transfer wizards.

#### 11. `src/components/tablelist/TableListTab.tsx` and Structure Modals (Modify)
*   **Target Files**:
    *   `src/components/tablelist/TableListTab.tsx`
    *   `src/components/structure/CreateTableModal.tsx`
    *   `src/components/structure/DropTableModal.tsx`
    *   `src/components/structure/RenameTableModal.tsx`
    *   `src/components/structure/TableMaintenanceModal.tsx`
*   **Proposed Changes**: Localize table list column headers (Name, Type, Engine, Rows, Data Size, Index Size, Collation), table tabs (`Columns`, `Indexes`, `Foreign Keys`, `DDL`), and destructive confirmation dialogs.

#### 12. Diagnostic & Performance Modals (Modify)
*   **Target Files**:
    *   `src/components/performance/DatabaseMetricsModal.tsx`
    *   `src/components/performance/TablePartitionsModal.tsx`
    *   `src/components/transactions/LockInspectorModal.tsx`
    *   `src/components/diff/SchemaDiffModal.tsx`
    *   `src/components/security/AuditLogDrawer.tsx`
    *   `src/components/monitor/ActivityMonitorModal.tsx`
    *   `src/components/security/UserPrivilegeManagerModal.tsx`
*   **Proposed Changes**: Localize modal titles, chart labels, refresh buttons, lock type descriptions, active session kill confirmations, and diff comparison views.

#### 13. Data Transfer Wizards (Modify)
*   **Target Files**:
    *   `src/components/transfer/DataImportWizardModal.tsx`
    *   `src/components/transfer/DataExportWizardModal.tsx`
    *   `src/components/transfer/ExportSqlModal.tsx`
    *   `src/components/transfer/ImportSqlModal.tsx`
    *   `src/components/transfer/CrossDbCopyModal.tsx`
*   **Proposed Changes**: Localize step headers, file format selectors (CSV, JSON, SQL Dump), delimiter choices, column mapping tables, streaming transfer progress indicators, and completion alert dialogs.

#### 14. `docs/db-manager-plan.md` (Modify)
*   **Type / Scope**: Core project specification document.
*   **Proposed Changes**: Update i18n section to document full UI coverage, technical terminology lexicon rules, and automated parity testing requirements.

---

### Verification Plan

#### 1. Automated Parity Verification
*   **Command**: `pnpm test src/test/i18nParity.test.ts`
*   **Assertions**:
    *   Passes with 0 missing leaf keys in `th.json`.
    *   Passes with 0 orphan leaf keys in `th.json`.
    *   Passes with 0 empty translation strings across both files.
    *   Passes with 100% identical variable interpolation tokens in matching keys.

#### 2. Full Test Suite & Static Analysis
*   **Command**: `pnpm test`
*   **Assertions**: All existing unit and component tests continue to pass 100% without regression.
*   **Command**: `pnpm build`
*   **Assertions**: TypeScript compiler (`tsc`) reports 0 type errors with the augmented `i18next` type definitions.
*   **Command**: `cargo test --manifest-path src-tauri/Cargo.toml`
*   **Assertions**: Rust backend tests pass 100%.

#### 3. Manual Desktop Visual Verification (macOS)
*   **Command**: `make dev`
*   **Checklist**:
    1. Click language toggle (`EN | TH`) in `StatusBar` and `MainToolbar`: verify instant transition to Thai without page reload.
    2. Inspect Thai tone marks in toolbar buttons, tab headers, and table headers: confirm no vertical clipping.
    3. Open `ConnectionDialog`: verify all fields, environment badges, and labels render cleanly without horizontal overflow.
    4. Trigger an intentional connection failure (e.g., invalid port): confirm localized toast envelope appears with raw database driver error message intact.
    5. Open `TableListTab` and right-click tree items: confirm all context menus render in Thai with verbatim English database terms (`Query`, `Schema`, `Execution Plan`, `Primary Key`, `Index`).
    6. Restart application: verify selected language persists across restarts from `localStorage`.

--------------------------------------------------------------------------------

*Drafted with EGM*
