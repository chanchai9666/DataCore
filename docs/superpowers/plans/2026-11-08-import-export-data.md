# Implementation Plan: Data Import & Export System (Issue #22)

ระบบนำเข้า (Import) และส่งออก (Export) ข้อมูลรองรับ CSV และ JSON สำหรับ macOS Apple Silicon โดยประมวลผลแบบ Streaming และ Batch Insert บน Rust Backend เพื่อประสิทธิภาพสูงสุดและไม่กินแรม พร้อม UI Column Mapping และ Progress Cancellation

## 1. Scope & Architecture
- **Supported Formats:**
  - **CSV:** Auto-delimiter detection (`,`, `;`, `\t`), quote-handling, header toggle
  - **JSON:** Standard Array (`[{...}]`) และ NDJSON (`{...}\n{...}`)
- **UI Entry Points:**
  - Object Browser: Table Context Menu -> *Import Data...* and *Export Table Data...*
  - Data Grid Toolbar: Export button -> *Current View* vs *All Rows*
- **Backend Architecture (Rust):**
  - Streaming file I/O with crates `csv` and `serde_json`
  - Multi-row Batch INSERT (500-1,000 rows/batch)
  - Error policy: Atomic Transaction (default) with optional "Skip invalid rows"
  - Progress updates via Tauri Events + Cancellation support
- **Native File Dialogs:**
  - `@tauri-apps/plugin-dialog` + `tauri-plugin-dialog`

## 2. Components & Files to Create / Modify
### Backend (Rust):
- `src-tauri/Cargo.toml`: Add `csv = "1.3"`, `tauri-plugin-dialog = "2"`
- `src-tauri/src/services/data_transfer.rs`: CSV/JSON preview, streaming import, streaming export
- `src-tauri/src/commands/data_transfer.rs`: Tauri IPC commands (`preview_import_file`, `import_data`, `export_data`)
- `src-tauri/src/lib.rs`: Register commands and dialog plugin
- `src-tauri/src/services/data_transfer_test.rs`: Unit tests for data transfer

### Frontend (React / TypeScript):
- `package.json`: Add `@tauri-apps/plugin-dialog`
- `src/types/dataTransfer.ts`: Types for import/export options, column mapping, preview, and progress
- `src/api/dataTransferApi.ts`: Client wrapper for Tauri IPC data transfer commands
- `src/components/transfer/ImportModal.tsx`: Import dialog with preview, delimiter, column mapping, progress bar, cancel
- `src/components/transfer/ExportModal.tsx`: Export dialog with format, delimiter, headers, progress bar
- `src/components/sidebar/ObjectBrowser.tsx`: Add "Import Data..." and "Export Table Data..." to table context menu
- `src/components/grid/DataGrid.tsx`: Add "Export" button to grid toolbar
- Tests: `ImportModal.test.tsx`, `ExportModal.test.tsx`, `dataTransferApi.test.ts`
