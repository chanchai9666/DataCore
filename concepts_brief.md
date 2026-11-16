# DataCore Development Roadmap (Phase 34 - 38) Concepts Brief

* **Author:** chanchai9666
* **Date:** 2026-11-16
* **Status:** In Review (EGM Brainstorming)

## 1. ภาพรวม (Overview)

เอกสารฉบับนี้เป็นการสรุปและประเมินเชิงวิพากษ์สำหรับแผนงาน **DataCore Development Roadmap (Phase 34+)** ซึ่งต่อยอดจาก Phase 33 เดิมใน `docs/db-manager-plan.md` แผนงานนี้ครอบคลุมการยกระดับใน 5 มิติหลัก ได้แก่ ความปลอดภัยระดับหน่วยความจำและ Production Guardrails (Phase 34), ความลื่นไหลในการใช้งานและ Workspace Persistence (Phase 35), การบริหารจัดการ Object เชิงลึกและระบบ Backup/Restore (Phase 36), การขยายฐานข้อมูลและ AI Assistant แบบ Local-first (Phase 37), และมาตรฐานการเผยแพร่แอปบน macOS (Phase 38)

---

## 2. การวิเคราะห์ความสอดคล้องกับโค้ดเบส (Codebase Alignment)

จากการตรวจสอบซอร์สโค้ดปัจจุบันในโปรเจกต์ DataCore พบว่าข้อเท็จจริงทางเทคนิคใน Roadmap สอดคล้องกับสภาพโค้ดจริง 100%:

