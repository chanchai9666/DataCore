# แผนโปรเจกต์โปรแกรมจัดการฐานข้อมูล (DataCore)

Tech Stack และฟีเจอร์ — สไตล์ Navicat สำหรับ Mac M1
รองรับ SQLite, PostgreSQL, MySQL (Local และ Remote)

## 1. ภาพรวมโปรเจกต์

แอปเดสก์ท็อปสำหรับเชื่อมต่อและจัดการฐานข้อมูลที่เบาและเร็วบน Apple Silicon (M1/M2/M3/M4) ใช้งานแบบ Navicat คือเปิดแอปแล้วเห็นรายการ connection ทางซ้าย เปิดหลายแท็บ และแก้ไขข้อมูลในตารางได้ทันที

**แนวทางที่เลือก:** Tauri 2 + Rust + React (TypeScript) เพื่อให้ได้ไฟล์แอปเล็ก (ประมาณ 10 MB) ใช้แรมน้อย และมี library สำหรับ UI ซับซ้อนครบ

## 2. ตัวอย่างหน้าตาโปรแกรม

> ภาพด้านล่างเป็น mockup ที่ออกแบบขึ้นเพื่อแสดงแนวคิด UI ไม่ใช่ภาพจากโปรแกรมจริง (ไฟล์ต้นฉบับ SVG อยู่ในโฟลเดอร์ `images/`)

### 2.1 หน้าต่างหลัก: Object Browser + Query Editor + Data Grid

![หน้าต่างหลัก](images/01-main-window.png)

- ซ้าย: ต้นไม้ connection → database → schema → table พร้อมระบบสีไอคอนสถานะการเชื่อมต่อ 4 ระดับ (ยังไม่ได้เชื่อมต่อ = สีเทา, กำลังเชื่อมต่อ = สีส้ม, เชื่อมต่อแล้ว = สีเขียว, เชื่อมต่อล้มเหลว = สีแดง) โดยลูกศร expander จะแสดงก็ต่อเมื่อเชื่อมต่อสำเร็จแล้วเท่านั้น เพื่อความเป็นระเบียบเรียบร้อยตามสไตล์ Navicat/DBeaver พร้อมการควบคุม Connect / Disconnect ผ่าน Context Menu หรือการคลิก/ดับเบิ้ลคลิก โดยเมื่อเลือก Disconnect จะทำการตัดการเชื่อมต่อจริงในระดับ Backend (Teardown & Rollback Sessions ทั้งหมดของ connection นั้น) พร้อมทั้งปิด Tabs ที่เชื่อมโยง และรีเซ็ตสถานะเป็นยังไม่ได้เชื่อมต่อ (สีเทา และซ่อนลูกศร)
- บน: หลายแท็บ (Query, Table, Designer) แถบเครื่องมือ พร้อมปุ่ม Auto-Commit / Commit / Rollback
- กลาง: SQL editor พร้อม syntax highlighting และ autocomplete
- ล่าง: กริดผลลัพธ์ Glide Data Grid แก้ไขช่องได้ แสดง NULL ชัดเจน แบ่งหน้าทีละ 100 แถว พร้อมปุ่มเปิด Cell Detail Drawer สำหรับดู JSON/Text ยาว, แถบฟิวเตอร์ค้นหาข้อมูลสไตล์ Navicat (Filter Bar Builder พร้อม SQL WHERE preview และปุ่ม Toggle), และระบบไฮไลท์ทั้งแถวเมื่อคลิกที่หมายเลขของแถว รองรับ Multi-row selection ด้วย Shift/Cmd

### 2.2 หน้าต่างสร้าง Connection

![สร้าง Connection](images/02-connection-dialog.png)

- เลือกชนิดฐานข้อมูล, ใส่ host/port/user/password
- รองรับการกรอกรหัสผ่านโดยตรงและตัวเลือก Remember password (จำรหัสผ่านข้ามเซสชันการเปิด-ปิดโปรแกรม โดยจัดเก็บใน Local Encrypted Vault ที่เข้ารหัสด้วย AES-256-GCM ที่ `~/.datacore/vault.enc` พร้อมสิทธิ์ไฟล์ 0600 โดยปิดการเรียกใช้งาน OS Keychain โดยสมบูรณ์เพื่อป้องกันหน้าต่างขอสิทธิ์ของระบบปฏิบัติการ)
- เลือกโหมด SSL และมีแท็บ SSH Tunnel สำหรับ remote
- ปุ่ม Test Connection แสดงผลและเวลาตอบสนอง

### 2.3 Table Designer

![Table Designer](images/03-table-designer.png)

- แก้ไขคอลัมน์ ชนิดข้อมูล Not Null, key และค่า default
- แท็บ Indexes, Foreign Keys, Constraints
- Preview SQL ก่อนใช้การเปลี่ยนแปลงจริง

---

## 3. Tech Stack และสถาปัตยกรรมระบบ

### 3.1 แกนหลัก (Core)

| ส่วน | เทคโนโลยี | หน้าที่ |
|---|---|---|
| Framework | Tauri 2 | ห่อแอปเป็น native บน macOS (ARM64) พร้อมหน้าต่าง Overlay Titlebar |
| Backend | Rust + Tokio | ตรรกะหลัก, async runtime |
| DB driver | sqlx (`sqlite`, `postgres`, `mysql`, `tls-rustls`) | ต่อฐานข้อมูลทั้ง 3 ชนิด พร้อม dynamic query decode |
| Frontend | React 18 + TypeScript | ส่วนติดต่อผู้ใช้ (UI) |
| Build tool | Vite | dev server และ bundle |

### 3.2 Backend (Rust crates & Architecture)

| Crate | ใช้ทำอะไร |
|---|---|
| `russh` | SSH tunnel |
| `aes-gcm` / Vault store | จัดเก็บรหัสผ่านแบบถาวรใน Local Encrypted Vault ด้วย AES-256-GCM (`~/.datacore/vault.enc`) สิทธิ์ 0600 (ปิด OS Keychain ถาวรและนำ crate `keyring` ออก) |
| `serde` / `serde_json` | แปลงข้อมูลระหว่าง Rust และ UI |
| `csv` | import/export CSV |
| `sqlparser` | แยก statement หลายคำสั่งใน editor |
| `thiserror` / `anyhow` | จัดการ error |
| `tracing` | log และ debug |
| `rusqlite` (ทางเลือก) | ควบคุม SQLite ละเอียดกว่า sqlx |

#### สถาปัตยกรรมการจัดการ Connection และ Data Contract ฝั่ง Backend:
1. **การแบ่งประเภท Connection:**
   - **Shared Pool:** ใช้สำหรับ Object Browser ดึง Metadata/Schema (Tables, Views, Columns) เพื่อไม่ให้กระทบหรือบล็อกการทำงานของผู้ใช้
   - **Dedicated Session ต่อแท็บ:** สำหรับ Query Editor แต่ละแท็บจะมี Session เฉพาะ เพื่อรองรับ Transaction (`BEGIN`, `COMMIT`, `ROLLBACK`), Temporary Tables และ Session Variables
