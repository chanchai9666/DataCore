# Design Document: Auto-Commit vs Staging Mode (DataCore)

- **Date:** 2026-11-08
- **Status:** Approved
- **Target Branch:** `feature/new-features`
- **Issue Reference:** Closes #31

---

## 1. Intent & The Why

ในระบบจัดการฐานข้อมูล (Database Client) เช่น DBeaver หรือ Navicat การแก้ไขข้อมูลในตารางมีความเสี่ยงที่จะส่งผลกระทบต่อข้อมูลจริงในทันที (Data Loss หรือ Accidental Overwrite)
- ในบางกรณี ผู้ใช้ต้องการความรวดเร็วในการแก้ไขแบบ **Auto-Commit (บันทึกทันที)** สำหรับงานทั่วไป
- ในหลายกรณี โดยเฉพาะใน Production หรือ Database ที่สำคัญ ผู้ใช้ต้องการ **Staging Mode (Manual Commit)** ที่สามารถแก้ไขหลายๆ ช่อง (Cell edits), เพิ่มหลายๆ แถว (Insert rows), หรือลบหลายๆ แถว (Delete rows) เป็นแบบ Local Draft ก่อน โดยเห็นการไฮไลท์สีที่แถว/ช่องที่มีการเปลี่ยนแปลงอย่างชัดเจน เมื่อตรวจสอบความถูกต้องครบถ้วนแล้ว จึงกดปุ่ม **`Commit (N)`** เพื่อส่งคำสั่งไปรันบนฐานข้อมูลจริงเป็นก้อนเดียว (Batch Transaction) หรือกด **`Discard`** เพื่อยกเลิกการเปลี่ยนแปลงทั้งหมดได้อย่างปลอดภัย

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Auto-Commit / Staging Mode Toggle:**
   - มีปุ่มสลับโหมดวางอยู่ที่ `GridBottomBar` ข้างปุ่ม `Commit` และ `Discard`
   - แสดงสถานะชัดเจน เช่น `⚡ Auto-Commit` (โหมดบันทึกทันที) vs `📝 Manual Commit` (โหมด Staging)
   - หากผู้ใช้อยู่ในโหมด Staging และมีรายการค้างอยู่ (`hasPendingChanges`) แล้วพยายามกดสลับกลับเป็น Auto-Commit จะต้องมีกล่องข้อความยืนยันเตือนความปลอดภัย (Prompt/Confirm) ไม่ให้ข้อมูลดราฟต์สูญหายโดยไม่ตั้งใจ
2. **Staged Operations in Staging Mode:**
   - **Cell Editing:** เมื่อดับเบิ้ลคลิกแก้ไขค่าในช่อง เซลล์นั้นจะถูก Stage ไว้ใน `pendingChangesStore` และตารางจะแสดงผลค่าใหม่ทันที พร้อมใส่สีไฮไลต์ (Blue/Indigo tint)
   - **Add Row:** เมื่อเพิ่มแถวใหม่ ข้อมูลแถวนั้นจะถูก Stage ใน `pendingChangesStore` และแสดงเป็นแถวดราฟต์ในตารางพร้อมไฮไลต์สี (Emerald/Green tint)
   - **Delete Row:** เมื่อเลือกแถวแล้วกด Delete แถวนั้นจะถูกบันทึกใน `deletedRowIndices` และแสดงไฮไลต์สีแดง (Rose/Red tint) บนตาราง
3. **Commit & Discard Action:**
   - ปุ่ม `Commit` แสดงจำนวนรายการค้าง เช่น `Commit (3)` พร้อมสี Accent เมื่อมี Pending Changes
   - เมื่อกด `Commit`: นำคำสั่ง SQL ทั้งหมด (UPDATEs, INSERTs, DELETEs) ไป Execute บันทึกลงฐานข้อมูลจริง เคลียร์ Store และ Refresh ตาราง
   - ปุ่ม `Discard` เปิดให้กดได้เมื่อมี Pending Changes เมื่อกดจะเคลียร์ทุกการแก้ไขใน Store และคืนค่าหน้าจอกลับสู่สภาพเดิมของ Database
4. **Auto-Commit Mode (Default Compatibility):**
   - เมื่อ Auto-Commit เปิดอยู่ พฤติกรรมยังคงทำงานแบบ Direct Execution ทันทีตามเดิม ปุ่ม Commit/Discard จะเป็นสีเทา (disabled)

### Non-Goals
- การทำ Staging ข้าม Database หลายตัวพร้อมกัน (ขอบเขตจำกัดเฉพาะ Table/Tab ปัจจุบัน)
- การทำ Git-like 3-way merge conflict resolution

### Anti-Goals
- ห้ามทำลายข้อมูลดราฟต์ของผู้ใช้โดยไม่มีการยืนยัน
- ห้ามทำให้ Glide Data Grid rendering กระตุกหรือลดทอน performance

---

## 3. Architecture & Data Flow

1. **State Management (`src/stores/pendingChangesStore.ts`):**
   - เพิ่ม `isAutoCommit: Record<string, boolean>` (ค่าเริ่มต้น: `true`)
   - ฟังก์ชัน `setAutoCommitMode(tableKey: string, enabled: boolean): void`
   - ฟังก์ชัน `isAutoCommitMode(tableKey: string): boolean`
   - ฟังก์ชัน `getPendingChanges(tableKey: string): TablePendingState`
2. **Grid Rendering (`src/components/grid/DataGrid.tsx`):**
   - ใน `getCellContent`:
     - ตรวจสอบว่า Cell อยู่ใน `cellEdits` หรือไม่ -> แสดงค่าใหม่ พร้อม `themeOverride` (Blue tint)
     - ตรวจสอบว่า Row อยู่ใน `deletedRowIndices` หรือไม่ -> แสดง `themeOverride` (Red tint)
     - ผสานแถวใหม่จาก `addedRows` เข้ากับแถวที่แสดงผล พร้อม `themeOverride` (Green tint)
   - ใน `GridBottomBar.tsx`:
     - เพิ่มปุ่ม Toggle สลับโหมด `Auto-Commit` / `Manual Commit` ข้างปุ่ม Commit/Discard
3. **Batch Commit Execution (`src/components/layout/DockLayout.tsx`):**
   - สร้าง helper `executeBatchCommit(tabId, tableKey, pendingChanges)` รวม SQL Statements (BEGIN TRANSACTION ... COMMIT) ส่งไปยัง `dbApi.executeQuery`
   - เมื่อสำเร็จ: `discardChanges(tableKey)` และ `loadTableData()`

---

## 4. Verification & Testing

- Unit test สำหรับ `pendingChangesStore`: toggle auto-commit, stage/unstage
- Unit test สำหรับ `GridBottomBar`: แสดงปุ่มสลับโหมด, แสดงจำนวน pending, กดปุ่ม commit/discard
- Unit test สำหรับ `DataGrid`: cell edit ใน auto-commit vs staging, การแสดงไฮไลต์สี
- Full suite test: `pnpm test` (357+ tests) และ `pnpm build`
