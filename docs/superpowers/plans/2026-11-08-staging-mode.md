# Auto-Commit vs Staging Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ตาราง DataGrid รองรับการสลับโหมดระหว่าง Auto-Commit (บันทึกทันที) และ Staging Mode (แก้ไข/เพิ่ม/ลบแบบดราฟต์ พร้อมไฮไลต์สี แล้วค่อยกด Commit / Discard พร้อมกัน) ผ่านปุ่มสลับบน Bottom Action Bar

**Architecture:** 
- ขยาย `pendingChangesStore` ให้จัดการสถานะ `isAutoCommit` ต่อ `tableKey`
- เพิ่มปุ่ม Toggle สลับโหมดบน `GridBottomBar` วางถัดจากปุ่ม Commit และ Discard
- ในโหมด Staging: ปรับปรุง `getCellContent` ใน `DataGrid` ให้ผสานและไฮไลท์แถว/ช่องที่มี pending changes (Cell edit = blue tint, Insert row = green tint, Delete row = red tint)
- ใน `DockLayout`: ปรับ `handleCellEdited`, `handleAddRow`, `handleRowDelete` ให้แยกพฤติกรรมระหว่าง Auto-Commit (รัน SQL ทันที) และ Staging (stage ลง store) พร้อมฟังก์ชัน `handleCommitChanges` สำหรับ Batch SQL execution

**Tech Stack:** React 18, TypeScript, Zustand, Glide Data Grid, Vitest

**Spec:** `docs/superpowers/specs/2026-11-08-staging-mode-design.md`

## Global Constraints
- ต้องใช้ `pnpm test` และ `pnpm build` ในการตรวจสอบความถูกต้อง 100%
- รักษาธีม Dark/Light mode ของ DataCore และ Glide Data Grid
- คืนค่าดั้งเดิมทันทีเมื่อกด Discard และห้ามสูญเสียข้อมูลหากสลับโหมดกลับไป Auto-Commit โดยไม่ตั้งใจ

## Review Focus
1. การสลับโหมดจาก Staging กลับไป Auto-Commit ในขณะที่มี pending changes อยู่ ต้องมี prompt/confirm ยืนยัน
2. การคำนวณ `hasPendingChanges` และ `pendingCount` ต้องแม่นยำรวมทั้ง cell edits, added rows, และ deleted rows
3. ไฮไลต์สีใน Glide Data Grid ต้องเข้ากันได้กับทั้ง Dark และ Light mode
4. Batch commit SQL generation ต้องสร้างคำสั่ง UPDATE/INSERT/DELETE ที่ถูกต้องตาม SQL syntax ของ database driver
5. การกด Discard ต้องล้าง pending changes ใน store และรีเฟรชตารางกลับสู่ข้อมูลจริง

---

### Task 1: Extend `pendingChangesStore` with Auto-Commit mode management

**Files:**
- Modify: `src/stores/pendingChangesStore.ts`
- Test: `src/stores/pendingChangesStore.test.ts`

- [x] Write failing test in `src/stores/pendingChangesStore.test.ts` verifying:
  - Default `isAutoCommitMode(tableKey)` returns `true`
  - `setAutoCommitMode(tableKey, false)` changes it to `false`
  - `isAutoCommitMode` operates per tableKey
- [x] Implement `isAutoCommit` state dictionary, `setAutoCommitMode`, and `isAutoCommitMode` selector in `src/stores/pendingChangesStore.ts`
- [x] Run `pnpm test src/stores/pendingChangesStore.test.ts` to verify
- [x] Commit changes: `git commit -am "feat(store): add autoCommitMode management to pendingChangesStore (#31)"`

---

### Task 2: Add Auto-Commit / Staging Toggle Button to `GridBottomBar`

**Files:**
- Modify: `src/components/grid/GridBottomBar.tsx`
- Test: `src/components/grid/GridBottomBar.test.tsx`

- [x] Write failing tests in `src/components/grid/GridBottomBar.test.tsx`:
  - Renders mode toggle button showing Auto-Commit state
  - Calls `onToggleAutoCommit` when clicked
  - Shows warning / disabled state or handles clicks appropriately
- [x] Add `isAutoCommit: boolean` and `onToggleAutoCommit: () => void` props to `GridBottomBarProps` and render clean toggle pill button next to Commit/Discard buttons
- [x] Run `pnpm test src/components/grid/GridBottomBar.test.tsx` to verify
- [x] Commit changes: `git commit -am "feat(grid): add auto-commit toggle button to GridBottomBar (#31)"`

---

### Task 3: Visual Indicators for Staged Changes in `DataGrid`

**Files:**
- Modify: `src/components/grid/DataGrid.tsx`
- Test: `src/components/grid/DataGrid.test.tsx`

- [x] Write failing tests in `src/components/grid/DataGrid.test.tsx`:
  - In Staging mode, edited cell displays staged value with `themeOverride` highlight
  - Staged deleted row displays with red background tint
  - Staged added rows are appended and displayed with green background tint
- [x] Implement visual indicators in `getCellContent`, `rowsCount` computation, and cell edits in `DataGrid.tsx`
- [x] Run `pnpm test src/components/grid/DataGrid.test.tsx` to verify
- [x] Commit changes: `git commit -am "feat(grid): render visual highlights for staged edits, additions and deletions (#31)"`

---

### Task 4: Connect Staging vs Auto-Commit Handlers and Batch Commit in `DockLayout`

**Files:**
- Modify: `src/components/layout/DockLayout.tsx`
- Test: `src/components/layout/DockLayout.test.tsx`

- [x] Update `handleCellEdited`, `handleRowDelete`, and `handleSubmitInsertRow` in `DockLayout.tsx`:
  - If in Auto-Commit mode: execute SQL directly as before
  - If in Staging mode: stage in `pendingChangesStore` without executing SQL immediately
- [x] Implement `handleCommitChanges`:
  - Gather all pending cell edits, additions, and deletions for `tableKey`
  - Generate SQL statements and execute via `dbApi.executeQuery`
  - Clear pending changes and show status badge
- [x] Implement `handleToggleAutoCommit`:
  - If switching from Staging to Auto-Commit and `hasPendingChanges`, prompt confirmation before clearing or switching
- [x] Run full test suite: `pnpm test` and `pnpm build`
- [x] Commit changes: `git commit -am "feat(layout): integrate staging workflow and batch commit in DockLayout (#31)"`

---

### Task 5: End-to-End Verification and Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-11-08-staging-mode-design.md`
- Modify: `docs/db-manager-plan.md`

- [x] Verify complete workflow with `pnpm test` (all 357+ tests passing) and `pnpm build`
- [x] Update `docs/db-manager-plan.md` to mark Phase 7 completed
- [x] Commit and close GitHub issue #31 with summary
