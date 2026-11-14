# DataCore ⚡️

> โปรแกรมจัดการฐานข้อมูลแบบ Desktop สไตล์ **Navicat / TablePlus** ที่ออกแบบมาสำหรับ **macOS Apple Silicon (M1/M2/M3/M4)** โดยเฉพาะ มีขนาดเล็ก (~10 MB), เปิดเร็ว, กินแรมน้อย และรองรับ SQLite, PostgreSQL และ MySQL

[![Tauri 2](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.85+-orange?logo=rust)](https://www.rust-lang.org/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-Passing%20(907%2F907)-brightgreen)](https://github.com/)

---

## 📸 ภาพตัวอย่างหน้าจอ (UI Mockups)

| หน้าต่างหลัก (Object Browser + Editor + Data Grid) | หน้าต่างสร้าง Connection (Local Encrypted Vault & TLS Security) |
|---|---|
| ![Main Window](docs/01-main-window.png) | ![Connection Dialog](docs/02-connection-dialog.png) |

---

## 🌟 จุดเด่นและฟีเจอร์หลัก (Features)

### 1. ความเร็วและสถาปัตยกรรมระดับ Native (High Performance Architecture)
* **พัฒนาด้วย Tauri 2 + Rust + React 18:** แอปพลิเคชัน Desktop ขนาดกะทัดรัด คอมไพล์แบบ Native ARM64 เปิดโปรแกรมได้ทันใจและประหยัด RAM
* **รองรับ 3 ฐานข้อมูลหลัก:** เชื่อมต่อและบริหารจัดการ **SQLite** (ทั้งไฟล์ดิสก์และ `:memory:`), **PostgreSQL** และ **MySQL** ได้อย่างสมบูรณ์แบบ
* **ระบบจัดเก็บรหัสผ่านความปลอดภัยสูง (Local Encrypted Vault & Session Security):**
  - **เมื่อเลือก Remember password:** เข้ารหัสรหัสผ่านอย่างปลอดภัยด้วย **AES-256-GCM** จัดเก็บลงดิสก์ที่ `~/.datacore/vault.enc` (file permission 0600) พร้อมกุญแจ 256-bit ที่ `~/.datacore/.vault.key` **คงอยู่ปลอดภัยข้ามการปิด-เปิดโปรแกรมและการ restart เครื่อง** โดยไม่ต้องกรอกรหัสผ่านซ้ำ ไม่มีการบันทึก Plaintext ลงไฟล์คอนฟิก และไม่เรียกใช้ OS Keychain เพื่อหลีกเลี่ยง Authorization Popups รบกวน
  - **เมื่อไม่เลือก Remember password:** จัดเก็บรหัสผ่านเฉพาะใน RAM ชั่วคราว (In-Memory Session) และจะถูกล้างทิ้งทันทีเมื่อปิดโปรแกรมหรือ restart เครื่อง เพื่อความเป็นส่วนตัวสูงสุด

### 2. ความถูกต้องของข้อมูลและธุรกรรมระดับองค์กร (Enterprise Transactions & ACID)
* **Dedicated Transaction Sessions ต่อแท็บ:** แต่ละแท็บ Query Editor ทำงานบน Connection Session อิสระ รองรับคำสั่ง Transaction (`BEGIN`, `COMMIT`, `ROLLBACK`), Temporary Tables และ Session Variables ได้อย่างอิสระ ไม่ปนเปื้อนข้ามแท็บ
* **Transaction Isolation Level Selector:** ปรับเลือกระดับ Isolation ได้แบบ Real-time บน Editor Toolbar (`Read Committed`, `Repeatable Read`, `Serializable`, `Read Uncommitted`)
* **Savepoint Manager:** คำสั่งสร้าง Savepoint, Rollback to Savepoint, และ Release Savepoint ผ่าน UI พร้อมคำสั่ง SQL Preview
* **Lock Inspector & Deadlock Terminator:** หน้าต่างวิเคราะห์ Active Sessions และ Table/Row Locks แบบ Real-time ตรวจจับ Deadlock พร้อมปุ่ม Terminate / Kill Blocking Query ได้ทันทีจากแถบเครื่องมือ Tools

### 3. ประสิทธิภาพและการวิเคราะห์ (Performance & Optimization Suite)
* **Visual Query Explain & Execution Plan:** รองรับคำสั่ง `EXPLAIN` และ `EXPLAIN ANALYZE` (PostgreSQL, MySQL, SQLite) แสดงผลทั้งแบบ Plan Node Tree, Summary Metrics (Planning Time, Execution Time, Total Cost, Estimated Rows) และ Raw JSON/Text
* **Extended Index Support:** รองรับการสร้าง Index หลากหลายประเภทใน Table Structure Editor: **B-Tree, Hash, GIN, GiST, Full-text, Composite** และ **Unique**
* **Database Metrics & Buffer Cache Dashboard:** มอนิเตอร์ Buffer Cache Hit Ratio, Database Storage Stats, Deadlock Counts แบบ Real-time
* **Table Partitioning Viewer:** ตรวจสอบข้อมูลแถบ Partitions ของตารางขนาดใหญ่ (Partition Key, Expression, Row Counts, Storage Size)
* **Views & Materialized Views Management:** ตรวจสอบ View DDL และปุ่มสั่ง Refresh Materialized View สำหรับ PostgreSQL

### 4. ความปลอดภัยและการปฏิบัติตามมาตรฐาน (Security & Compliance Suite)
* **Row-Level Security (RLS) Management:** เมนูควบคุมสิทธิ์แถวข้อมูลในแท็บ Security ของ Table Designer:
  - สวิตช์เปิด/ปิด RLS (`ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY`)
  - ระบบบริหารจัดการ Policy: ดูรายการ, สร้าง Policy ใหม่ (`CREATE POLICY`) กำหนด Command (`ALL`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`), Roles, Permissive/Restrictive, `USING` Expression, และ `WITH CHECK` Expression พร้อมปุ่ม Drop Policy
* **In-Transit Encryption (TLS/SSL):**
  - รองรับโหมด SSL เต็มรูปแบบบน PostgreSQL และ MySQL (`disable`, `prefer`, `require`, `verify-ca`, `verify-full`)
  - **Live Connection Security Inspector:** ตรวจสอบ Cipher Suite, TLS Protocol Version, และ Key Exchange Bit Strength ของการเชื่อมต่อปัจจุบันได้แบบ Real-time
* **At-Rest Storage Encryption:** ตรวจสอบสถานะการเข้ารหัส Local Vault (AES-256-GCM) และ Transparent Data Encryption (TDE) ของเซิร์ฟเวอร์
* **Security Audit Trail & Searchable Drawer:** บันทึกประวัติกิจกรรมสำคัญทั้งหมด (Who, What, When, Query, Status, Duration) พร้อมช่องค้นหา กรองตามกิจกรรม/ช่วงเวลา และส่งออก Audit Log เป็น CSV/JSON

### 5. การจัดการตารางและการถ่ายโอนข้อมูล (Table Management & Transfers)
* **Table List View & Detailed Metadata Grid:** ดับเบิลคลิกที่โหนด Tables ใน Object Browser เพื่อดูรายการตารางทั้งหมด พร้อมข้อมูลเชิงลึก (Rows, Data Size, Index Size, Total Size, Engine, Collation, Encoding, Comment) พร้อมระบบค้นหาและจัดเรียงได้ทุกคอลัมน์
* **Foreign Keys & Constraints Manager:** แถบจัดการ Foreign Keys (กำหนด Referenced Table/Column, On Delete/Update rules) และ Constraints (`CHECK`, `UNIQUE`) ใน Table Designer พร้อม Live SQL Preview และ Confirmation Dialog
* **Table Maintenance & Diagnostics Suite:** สั่งการบำรุงรักษาตารางผ่าน UI (OPTIMIZE, VACUUM, ANALYZE, REINDEX, CHECK TABLE)
* **Duplicate Table (Native SQL Clone):** โคลนตารางพร้อมโครงสร้างและข้อมูลทันใจใน Database เดียวกัน (Structure Only หรือ Structure + Data)
* **Cross-Database Table Transfer (แบบ Navicat):** ย้ายหรือคัดลอกตารางข้าม Connection หรือ Engine (SQLite ⟷ PostgreSQL ⟷ MySQL) พร้อม Automatic Data Type Mapping อัจฉริยะ และสตรีมมิ่ง Batch Inserts ทีละ 500 แถว ควบคุม RAM < 32MB
* **Streaming SQL/CSV/JSON Import & Export:** นำเข้าและส่งออกข้อมูลตารางหรือผลลัพธ์ Query เป็น `.sql`, `.csv`, `.json` พร้อมตัวแยกคำสั่งอัจฉริยะ รองรับ multi-statement และคำสั่ง `DELIMITER`

### 6. ความสะดวกและประสบการณ์ผู้ใช้ (Productivity & UI/UX)
* **ตารางข้อมูลความเร็วสูง (Glide Data Grid):** เรนเดอร์บน HTML5 Canvas ลื่นไหลแม้ข้อมูลมีปริมาณมหาศาล, แบ่งหน้าทีละ 100 แถว, แสดงผลค่า `NULL` ชัดเจน, รองรับ Inline Edit / Insert Row, Filter Bar Builder และ **Cell Detail Drawer**
* **Global Tools Dropdown Menu:** รวมศูนย์เครื่องมือวิเคราะห์ระดับโปรแกรมบน MainToolbar เข้าถึง Metrics, Locks, Audit Log, Query History & Snippets, และ Connection Security ได้ทันที
* **Query History & Saved Snippets:** บันทึกประวัติการรันคำสั่ง SQL ย้อนหลัง 200 รายการ พร้อมระบบบันทึกและจัดการ Snippet คำสั่งที่ใช้บ่อย
* **Command Palette (⌘K / ⌘P):** ศูนย์กลางสั่งการด้วยคีย์บอร์ดระดับโปรแกรม ค้นหาคำสั่ง, สลับ Connection, เปิด Table/View ได้อย่างรวดเร็ว
* **Connection Folder Grouping:** จัดกลุ่มการเชื่อมต่อเป็นโฟลเดอร์ พร้อมเลือกสีโฟลเดอร์ตามต้องการ
* **Application Visual Identity:** ไอคอนแอปพลิเคชันสไตล์ Luxury Minimalist Squircle ตัดขอบโปร่งใสตามมาตรฐาน **macOS Human Interface Guidelines (HIG)**

### 7. การเขียนคิวรีและการแนะนำโค้ดอัจฉริยะ (Querying, Autocomplete & No-Code Builder)
* **Visual Query Builder (No-Code SELECT Query Builder):** สร้างคำสั่ง SELECT Query ได้ง่ายดายผ่านหน้าต่าง No-Code UI โดยไม่ต้องพิมพ์ SQL:
  - เลือกตารางหลัก (Base Table) และตั้ง Alias
  - เลือกคอลัมน์ พร้อม Alias และฟังก์ชันสรุปผลรวม (COUNT, SUM, AVG, MIN, MAX)
  - กำหนด Table JOINs (INNER, LEFT, RIGHT, FULL) พร้อมเงื่อนไข ON
  - กำหนดตัวกรองเงื่อนไข WHERE (equals, contains, between, is null ฯลฯ) สลับระหว่าง AND / OR
  - กำหนดการจัดเรียง (ORDER BY) และขอบเขตแถว (LIMIT / OFFSET)
  - แสดงผล Live SQL Preview ตาม Dialect จริง พร้อมปุ่ม Copy, Open in SQL Editor หรือกด Run Query เพื่อแสดงผลลัพธ์ผ่าน Data Grid ได้ทันที
* **Schema-Aware Autocomplete สำหรับ SQL Editor:** แนะนำคำสั่งอัตโนมัติใน CodeMirror 6 โดยดึง Metadata จากโครงสร้างฐานข้อมูลจริง (`Record<string, string[]>`) แนะนำชื่อตาราง, Views, และชื่อคอลัมน์พร้อม Data Types เมื่อพิมพ์หลังคำสั่ง `FROM`, `JOIN`, `SELECT` หรือ `<table>.` พร้อมระบบ Invalidate Cache อัตโนมัติเมื่อมีการรันคำสั่ง DDL (`CREATE`, `ALTER`, `DROP`)
* **SQL Formatter (⌘⇧F) & Multi-Result Tabs:**
  - จัดรูปแบบโค้ด SQL ให้เป็นระเบียบสวยงามผ่านไลบรารี `sql-formatter` รองรับ dialect ของ PostgreSQL, MySQL และ SQLite ด้วยปุ่มบน Toolbar หรือคีย์ลัด `⌘⇧F` (Mac) / `Ctrl+Shift+F`
  - รองรับการรัน Batch Script ที่มีหลายคำสั่ง (เช่น `SELECT 1; SELECT 2;`) โดย SQLite driver แยก statement แบบ Quote-aware และแสดงผลลัพธ์แยกแต่ละชุดบน Multi-Result Tabs (`Result 1`, `Result 2`, `Messages`)
* **Horizontal Split Layout สำหรับหน้าจอกว้าง (Ultrawide Monitors):** สลับโหมดแบ่งหน้าจอใน Query Editor ได้ทั้ง Vertical Split (บน/ล่าง) และ Horizontal Split (Editor ซ้าย / Data Grid ขวา) พร้อมแถบ Resizer ปรับขนาดความกว้างได้ตามต้องการ และจดจำการตั้งค่าลงใน `localStorage`
* **Safe Mutation Impact Preview (Simulation Guard):** พรีวิวผลกระทบของคำสั่ง `DELETE` / `UPDATE` ก่อนรันจริง เพื่อดูจำนวนแถวที่จะได้รับผลกระทบ โดยระบบจำลองคำสั่งภายใต้ Transaction และทำการ Rollback 100% เสมอ ป้องกันการลบข้อมูลทั้งตารางโดยไม่ตั้งใจ

### 8. ความสะดวก การเข้าถึง และสถาปัตยกรรมระดับโมดูลาร์ (Accessibility, i18n & Modular Design)
* **ระบบ Internationalization (i18n):** รองรับภาษาไทย (th) และภาษาอังกฤษ (en) สลับภาษาได้ทันทีแบบ Reactive บน Toolbar และ StatusBar โดยไม่ต้องรีสตาร์ทแอป และบันทึกค่าภาษาไว้ใน `localStorage`
* **Deep Tree Object Browser:** ขยายโหนด Table ใน Sidebar ให้แสดงลูกศรคลี่ดู Columns พร้อม Data Types และไอคอน PK/FK (Lazy-loaded) และรองรับการ Drag & Drop หรือดับเบิลคลิกชื่อคอลัมน์เพื่อแทรกลงใน SQL Editor ทันที
* **Keyboard Splitter Navigation (Accessibility A11y):** แถบ Resizer ใน DockLayout รองรับมาตรฐาน `role="separator"`, `tabIndex={0}`, `aria-orientation` และสามารถปรับขนาดความกว้าง/ความสูงได้ด้วยปุ่มลูกศรบนคีย์บอร์ด
* **Modular UI Architecture:** สถาปัตยกรรมคอมโพเนนต์ระดับโมดูลาร์ แยกหน้าจอ `TableStructureEditor` ออกเป็น 5 Sub-tabs ย่อย (`ColumnsTab`, `IndexesTab`, `ForeignKeysTab`, `ConstraintsTab`, `RlsSecurityTab`) ให้ไฟล์มีขนาดกะทัดรัด บำรุงรักษาง่าย และทำความสะอาด Tauri IPC parameters เป็น camelCase มาตรฐานเดียว ปราศจากความซ้ำซ้อน

---

## 🛠 Tech Stack

### Backend (Rust)
- **Tauri 2**: Framework สำหรับ Native Desktop Application
- **Tokio**: Asynchronous Runtime ประสิทธิภาพสูง
- **sqlx**: Database Driver สำหรับ PostgreSQL และ MySQL (พร้อม `tls-rustls` และ Connection Pooling)
- **rusqlite**: Database Driver สำหรับ SQLite (เปิดใช้ feature `bundled` และ `column_decltype`)
- **aes-gcm / rand**: ระบบเข้ารหัสรหัสผ่าน Local Vault แบบ AES-256-GCM
- **serde / serde_json**: Serialization / Deserialization ข้อมูลระหว่าง Rust และ Frontend
- **csv**: Streaming CSV Reader / Writer

### Frontend (React & TypeScript)
- **React 18 + TypeScript + Vite**: UI Framework, Compiler และ Build Tool
- **@glideapps/glide-data-grid**: Data Grid ประสิทธิภาพสูงบน HTML5 Canvas
- **CodeMirror 6 (@codemirror/lang-sql)**: SQL Editor พร้อม Syntax Highlighting & Keymaps
- **react-arborist**: Tree Component ประสิทธิภาพสูงสำหรับ Object Browser
- **Zustand**: Client State Management (`tabStore`, `connectionStore`, `auditLogStore`, `snippetStore`, `folderStore`, `queryHistoryStore`)
- **Tailwind CSS**: Styling และ Dynamic Theme Management (Dark/Light Mode)
- **lucide-react**: Modern SVG Icons
- **Vitest**: Unit & Component Testing

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
DataCore/
├── src-tauri/                     # Rust Backend (Tauri 2)
│   ├── Cargo.toml                 # Rust dependencies
│   ├── tauri.conf.json            # การตั้งค่าหน้าต่าง macOS Overlay & App Icon
│   └── src/
│       ├── main.rs / lib.rs       # Entry point และ Tauri Builder
│       ├── models/                # Data Contract (QueryResult, CellValue, ConnectionConfig, Transfer)
│       ├── drivers/               # Database Drivers (SQLite, Postgres, MySQL)
│       ├── services/              # Encrypted Vault, Data Transfer, Cross-DB Transfer, SQL Transfer
│       ├── session/               # SessionManager (Dedicated Tab Sessions)
│       └── commands/              # Tauri IPC Command Handlers
├── src/                           # React Frontend (TypeScript)
│   ├── api/                       # Tauri IPC API Wrapper (`db.ts`, `securityHelpers.ts`, `performanceHelpers.ts`)
│   ├── stores/                    # Zustand Stores (`tabStore.ts`, `connectionStore.ts`, `auditLogStore.ts`)
│   ├── types/                     # TypeScript Type Definitions (`types/db.ts`, `dataTransfer.ts`)
│   └── components/
│       ├── chrome/                # MainToolbar (Tools Menu), StatusBar
│       ├── sidebar/               # Object Browser Tree View, DbBadge
│       ├── editor/                # SQL Query Editor, EditorToolbar, HistorySnippetsDrawer
│       ├── grid/                  # Glide Data Grid, Pagination, Cell Detail Drawer
│       ├── tablelist/             # Table List View & Detailed Metadata Grid
│       ├── structure/             # Create Table, Drop Table, Rename Table, Table Structure Editor (RLS)
│       ├── performance/           # DatabaseMetricsModal, TablePartitionsModal
│       ├── transactions/          # LockInspectorModal, SavepointModal
│       ├── security/              # AuditLogDrawer, ConnectionSecurityModal
│       ├── transfer/              # Cross-DB Copy, Duplicate Table, SQL/CSV/JSON Import/Export
│       ├── dialogs/               # Connection Manager Dialog & Driver Forms
│       └── layout/                # TitleBar (macOS Traffic Lights) & DockLayout
├── docs/                          # เอกสารข้อกำหนดและแผนการพัฒนา
│   ├── db-manager-plan.md         # แผนโปรเจกต์และ Tech Stack ฉบับสมบูรณ์
│   └── superpowers/plans/         # แผนการพัฒนาแบบละเอียด (Implementation Plan)
├── tests/                         # End-to-End Workflow Tests
├── Makefile                       # คำสั่งลัดสำหรับการพัฒนา
└── package.json                   # Frontend dependencies
```

---

## 🚀 การติดตั้งและเริ่มต้นใช้งาน (Getting Started)

### สิ่งที่ต้องเตรียม (Prerequisites)
1. **macOS** (แนะนำ Apple Silicon M1/M2/M3/M4)
2. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```
3. **Node.js** (v20+ หรือ v26) และ **pnpm**:
   ```bash
   corepack enable && corepack prepare pnpm@latest --activate
   ```
4. **Rust Toolchain**:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
   ```

---

### ติดตั้งและรันโปรแกรม

```bash
# 1. ติดตั้ง Dependencies
make install

# 2. รันแอปพลิเคชันในโหมด Desktop Development (Tauri 2)
make dev

# หรือรันเฉพาะ Frontend Vite Dev Server ใน Browser
make dev-web
```

---

## 📜 คำสั่ง Makefile ทั้งหมด (Make Commands)

| คำสั่ง | คำอธิบาย |
|---|---|
| `make install` | ติดตั้ง Dependencies ของ Frontend ทั้งหมดผ่าน `pnpm` |
| `make dev` | รันแอปพลิเคชัน Desktop ในโหมด Development (Tauri 2) |
| `make dev-web` | รันเฉพาะ Vite Web Dev Server สำหรับทดสอบ UI บน Browser |
| `make test` | รันชุดการทดสอบทั้งหมด (ทั้ง Rust Backend 87 tests และ Vitest 820 tests รวม **907 tests ผ่าน 100%**) |
| `make test-backend` | รันเฉพาะ Unit & Integration Tests ฝั่ง Rust Backend |
| `make test-frontend`| รันเฉพาะ Unit & Component Tests ฝั่ง React Frontend |
| `make check` | ตรวจสอบ Compilation (`cargo check`) และ TypeScript Type Checking (`tsc`) ทั้งระบบ |
| `make lint` | ตรวจสอบ Code Quality และคำเตือนด้วย Cargo Clippy |
| `make build` | Build เป็น Production Desktop Application สำหรับ macOS (.app / .dmg) |
| `make build-frontend`| Build เฉพาะ Production Bundle ฝั่ง Web Assets (Vite) |
| `make clean` | ลบไฟล์ Build Artifacts ทั้งหมด (`dist/` และ `src-tauri/target/`) |

---

## 🧪 การทดสอบ (Testing)

โปรเจกต์นี้ได้รับการพัฒนาด้วยแนวทาง **Test-Driven Development (TDD)** โดยมีชุดการทดสอบรวม **907 tests (ผ่าน 100%)**:

```bash
# รันเทสต์ทั้งหมด
make test
```

* **Rust Backend (87 tests):**
  - Data Contract Serialization & Roundtrip
  - Local Encrypted Vault (AES-256-GCM) Persistence, File Permissions (0600) & Argon2id Master Password KEK Derivation
  - Connection Store Atomic Persistence & Isolation
  - SQLite Dynamic Type Extraction, Pagination, Interrupt Cancellation & Multi-Statement Batch Script Execution
  - Dedicated Session Lifecycle & Explicit Rollback on Close
  - Schema Metadata Connection Isolation
  - Table List View Metadata Query & Size Calculation (SQLite)
  - Duplicate Table Native SQL Cloner & Options Validation
  - SQL Script Splitter & Multi-Statement Parsing with Quote/Comment Awareness & `DELIMITER`
  - SQL Export & Import Lifecycle (SQLite)
  - CSV & JSON Streaming Data Transfer, Delimiter Detection, Column Mapping & Cancellation
  - Cross-Database Table Transfer: Cross-Engine Data Type Mapping (`SQLite` ⟷ `PostgreSQL` ⟷ `MySQL`), DDL Generation & Streaming Batch Inserts
  - Path Traversal Guard: ป้องกัน Directory Traversal (`../`), System Paths และ Sensitive User Directory Exposure
  - Tamper-Evident Cryptographic Hash Chain Audit Logger (Append-only, SHA-256 Hashing, Rotation & Verification)
  - Mutation Impact Preview Simulation Engine (Guaranteed 100% Rollback)
* **React Frontend (820 tests):**
  - Zustand Stores (`tabStore`, `connectionStore`, `auditLogStore`, `snippetStore`, `folderStore`, `queryHistoryStore`, `schemaStore`, `pendingChangesStore`)
  - Object Browser Tree Component, Deep Tree Columns Drill-down (Lazy-loading, Types, PK/FK Badges, Drag & Drop), Node Navigation, Context Menu, Connection Color Folders
  - CodeMirror 6 SQL Editor, Dialects, Schema-Aware Autocomplete, Keymap (`⌘+Enter`, `⌘⇧F`), Toolbar Actions
  - Glide Data Grid Canvas Integration, NULL Indicators, Cell Detail Drawer, Inline Row Editing / Row Insertion
  - Visual Query Builder Tab: Base Table, Columns & Aliases, Aggregates, Multi-Table JOINs, Filter Conditions (AND/OR), Sorting, Limit, Live SQL Preview & SQL Editor Export
  - Internationalization (i18n): Thai & English translations, Instant Reactive Language Switcher, LocalStorage Persistence
  - SQL Formatter Helper, Multi-Result Tabs Sub-layout, Horizontal/Vertical Split Layout Persistence
  - Table Structure Editor & Modular Sub-tabs (`ColumnsTab`, `IndexesTab`, `ForeignKeysTab`, `ConstraintsTab`, `RlsSecurityTab`)
  - Table Management Modals (Create Table, Drop Table with CASCADE, Rename Table, Maintenance Modal)
  - Extended Indexes, Foreign Keys & Constraints Managers with Live SQL Preview
  - Row-Level Security (RLS) Manager, Enable/Disable Toggle, Policy Editor, Drop Policy
  - Connection Security Modal: In-Transit TLS Inspection & At-Rest Encryption Status
  - Table List Tab View: Detailed Metadata Grid, Formatting Helpers (Bytes & Row Count), Sorting, Searching, and Right-Click Context Menu
  - Duplicate Table Modal, SQL/CSV/JSON Import & Export Modals, Cross-Database Copy Modal
  - Connection Dialog Form Switching, Latency Measurement, SSL Mode Configuration
  - Database Metrics Modal, Lock Inspector Modal, Audit Log Drawer, History & Snippets Drawer, Impact Preview Modal, Command Palette
  - DockLayout Splitter Accessibility (ARIA `role="separator"`, `tabIndex={0}`, keyboard navigation)
  - End-to-End User Journey Workflow Test

---

## 🗺 แผนการพัฒนาและประวัติ Phase (Roadmap & Milestones)

- [x] **Phase 1-5: Foundations, UI Shell & DataGrid** (Tauri 2, Tailwind, Glide Data Grid, macOS Titlebar)
- [x] **Phase 6-10: In-Grid Search, Staging Mode, Input Sanitization & Safe Row Deletion**
- [x] **Phase 11-15: Cell Detail Drawer Diffs, ObjectBrowser Double-Click, Table Rename & Maintenance Suite**
- [x] **Phase 16-20: Metrics Isolation, Streamlined Cell Editing, SQLite Native File Picker & Connection Folders**
- [x] **Phase 21-23: Query History & Snippets, Query Explain Visualizer, Foreign Keys & Constraints**
- [x] **Phase 24: Brand Icon & Visual Identity Upgrade** (Luxury Minimalist Squircle Core, macOS HIG compliance)
- [x] **Phase 25: Enterprise Capabilities** (ACID Transactions, Extended Indexes, Cache Metrics, Partitioning Viewer, Audit Log)
- [x] **Phase 26: MainToolbar Tools Menu & Global Drawers Integration**
- [x] **Phase 27: Row-Level Security (RLS) Manager, In-Transit TLS & At-Rest Encryption Inspector**
- [x] **Phase 28: Visual ER Diagram Viewer & Designer** (Topological Layout, Pan & Zoom, SVG Export)
- [x] **Phase 29: Database Schema Comparison & Synchronization** (Schema Diff, UP/DOWN Migration Scripts)
- [x] **Phase 30: Server Activity Monitor & Process List** (Active Sessions, Query Termination, Auto-Refresh)
- [x] **Phase 31: Comprehensive Data Import/Export Wizard** (Multi-step Column Mapping, CSV/JSON/TSV)
- [x] **Phase 32: Database User & Privilege Manager** (User Lifecycle, GRANT/REVOKE, Host Scopes)
- [x] **Phase 33: Modern UX/UI Upgrade & Performance Suite** (Internationalization i18n th/en, Visual Query Builder No-Code UI, Schema-Aware Autocomplete, SQL Formatter ⌘⇧F, Multi-Result Tabs, Horizontal Split Layout, Deep Tree Object Browser, Keyboard Splitter Accessibility, และ Modular TableStructureEditor Architecture)

---

## 📄 ใบอนุญาต (License)

โปรเจกต์นี้อยู่ภายใต้ใบอนุญาต [MIT License](LICENSE)