2. **Dynamic Query Decoder (Data Contract):**
   - เนื่องจาก SQL รันแบบ runtime แปลงผลลัพธ์จาก `sqlx` dynamic rows ให้อยู่ในรูปแบบ `QueryResult`:
     ```rust
     pub struct QueryResult {
         pub columns: Vec<ColumnMeta>,       // name, data_type, nullable, is_primary_key, is_auto_increment
         pub rows: Vec<Vec<CellValue>>,       // Value variant: Null, String, Number, Bool, Bytes(base64), Json
         pub execution_time_ms: u64,
         pub rows_affected: Option<u64>,
     }
     ```
   - **Quote-aware SQL Parser/Splitter:** การรันคำสั่ง DDL หรือ batch direct query ใช้ `splitSqlStatements` ที่คำนึงถึง single/double quotes, backticks, PostgreSQL Dollar-Quoted Strings (`$$...$$`, `$tag$...$tag$`), backslash escapes, และ block/line comments ป้องกันการตัดผิดเมื่อค่ามี `;` อยู่ภายใน string literal หรือ stored routines
3. **กลไก Cancel Query ที่สมบูรณ์:**
   - ฝั่ง Rust มีกลไกส่งคำสั่งยกเลิกไปยัง Database Server จริงอย่างสมบูรณ์:
     - **SQLite:** ใช้ `rusqlite::InterruptHandle` (`sqlite3_interrupt`) ซึ่ง thread-safe และไม่บล็อก connection lock
     - **PostgreSQL:** บันทึก backend PID และส่ง `pg_cancel_backend(pid)` ผ่าน dedicated cancellation connection
     - **MySQL:** บันทึก connection ID และส่งคำสั่ง `KILL QUERY <id>` ผ่าน dedicated cancellation connection

### 3.3 Frontend (npm packages)

| Package | ใช้ทำอะไร |
|---|---|
| Glide Data Grid | กริดข้อมูล virtual scrolling แก้ไขในช่องได้ (Canvas-based) |
| react-arborist | ต้นไม้ Object Browser |
| dockview | แท็บและแผงลาก-วางได้ (Docking system) |
| CodeMirror 6 + `@codemirror/lang-sql` | SQL editor พร้อม syntax & autocomplete |
| Zustand | จัดการ client state (Connections, Tabs, Settings) |
| TanStack Query | จัดการการโหลดข้อมูลและ server cache |
| Tailwind CSS + Radix UI | หน้าตาและ UI primitives (Dialog, AlertDialog, ContextMenu) พร้อม A11y |
| React Hook Form + Zod | จัดการสถานะ Form และ Data validation แบบ Type-safe |
| Query Builder | ตัวสร้างคำสั่ง SQL DDL/DML กลางที่ปลอดภัยตามแต่ละ Dialect |
| sonner | ระบบ Toast Notifications แจ้งเตือนสถานะการทำงาน |
| lucide-react | ไอคอน |
| sql-formatter | จัดรูปแบบ SQL |

### 3.4 Tooling & Development Prerequisites

- **pnpm**: จัดการแพ็กเกจ Frontend
- **Rust Toolchain**: `rustup` พร้อม target `aarch64-apple-darwin` สำหรับ Apple Silicon
- **Xcode Command Line Tools**: จำเป็นสำหรับคอมไพล์ C-bindings บน macOS
- **Biome** หรือ **ESLint + Prettier**: lint/format
- **Vitest**: ทดสอบฝั่ง UI
- **cargo test + testcontainers**: ทดสอบกับ Postgres/MySQL จริง
- **GitHub Actions**: build และ sign แอป
- **Apple Developer ID**: ลงนามและ notarize ให้เปิดบน Mac ได้ไม่ติดคำเตือน

---

## 4. ฟีเจอร์

### ระดับ 1: MVP (ต้องมี)

**Connection Manager**
- เพิ่ม/แก้/ลบ/ทำซ้ำ connection
- รองรับ SQLite, PostgreSQL, MySQL
- ปุ่ม Test Connection แสดงเวลาตอบสนอง
- จัดกลุ่ม connection เป็นโฟลเดอร์
- เก็บรหัสผ่านใน Local Encrypted Vault (ปิดการเรียกใช้ OS Keychain)

**Object Browser**
- ต้นไม้ connection → database → schema → table / view
- ค้นหาในต้นไม้ (Quick filter)
- คลิกขวาเมนู: เปิดตาราง, ลบ, เปลี่ยนชื่อ, refresh
- ใช้ Connection Pool แยกเฉพาะ ไม่รบกวน Session ของ Editor

**Table Viewer**
- แสดงข้อมูลแบบกริด Glide Data Grid (Virtual Scrolling)
- แบ่งหน้าทีละ 100 แถว เพื่อประสิทธิภาพและความเร็วของ Tauri IPC
- **Navicat-style Filter Bar:** แถบฟิวเตอร์ค้นหาข้อมูลแบบ Filter Builder สามารถระบุ `[Column] [Operator] [Value]` พร้อมปุ่ม `+ Add Condition` ตัวเชื่อม `AND` / `OR`, Checkbox เปิด/ปิดเงื่อนไข, ปุ่ม Clear, ปุ่ม Apply, กด Enter เพื่อ Apply ทันที และพรีวิว SQL WHERE clause (กรองระดับ Server-side สำหรับ Table Tab และ In-memory สำหรับ Query Tab พร้อมจดจำ State แยกตามแต่ละแท็บ)
- **Row Header Selection & Highlight:** คลิกที่หมายเลขแถว (Row Marker `clickable-number` 1, 2, 3...) แล้วไฮไลท์ทั้งแถวด้วยสีฟ้าเด่นชัด (`accentLight: rgba(59, 130, 246, 0.25)`) พร้อมรองรับ Multi-row selection ด้วย Shift/Cmd และเชื่อมต่อกับปุ่ม Delete Row เป็น `Delete (N) Rows`
- **Order By คอลัมน์ (Column Sorting):** คลิกที่ Header คอลัมน์เพื่อเรียงลำดับข้อมูลสลับระหว่าง `ASC (▲)` -> `DESC (▼)` -> `None (ลำดับเริ่มต้น)` โดย Table Tab ทำงานแบบ Server-side ผ่าน SQL `ORDER BY` และ Query Tab ทำงานแบบ Client-side In-memory
- **Column Resizing:** รองรับการลากขอบ Header คอลัมน์เพื่อย่อ/ขยายความกว้างได้อย่างอิสระ พร้อมบันทึกขนาดคอลัมน์คงอยู่แยกตามแต่ละแท็บ (Persist column widths per tab)
- แก้ไขช่อง (Inline Edit), เพิ่มแถว (Insert Row Modal), ลบแถว แล้ว commit/rollback
- รองรับการดึง metadata ของคอลัมน์จาก `information_schema` แม้ตารางจะยังไม่มีข้อมูล (0 rows) เพื่อให้เปิดหน้าต่าง Insert Row กรอกข้อมูลได้ทันที
- คำสั่ง INSERT จะละเว้นคอลัมน์ auto-increment / SERIAL / id ที่มีค่าว่างหรือ NULL เพื่อให้ฐานข้อมูลสร้าง Sequence ให้โดยอัตโนมัติ
- แสดง `NULL` ชัดเจน
- **Cell Detail Drawer / Modal:** ดูและแก้ไขข้อมูลยาว เช่น ข้อความยาว, JSON, หรือข้อมูล Binary