1. **ลำดับ Phase:** ใน `docs/db-manager-plan.md` บันทึกสถานะเสร็จสิ้นสมบูรณ์ที่ Phase 33 (และ Audit Issues #107–#150) การเริ่มที่ **Phase 34** จึงเป็นลำดับที่ถูกต้องและต่อเนื่องกัน
2. **การจัดการ Secret ใน RAM (`src-tauri/Cargo.toml`):** ปัจจุบันยังไม่มี crate `zeroize` และ struct เช่น `PostgresConnection`, `KeychainVault` ยังเก็บรหัสผ่านเป็น `String` ธรรมดาใน Heap
3. **Filter Injection Vulnerability (`src-tauri/src/drivers/sqlite.rs` L351-355):** ฟังก์ชัน `fetch_table_data` ใช้เพียง `validate_table_filter(f)` กรองคำต้องห้ามแบบ blocklist แล้วต่อสตริง `format!(" WHERE {}", f.trim())` เข้ากับ SQL query โดยตรง เสี่ยงต่อ syntax mismatch และ edge-case bypass
4. **Desktop App Distribution (`src-tauri/tauri.conf.json`):** ยังไม่มีการตั้งค่า `tauri-plugin-updater` สำหรับ Auto-update และยังไม่มี Apple Developer Team ID / Entitlements สำหรับ Notarization

---

## 3. ข้อวิพากษ์และจุดเสี่ยงสำคัญ (Critique & High-Risk Blindspots)

เพื่อป้องกันปัญหาทางสถาปัตยกรรมและลดภาระงานซ้ำซ้อน (Tech Debt & Refactoring Cost) มีข้อสังเกตและจุดเสี่ยงที่ต้องพิจารณาอย่างเข้มงวดดังนี้:

### 3.1 การสลับลำดับความสำคัญของ Type-Safe IPC (`tauri-specta`)
* **ปัญหา:** แผนงานวาง `tauri-specta` ไว้ใน Phase 38 (เฟสสุดท้าย) แต่ใน Phase 34.3 มีการเปลี่ยน Data Contract ของ Query Filter เป็น AST (`FilterCondition`), Phase 35 มีการส่ง Workspace State, และ Phase 36 มีการเพิ่ม Schema Tree Nodes ใหม่
* **ข้อเสนอแนะ:** การนำ `tauri-specta` มาทำเป็นเฟสแรกๆ หรือก่อนปรับโครงสร้าง Driver จะช่วยป้องกัน IPC type drift ระหว่าง Rust และ TypeScript ได้ตั้งแต่ต้นทาง แทนที่จะต้องเขียน type matching ซ้ำซ้อนสองฝั่งด้วยมือไปจนถึง Phase 37

### 3.2 ความเข้ากันไม่ได้ของ Non-Relational Engine (Redis) กับ Driver Abstraction
* **ปัญหา:** ปัจจุบัน Trait `DatabaseConnection` ใน `src-tauri/src/drivers/traits.rs` ถูกออกแบบมาเฉพาะสำหรับ Relational Database แบบ tabular (columns, data types, rows, SQL execution, explain plan)
* **ความเสี่ยง:** Redis มีโมเดลข้อมูลเป็น Key-Value / In-Memory Data Structures (Strings, Hashes, Lists, Sets, Streams) ซึ่งไม่มี SQL execution, Table schema หรือ Foreign Key หากนำมาต่อเข้า trait เดิมจะเกิด abstraction leak อย่างรุนแรง
* **ข้อเสนอแนะ:** ควรแยก Relational Engines (DuckDB, MSSQL) ไว้ในกลุ่ม Engine ปกติ และแยก NoSQL/Key-Value Engine (Redis) ออกมาเป็นโครงสร้างแยกเฉพาะ หรือตัด Redis ออกไปเป็น Non-Goal ก่อน

### 3.3 ข้อขัดแย้งของ Touch ID / macOS Keychain กับ Zero-Popup Philosophy
* **ปัญหา:** ปรัชญาการออกแบบเดิมของ DataCore (ระบุไว้ใน `AGENTS.md`) คือ *"ไม่เรียกใช้ OS Keychain เพื่อหลีกเลี่ยง Authorization Popups รบกวน โดยจำรหัสผ่านข้ามการปิด-เปิดแอปและการ restart เครื่องได้อย่างปลอดภัย"*
* **ข้อกำหนด:** การเพิ่ม macOS Keychain / Touch ID (Phase 34.2) จะต้องเป็น **Strictly Opt-In** 100% โดยที่ผู้ใช้ทั่วไปจะยังคงใช้ Local Vault (Argon2id + AES-256-GCM) ต่อไปตามเดิมโดยไม่มี popup กวนใจ

### 3.4 ขอบเขตของ Native Dump & Restore (`pg_dump` / `mysqldump`)
* **ปัญหา:** บนเครื่อง macOS ของผู้ใช้อาจไม่มี CLI `pg_dump` หรือ `mysqldump` ติดตั้งอยู่ใน `$PATH`
* **ความเสี่ยง:** หากแอปไม่พบ binary หรือเวอร์ชันของ CLI ไม่ตรงกับ Server (เช่น client version เก่ากว่า server version) คำสั่ง backup/restore จะล้มเหลวทันที
* **ข้อกำหนด:** ต้องมี UI ที่ให้ผู้ใช้ระบุ Binary Path ได้เอง และมีระบบ Fallback หรือ Error Diagnostics ที่ชัดเจน

---

## 4. เป้าหมายและขอบเขต (Goals vs. Non-Goals)

* **In-Scope Goals (เป้าหมายที่อยู่ในขอบเขต):**
  * พัฒนาความปลอดภัยหน่วยความจำและการป้องกัน Injection (Phase 34)
  * เพิ่มความสะดวกในการใช้งานประจำวัน: Workspace Persistence, FK Popover, Cell Detail Drawer, Copy As (Phase 35)
  * ขยายความสามารถในการสำรวจโครงสร้างฐานข้อมูลขั้นสูง Triggers, Functions, Procedures (Phase 36)
  * ขยายการรองรับ Embedded Analytics ด้วย DuckDB (Phase 37)
  * จัดเตรียมระบบ Distribution และ macOS Code Signing / Notarization (Phase 38)
* **Out-of-Scope Non-Goals (สิ่งที่อยู่นอกขอบเขตในรอบนี้):**
  * การรวม Redis เข้าเป็น Relational Database (ควรพิจารณาในโครงการแยกหรือ Phase ถัดไป)
  * การส่งข้อมูล Row Data จริงไปยังคลาวด์หรือ Third-party LLM (รักษาความเป็น Local-First 100%)
  * การบังคับใช้ macOS Keychain เป็นค่าเริ่มต้นแทนระบบ Local Vault

---

## 5. โครงสร้างการเปิด GitHub Issues (Created Epic Issues)

ได้ทำการเปิด GitHub Issues เป็น 5 Epic Issues พร้อม Checklist งานย่อยอย่างสมบูรณ์ ดังนี้:

* **Phase 34:** [#151 feat(epic): Phase 34 — Security Hardening, Type-Safe IPC & Production Guardrails](https://github.com/chanchai9666/DataCore/issues/151)
* **Phase 35:** [#152 feat(epic): Phase 35 — UX/UI Ergonomics & Workspace Persistence](https://github.com/chanchai9666/DataCore/issues/152)
* **Phase 36:** [#153 feat(epic): Phase 36 — Deep Object Browser & Native Backup/Restore Suite](https://github.com/chanchai9666/DataCore/issues/153)
* **Phase 37:** [#154 feat(epic): Phase 37 — Engine Expansion (DuckDB, MSSQL) & Local-First AI Assistant](https://github.com/chanchai9666/DataCore/issues/154)
* **Phase 38:** [#155 feat(epic): Phase 38 — Distribution, Auto-Updater & Accessibility Standards](https://github.com/chanchai9666/DataCore/issues/155)
