# DataCore — Pending GitHub Issues Draft

เอกสารนี้รวบรวมรายการปัญหาและงานปรับปรุงที่ตรวจพบจากการประเมินโค้ดเบส (ณ วันที่ 20 พฤศจิกายน 2026, commit `6eb4a9d`) เพื่อใช้สำหรับเปิด GitHub Issues ผ่าน `gh issue create` ภายหลังตามแนวทางใน `AGENTS.md`

---

## สรุปสถานะ GitHub Issues (อัปเดตล่าสุด 21 พฤศจิกายน 2026)

| Issue | GitHub | สถานะ | หัวข้อ |
| :--- | :--- | :--- | :--- |
| Issue 1 | [#227](https://github.com/chanchai9666/DataCore/issues/227) | ✅ Closed | [Security] Escape schema name in `MssqlConnection::get_object_ddl` & review raw filter fallback |
| Issue 2 | [#228](https://github.com/chanchai9666/DataCore/issues/228) | ✅ Closed | [Chore/Hygiene] Remove leftover temporary test file `round7_probe_test.rs` |
| Issue 3 | [#229](https://github.com/chanchai9666/DataCore/issues/229) | 🟡 Open (Partial — `set_autocommit` & `Zeroizing` done, `cancel` pending) | [Feature Parity] Complete MSSQL driver `cancel` and `set_autocommit` support |
| Issue 4 | [#230](https://github.com/chanchai9666/DataCore/issues/230) | ✅ Closed | [UI/UX] Migrate `DriverForm.tsx` from hardcoded dark Tailwind classes to semantic theme tokens |
| Issue 5 | [#231](https://github.com/chanchai9666/DataCore/issues/231) | ⏸️ Open (On Hold / ดองยาว) | [Release/Distribution] Configure macOS Code Signing, Hardened Runtime & Notarization |
| Issue 6 | [#232](https://github.com/chanchai9666/DataCore/issues/232) | 🔴 Open | [Docs] Update README screenshots and driver documentation |
| Issue 7 | [#233](https://github.com/chanchai9666/DataCore/issues/233) | ✅ Closed | [UI/UX & i18n] Improve ConnectionDialog & DriverForm Layout, Theme Tokens, and Thai/EN Parity |
| Issue 8 | [#234](https://github.com/chanchai9666/DataCore/issues/234) | ✅ Closed | [Bug/UX] Fix Right-Click Context Menu Flashing at Top-Left `(0, 0)` |
| Issue 9 | [#235](https://github.com/chanchai9666/DataCore/issues/235) | ✅ Closed | [Feature/UX] Add Multi-Select and Keyboard Shortcuts to Table Detail (`TableListTab`) |
| Issue 10 | [#236](https://github.com/chanchai9666/DataCore/issues/236) | ✅ Closed | [Feature/UX] Align Table Detail Right-Click Context Menu with Tree Table (`ObjectBrowser`) for Single & Multi-Table Selection |
| Issue 11 | [#237](https://github.com/chanchai9666/DataCore/issues/237) | ✅ Closed | [Feature] Saved / Frequently Used Queries per Database (บันทึกและรัน Query ที่ใช้บ่อยแยกตามฐานข้อมูล) |
| Issue 12 | [#238](https://github.com/chanchai9666/DataCore/issues/238) | ✅ Closed | [UX/Perf] Improve Active Tab Visibility & Navigation and Prevent Auto-Reload on `TableListTab` Switch |
| Issue 13 | [#239](https://github.com/chanchai9666/DataCore/issues/239) | ✅ Closed | [Feature/UX] Add Card / Grid, Grouped by Prefix, and Storage & Health Views to Table Detail (`TableListTab`) |
| Issue 14 | [#240](https://github.com/chanchai9666/DataCore/issues/240) | ✅ Closed | [UX] Add Prefix-Grouping Toggle to List View & Masonry Color-Coded Board for Grouped View in `TableListTab` |
| Issue 15 | [#241](https://github.com/chanchai9666/DataCore/issues/241) | ✅ Closed | [UI/UX] Migrate `EditorToolbar.tsx` from Hardcoded Light Colors to Semantic Theme Tokens for Dark Mode |
| Issue 16 | [#242](https://github.com/chanchai9666/DataCore/issues/242) | ✅ Closed | [UX/Validation] Prevent Duplicate Saved Query Names Within the Same Scope (`SaveQueryModal` & `snippetStore`) |
| Issue 17 | [#243](https://github.com/chanchai9666/DataCore/issues/243) | ✅ Closed | [UI/UX] Add Tab Right-Click Context Menu, Tab Pinning, and High-Visibility Open Tabs Switcher Button |
| Issue 18 | [#244](https://github.com/chanchai9666/DataCore/issues/244) | ✅ Closed | [Perf/UX] Cache `ObjectBrowser` Schema Tree, Column Metadata, and Expanded State Across Sidebar Collapse/Expand |
| Issue 19 | [#245](https://github.com/chanchai9666/DataCore/issues/245) | ✅ Closed | [Test/Bug] Add Real-Browser Playwright E2E & Backend Real-DB E2E Suites and Fix `SaveQueryModal` Hook Order |
| Issue 20 | [#246](https://github.com/chanchai9666/DataCore/issues/246) | ✅ Closed | [Perf/Backend] Optimize PostgreSQL `pg_catalog` Queries, Session Reuse, and `AuditLogger` Scaling |
| Issue 21 | [#247](https://github.com/chanchai9666/DataCore/issues/247) | ✅ Closed | [Security/Hygiene] Remove Unused `password` Field from `MssqlConnection` |
| Issue 22 | [#248](https://github.com/chanchai9666/DataCore/issues/248) | ✅ Closed | [UI/UX] Replace Disconnected Text Label with Gray Status Dot in `MainToolbar` |
| Round 7 | [#250](https://github.com/chanchai9666/DataCore/issues/250) | ✅ Closed | security: address Round 7 audit findings U1-U9 and fix CI fmt/clippy |
| Round 8 | [#251](https://github.com/chanchai9666/DataCore/issues/251) | ✅ Closed | security: address Round 8 audit findings R1-R7 (repair/rebuild, error counts, anchor promotion, perf & tests) |
| Issue 19 | — | ✅ Fixed (Pending Issue) | [Test/Bug] Add Real-Browser Playwright E2E & Backend Real-DB E2E Suites and Fix `SaveQueryModal` Hook Order |
| Issue 20 | — | ✅ Fixed (Pending Issue) | [Perf/Backend] Optimize PostgreSQL `pg_catalog` Queries, Session Reuse, and `AuditLogger` Scaling |
| Issue 21 | — | ✅ Fixed (Pending Issue) | [Security/Hygiene] Remove Unused `password` Field from `MssqlConnection` |
| Issue 22 | — | ✅ Fixed (Pending Issue) | [UI/UX] Replace Disconnected Text Label with Gray Status Dot in `MainToolbar` |

---

## Issue 1: [Security] Escape schema name in `MssqlConnection::get_object_ddl` & review raw filter fallback

- **Labels:** `security`, `bug`, `backend`
- **Priority:** High
- **GitHub Issue:** [#227](https://github.com/chanchai9666/DataCore/issues/227) (✅ Closed)

### ปัญหา (Problem Description)
1. **Unescaped schema interpolation ใน `src-tauri/src/drivers/mssql.rs` (`get_object_ddl`):**
   - บรรทัดที่เรียก `SELECT OBJECT_DEFINITION(OBJECT_ID('[{s_name}].[{}]')) AS ddl;` มีการ escape เฉพาะ `name` (`name.replace(']', "]]")`) แต่แทรก `s_name` ลงใน single-quoted SQL string โดยตรง ไม่ได้ escape เครื่องหมาย `'` (`s_name.replace('\'', "''")`) และ `]` (`s_name.replace(']', "]]")`) รวมถึงไม่ได้ escape `'` ใน `name`
2. **Raw SQL filter fallback ใน `src-tauri/src/drivers/traits.rs` (`build_safe_where_clause`):**
   - แม้ระบบจะรองรับ Structured JSON AST (`TableFilterState`) แล้ว แต่ยังเปิด fallback ให้ส่ง raw WHERE clause ได้ โดยอาศัย `validate_table_filter` แบบ keyword denylist ซึ่งยังเปิดช่องให้เขียน expression หรือ subquery ที่ไม่พึงประสงค์ได้ (เช่น `EXISTS (SELECT ...)` หรือ function call)

### แนวทางแก้ไข (Proposed Solution)
1. ใน `src-tauri/src/drivers/mssql.rs` (`get_object_ddl`):
   - Escape ทั้ง `]` → `]]` และ `'` → `''` สำหรับทั้ง `s_name` และ `name` (หรือใช้ parameterized query `OBJECT_ID(@P1)` ผ่าน `tiberius::Query::bind`)
   - เพิ่ม unit test ตรวจสอบกรณี schema/table name มีอักขระ `'` และ `]`
2. ใน `src-tauri/src/drivers/traits.rs`:
   - พิจารณาจำกัดหรือ deprecate raw filter fallback ให้ใช้เฉพาะ Structured JSON AST (`TableFilterState`) ใน UI/IPC หรือเพิ่ม allowlist validation ที่เข้มงวดขึ้น

### Acceptance Criteria
- [ ] `get_object_ddl` ใน `mssql.rs` ใช้ parameterized query หรือ escape อักขระพิเศษครบถ้วนทั้ง schema และ object name
- [ ] มี unit tests ครอบคลุมกรณีชื่อมี single quote และ bracket
- [ ] `cargo test` ผ่าน 100%

---

## Issue 2: [Chore/Hygiene] Remove leftover temporary test file `round7_probe_test.rs`

- **Labels:** `chore`, `cleanup`, `backend`
- **Priority:** Medium
- **GitHub Issue:** [#228](https://github.com/chanchai9666/DataCore/issues/228) (✅ Closed)

### ปัญหา (Problem Description)
- พบไฟล์ `src-tauri/src/services/round7_probe_test.rs` ซึ่งหัวไฟล์ระบุว่าเป็นไฟล์ทดสอบชั่วคราว (`//! TEMPORARY round-7 probe tests (deleted after running).`) แต่ยังค้างอยู่ใน repository และมีการรันคำสั่ง OS อย่าง `chflags` ในเทสต์

### แนวทางแก้ไข (Proposed Solution)
- ตรวจสอบว่า test cases สำคัญใน `round7_probe_test.rs` (เช่น P1–P7 สำหรับ `AuditLogger`) ถูกย้ายไปรวมใน `src-tauri/src/services/audit_logger_test.rs` แล้วหรือยัง
- ย้ายเฉพาะ regression test ที่จำเป็นเข้า `audit_logger_test.rs` (โดยไม่พึ่งคำสั่งเฉพาะเครื่องที่เสี่ยง flaky) แล้วลบ `round7_probe_test.rs` พร้อมถอด `mod round7_probe_test;` ออก

### Acceptance Criteria
- [ ] ไม่มีไฟล์ `round7_probe_test.rs` ค้างอยู่ใน `src-tauri/src/services/`
- [ ] Regression cases สำคัญถูกครอบคลุมใน `audit_logger_test.rs`
- [ ] `cargo test` ผ่าน 100%

---

## Issue 3: [Feature Parity] Complete MSSQL driver `cancel` and `set_autocommit` support

- **Labels:** `enhancement`, `backend`, `mssql`
- **Priority:** Medium
- **GitHub Issue:** [#229](https://github.com/chanchai9666/DataCore/issues/229) (🟡 Open (Partial — `set_autocommit` & `Zeroizing` done, `cancel` pending))

### ปัญหา (Problem Description)
- ใน `src-tauri/src/drivers/mssql.rs` เมธอด `cancel(&self)` และ `set_autocommit(&self, _enabled: bool)` ของ `MssqlConnection` ยังเป็น no-op (คืน `Ok(())` โดยไม่ได้ทำงานจริง) และ `Drop` ของ `MssqlConnection` ยังไม่ได้ทำ `zeroize` เหมือน `PostgresConnection` / `MysqlConnection`
- นอกจากนี้ `should_trust_mssql_cert` ยังยอมรับ certificate อัตโนมัติเมื่อ `ssl_mode` เป็น `require` (ตรวจ CA เฉพาะ `verify-ca` / `verify-full`)

### แนวทางแก้ไข (Proposed Solution)
1. Implement transaction mode toggle (`SET IMPLICIT_TRANSACTIONS ON/OFF` หรือจัดการ `BEGIN TRAN` state) ใน `MssqlConnection::set_autocommit`
2. Implement query cancellation สำหรับ MSSQL (เช่น ส่ง TDS attention packet หรือเก็บ session SPID เพื่อสั่ง `KILL <spid>` / abort stream)
3. จัดเก็บ credential ด้วย `Zeroizing<String>` และ implement `Drop` ให้สอดคล้องกับไดรเวอร์อื่น รวมถึงแจ้งเตือนใน Security Inspector หาก MSSQL เชื่อมต่อแบบไม่ verify CA

### Acceptance Criteria
- [ ] `set_autocommit(false)` / `commit()` / `rollback()` ทำงานจริงบน MSSQL
- [ ] ยกเลิกคิวรีที่กำลังรันบน MSSQL ได้
- [ ] มี unit/integration tests รองรับและผ่าน 100%

---

## Issue 4: [UI/UX] Migrate `DriverForm.tsx` from hardcoded dark Tailwind classes to semantic theme tokens

- **Labels:** `ui/ux`, `theme`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#230](https://github.com/chanchai9666/DataCore/issues/230) (✅ Closed)

### ปัญหา (Problem Description)
- ใน `src/components/dialogs/DriverForm.tsx` ยังใช้คลาสสีโทนมืดแบบ hardcode เช่น `text-gray-200`, `bg-gray-800`, `border-gray-700`, `text-gray-100` แทนการใช้ semantic CSS design tokens จาก `src/styles/tokens.css` (`bg-panel`, `bg-[var(--bg-input)]`, `border-border`, `text-text`, `text-muted`)
- ส่งผลให้เมื่อผู้ใช้สลับธีมเป็น **Light** หรือ **Warm Paper (`[data-theme='warm-paper']`)** หน้าฟอร์มตั้งค่า Connection จะยังแสดงเป็นโทนมืดขัดกับธีมหลักของแอป

### แนวทางแก้ไข (Proposed Solution)
- แทนที่คลาสสี hardcode ทั้งหมดใน `src/components/dialogs/DriverForm.tsx` ด้วย semantic theme tokens ที่สอดคล้องกับ `tokens.css` และ `tailwind.config.js`
- ตรวจสอบ dialog อื่นๆ ใน `src/components/dialogs/` เพิ่มเติมเพื่อให้รองรับทั้ง `dark`, `light` และ `warm-paper` รวมถึงโหมด `.high-contrast`

### Acceptance Criteria
- [ ] `DriverForm.tsx` แสดงผลกลมกลืนทั้งในธีม Light, Dark และ Warm Paper
- [ ] อัปเดต/เพิ่ม Vitest component tests ตรวจสอบการ render และผ่าน 100% (`pnpm test` และ `pnpm build`)

---

## Issue 5: [Release/Distribution] Configure macOS Code Signing, Hardened Runtime & Notarization

- **Labels:** `release`, `security`, `macos`
- **Priority:** High (before public release)
- **GitHub Issue:** [#231](https://github.com/chanchai9666/DataCore/issues/231) (⏸️ Open — On Hold / ดองยาว)

### ปัญหา (Problem Description)
- ใน `src-tauri/tauri.conf.json` ค่า `bundle.macOS.signingIdentity` ยังตั้งเป็น `null`
- หากแจกจ่ายไฟล์ `.dmg` / `.app` ให้ผู้ใช้ปลายทางบน macOS จะติดคำเตือน **macOS Gatekeeper** ("cannot be opened because the developer cannot be verified") และอาจกระทบการทำงานของ `tauri-plugin-updater`

### แนวทางแก้ไข (Proposed Solution)
1. เตรียม Apple Developer ID Application Certificate และตั้งค่า `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (App-specific password), `APPLE_TEAM_ID` ใน GitHub Actions Secrets (`.github/workflows/release.yml`)
2. ตรวจสอบ `src-tauri/entitlements.plist` ให้รองรับ Hardened Runtime ตามที่ Tauri 2 และ SSH/Network ต้องการ
3. ทดสอบ build + sign + notarize และตรวจสอบด้วย `codesign --verify --deep --strict` และ `spctl --assess`

### Acceptance Criteria
- [ ] Build release `.dmg` ผ่านการ Sign และ Notarize จาก Apple
- [ ] เปิดใช้งานบน macOS เครื่องอื่นได้โดยไม่ติด Gatekeeper block
- [ ] Auto-updater (`tauri-plugin-updater`) ตรวจสอบลายเซ็นและอัปเดตได้สมบูรณ์

---

## Issue 6: [Docs] Update README screenshots and driver documentation

- **Labels:** `documentation`
- **Priority:** Low
- **GitHub Issue:** [#232](https://github.com/chanchai9666/DataCore/issues/232) (🔴 Open)

### ปัญหา (Problem Description)
- ภาพตัวอย่างใน `docs/01-main-window.png` ยังแสดงชื่อโปรแกรมเดิมว่า `DBPilot` และ `docs/02-connection-dialog.png` ยังแสดงเฉพาะ 3 ไดรเวอร์ (SQLite, PostgreSQL, MySQL) ยังไม่สะท้อนธีมใหม่ (`Warm Paper`) และไดรเวอร์เพิ่มเติม (`DuckDB`, `MSSQL`)

### แนวทางแก้ไข (Proposed Solution)
- บันทึกภาพหน้าจอ DataCore เวอร์ชันปัจจุบัน (ทั้ง Dark/Light และ Warm Paper theme) มาแทนที่ใน `docs/`

---

## Issue 7: [UI/UX & i18n] Improve ConnectionDialog & DriverForm Layout, Theme Tokens, and Thai/EN Parity

- **Labels:** `ui/ux`, `i18n`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#233](https://github.com/chanchai9666/DataCore/issues/233) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
- `DriverForm.tsx` ใช้คลาสสีโทนมืดแบบ hardcode (`bg-gray-800`, `border-gray-700`, `text-gray-200`) ทำให้เพี้ยนในธีม Light และ Warm Paper
- ปรับขนาดและการวาง layout ของ `ConnectionDialog.tsx` และ `DriverForm.tsx` (ช่อง Host/Port, Read-Only, Remember Password, ซ่อนแท็บ SSL/SSH สำหรับ DuckDB)
- เพิ่มคำเตือนความปลอดภัย Vault DCV1 สำหรับ Production และตรวจสอบความครบถ้วนของคำแปลภาษาไทย/อังกฤษ (`en.json` / `th.json`)

### วิธีการแก้ไข (Implemented Solution)
1. **Theme Tokens & Layout (`ConnectionDialog.tsx`, `DriverForm.tsx`):**
   - แทนที่คลาสสี hardcode ด้วย semantic CSS tokens (`bg-panel`, `border-line`, `text-text`, `text-muted`, `bg-sidebar`)
   - ขยายความกว้าง modal เป็น `max-w-2xl`, จัด grid ช่อง Host/Port, จัดวาง Read-Only และ Remember Password ให้สมดุล, ซ่อน sub-tab SSL/SSH เมื่อเลือก DuckDB และเพิ่มแบนเนอร์เตือนเมื่อใช้ Production กับ Vault DCV1
2. **i18n Parity (`src/locales/en.json`, `src/locales/th.json`):**
   - ตรวจสอบและปรับให้คีย์คำแปล `en.json` และ `th.json` ตรงกันครบ 1,086 คีย์ ลบคีย์ซ้ำ `rememberPassword` และปรับ `security.atRestTitle` ให้สอดคล้องกับเทส

---

## Issue 8: [Bug/UX] Fix Right-Click Context Menu Flashing at Top-Left `(0, 0)`

- **Labels:** `bug`, `ui/ux`, `frontend`
- **Priority:** High
- **GitHub Issue:** [#234](https://github.com/chanchai9666/DataCore/issues/234) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
- พบปัญหาเมื่อคลิกขวาที่หน้า Table Detail เมนูคลิกขวาจะแวบไปแสดงที่มุมบนซ้าย `(0, 0)` ก่อนที่จะเด้งมาแสดงตรงตำแหน่งเมาส์

### วิธีการแก้ไข (Implemented Solution)
- แก้ไข `src/hooks/useContextMenuPosition.ts` ให้คืนค่าพิกัดเริ่มต้น `{ top: contextMenu.mouseY, left: contextMenu.mouseX }` ทันทีตั้งแต่ render รอบแรก ก่อนที่ `useLayoutEffect` จะคำนวณ clamp ขอบหน้าจอ
- เพิ่ม unit test ใน `src/components/tablelist/TableListTab.test.tsx` ตรวจสอบว่า style `left` และ `top` ตรงกับตำแหน่งเมาส์ทันที

---

## Issue 9: [Feature/UX] Add Multi-Select and Keyboard Shortcuts to Table Detail (`TableListTab`)

- **Labels:** `enhancement`, `ui/ux`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#235](https://github.com/chanchai9666/DataCore/issues/235) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
- หน้า Table Detail (`TableListTab.tsx`) ต้องการให้เลือกได้หลายตารางและใช้งานคีย์ลัดได้

### วิธีการแก้ไข (Implemented Solution)
- เพิ่มการเลือกหลายแถวใน `src/components/tablelist/TableListTab.tsx`: `Click` (เลือกเดี่ยว), `⌘/Ctrl+Click` (สลับเลือกเพิ่ม/ลด), `Shift+Click` (เลือกเป็นช่วง) พร้อมแสดง badge จำนวนที่เลือก
- เพิ่มคีย์ลัด: `⌘A` (เลือกทั้งหมด), `⌘C` (คัดลอกชื่อตารางที่เลือก), `⌘F` (โฟกัสช่องค้นหา), `↑/↓` และ `Shift+↑/↓` (เลื่อน/เลือกช่วง), `Enter` (เปิดตารางที่เลือก), `Escape` (ยกเลิกการเลือก/ปิดเมนู), `Delete/Backspace` (Drop ตารางเมื่อเลือก 1 ตาราง)
- เพิ่มคำแปลใน `en.json`/`th.json` และ unit tests ใน `TableListTab.test.tsx`

---

## Issue 10: [Feature/UX] Align Table Detail Right-Click Context Menu with Tree Table (`ObjectBrowser`) for Single & Multi-Table Selection

- **Labels:** `enhancement`, `ui/ux`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#236](https://github.com/chanchai9666/DataCore/issues/236) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
- ต้องการให้คลิกขวาที่หน้า Table Detail (`TableListTab`) ใช้งานได้เหมือนคลิกขวาที่ tree table (`ObjectBrowser`) ทั้งกรณีเลือกตารางเดียวและกรณีเลือกหลายตาราง

### วิธีการแก้ไข (Implemented Solution)
1. **กรณีเลือกตารางเดียว (`src/components/tablelist/TableListTab.tsx`):**
   - เพิ่มเมนูที่ขาดไปให้ครบ ได้แก่ **Query Table** (`openQueryTab`), **Visual Query Builder** (`openQueryBuilderTab`) และ **View DDL / Source** (`dbApi.getObjectDdl`)
   - จัดลำดับเมนู ไอคอน และคีย์ i18n ให้ตรงกับ `ObjectBrowser.tsx`
2. **กรณีเลือกหลายตาราง (`src/components/tablelist/TableListTab.tsx`, `src/components/transfer/ExportSqlModal.tsx`):**
   - เพิ่มคำสั่งแบบชุดในเมนูคลิกขวา: เปิดทุกตารางที่เลือก, แก้ไขโครงสร้างทุกตาราง, Export เป็น SQL Dump หลายตาราง (เพิ่ม prop `tableNames?: string[]` ใน `ExportSqlModal.tsx`), Run SQL Script, Query ตารางที่เลือกทั้งหมด, Visual Query Builder, ดู DDL / Source รวมทุกตาราง, คัดลอกชื่อทุกตาราง และ Drop ตารางที่เลือกทั้งหมด (พร้อมหน้าต่างยืนยันและปิดแท็บที่เกี่ยวข้อง)
   - เพิ่มคำแปล ไทย/EN ใน `src/locales/en.json` และ `src/locales/th.json` และเพิ่ม unit tests ใน `src/components/tablelist/TableListTab.test.tsx` (`pnpm test`: 118 ไฟล์, 1,142 tests ผ่านทั้งหมด, `pnpm build` ผ่าน)

---

## Issue 11: [Feature] Saved / Frequently Used Queries per Database (บันทึกและรัน Query ที่ใช้บ่อยแยกตามฐานข้อมูล)

- **Labels:** `enhancement`, `feature`, `frontend`, `ui/ux`
- **Priority:** Medium
- **GitHub Issue:** [#237](https://github.com/chanchai9666/DataCore/issues/237) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ / ความต้องการ (Requested Feature)
- ต้องการฟีเจอร์สำหรับบันทึก ตั้งชื่อ และรัน Query ที่ใช้บ่อยแยกตามแต่ละฐานข้อมูล (Connection / Database)
- มี **หน้ารวมแบบแท็บกลางจอ** สำหรับไล่ดู ค้นหา กรอง แก้ไข รัน และจัดการ Query ที่เซฟไว้ทั้งหมด พร้อม **รายการย่อใน Sidebar** ใต้แต่ละฐานข้อมูล
- บันทึกไว้ในเครื่องแบบ Local และสามารถ **Export เป็นไฟล์ `.json`** เพื่อนำไป **Import ที่เครื่องใหม่** ได้

### วิธีการแก้ไข (Implemented Solution)
1. **ระยะที่ 1 — Data Model, Store & Export/Import JSON (`src/types/queryHistory.ts`, `src/stores/snippetStore.ts`, `src/stores/snippetStore.test.ts`):**
   - ขยาย `SqlSnippet` (รองรับ backward-compatible กับข้อมูลเดิมใน `localStorage`) ด้วยฟิลด์ `scope` (`'global' | 'connection' | 'database'`), `connectionId`, `connectionName`, `database`, `driver`, `isPinned`, `runCount`, `lastRunAt` และ `SavedQueriesExportBundle`
   - เพิ่ม `togglePin`, `recordRun`, `getQueriesForContext`, `exportQueriesJson`, และ `importQueriesJson(jsonText, mode)` ใน `useSnippetStore`
2. **ระยะที่ 2 — บันทึกจากหน้า SQL Editor (`src/components/editor/SaveQueryModal.tsx`, `EditorToolbar.tsx`, `SqlEditor.tsx`, `tabHelpers.ts`, `src/types/db.ts`):**
   - เพิ่ม `savedQueryId` และ `autoRun` ใน `Tab` เพื่อเปิดแท็บจาก Saved Query พร้อมชื่อ Query บนหัวแท็บและไม่เปิดแท็บซ้ำ
   - เพิ่มปุ่ม **Save Query / Update Saved** (`⌘S`) บน `EditorToolbar` และ Modal สำหรับตั้งชื่อ หมายเหตุ เลือกขอบเขต (`database` / `connection` / `global`) ปักหมุด และ `Save as New`
3. **ระยะที่ 3 — หน้ารวมแบบแท็บกลางจอ, รายการย่อใน Sidebar & Command Palette (`SavedQueriesTab.tsx`, `ObjectBrowser.tsx`, `DockLayout.tsx`, `MainToolbar.tsx`, `App.tsx`, `CommandPaletteModal.tsx`):**
   - สร้าง `SavedQueriesTab.tsx` สำหรับค้นหา กรองตาม Connection/Scope ปักหมุด รัน 1 คลิก เปิดแก้ไข ลบ และ Export/Import `.json`
   - เพิ่มส่วน **Saved Queries** แบบพับได้ใน `ObjectBrowser.tsx` แสดงรายการที่ใช้บ่อยของฐานข้อมูลปัจจุบันพร้อมปุ่มรัน 1 คลิกและปุ่มดูทั้งหมด
   - เชื่อม `CommandPaletteModal.tsx` (`⌘K`) ให้จัดลำดับ Saved Queries ของฐานข้อมูลปัจจุบันขึ้นก่อน
4. **ระยะที่ 4 — Production Guardrail, i18n, Tests & Docs (`en.json`, `th.json`, `SavedQueriesTab.test.tsx`, `docs/db-manager-plan.md`):**
   - 1-Click Run ผ่าน `SqlEditor.handleRunQuery` เคารพ Production Safe Mode (`dangerousQueryDetector`) อัตโนมัติ
   - เพิ่มคำแปลไทย/อังกฤษครบ 100% parity และเพิ่ม Vitest unit/component tests (`snippetStore.test.ts`, `SavedQueriesTab.test.tsx`)

---

## Issue 12: [UX/Perf] Improve Active Tab Visibility & Navigation and Prevent Auto-Reload on `TableListTab` Switch

- **Labels:** `enhancement`, `ui/ux`, `performance`, `frontend`
- **Priority:** High
- **GitHub Issue:** [#238](https://github.com/chanchai9666/DataCore/issues/238) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
1. เมื่อเปิดแท็บไว้หลายแท็บในแถบด้านบน หาแท็บที่กำลังใช้งานอยู่ได้ยากมาก
2. ทุกครั้งที่สลับกลับมาที่แท็บรายละเอียดตาราง (`TableListTab`) หน้าจอจะโหลดข้อมูลใหม่ซ้ำทุกครั้ง ทำให้เสียเวลา ต้องการให้ไม่ต้อง auto โหลดซ้ำ โดยให้ใช้ปุ่มรีเฟรชหรือคลิกขวาเพื่อรีเฟรชแทน

### วิธีการแก้ไข (Implemented Solution)
1. **การแสดงผลและการนำทางแท็บที่กำลังใช้งาน (`src/components/layout/DockLayout.tsx`):**
   - เพิ่มการเลื่อนแถบแท็บอัตโนมัติ (`scrollIntoView`) เมื่อเปลี่ยน `activeTabId` เพื่อให้แท็บที่กำลังใช้งานอยู่ในมุมมองเสมอ
   - เพิ่มความคมชัดของสีและกรอบไฮไลต์สำหรับแท็บที่ใช้งานอยู่ (`data-active="true"`) ในทุกธีม (`warm-paper`, `dark`, `light`) พร้อมแสดงปุ่มปิด (`×`) บนแท็บที่ใช้งานอยู่ตลอดเวลา
   - เพิ่มปุ่ม **Open Tabs Switcher** (`data-testid="open-tabs-switcher-btn"`) ปักหมุดด้านขวาของแถบแท็บ แสดงจำนวนแท็บที่เปิดอยู่ พร้อมเมนูค้นหา/กรองชื่อแท็บ แถบระบุแท็บที่กำลังใช้งาน ปุ่มปิดรายแท็บ และปุ่ม **Close Other Tabs**
2. **แคชข้อมูลรายการตารางและปิดการ Auto-Reload (`src/stores/tableListCacheStore.ts`, `src/components/tablelist/TableListTab.tsx`):**
   - สร้าง Zustand store `useTableListCacheStore` เก็บผลลัพธ์ `TableMetadata[]` ตามคีย์ `${connectionId}:${schemaName || '__default__'}`
   - ปรับ `TableListTab.tsx` ให้โหลดข้อมูลจาก API อัตโนมัติเฉพาะครั้งแรกที่ยังไม่มีข้อมูลในแคช เมื่อสลับแท็บไปมาจะใช้ข้อมูลจากแคชทันทีโดยไม่โหลดซ้ำ
   - เพิ่มคำสั่ง **Refresh Tables** (`data-testid="ctx-refresh-tables"`) ในเมนูคลิกขวาทั้งบนแถวตาราง (เดี่ยว/หลายตาราง) และบนพื้นที่ว่างของตาราง ควบคู่กับปุ่ม Refresh บน Toolbar
3. **การแปลและชุดทดสอบ (`src/locales/en.json`, `src/locales/th.json`, `TableListTab.test.tsx`, `DockLayout.test.tsx`):**
   - เพิ่มคีย์คำแปลภาษาไทยและอังกฤษครบถ้วน และเพิ่ม Unit Tests ตรวจสอบการทำงานของแคช การรีเฟรชผ่านเมนูคลิกขวา และ Open Tabs Switcher

---

## Issue 13: [Feature/UX] Add Card / Grid, Grouped by Prefix, and Storage & Health Views to Table Detail (`TableListTab`)

- **Labels:** `enhancement`, `ui/ux`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#239](https://github.com/chanchai9666/DataCore/issues/239) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ / ความต้องการ (Requested Feature)
- ต้องการเพิ่มมุมมองการแสดงผลในหน้า Table Detail (`TableListTab`) ให้เลือกดูได้หลายแบบ ได้แก่:
  1. **Card / Grid View** สำหรับสแกนภาพรวมแบบการ์ด
  2. **Grouped by Prefix View** สำหรับจัดกลุ่มตารางตามคำนำหน้า (`_`) และพับ/ขยายได้
  3. **Storage & Health View** สำหรับดู KPI สรุปพื้นที่จัดเก็บ สัดส่วน Data/Index และสถานะสุขภาพตาราง

### วิธีการแก้ไข (Implemented Solution)
1. **View Mode Switcher & Persistence (`src/components/tablelist/TableListTab.tsx`):**
   - เพิ่มปุ่มสลับมุมมองแบบ Segmented Control (`table` | `grid` | `grouped` | `storage`) บน Toolbar ด้านบน พร้อมบันทึกค่าที่เลือกลง `localStorage` (`datacore-table-list-view-mode`)
   - รองรับการค้นหา เลือกหลายตาราง ดับเบิลคลิกเปิดตาราง คลิกขวา Context Menu คีย์ลัด และธีม Light/Dark ร่วมกันทุกมุมมอง
2. **มุมมองใหม่ทั้ง 3 แบบ (`TableListTab.tsx`):**
   - **Card / Grid View:** แสดงการ์ดตารางแบบ Responsive Grid พร้อมชื่อ Engine, Approx Rows, Total Size, สัดส่วน Data/Index และปุ่มลัดจัดการตาราง
   - **Grouped by Prefix View:** เพิ่มฟังก์ชัน `getTablePrefix` และ `groupTablesByPrefix` จัดกลุ่มตารางที่มีคำนำหน้า `_` ร่วมกันตั้งแต่ 2 ตารางขึ้นไป (และรวมตารางเดี่ยวไว้ในกลุ่ม `Other / Ungrouped`) พร้อมหัวกลุ่มพับ/ขยายที่สรุปจำนวนตาราง แถว และขนาดรวม
   - **Storage & Health View:** เพิ่มแถบ KPI สรุป (Total Tables, Total Storage, Largest Table, Health Alerts), แถบสัดส่วน Data vs Index ต่อตาราง และสถานะสุขภาพ (`Needs ANALYZE`, `Index > Data`, `Healthy`) จาก `getTableHealthStatus`
3. **i18n & Tests (`src/locales/en.json`, `src/locales/th.json`, `src/components/tablelist/TableListTab.test.tsx`):**
   - เพิ่มคีย์คำแปลภาษาอังกฤษและภาษาไทยครบถ้วน และเพิ่ม Unit Tests ทดสอบทุกมุมมองและการคำนวณ

---

## Issue 14: [UX] Add Prefix-Grouping Toggle to List View & Masonry Color-Coded Board for Grouped View in `TableListTab`

- **Labels:** `enhancement`, `ui/ux`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#240](https://github.com/chanchai9666/DataCore/issues/240) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
1. ในมุมมอง **แบบรายการ (List View)** เพิ่มตัวเลือกให้ผู้ใช้เปิด/ปิดการจัดกลุ่มตาม Prefix เองได้ โดยเมื่อเปิดให้แสดงแบบหัวกลุ่มพับ/ขยายได้เหมือนแบบจัดกลุ่มเดิม
2. ในมุมมอง **แบบจัดกลุ่ม (Grouped View)** ให้ปรับการแสดงผลเป็น **Multi-column Masonry Board แยกสีตามหมวดหมู่** (สไตล์ Master Grocery List) เพื่อให้กวาดสายตาดูตารางจำนวนมากในหน้าจอเดียวได้ง่าย

### วิธีการแก้ไข (Implemented Solution)
1. **List View Group Toggle (`src/components/tablelist/TableListTab.tsx`):**
   - เพิ่มปุ่ม `Group` (`data-testid="toggle-group-in-list"`) บน Toolbar เฉพาะเมื่ออยู่ในมุมมอง List พร้อมจำค่าใน `localStorage` (`datacore-table-list-group-in-list`)
   - เมื่อเปิดใช้งานจะแสดงผลเป็น Accordion List แบ่งกลุ่มตาม Prefix พับ/ขยายได้พร้อมสรุปจำนวนตาราง แถว และขนาดรวม
2. **Grouped Masonry Board (`src/components/tablelist/TableListTab.tsx`):**
   - ปรับ `viewMode === 'grouped'` เป็น CSS Multi-column Masonry (`columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5`) แต่ละกลุ่มใช้บล็อก `break-inside-avoid` พร้อมชุดสีพาสเทลแยกหมวดหมู่ (`GROUP_BOARD_PALETTES`) รองรับทั้ง Light และ Dark theme
   - ใช้ชื่อมุมมองเป็น **หมวด (`th`) / Categories (`en`)** และใช้ไอคอนตาราง (`TableIcon`) หน้ารายการตารางเหมือน Tree Table รองรับการเลือกหลายตาราง ดับเบิลคลิกเปิด และคลิกขวา Context Menu ครบถ้วน
3. **i18n & Tests (`src/locales/en.json`, `src/locales/th.json`, `src/components/tablelist/TableListTab.test.tsx`):**
   - เพิ่มคำแปลภาษาไทย/อังกฤษ และเพิ่ม/อัปเดต Unit Tests ครอบคลุมทั้ง Masonry Board และ List View Group Toggle

---

## Issue 15: [UI/UX] Migrate `EditorToolbar.tsx` from Hardcoded Light Colors to Semantic Theme Tokens for Dark Mode

- **Labels:** `ui/ux`, `theme`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#241](https://github.com/chanchai9666/DataCore/issues/241) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
- แถบเครื่องมือของ SQL Editor (`EditorToolbar.tsx`) ใช้พื้นหลังและปุ่มสีขาวแบบ hardcode ทำให้ในโหมด Dark Mode ดูสว่างขัดกับพื้นหลังเข้มโดยรอบ

### วิธีการแก้ไข (Implemented Solution)
- แก้ไข `src/components/editor/EditorToolbar.tsx` ให้ใช้ CSS design tokens จาก `src/styles/tokens.css` แทนสี hardcode ทั้งหมด (เช่น `--bg-panel`, `--bg-input`, `--bg-sidebar`, `--border-color`, `--text-primary`, `--text-secondary`, `--text-disabled`, `--accent`, `--success`, `--danger`, `--warn`, `--badge-bg`, `--badge-text`) เพื่อให้แถบเครื่องมือ ปุ่ม `<select>` เส้นคั่น และป้ายสถานะกลมกลืนทั้งในโหมด Dark, Light และ Warm Paper

---

## Issue 16: [UX/Validation] Prevent Duplicate Saved Query Names Within the Same Scope (`SaveQueryModal` & `snippetStore`)

- **Labels:** `enhancement`, `ui/ux`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#242](https://github.com/chanchai9666/DataCore/issues/242) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
- ป้องกันการตั้งชื่อ Query ที่บันทึกไว้ซ้ำกันภายในขอบเขตเดียวกัน เพื่อไม่ให้สับสนหรือเผลอสร้างรายการซ้ำ

### วิธีการแก้ไข (Implemented Solution)
1. **Duplicate Detection Helper (`src/stores/snippetStore.ts`):**
   - เพิ่มฟังก์ชัน `findDuplicateSnippetTitle` ตรวจสอบชื่อซ้ำแบบไม่สนตัวพิมพ์เล็ก-ใหญ่และช่องว่างหน้าหลัง (`trim().toLowerCase()`) ภายในขอบเขตเดียวกัน (`database`, `connection`, `global`) และรองรับ `excludeId` สำหรับการอัปเดตรายการเดิม
2. **Inline Validation & Guard (`src/components/editor/SaveQueryModal.tsx`, `en.json`, `th.json`):**
   - แสดงข้อความเตือนใต้ช่องชื่อ Query ทันทีเมื่อชื่อซ้ำ (`save-query-duplicate-error`) พร้อมปิดปุ่ม **Save / Update** และ **Save as New** รวมถึงบล็อกการบันทึกซ้ำใน handler
   - เพิ่มคำแปลภาษาอังกฤษ/ไทย และเพิ่ม unit/component tests ใน `snippetStore.test.ts` และ `SavedQueriesTab.test.tsx`

---

## Issue 17: [UI/UX] Add Tab Right-Click Context Menu, Tab Pinning, and High-Visibility Open Tabs Switcher Button

- **Labels:** `enhancement`, `ui/ux`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#243](https://github.com/chanchai9666/DataCore/issues/243) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
1. ต้องการเมนูคลิกขวาบนหัวแท็บสำหรับปิดแท็บหลายรูปแบบ (ปิดแท็บนี้, ปิดแท็บอื่น, ปิดทางขวา, ปิดทางซ้าย, ปิดทั้งหมด, ปิดตาม Connection, ปิดแท็บที่ยังไม่ได้โหลด, ปักหมุด, คัดลอกชื่อ)
2. ปุ่มลิสต์แท็บด้านขวา (`14 ▾`) มองเห็นได้ยากเพราะพื้นหลังกลืนไปกับแถบแท็บและชนกับแท็บที่เลื่อนล้น

### วิธีการแก้ไข (Implemented Solution)
1. **Batch Tab Close & Pinning (`src/types/db.ts`, `src/stores/tabStore.ts`):**
   - เพิ่มฟิลด์ `pinned?: boolean` ใน `Tab` และเพิ่มเมธอด `closeTabs(tabIds)` และ `togglePinTab(tabId)` ใน `useTabStore` โดยการปิดแท็บแบบกลุ่มจะข้ามแท็บที่ปักหมุดไว้เสมอ
2. **Tab Context Menu & Switcher Button (`src/components/layout/DockLayout.tsx`, `en.json`, `th.json`):**
   - เพิ่มเมนูคลิกขวาบน `[role="tab"]` ใช้ `useContextMenuPosition` (พร้อมรองรับ middle-click ปิดแท็บ) ครบทั้ง Close, Close Others, Close to the Right, Close to the Left, Close All, Close Tabs for This Connection, Close Unloaded Tabs, Pin/Unpin Tab และ Copy Name
   - ปรับโซนปุ่มด้านขวาให้มีเส้นคั่นชัดเจนและเปลี่ยนปุ่ม Open Tabs Switcher เป็นปุ่ม Pill ที่มีไอคอน `Layers` + Badge ตัวเลข + `ChevronDown` รองรับทั้ง `dark`, `light` และ `warm-paper`
   - เพิ่มคำแปลภาษาไทย/อังกฤษและ Unit Tests ใน `DockLayout.test.tsx`

---

## Issue 18: [Perf/UX] Cache `ObjectBrowser` Schema Tree, Column Metadata, and Expanded State Across Sidebar Collapse/Expand

- **Labels:** `performance`, `ui/ux`, `frontend`
- **Priority:** Medium
- **GitHub Issue:** [#244](https://github.com/chanchai9666/DataCore/issues/244) (✅ Closed)
- **Status:** Fixed (Verified with `pnpm test` & `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
- เมื่อกดพับแถบข้าง Explorer แล้วเปิดกลับมาใหม่ Tree Table ต้องรอโหลดสักพักกว่าจะกางออกมา

### วิธีการแก้ไข (Implemented Solution)
- ย้าย `schemas` (`schemaTrees`), `tableColumnsMap` และ `treeOpenState` จาก local state ใน `ObjectBrowser.tsx` ไปเก็บใน `useSchemaStore` (`src/stores/schemaStore.ts`)
- เมื่อพับและเปิด Explorer กลับมาใหม่ `ObjectBrowser` จะใช้ข้อมูล Schema Tree, รายชื่อคอลัมน์ และสถานะการกาง/พับของ node เดิมจากแคชทันทีโดยไม่เรียก `dbApi.getSchemaTree` ซ้ำ (ล้างแคชเฉพาะเมื่อกด Disconnect หรือ Refresh)
- เพิ่มเทสใน `DockLayout.test.tsx` และอัปเดต `ObjectBrowser.test.tsx` ให้รีเซ็ต `useSchemaStore` ใน `beforeEach`

---

## Issue 19: [Test/Bug] Add Real-Browser Playwright E2E & Backend Real-DB E2E Suites and Fix `SaveQueryModal` Hook Order

- **Labels:** `testing`, `bug`, `frontend`, `backend`
- **Priority:** High
- **Status:** Fixed (Verified with 15 Playwright E2E tests, `make test-backend`, `pnpm test`, `pnpm build`)

### สิ่งที่สั่งแก้ (Requested Fix)
- ต้องการชุดทดสอบ End-to-End แบบ Real-Browser (Playwright) และ Real-DB ฝั่ง Rust Backend รวมถึงแก้ไขบั๊กที่ตรวจพบระหว่างการทดสอบจริง

### วิธีการแก้ไข (Implemented Solution)
1. **Real-Browser Playwright E2E (`playwright.config.ts`, `tests/playwright/tauri-mock.ts`, `tests/playwright/app.spec.ts`, `vite.config.ts`, `package.json`):**
   - เพิ่มชุดทดสอบ 15 เคส ครอบคลุม UI Shell, Themes (`dark`/`light`/`warm-paper`), i18n (`EN`/`TH`), SQLite Connection, Schema Tree, SQL Editor & DataGrid, Saved Queries + Duplicate Validation, `TableListTab` 4 มุมมอง, Table Structure Editor, Visual Query Builder, ER Diagram, Responsive Layout, Screen Sharing Protection, PII Masking, Production Safe Mode (`CONFIRM` guardrail), Stored XSS/SQLi, Vault Unlock (`DCV2`) และ IPC Error Recovery
2. **Backend Real-DB E2E (`src-tauri/tests/real_db_e2e.rs`):**
   - เพิ่ม integration tests 5 เคส ทดสอบ SQLite CRUD/Unicode/`NULL`/Constraints/Schema, Transaction Commit/Rollback, Read-Only Bypass Guards, SQLi Filter & Path Traversal Guards และ SQL Splitter
3. **React Hooks Order Bug (`src/components/editor/SaveQueryModal.tsx`):**
   - ย้าย `if (!isOpen) return null;` ลงไปหลัง `useMemo` hooks ทั้งสองตัว เพื่อแก้ปัญหา rendered fewer hooks than expected

---

## Issue 20: [Perf/Backend] Optimize PostgreSQL `pg_catalog` Queries, Session Reuse, and `AuditLogger` Scaling

- **Labels:** `performance`, `backend`, `postgres`, `audit`
- **Priority:** High
- **Status:** Fixed (Verified with `make test-backend`)

### สิ่งที่สั่งแก้ (Requested Fix)
- การเชื่อมต่อและรัน query PostgreSQL ช้าผิดปกติ (เช่น `POS V1` หมุนค้าง) รวมถึงไฟล์ `~/.datacore/audit.jsonl` โตขึ้นเรื่อยๆ จนส่งผลต่อประสิทธิภาพในระยะยาว

### วิธีการแก้ไข (Implemented Solution)
1. **PostgreSQL `pg_catalog` Optimization (`src-tauri/src/drivers/postgres.rs`):**
   - เปลี่ยน `fetch_schema_tree` จาก 5 queries บน `information_schema` มาใช้ `pg_catalog` และรวม `pg_namespace` + `pg_class`/`pg_proc`/`pg_trigger` เป็น single `UNION ALL` query (1 round-trip)
   - เปลี่ยน metadata query ใน `fetch_table_data` มาใช้ `pg_catalog.pg_attribute`, `pg_index`, `pg_attrdef` และ `pg_catalog.format_type`
2. **Session Reuse for Schema & DDL (`src-tauri/src/session/mod.rs`, `src-tauri/src/commands/db.rs`):**
   - เพิ่ม `SessionManager::get_connection_session` และปรับ `get_schema_tree_impl` / `get_object_ddl_impl` ให้นำ session ที่เปิดอยู่แล้วมาใช้ซ้ำก่อนสร้าง connection ใหม่
3. **`AuditLogger` Performance & Scaling (`src-tauri/src/services/audit_logger.rs`):**
   - เพิ่ม `active_entries_cache` ใน `log_inner` (พร้อม reset เมื่อ `!log_path.exists()` และซิงค์ใน `verify_integrity_locked`) แทนการสแกนไฟล์นับบรรทัดทุกครั้ง
   - ปรับ `read_last_hash_from_file` ให้อ่านเฉพาะท้ายไฟล์ 64 KB (O(1)) และปรับ `count_existing_non_empty_lines` ให้นับผ่าน byte buffer 64 KB แบบไม่จัดสรร `String`
   - ปรับ `get_logs` ให้อ่านย้อนหลังจาก `audit.jsonl` และไฟล์ archive ล่าสุด โดยหยุดทันทีเมื่อครบ `offset + limit`
   - ลด `DEFAULT_MAX_FILE_SIZE_BYTES` จาก 10 MB เหลือ 2 MB และแยก `default_dir()` ใน `#[cfg(test)]` ไปยัง temp directory เพื่อไม่ให้ test เขียนปนกับ `~/.datacore/`

---

## Issue 21: [Security/Hygiene] Remove Unused `password` Field from `MssqlConnection`

- **Labels:** `security`, `cleanup`, `backend`, `mssql`
- **Priority:** Medium
- **Status:** Fixed

### สิ่งที่สั่งแก้ (Requested Fix)
- พบ compiler warning `field password is never read` ใน `MssqlConnection` และไม่ควรถือ plaintext password ค้างไว้ใน RAM โดยไม่ได้ใช้งาน

### วิธีการแก้ไข (Implemented Solution)
- ลบฟิลด์ `password: Option<Zeroizing<String>>` และ import `zeroize::Zeroizing` ที่ไม่ได้ใช้งานออกจาก `src-tauri/src/drivers/mssql.rs` (ใช้ `password` เฉพาะตอน `Client::connect(...)` แล้วปล่อยทิ้งทันที) ทำให้ compile สะอาดไม่มี warning และลดช่วงเวลาที่ credential อยู่ในหน่วยความจำ

---

## Issue 22: [UI/UX] Replace Disconnected Text Label with Gray Status Dot in `MainToolbar`

- **Labels:** `ui/ux`, `frontend`
- **Priority:** Low
- **Status:** Fixed

### สิ่งที่สั่งแก้ (Requested Fix)
- เปลี่ยนข้อความ `(ไม่ได้เชื่อมต่อ)` / `(Disconnected)` ในแถบสถานะการเชื่อมต่อบน Toolbar ด้านบน ให้แสดงเป็นจุดสีเทาแทน

### วิธีการแก้ไข (Implemented Solution)
- ลบข้อความ `({t('status.disconnected', 'Disconnected')})` ออกจาก `src/components/chrome/MainToolbar.tsx` และปรับ `toolbar-connection-status-dot` ตอนไม่ได้เชื่อมต่อให้เป็น `bg-zinc-400 dark:bg-zinc-500` พร้อม `aria-label` บอกสถานะ รวมถึงอัปเดต assertion ใน `src/components/chrome/MainToolbar.test.tsx`

---

## คำสั่ง `gh issue create` สำหรับนำไปรันภายหลัง

```bash
gh issue create --title "[Security] Escape schema name in MssqlConnection::get_object_ddl & review raw filter fallback" --label "security,bug,backend" --body-file docs/pending-issues.md
```
*(แนะนำให้คัดลอกรายละเอียดทีละหัวข้อด้านบนไปสร้างเป็นแต่ละ Issue แยกกัน)*

- **GitHub Issue:** [#245](https://github.com/chanchai9666/DataCore/issues/245) (✅ Closed)
- **GitHub Issue:** [#246](https://github.com/chanchai9666/DataCore/issues/246) (✅ Closed)
- **GitHub Issue:** [#247](https://github.com/chanchai9666/DataCore/issues/247) (✅ Closed)
- **GitHub Issue:** [#248](https://github.com/chanchai9666/DataCore/issues/248) (✅ Closed)