**Query Editor**
- หลายแท็บ (**Dedicated Connection ต่อ 1 แท็บ**)
- **Connection-Aware Query Tab Control:** ซ่อนปุ่ม `New Query Tab` ในหน้า Empty State และปุ่มบวก (+) บน Tab Bar เมื่อยังไม่ได้เชื่อมต่อฐานข้อมูลใดๆ เพื่อป้องกันการเปิด Query Tab โดยไม่มี connection ที่เชื่อมต่ออยู่ พร้อมแสดงข้อความแนะนำให้เชื่อมต่อฐานข้อมูลจาก Object Browser
- **สวิตช์ Auto-Commit (ON / OFF)** พร้อมปุ่ม **Commit** และ **Rollback** บนแถบเครื่องมือ
- syntax highlighting + autocomplete ชื่อตาราง/คอลัมน์
- รันทั้งหมดหรือเฉพาะส่วนที่เลือก (⌘+Enter)
- ปุ่มยกเลิก query (พร้อมส่งสัญญาณยกเลิกไปยัง DB server)
- แสดงเวลารันและจำนวนแถว
- ประวัติ query (Query History)

**พื้นฐานและ UI/UX สำหรับ Mac**
- **macOS Native Window Look:** ซ่อน Title Bar ใช้ `titleBarStyle: "Overlay"` ให้แถบแท็บแนบชิดปุ่ม Traffic Light (แดง/เหลือง/เขียว)
- Dark / Light mode (พร้อม Sync Theme เข้า Canvas ของ Glide Data Grid)
- คีย์ลัดแบบ Mac (⌘+Enter รัน, ⌘+T แท็บใหม่, ⌘+W ปิดแท็บ, ⌘+F ค้นหา)

---

### ระดับ 2: สำหรับ Remote

- SSL/TLS พร้อมเลือก CA / client certificate
- SSH Tunnel (password / private key)
- Connection timeout และ auto-reconnect
- รองรับ connection string (เช่น `postgres://...`)
- แสดงสถานะการเชื่อมต่อ (Ping / Active state)

### ระดับ 3: จัดการโครงสร้าง

- **Table Structure Editor & Designer (เสร็จสมบูรณ์)**:
  - ดูโครงสร้างคอลัมน์, ชนิดข้อมูล, สถานะ Nullable, ค่า Default, และ Primary Key
  - เพิ่มคอลัมน์ใหม่ (ALTER TABLE ADD COLUMN) พร้อม Live SQL Preview และ Quick Presets
  - แก้ไขคอลัมน์ (เปลี่ยนชื่อ, แก้ชนิดข้อมูล, ปรับ Nullable, ปรับค่า Default)
  - ลบคอลัมน์ (ALTER TABLE DROP COLUMN) พร้อมระบบความปลอดภัยยืนยันก่อนลบ
  - รองรับการกำหนด Length/Values สัมพันธ์ตามประเภทข้อมูล (เช่น `VARCHAR(30)`, `INT(5)`, `NUMERIC(10,2)`) และปิดช่องอัตโนมัติสำหรับประเภทที่ไม่ต้องมีขนาด (เช่น `DATE`, `JSON`, `UUID`, `BOOLEAN`, `TIMESTAMP`)
  - แสดง CREATE TABLE DDL พร้อมปุ่มคัดลอกคำสั่ง SQL
  - **แท็บจัดการ Index ในตาราง (เสร็จสมบูรณ์)**: ดูรายการ Index ทั้งหมดของตาราง (ชื่อ, คอลัมน์, ชนิด, สถานะ PK / Unique), สร้าง Index ใหม่ (Create Index), และลบ Index (Drop Index)
- **สร้างตารางใหม่ (Create Table - เสร็จสมบูรณ์)**:
  - เมนูคลิกขวาที่ Schema, Database, หรือโฟลเดอร์ Tables ใน Object Browser
  - หน้าต่าง Create Table Modal กำหนดชื่อตาราง, คอลัมน์, PK, Nullable, Default, Quick Presets (+Timestamps, +ID)
  - **แถบจัดการ Index ในหน้าต่างสร้างตาราง (เสร็จสมบูรณ์)**: กำหนด Index เพิ่มเติมได้ทันที พร้อมตัวเลือกคอลัมน์และ Unique flag
  - รันคำสั่ง DDL ผ่าน `dbApi.executeDirectQuery` โดยเปิด-ปิด Temporary Session อัตโนมัติ แก้ปัญหา Connection session not found
  - เมื่อสร้างเสร็จ ทำการรีเฟรช Object Browser และเปิดแท็บตารางใหม่ทันที
- **ลบตาราง (Drop Table - เสร็จสมบูรณ์)**:
  - เมนูคลิกขวาที่ตารางใน Object Browser หรือปุ่ม Drop ใน Table Structure Editor
  - ดำเนินการผ่าน `executeDirectQuery` แบบ temporary session ปลอดภัยและไม่ติดปัญหา session
  - หน้าต่างยืนยันความปลอดภัย พิมพ์ชื่อตารางเพื่อยืนยัน พร้อมตัวเลือก `CASCADE` สำหรับ PostgreSQL
  - ปิดแท็บที่เปิดอยู่ของตารางนั้นอัตโนมัติ และรีเฟรช Object Browser ทันที
- **ส่วนที่พัฒนาในลำดับถัดไป**:
  - การจัดการ Foreign Keys และ Constraints
  - เปลี่ยนชื่อตาราง (RENAME TABLE)
  - การจัดการ Views

### ระดับ 4: ข้อมูลเข้า-ออก

