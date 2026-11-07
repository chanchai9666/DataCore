# Implementation Plan: Create Table and Drop Table Features (Issue #1)

เพิ่มฟังก์ชันการสร้างตารางใหม่ (Create Table) และลบตาราง (Drop Table) รองรับ PostgreSQL, MySQL, และ SQLite พร้อม UI Modal, Live SQL Preview และเชื่อมโยงกับ Object Browser และ TableStructureEditor

## 1. User Review Required & Scope
- **Create Table:**
  - สร้างผ่านคลิกขวาที่ Schema, Database, หรือโฟลเดอร์ Tables ใน Object Browser
  - มี Create Table Modal: กำหนดชื่อตาราง, รายการคอลัมน์ (ชื่อ, ชนิดข้อมูล, Length/Values, Primary Key, Nullable, Default Value)
  - มี Quick Presets สำหรับคอลัมน์มาตรฐาน (เช่น `id` (PK), `created_at`, `updated_at`)
  - Live SQL Statement Preview
  - เมื่อสร้างเสร็จ ทำการรีเฟรช Object Browser และเปิดแท็บตารางใหม่ให้อัตโนมัติ
- **Drop Table:**
  - ลบผ่านคลิกขวาที่ตารางใน Object Browser หรือปุ่มใน Table Structure Editor
  - มี Drop Table Confirmation Modal พร้อมคำเตือนข้อมูลสูญหาย และตัวเลือก `CASCADE`
  - เมื่อลบเสร็จ ทำการปิดแท็บที่เปิดอยู่ของตารางนั้น และรีเฟรช Object Browser
- **Dialect Handling:**
  - PostgreSQL: Quote ด้วย `"schema"."table"`, รองรับ `SERIAL / BIGSERIAL / UUID`, `CASCADE`
  - MySQL: Quote ด้วย \`table\`, รองรับ `AUTO_INCREMENT`, `PRIMARY KEY`
  - SQLite: Quote ด้วย `"table"`, รองรับ `INTEGER PRIMARY KEY AUTOINCREMENT`

---

## 2. Proposed Changes & Components

### A. SQL Generator Helpers
- **File:** `src/components/structure/tableManagementHelpers.ts`
- **Functions:**
  - `buildCreateTableSql(config: CreateTableConfig): string`
  - `buildDropTableSql(tableName: string, schemaName?: string, driver?: string, cascade?: boolean): string`
- **Unit Tests:** `src/components/structure/tableManagementHelpers.test.ts`

### B. Modals
- **File:** `src/components/structure/CreateTableModal.tsx`
  - Interactive table name and columns editor
  - Integrate with `getDataTypeSpec` from `tableStructureHelpers.ts` for type-correlated lengths and default suggestions
  - Live SQL Preview
  - Error alert on failed execution
- **File:** `src/components/structure/DropTableModal.tsx`
  - Safety confirmation prompt
  - CASCADE option for PostgreSQL / MySQL
  - Tab close integration via `useTabStore`

### C. Object Browser & Tab Integration
- **File:** `src/components/sidebar/ObjectBrowser.tsx`
  - Add "New Table..." to context menus of Schema, Database, and Tables Folder
  - Add "Drop Table..." (destructive/red) to context menu of Table
  - Mount `CreateTableModal` and `DropTableModal`
- **File:** `src/components/structure/TableStructureEditor.tsx`
  - Add "Drop Table" button to toolbar

### D. Documentation & Spec Update
- **File:** `docs/db-manager-plan.md`
  - Update Table Designer & Object Browser features to mark Create/Drop table as implemented

---

## 3. Step-by-Step Execution Plan

### Task 1: TDD for Table Management Helpers
- Write comprehensive tests in `src/components/structure/tableManagementHelpers.test.ts`
- Implement `src/components/structure/tableManagementHelpers.ts`
- Verify tests pass with `pnpm test`

### Task 2: Implement DropTableModal & Unit Tests
- Create `src/components/structure/DropTableModal.tsx`
- Write unit tests in `src/components/structure/DropTableModal.test.tsx`
- Verify tests pass

### Task 3: Implement CreateTableModal & Unit Tests
- Create `src/components/structure/CreateTableModal.tsx`
- Write unit tests in `src/components/structure/CreateTableModal.test.tsx`
- Verify tests pass

### Task 4: Integrate with ObjectBrowser & TableStructureEditor
- Update `src/components/sidebar/ObjectBrowser.tsx` to add "New Table..." and "Drop Table..."
- Update `src/components/structure/TableStructureEditor.tsx` to add "Drop Table" in toolbar
- Update/add tests in `src/components/sidebar/ObjectBrowser.test.tsx` and `src/components/structure/TableStructureEditor.test.tsx`

### Task 5: Update Specification & Verify Build
- Update `docs/db-manager-plan.md`
- Run full test suite (`pnpm test` and `pnpm build`)
- Commit changes with descriptive commit message

### Task 6: Close GitHub Issue #1
- Use `gh issue close 1 --comment "..."` with details of implementation
