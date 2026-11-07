# Code Review Report — `main...HEAD` (feature/datacore-mvp)

> จุดอ้างอิง (fixed point): `main` (`5e43b5e`) · 39 commits · 110 ไฟล์ · ~26k บรรทัด
> ตรวจเมื่อ: 2026-11-07 — 2 แกน: **Standards** (มาตรฐานตามเอกสาร + Fowler smell, _Refactoring_ ch.3) และ **Spec** (เทียบกับ GitHub Issues #1–#7 + สเปคโปรเจกต์)
> ผลตรวจจริง ณ วันตรวจ: Vitest 172/172 ผ่าน · cargo test 13/13 ผ่าน
> สถานะ: บันทึกไว้เพื่อปรับแก้ในภายหลัง (ยังไม่แก้)

## วิธีใช้งานไฟล์นี้

- หมวด **Standards** = การละเมิดมาตรฐานที่เอกสารระบุ (hard violations) + code smells (judgement calls)
- หมวด **Spec** = ของที่ spec ต้องการแต่หายไป / เกินขอบเขต (scope creep) / implement แล้วผิด
- แต่ละรายการมีรหัส: `S*` (Standards), `P*` (Spec missing/partial), `W*` (Spec wrong)
- เมื่อแก้รายการใดเสร็จ ให้ขีด `[x]` พร้อมอ้างอิง issue/commit ใหม่ (ตาม workflow ใน `AGENTS.md`)

---

## Standards

### Hard violations (มาตรฐานที่เอกสารระบุ)

- [ ] **S1. Commit ไม่อ้างอิง issue (AGENTS.md §Workflow ข้อ 1+4)** — 28 ใน 35 commits ไม่มี `closes #N` (เช่น `d00f311`, `dfa503e`, `78c300a`) และงานส่วนใหญ่ของ MVP ไม่ได้เปิด issue ก่อนเริ่ม ปัญหานี้แก้ย้อนหลังไม่ได้ — ใช้เป็นบทเรียนและเปิด issue ประกอบรายการแก้ในไฟล์นี้ต่อจากนี้ตาม workflow
- [ ] **S2. Spec ไม่ถูกอัปเดตทุกครั้ง (AGENTS.md §Workflow ข้อ 2)** — `docs/db-manager-plan.md` ถูกแตะเพียง 6 commits จาก 30+ commits ที่แก้ฟีเจอร์ (เช่น `e017c44` structure editor, `9df8bb3` grid) — แก้ได้: อัปเดตสเปคให้ตรงกับที่ implement จริงตามรายการในหมวด Spec
- [x] **S3. เอกสารขัดกับโค้ดเรื่อง Keychain (AGENTS.md §Architecture, README.md)** — ปรับแก้เอกสารให้ตรงกับการทำงานแบบ in-memory เรียบร้อยแล้ว (closes #8)

### ✓ ผ่านมาตรฐานแล้ว (ไม่ต้องทำอะไร)

pnpm / port 1420 strictPort ✓ ไม่แตะ `src-tauri/gen/` ✓ Zustand เท่านั้น ✓ IPC ผ่าน `src/api/db.ts` เท่านั้น ✓ data contract `src/types/db.ts` ↔ `src-tauri/src/models/query.rs` sync ✓ สถาปัตยกรรม commands→drivers→services/session ตรง README ✓

### Smells (judgement calls — ไม่ใช่ violation ตรง ๆ)

- [x] **S4. Duplicated Code** — ปรับ `setAutoCommit` และ `setQueryContent` ใน `src/stores/tabStore.ts` ให้เรียกใช้ `updateTab` ลด code duplication (closes #11)
- [ ] **S5. Data Clumps (common parameter ซ้ำ 12 จุด)** — `src/api/db.ts:28-60,98-155` ทุก invoke ส่งทั้ง `connectionId` + `connection_id` / `tabId` + `tab_id` — Tauri 2 แปลง snake→camelCase ให้อยู่แล้ว (ยกเว้นจุดที่ตั้งใจรับแบบ snake) → ตรวจฝั่ง Rust ว่ารับอย่างไร แล้วตัดฝั่งซ้ำทิ้ง
- [ ] **S6. Duplicated Code ข้าม runtime + Divergent Change** — `src/types/db.ts:69-87` (`formatCellValue`) โคลน logic ของ `src-tauri/src/models/query.rs:70-80` (`to_display_string`) และเป็น runtime code ในไฟล์ **type** → เลือกเก็บ display logic ไว้ที่เดียว (กัน logic ต่างกันสองฝั่ง) หรือย้าย TS ออกจากไฟล์ type
- [ ] **S7. Large Class / Long File** — `TableStructureEditor.tsx` (1782 บรรทัด, 31 `useState`) และ `ObjectBrowser.tsx` (932 บรรทัด) → แบ่งเป็น sub-component ตามโหมด
- [ ] **S8. Data Clump + Mysterious Name** — `src/types/db.ts:20-21` `SchemaNode` มีทั้ง `schema_name?` **และ** `schema?` สองฟิลด์ความหมายซ้อน → ลดเหลืออันเดียวพร้อม sync ฝั่ง Rust

---

## Spec

### ✓ ผ่านแล้ว

- Issue #1 (Create/Drop Table) ครบ: modal, live SQL preview, CASCADE, ยืนยันด้วยการพิมพ์ชื่อตาราง, ปิดแท็บที่เกี่ยวข้อง, refresh + เปิดแท็บใหม่อัตโนมัติ
- Issue #2 (AGENTS.md/GEMINI.md) เป็น docs-only ตรงตามขอบเขต
- Issue #7 ขอบเขต Postgres/MySQL เท่านั้น ถูกต้องตามขอบเขตงานของ issue จริง — SQLite คืน columns จาก `stmt.column_count()` แม้ 0 rows อยู่แล้ว (`sqlite.rs:64`)
- Tests ผ่านทุกจุดตามข้อกำหนด (Vitest 172 + cargo test 13) และ `docs/db-manager-plan.md` ถูกอัปเดต (+35 บรรทัด) ตาม workflow

### (a) หายไป / บางส่วน

- [ ] **P1. Sort & Filter กริด** — spec: `"เรียงลำดับและกรองข้อมูล"` (`docs/db-manager-plan.md:133`) — ไม่มีโค้ด sorting/filtering ใน `DataGrid.tsx` / `DockLayout.tsx` → เปิด issue ใหม่เพื่อ implement หรือขยับไปทีหลัง MVP
- [ ] **P2. Query History** — spec: `"ประวัติ query"` (`docs/db-manager-plan.md:147`) — ไม่มีในโค้ดทั้งระบบ → เปิด issue ใหม่
- [ ] **P3. Mac shortcuts เพิ่ม** — spec: `"⌘+T แท็บใหม่, ⌘+W ปิดแท็บ, ⌘+F ค้นหา"` (`docs/db-manager-plan.md:152`) — มีแค่ `⌘+Enter` ใน `SqlEditor.tsx:125` → เปิด issue ใหม่
- [x] **P4. Disconnect ไม่ตัดจริง** — เพิ่ม backend teardown ผ่าน `disconnect_connection` / `close_sessions_for_connection` พร้อม rollback และปิดแท็บที่เกี่ยวข้องผ่าน `closeTabsForConnection` ใน frontend พร้อม automated test (closes #11)
- [x] **P5. เอกสารล้าสมัยหลายจุด (รวมกับ S3)** — ปรับแก้ README badge "Tests 185/185" และ README Roadmap ให้ตรงกับโค้ดจริงเรียบร้อยแล้ว (closes #8)

### (b) Scope creep (ไม่ต้องการเพิ่ม — แค่ทำเอกสารให้สอดคล้อง)

- [x] Table Structure Editor (ALTER), Length/Default correlation และ inline edit/insert/delete แถว อัปเดตลงใน README Roadmap ระดับ 1 เรียบร้อยแล้ว (closes #8)
- [x] ลบ `keyring` ออกจาก `Cargo.toml` และ `error.rs` เรียบร้อยแล้ว (closes #8)

### (c) Implement แต่ผิด / stub

- [x] **W1. Cancel query เป็น no-op (หนักสุด)** — implement การยกเลิกจริงครบทั้ง 3 drivers (SQLite: `InterruptHandle`/`sqlite3_interrupt`, Postgres: `pg_cancel_backend`, MySQL: `KILL QUERY`) พร้อม automated test ใน `sqlite_test.rs` เรียบร้อยแล้ว (closes #9)
- [x] **W2. buildInsertSql ข้ามเฉพาะ PK ชื่อ `id`/SERIAL ไม่ครบ** — รองรับ `is_primary_key`, `is_auto_increment`, PK รูปแบบต่าง ๆ (UUID, custom PK names `*_id`, AUTO_INCREMENT) ใน Rust `ColumnMeta`, TypeScript และ `tableEditHelpers.ts` พร้อม test (closes #10)
- [x] **W3. executeDirectQuery แยก SQL ด้วย `split(';')`** — เพิ่มฟังก์ชัน `splitSqlStatements` ที่เป็น quote-aware และ comment-aware ใน `src/api/sqlSplitter.ts` พร้อม test ครอบคลุม (closes #10)

---

## สรุปเชิงเปรียบเทียบ

| แกน | จำนวน | หนักสุด |
|---|---|---|
| Standards | 8 (S1–S8) | S1/S3 — workflow ก่อนกฎมีผล + เอกสาร Keychain ขัดโค้ด |
| Spec | 9 (P1–P5, W1–W3, creep) | W1 — `cancel()` ทั้ง 3 drivers เป็น no-op ทั้งที่ spec ระบุชัด |

## ลำดับที่แนะนำให้เริ่มแก้

1. **เอกสารก่อน (เร็ว, ไม่แตะสถาปัตยกรรม):** S3 + P5 — แก้ AGENTS.md, README, Roadmap
2. **W1** — cancel() เป็น behavior หลักที่ผู้ใช้เห็นและผิดตาม spec ชัดเจน
3. **W2, W3** — เรื่อง insert query และ direct query
4. **P4** — backend teardown ตอน Disconnect (แตะ session/layer backend)
5. **S4–S8 + P1–P3** — เปิด issue ใหม่เรียกทีละเรื่อง (ตาม workflow AGENTS.md)