- **ระบบ Import / Export ข้อมูล (CSV & JSON - เสร็จสมบูรณ์)**:
  - **Backend Streaming Engine (Rust):** ประมวลผลแบบสตรีมมิ่งผ่าน Rust (`csv` และ `serde_json`) อ่าน/เขียนไฟล์ลงดิสก์โดยตรง ไม่นำข้อมูลทั้งหมดโหลดเข้า RAM ของ React WebView รองรับไฟล์ขนาดใหญ่ได้อย่างราบรื่น
  - **Multi-row Batch Insertion:** ทำการรวมคำสั่ง INSERT เป็นชุด (Batch ขนาด 500–1,000 แถว) เพื่อลด overhead ของ IPC และ round-trip ไปยังฐานข้อมูล
  - **รูปแบบไฟล์ที่รองรับ:**
    - **CSV:** ระบบตรวจจับตัวคั่นอัตโนมัติ (Auto-delimiter detection สำหรับ `,`, `;`, `\t`), จัดการ Escape/Quote ตามมาตรฐาน RFC 4180, เลือกว่ามีแถวหัวตาราง (Header) หรือไม่
    - **JSON:** รองรับทั้ง Standard JSON Array (`[ { ... } ]`) และ NDJSON / JSON Lines (`{ ... }\n{ ... }`)
  - **Column Mapping UI (Import):** แสดงพรีวิว 5 แถวแรก, จับคู่ชื่อคอลัมน์จากไฟล์เข้ากับคอลัมน์ของตารางปลายทางแบบอัตโนมัติ (Auto-mapping) พร้อมตัวเลือกจับคู่ด้วยตนเอง หรือเลือกข้ามคอลัมน์ (Skip)
  - **Error Handling Policy:** ตัวเลือกระหว่าง **Atomic Transaction** (เป็นค่าเริ่มต้น: หากแถวใดเกิดข้อผิดพลาดจะ Rollback ทั้งหมดเพื่อความปลอดภัยของข้อมูล) หรือ **Skip Invalid Rows** (ข้ามแถวที่ error และบันทึกแถวที่ถูกต้อง)
  - **Progress Tracking & Cancellation:** แถบแสดงความคืบหน้าแบบ Real-time (จำนวนแถวที่ประมวลผลแล้วและเวลาที่ใช้) พร้อมปุ่ม Cancel เพื่อยกเลิกและ Rollback ทันที
  - **Native macOS File Dialog:** ใช้ `@tauri-apps/plugin-dialog` และ `tauri-plugin-dialog` สำหรับกล่องเลือกไฟล์เปิด/บันทึกไฟล์แบบเนทีฟของ macOS
  - **จุดเข้าใช้งาน (UI Entry Points):**
    - **Object Browser:** คลิกขวาที่ตาราง -> เลือก *"Import Data into Table..."* หรือ *"Export Table Data..."*
    - **Data Grid Toolbar:** ปุ่ม *"Export"* บนแถบเครื่องมือ โดยเลือกได้ระหว่าง *"Current View (Filtered/Sorted)"* หรือ *"All Table Rows"*
    - **Main Toolbar (Desktop Chrome):** ปุ่ม *"Import"* และ *"Export"* แสดง Dropdown Menu สไตล์เดสก์ท็อปให้เลือกการถ่ายโอนข้อมูล (CSV/JSON) หรือคำสั่งสคริปต์ SQL Dump (.sql) และปุ่ม *"Backup"* ทำการเปิด Database SQL Dump ทันที
  - **Auto-refresh & Feedback:** เมื่อ Import สำเร็จจะทำการรีเฟรชข้อมูลในแท็บของตารางที่เปิดอยู่โดยอัตโนมัติ พร้อมแสดงข้อความสรุปผ่าน Toast notification (`sonner`)
- **การจัดการตารางและการถ่ายโอนข้อมูลขั้นสูง (ดู [Technical Design Doc](designs/table_management_and_data_transfer.md))**:
  - **Table List View (เสร็จสมบูรณ์)**: หน้าจอภาพรวมตารางระดับ Database/Schema ในรูปแบบ Detailed Metadata Grid (Glide Data Grid แสดง Estimated Rows ปราศจาก Table Lock, Data Size, Index Size, Storage Engine, Collation พร้อม Search Filter ค้นหาชื่อตาราง)
  - **Table List Context Menu**: เมนูคลิกขวาบนแถวตารางใน Table List View (Open Data, Design Structure, Duplicate Table, Copy Table to DB, Export as SQL Dump, Export Table Data, Import as SQL Dump, Import Table Data, Copy Table Name, Drop Table)
  - **Duplicate Table (Native SQL Quick Clone - เสร็จสมบูรณ์)**: เมนูลัดคลิกขวาที่ตารางเพื่อโคลนโครงสร้างและข้อมูลลงใน schema เดียวกันอย่างรวดเร็วระดับมิลลิวินาที ผ่านคำสั่ง Native SQL ของฐานข้อมูลเดิมโดยตรง (`CREATE TABLE ... LIKE / AS SELECT`) ไม่กินหน่วยความจำฝั่ง Client
  - **Cross-Database Table Copy (Navicat Data Transfer)**: คัดลอกตารางจากฐานข้อมูล A ไป B ข้ามการเชื่อมต่อและข้ามเอนจิน (SQLite, MySQL, PostgreSQL) พร้อมระบบ Auto Type Mapping และสตรีมข้อมูลผ่าน Batch INSERT ใน Rust
  - **SQL Import / Export (Navicat Standard - เสร็จสมบูรณ์)**:
    - *Export SQL:* สร้างไฟล์ Dump `.sql` เลือกได้ทั้ง Structure Only, Data Only, หรือ Structure & Data พร้อม Multi-row Batch INSERT (500–1,000 แถว)
    - *Import SQL:* ตัวอ่านและรันคำสั่งสตรีมมิ่ง `BufReader` ใน Rust รองรับไฟล์ขนาดใหญ่ระดับหลาย GB (เพดาน RAM < 32MB) กรองและตัดทิ้งคำสั่ง `DELIMITER` ของ MySQL อัตโนมัติ ป้องกัน Syntax Error และรองรับการสั่งยกเลิก (Cancellation) เพื่อ Rollback ทันที
- **การคัดลอกข้อมูลในตารางและการค้นหา In-Grid (Issue #30)**:
  - รองรับการคัดลอกข้อมูลทุกรูปแบบ: เซลล์เดี่ยว, ช่วงเซลล์ (Range), ทั้งแถว (Multi-row selection), และทั้งคอลัมน์แนวดิ่ง (Column selection)
  - เลือกว่าจะมี Headers ติดไปด้วยหรือไม่ผ่านปุ่มลัด `Cmd+Shift+C` หรือคลิกขวา Context Menu
  - คลิกหัวคอลัมน์เพื่อเลือกทั้งคอลัมน์แนวตั้ง และกด `Alt+Click` เพื่อเรียงลำดับข้อมูล (Sort Column)
  - รองรับ `Cmd+A` เพื่อเลือกข้อมูลทั้งหมดในตาราง (Select All)
  - รองรับการค้นหาข้อมูลในตารางด้วย `Cmd+F` มี Find Bar แสดงจำนวนผลลัพธ์และกระโดดไฮไลท์ข้ามเซลล์ที่ตรงคำค้นหา
- Copy เป็น CSV / JSON / INSERT statement จากกริด
- Backup / Dump ฐานข้อมูล

### ระดับ 5: ฟีเจอร์ขั้นสูง

- ER Diagram
- เปรียบเทียบ schema (Schema Diff)
- Query Explain / Execution Plan
- Saved Queries / Snippets
- ดู Process list / Active sessions
- จัดการผู้ใช้และสิทธิ์
- Auto-update ในตัวแอป

---

## 7. Classic Desktop DB Client UX/UI Redesign Roadmap (Issue #28)

อ้างอิงแนวทางการออกแบบใน [DataCore-UX-UI-Redesign-Guide.md](docs/DataCore-UX-UI-Redesign-Guide.md) และเอกสารสรุปความต้องการ [concepts_brief.md](../concepts_brief.md) มีการวางแผนและดำเนินการปรับปรุง UX/UI แบบ Incremental ครบทั้ง 5 Phase ดังนี้:

### Phase 1: Foundations & Design Tokens (✅ เสร็จสมบูรณ์)
- สร้าง `src/styles/tokens.css` กำหนดชุดตัวแปรสีทั้ง Light (default) และ Dark (Charcoal `#262628`/`#1e1e20`), Typography `--font-ui`, `--font-mono`, Spacing และ Component Heights
- อัปเดต `tailwind.config.js` ขยาย font sizes (`xs: 11px`, `sm: 12px`, `base: 13px`), heights (`row: 24px`, `btn: 24px`, `toolbar: 56px`, `status: 22px`) และ semantic color tokens
- จัดระเบียบ Button Hierarchy สไตล์ Classic Desktop (ลดสีสดเขียว/แดง ใช้ปุ่มเทาเรียบ และปุ่ม toolbar)
- แก้ไข UI Bug ใน TitleBar (ลบเครื่องหมาย `+ ` ซ้ำซ้อนที่แสดง `+ + New Connection`)

### Phase 2: Window Chrome & Layout Shell (✅ เสร็จสมบูรณ์)
- พัฒนา `MainToolbar` (ความสูง 56px, `pl-[78px]` เว้นระยะให้ macOS traffic lights, กำหนด `data-tauri-drag-region`)
- พัฒนา `StatusBar` (ความสูง 22px แสดง SQL ล่าสุด, row count, execution duration, active cell coordinate)
- ปรับปรุง Sidebar: ลบหัวข้อซ้อน EXPLORER / OBJECT BROWSER เหลือ Search box + Tree อย่างเป็นระเบียบ
- ปรับใช้ DB Type Badges สไตล์กลาง (`PG`, `MY`, `SQ`)

### Phase 3: Table Viewer & Safe Pending Changes (✅ เสร็จสมบูรณ์)
- ปรับแต่ง Glide Data Grid Theme สำหรับ Light/Dark canvas rendering (`gridTheme.ts`) ให้กลมกลืนกับ design tokens
- One-line Filter Bar เหนือกริด
- Bottom Action Bar รวมปุ่ม Add/Delete Row, Pagination, Refresh, Rows per page, และ Commit/Discard
- `pendingChangesStore` ใน Zustand สำหรับ stage การแก้ไขข้อมูล (Cell Edits, Row Insertions, Row Deletions) ก่อนส่งบันทึกลงฐานข้อมูลอย่างปลอดภัย

### Phase 4: Table Designer & Objects View (✅ เสร็จสมบูรณ์)
- Table Designer แบบ Inline Editable Grid พร้อม Sub-tabs (`Fields`, `Indexes`, `Foreign Keys`, `Triggers`, `SQL Preview`)
- เพิ่มแท็บ `SQL Preview` Inline DDL Generator สำหรับสร้างคำสั่ง `CREATE TABLE` พร้อมปุ่ม Copy
- จัด Desktop Button Hierarchy ปรับปุ่ม Action หลักและรองให้เรียบง่ายสบายตา

### Phase 5: macOS Native Polish (✅ เสร็จสมบูรณ์)
- Keyboard Shortcuts integration ผ่าน `useShortcuts` (⌘N: New Connection, ⌘T: New Query Tab, ⌘W: Close Active Tab)
- รองรับ `prefers-color-scheme` ตรวจจับ System Appearance อัตโนมัติ (Dark / Light)

### Phase 6: Table Copy & In-Grid Search (✅ เสร็จสมบูรณ์)
- รองรับการคัดลอกระดับช่อง, ทั้งแถว, ทั้งคอลัมน์แนวดิ่ง และทั้งตาราง (Cmd+A, Cmd+C, Cmd+Shift+C พร้อม Header)
- ระบบค้นหาข้อมูลในตาราง In-Grid Find Bar (Cmd+F) พร้อม Match Counter และกระโดดไปยังผลลัพธ์
- Right-click Context Menu สำหรับคัดลอก ค้นหา และเลือกทั้งหมด

### Phase 7: Auto-Commit vs Staging Mode (✅ เสร็จสมบูรณ์)
- สวิตช์สลับโหมด Auto-Commit vs Manual Staging Mode บน GridBottomBar
- โหมด Staging: รวบรวม Cell Edits, Insert Rows, Delete Rows ไว้ใน pendingChangesStore
- แสดงผลไฮไลต์สีบนเซลล์และแถวที่มีการเปลี่ยนแปลง (Blue/Green/Red tints)
- ปุ่ม Commit รวมคำสั่ง SQL รันเป็น Batch Transaction และปุ่ม Discard คืนค่าเดิม

### Phase 8: DataGrid Input Sanitization & Smart Type Handling (✅ เสร็จสมบูรณ์ - Issue #32)
- **Data/Time Type Sanitization:** จัดการการแก้ไขช่องวันที่/เวลา (`timestamp`, `timestamptz`, `date`, `time`) อย่างปลอดภัย หากผู้ใช้กรอก `0`, `""` หรือ `null` ในคอลัมน์ที่เป็น Nullable จะถูกแปลงเป็น `NULL` อัตโนมัติ ป้องกัน Database Error เช่น `date/time field value out of range: "0"`
- **Date Keyword Support:** รองรับการพิมพ์คีย์เวิร์ดพิเศษ เช่น `now`, `now()`, `CURRENT_TIMESTAMP` เพื่อกำหนดเป็นเวลาปัจจุบันของฐานข้อมูล
- **Numeric & Nullable Handling:** การเคลียร์ค่าเป็นช่องว่างในคอลัมน์ตัวเลข (`int`, `numeric`, `float`) หรือข้อความที่เป็น Nullable จะถูกแปลงเป็น `NULL` แทน Empty String ป้องกัน Type Mismatch Error ใน PostgreSQL/MySQL
- **User Feedback & Status Badges:** ปรับปรุงข้อความแจ้งเตือนสถานะเมื่อทำการ Auto-Commit หรือเกิด Error ให้สื่อสารชัดเจนและเข้าใจง่าย

### Phase 9: Native Confirmation Dialog & Safe Row Deletion (✅ เสร็จสมบูรณ์ - Issue #33)
- **Async Dialog Handling:** แก้ไขบั๊กการกดยกเลิกการลบแถวแต่รายการยังถูกลบ โดยเปลี่ยนจากการใช้ `window.confirm()` แบบซิงโครนัส (ซึ่งในสภาพแวดล้อม Tauri/WebKit จะคืนค่าเป็น `Promise` เสมอ ทำให้ถูกประเมินเป็น `true` ก่อนที่ผู้ใช้จะคลิก) มาเป็น `confirmDialog()` helper ที่เรียกใช้ `@tauri-apps/plugin-dialog` อย่างเป็นทางการ พร้อม `await` การตัดสินใจของผู้ใช้อย่างแท้จริง
- **Safe Row & Multi-Row Deletion:** การลบแถวเดี่ยวและหลายแถวทั้งใน `DockLayout.tsx` และ `DataGrid.tsx` ต้องรอผลตอบกลับจาก Dialog ก่อนส่งคำสั่ง DELETE ไปยังฐานข้อมูลเสมอ หากกดยกเลิก (Cancel) จะไม่ทำรายการใดๆ ทั้งสิ้น
- **Connection Deletion & Mode Toggling:** ปรับปรุงจุดยืนยันทั้งหมดในระบบให้เป็นแบบ Async เช่น การลบ Connection ใน `ObjectBrowser` และการสลับโหมดจาก Staging Mode ไป Auto-Commit เมื่อมี Pending Changes

### Phase 10: Staging Mode Consistency for Drawer & Direct Cell Edits (✅ เสร็จสมบูรณ์ - Issue #34)
- **Drawer Save Staging Consistency:** ปรับปรุงฟังก์ชัน `handleSaveDrawerValue` ใน `DataGrid.tsx` ให้ส่งผ่าน `handleCellEditedWithStaging` แทนการเรียก `onCellEdited` โดยตรง เพื่อให้การแก้ไขข้อมูลจาก Cell Detail Drawer เมื่ออยู่ในโหมด Staging ถูกบันทึกเป็น Staged Edit เข้าสู่ `pendingChangesStore` เสมอ และไม่ Auto-Commit ไปยังฐานข้อมูล
- **DockLayout Defensive Staging Check:** เพิ่มการตรวจสอบ `isAutoCommitMode` ใน `handleCellEdited` ของ `DockLayout.tsx` เพื่อให้ทำงานสอดคล้องกับ `handleRowDelete` และ `handleSubmitInsertRow` โดยหาก Auto-Commit ปิดอยู่ จะทำการ Stage การแก้ไขลงใน Store และไม่ยิงคำสั่ง `UPDATE` SQL ทันที

### Phase 11: Staged Values & Diff Visibility in Cell Detail Drawer (✅ เสร็จสมบูรณ์ - Issue #35)
- **Staged Cell Value Resolution:** ใน `DataGrid.tsx` ปรับปรุง `activeCellInfo` ให้ตรวจสอบการเปลี่ยนแปลงใน `tableChanges` (ทั้ง `cellEdits` และ `addedRows`) เพื่อให้ `cellInfo.value` สะท้อนค่าล่าสุดที่ถูก Stage ไว้ทันที โดยไม่ต้องปิด Drawer หรือรอ Commit
- **Staged Badge & Original Value Diff:** ใน `CellDetailDrawer.tsx` แสดง Badge ระบุสถานะ `Staged (Uncommitted)` และส่วนเปรียบเทียบค่าเดิม (Original Value) กับค่าใหม่ที่แก้ไข เพื่อให้ผู้ใช้เห็นชัดเจนว่าช่องนี้ถูกแก้ไขอะไรไปบ้างก่อนกด Commit Batch Transaction

### Phase 12: Double-Click Connection Trigger in Object Browser (✅ เสร็จสมบูรณ์ - Issue #36)
- **Double-Click Connection:** ปรับเปลี่ยนพฤติกรรมการคลิกที่ Connection Node ใน `ConnectionTreeNode.tsx` โดยการคลิกครั้งเดียว (Single-Click) จะทำหน้าที่เลือกโหนด (Select Node) และตั้งเป็น Active Connection เท่านั้น โดยไม่ทำการเชื่อมต่อฐานข้อมูล
- **Connect on Double-Click:** ย้ายการเชื่อมต่อ (`onConnectConnection`) ไปทำงานเมื่อผู้ใช้ทำการดับเบิลคลิก (Double-Click) หรือเลือกเมนู Connect ผ่าน Context Menu เพื่อป้องกันการเผลอคลิกแล้วเชื่อมต่อโดยไม่ตั้งใจ

### Phase 13: macOS Native Desktop Look & Feel Polish (✅ เสร็จสมบูรณ์ - Issue #37)
- **Eliminate WebKit Artifacts:** ปิด Default Browser Context Menu (Inspect, Reload, Back) ทั่วทั้งแอป เพื่อไม่ให้แสดงหน้าต่างเว็บเบราว์เซอร์เมื่อคลิกขวาในพื้นที่ว่าง, บล็อก `Cmd+R` / `Cmd+Shift+R` (Reload) และ `Cmd+=` / `Cmd+-` / `Cmd+0` (Page Zoom) ป้องกันหน้าจอวูบหรือขนาดเพี้ยน
- **Native Drag & Titlebar Mechanics:** ป้องกัน Default File Drop Navigation เมื่อมีการลากไฟล์เข้ามา, รองรับ `data-tauri-drag-region` บนพื้นที่ว่างของ Header และรองรับการดับเบิลคลิกบน Titlebar เพื่อ Toggle Maximize/Restore ตามมาตรฐาน macOS
- **Overscroll & Selection Polish:** กำหนด `overscroll-behavior: none` ป้องกันการเด้งย้วย (Rubber-band bounce) แบบเว็บ, บังคับ `user-select: none` บน UI Chrome และปรับ Focus Outline ให้เนียนตาเหมือน Native App

### Phase 14: Table Rename Feature (✅ เสร็จสมบูรณ์ - Issue #38)
- **Query Builder Support:** เพิ่มฟังก์ชัน `buildRenameTableSql(oldTableName, newTableName, schemaName?, driver?)` ที่รองรับคำสั่ง `ALTER TABLE <old> RENAME TO <new>;` พร้อม Quoting Identifier ตามประเภทของไดรเวอร์ (PostgreSQL, SQLite, MySQL)
- **RenameTableModal Component:** สร้าง Dialog สำหรับเปลี่ยนชื่อตาราง พร้อมระบบตรวจสอบความถูกต้อง (Validation), การแสดง SQL Preview, Loading Indicator, แจ้งเตือน Toast เมื่อสำเร็จ/เกิดข้อผิดพลาด และซิงก์อัปเดต Tab ที่เปิดอยู่ (`useTabStore`) ให้อัตโนมัติ
- **UI Integration:** เพิ่มเมนู "Rename Table..." ใน Context Menu ของ ObjectBrowser, เมนูจัดการใน TableListTab และปุ่ม "Rename" บน Toolbar ของ TableStructureEditor

### Phase 15: Table Maintenance & Diagnostics Suite (✅ เสร็จสมบูรณ์ - Issue #39)
- **Multi-Engine Maintenance Query Builder:** เพิ่ม `buildTableMaintenanceSql(operation, tableName, schemaName?, driver?)` รองรับการปรับแต่งและวินิจฉัยตาราง:
  - `analyze`: อัปเดตสถิติ Index ให้ Query Planner (PostgreSQL: `ANALYZE`, MySQL: `ANALYZE TABLE`, SQLite: `ANALYZE`)
  - `check`: ตรวจสอบความสมบูรณ์ของตาราง (PostgreSQL Catalog Check, MySQL: `CHECK TABLE`, SQLite: `PRAGMA integrity_check;`)
  - `optimize`: คลีนพื้นที่และ Defragment ข้อมูล (PostgreSQL: `VACUUM (ANALYZE)`, MySQL: `OPTIMIZE TABLE`, SQLite: `VACUUM;`)
  - `reindex`: ซ่อมแซมและสร้าง Index ใหม่ (PostgreSQL: `REINDEX TABLE`, MySQL: `REPAIR TABLE`, SQLite: `REINDEX`)
- **TableMaintenanceModal Component:** Dialog วิเคราะห์และซ่อมแซมตาราง รองรับการเลือก Operation, แสดง SQL Preview, แสดงผลลัพธ์การทำงานพร้อมเวลาประมวลผล (Execution Time in ms) และ Diagnostic Output
- **UI Integration:** เมนูคลิกขวาใน ObjectBrowser ("Maintenance & Diagnostics..."), ใน TableListTab และปุ่ม Toolbar ใน TableStructureEditor

### Phase 16: Per-Tab Execution Timing & Metrics Isolation (✅ เสร็จสมบูรณ์ - Issue #40)
- **Per-Tab Status Store (`statusStore.ts`):** ปรับปรุง Store ให้เก็บสถานะและเวลาคิวรี่แยกตาม `tabId` (`tabStatusMap`) พร้อมฟังก์ชัน `setActiveTabId` เพื่อสลับข้อมูลสถิติบน Status Bar ตามแท็บที่โฟกัสอยู่ทันที
- **Comprehensive Timing for Table Fetch & Queries:** เชื่อมโยงเวลาประมวลผล (`execution_time_ms`) เมื่อเปิดหรือรีเฟรชข้อมูลตาราง (`loadTableData`) บันทึกคำสั่ง SQL ที่ใช้ดึงข้อมูล จำนวนแถว และเวลาที่ใช้ลงในสถานะของแท็บนั้นๆ
- **Tab Switching Synchronization:** ซิงก์การสลับแท็บใน `DockLayout` เข้ากับ `useStatusStore` เพื่อให้ Status Bar แสดงผลเฉพาะข้อมูลของแท็บที่กำลังทำงานอยู่อย่างอิสระ

### Phase 17: Streamlined Cell Detail Direct Editing (✅ เสร็จสมบูรณ์ - Issue #41)
- **Direct Editable Mode in Cell Detail Drawer:** ปรับปรุง `CellDetailDrawer.tsx` ให้เริ่มต้นในโหมดแก้ไขข้อมูลทันที (`isEditing = true`) เมื่อมี `onSaveValue` (ตารางรองรับการแก้ไข) เพื่อให้ผู้ใช้สามารถคลิกพิมพ์แก้ไขค่าข้อมูลใน Textarea ได้ทันทีโดยไม่ต้องกดปุ่ม "Edit" ซ้ำอีกครั้ง
- **Quick Keyboard Shortcut (`Cmd+Enter` / `Ctrl+Enter`):** เพิ่มทางลัดคีย์บอร์ดสำหรับการบันทึกการแก้ไขค่าใน Cell Detail Drawer ได้ทันทีจาก Textarea
- **Seamless Mode Switching & Backward Compatibility:** มีปุ่มสลับมุมมองระหว่าง "Edit" (โหมดแก้ไขเริ่มต้น) และ "View / Preview" (สำหรับดูข้อมูลแบบเต็ม / Formatted JSON) พร้อมปุ่ม Copy และ Format เพื่อความยืดหยุ่นในการใช้งาน

### Phase 18: Auto-Close Cell Detail Drawer on Save (✅ เสร็จสมบูรณ์ - Issue #42)
- **Auto-Close on Save Changes:** ปรับปรุง `handleSave` ใน `CellDetailDrawer.tsx` ให้เรียก `onClose()` ทันทีหลังทำการบันทึกค่า (ทั้งเมื่อกดปุ่ม "Save Changes" และการกดคีย์ลัด `Cmd+Enter` / `Ctrl+Enter`) เพื่อให้ Drawer ปิดตัวเองโดยอัตโนมัติ ช่วยลดขั้นตอนการทำงานของผู้ใช้

### Phase 19: Native File Picker for SQLite Database Connection (✅ เสร็จสมบูรณ์ - Issue #43)
- **SQLite File Browser Button:** เพิ่มปุ่ม "Browse..." หรือ "Choose File..." ในฟอร์มการเชื่อมต่อ SQLite (`DriverForm.tsx`) เพื่อเปิดหน้าต่างเลือกไฟล์ฐานข้อมูลจากเครื่องได้โดยตรง
- **Tauri Dialog Integration:** ใช้งานฟังก์ชัน `open` จาก `@tauri-apps/plugin-dialog` พร้อมกำหนด Filters สำหรับไฟล์ SQLite (`.db`, `.sqlite`, `.sqlite3`, `.db3`, `.s3db`, `.sl3`, `*.*`)
- **Auto Populate & Smart Name Suggestion:** นำไฟล์ที่เลือกมากรอกลงในช่อง `Database Path` ทันที และแนะนำชื่อการเชื่อมต่ออัตโนมัติจากชื่อไฟล์หากผู้ใช้ยังไม่ได้กำหนดชื่อ พร้อมปุ่ม `:memory:` สำหรับการทดสอบ In-Memory Database

### Phase 20: Connection Folder Grouping with Custom Color & Rename Support (✅ เสร็จสมบูรณ์ - Issue #44)
- **Connection Folder Grouping in ObjectBrowser:** จัดกลุ่ม Connection Nodes ใน Sidebar ให้อยู่ใต้ Connection Folders ตามค่า `conn.folder` โดยการเชื่อมต่อที่ไม่มีโฟลเดอร์จะแสดงอยู่ที่ Root เลเวล
- **Folder Creation & Color Customization:** เพิ่มปุ่ม "New Folder" บนแถบเครื่องมือของ ObjectBrowser พร้อม Dialog สำหรับตั้งชื่อและเลือกสีไอคอนโฟลเดอร์ (Blue, Emerald, Amber, Red, Purple, Pink, Indigo, Gray) และบันทึกข้อมูลสีลง LocalStorage
- **Folder Management & Context Menu:**
  - เมนูคลิกขวาบนโฟลเดอร์: "Rename Folder...", "Change Color...", "Delete Folder" (พร้อมทางเลือกลบและย้ายการเชื่อมต่อไปไว้ที่ Root)
  - เมนูคลิกขวาบนการเชื่อมต่อ: "Move to Folder..." สำหรับย้ายเข้า/ออกจากโฟลเดอร์ได้อย่างสะดวกรวดเร็ว
  - ซิงก์การเปลี่ยนแปลงชื่อโฟลเดอร์ไปยังทุก Connection ผ่าน `useConnectionStore` และเซฟลง Backend

### Phase 21: Query History & Saved SQL Snippets Manager (✅ เสร็จสมบูรณ์ - Issue #45)
- **Query History Tracking:** บันทึกประวัติคำสั่ง SQL ที่รันผ่าน Query Editor ทุกครั้ง (SQL, timestamp, execution time, row count, status, connection & database name) สูงสุด 200 รายการลงใน Local Storage
- **SQL Snippets Management:** ระบบบันทึก Snippets ที่ใช้บ่อย พร้อมระบุชื่อ (Title), รายละเอียด (Description), หมวดหมู่/แท็ก (Category/Tags) และคำสั่ง SQL พร้อม Built-in Presets ที่มีประโยชน์
- **Slide-over History & Snippets Drawer:** แผงควบคุมสไตล์ Drawer บนหน้าต่าง Query Editor ให้ค้นหาคำสั่งย้อนหลัง, กรองตาม Connection, พรีวิวโค้ด, คัดลอก, แทรกคำสั่งลงใน Editor หรือกดรันซ้ำได้ทันที

### Phase 22: Query Explain & Execution Plan Viewer (✅ เสร็จสมบูรณ์ - Issue #46)
- **Multi-Engine Explain Query Builder:** เพิ่ม `buildExplainSql(rawSql, driver, isAnalyze, format)` รองรับ:
  - PostgreSQL: `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON)` หรือ `EXPLAIN`
  - MySQL: `EXPLAIN FORMAT=JSON` หรือ `EXPLAIN ANALYZE` (MySQL 8.0.18+)
  - SQLite: `EXPLAIN QUERY PLAN`
- **Editor Toolbar Integration:** เพิ่มปุ่ม "Explain" และตัวเลือก "Explain Analyze" บนแถบเครื่องมือของ Query Editor
- **Execution Plan Viewer:** แสดงผลแผนการทำงานของ Query ทั้งแบบ Plan Node Tree, Summary Metrics (Planning/Execution Time, Total Cost, Estimated Rows) และ Raw Engine Output ให้ตรวจสอบได้อย่างละเอียด

### Phase 23: Foreign Keys & Constraints Manager in Table Designer (✅ เสร็จสมบูรณ์ - Issue #47)
- **Foreign Key & Constraint SQL Helpers:** เพิ่ม SQL ดึงข้อมูล Metadata ของคีย์นอก (Foreign Keys) และข้อกำหนด (Check/Unique Constraints) สำหรับ PostgreSQL, MySQL, SQLite
- **DDL Builders:** พัฒนาคำสั่ง `buildAddForeignKeySql`, `buildDropForeignKeySql`, `buildAddConstraintSql`, `buildDropConstraintSql` ปลอดภัยตามแต่ละ Dialect
- **Table Structure Editor Sub-tabs:**
  - เพิ่มแถบ "Foreign Keys": ดูรายการ FK, สร้าง Foreign Key ใหม่ระบุ Column, Referenced Table/Column, Action Rules (CASCADE, RESTRICT, SET NULL, NO ACTION) และลบ FK
  - เพิ่มแถบ "Constraints": ดูรายการข้อกำหนด (CHECK / UNIQUE), สร้าง Constraint ใหม่ และลบ Constraint พร้อม Live SQL Preview และ Confirmation Dialog

### Phase 24: Application Brand Icon & Visual Identity Upgrade (✅ เสร็จสมบูรณ์ - Issue #48, #49)
- **Icon Design Concept:** ออกแบบไอคอนแอปพลิเคชัน DataCore สไตล์ Luxury & Minimalist สำหรับ macOS Dock และเดสก์ท็อป โดยใช้รูปทรงกระบอกฐานข้อมูล (Database Cylinder Core) วัสดุ Obsidian/Titanium พร้อมแกนกลางคริสตัลเรืองแสง Sapphire Blue และแสงสะท้อน Frosted Glass Champagne Gold
- **Brightness & Radiance Enhancement (Issue #49):** ปรับจูนระดับความสว่าง (Brightness) และความสดของแกนคริสตัลเรืองแสง (Saturation & Contrast) เพื่อเพิ่มความคมชัด สว่างสดใส และโดดเด่นบนแถบ macOS Dock และพื้นหลังสีเข้ม
- **Cross-Platform Asset Regeneration:** แปลงและสร้างไอคอนความละเอียดสูงครอบคลุมทุกแพลตฟอร์มด้วย `pnpm tauri icon` ประกอบด้วย `.icns` (macOS), `.ico` (Windows), หลากหลายขนาด PNG สำหรับ Linux/Web/Mobile
- **Web Favicon Update:** อัปเดต `index.html` และ asset ใน `public/` ให้เชื่อมโยงกับไอคอนใหม่ของแอปอย่างกลมกลืน

### Phase 25: Enterprise Capabilities — Transactions, Performance & Security Audit Manager (✅ เสร็จสมบูรณ์ - Issue #50)
- **1. Data Integrity & Transactions (ACID):**
  - **Transaction Isolation Level Selector:** ตัวเลือกตั้งค่าระดับ Isolation (Read Committed, Repeatable Read, Serializable, Read Uncommitted) บน Query Editor Toolbar
  - **Savepoint Management:** คำสั่งสร้าง Savepoint, Rollback to Savepoint, และ Release Savepoint
  - **Lock & Concurrency Inspector:** หน้าต่างตรวจสอบ Active Sessions, Table/Row Locks, ตรวจจับ Deadlock พร้อมปุ่ม Terminate / Kill Blocking Query
- **2. Performance & Optimization:**
  - **Extended Index Support:** รองรับการสร้าง Index หลายประเภท (B-Tree, Hash, GIN, GiST, Full-text, Composite, Unique) ใน Table Designer
  - **Server Cache & Performance Dashboard:** มอนิเตอร์สถิติ Buffer Cache Hit Ratio, Deadlocks, Database Storage Stats
  - **Table Partitioning Viewer:** แสดงข้อมูลแถบ Partitions ของตารางขนาดใหญ่ (Partition Key, Expression, Row Counts, Storage Size)
  - **Views & Materialized Views Management:** ตรวจสอบคำสั่ง View DDL และปุ่ม Refresh Materialized View (สำหรับ PostgreSQL)
- **3. Security & Auditing:**
  - **Audit Logging System (`useAuditLogStore`):** บันทึกประวัติกิจกรรมและการเข้าถึงข้อมูล (Who, What, When, Connection, Query, Rows Affected, Status)
  - **Audit Log Viewer Modal:** หน้าต่างค้นหา กรองตามกิจกรรม/ช่วงเวลา และส่งออกข้อมูล Audit Log เป็น CSV/JSON

### Phase 26: Tools Menu in MainToolbar (✅ เสร็จสมบูรณ์ - Issue #51)
- **MainToolbar Tools Menu:**
  - เพิ่มปุ่มเมนู Dropdown `Tools` บนแถบเครื่องมือหลักของแอปพลิเคชัน (`MainToolbar`) ข้างปุ่ม Table และ Backup
  - รวมเมนูเครื่องมือวิเคราะห์และวินิจฉัยฐานข้อมูลระดับแอปพลิเคชัน:
    - **Performance & Metrics:** เข้าถึงสถิติ Buffer Cache Hit Ratio และขนาด Database ได้ทันที
    - **Lock Inspector & Concurrency:** ตรวจสอบ Active Locks / Sessions และปลด Deadlock ได้จากทุกหน้าจอ
    - **Security & Audit Log:** เข้าถึงประวัติความปลอดภัย Audit Trail ได้ตลอดเวลา
    - **Query History & Snippets:** ดูประวัติการคิวรีและเรียกใช้คำสั่ง SQL Snippet ที่บันทึกไว้ได้โดยตรง พร้อมความสามารถในการเปิดหรือแทรกลงใน Query Tab
- **Global Modals & Drawers Integration (`App.tsx`):**
  - ยกระดับ State การเปิด/ปิด Metrics, Locks, Audit Log, และ History & Snippets มาไว้ที่ระดับ App Root
  - ผู้ใช้สามารถเข้าถึงเครื่องมือสำคัญเหล่านี้ได้ทันทีที่มีการเลือกการเชื่อมต่อ (Active Connection) โดยไม่จำเป็นต้องเปิดแท็บ New Query ก่อน













