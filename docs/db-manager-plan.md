# แผนโปรเจกต์โปรแกรมจัดการฐานข้อมูล (DataCore)

สถาปัตยกรรม Tech Stack และฟีเจอร์สำหรับ macOS Apple Silicon
รองรับ SQLite, PostgreSQL, MySQL (พร้อมรองรับ DuckDB และ MSSQL)

## 1. ภาพรวมโปรเจกต์

แอปพลิเคชันเดสก์ท็อปสำหรับเชื่อมต่อและจัดการฐานข้อมูล มุ่งเน้นความเรียบง่าย คล่องตัว และประหยัดทรัพยากรบน Apple Silicon (M1/M2/M3/M4) ออกแบบให้ใช้งานสะดวก เปิดแอปแล้วเห็นรายการ connection ทางซ้าย เปิดใช้งานได้หลายแท็บพร้อมกัน และสามารถเรียกดูหรือแก้ไขข้อมูลในตารางได้อย่างราบรื่น

**แนวทางที่เลือก:** Tauri 2 + Rust + React (TypeScript) เพื่อให้ได้ไฟล์แอปพลิเคชันขนาดกะทัดรัด (ประมาณ 10 MB) ใช้หน่วยความจำอย่างคุ้มค่า และมีเครื่องมืออำนวยความสะดวกในการทำงานครบครัน

## 2. ตัวอย่างหน้าตาโปรแกรม

> ภาพด้านล่างเป็น mockup ที่ออกแบบขึ้นเพื่อแสดงแนวคิด UI ไม่ใช่ภาพจากโปรแกรมจริง (ไฟล์ต้นฉบับ SVG อยู่ในโฟลเดอร์ `images/`)

### 2.1 หน้าต่างหลัก: Object Browser + Query Editor + Data Grid

![หน้าต่างหลัก](images/01-main-window.png)

- ซ้าย: ต้นไม้ connection → database → schema → table พร้อมระบบสีไอคอนสถานะการเชื่อมต่อ 4 ระดับ (ยังไม่ได้เชื่อมต่อ = สีเทา, กำลังเชื่อมต่อ = สีส้ม, เชื่อมต่อแล้ว = สีเขียว, เชื่อมต่อล้มเหลว = สีแดง) โดยลูกศร expander จะแสดงก็ต่อเมื่อเชื่อมต่อสำเร็จแล้วเท่านั้น เพื่อความเป็นระเบียบเรียบร้อย พร้อมการควบคุม Connect / Disconnect ผ่าน Context Menu หรือการคลิก/ดับเบิ้ลคลิก โดยเมื่อเลือก Disconnect จะทำการตัดการเชื่อมต่อจริงในระดับ Backend (Teardown & Rollback Sessions ทั้งหมดของ connection นั้น) พร้อมทั้งปิด Tabs ที่เชื่อมโยง และรีเซ็ตสถานะเป็นยังไม่ได้เชื่อมต่อ (สีเทา และซ่อนลูกศร)
- บน: หลายแท็บ (Query, Table, Designer) แถบเครื่องมือ พร้อมปุ่ม Auto-Commit / Commit / Rollback
- กลาง: SQL editor พร้อม syntax highlighting และ autocomplete
- ล่าง: กริดผลลัพธ์ Glide Data Grid แก้ไขช่องได้ แสดง NULL ชัดเจน แบ่งหน้าทีละ 100 แถว พร้อมปุ่มเปิด Cell Detail Drawer สำหรับดู JSON/Text ยาว, แถบฟิวเตอร์ค้นหาข้อมูล (Filter Bar Builder พร้อม SQL WHERE preview และปุ่ม Toggle), และระบบไฮไลท์ทั้งแถวเมื่อคลิกที่หมายเลขของแถว รองรับ Multi-row selection ด้วย Shift/Cmd

### 2.2 หน้าต่างสร้าง Connection

![สร้าง Connection](images/02-connection-dialog.png)

- เลือกชนิดฐานข้อมูล, ใส่ host/port/user/password
- รองรับการกรอกรหัสผ่านโดยตรงและตัวเลือก Remember password:
  - **เมื่อเลือก Remember password:** จัดเก็บรหัสผ่านอย่างปลอดภัยใน Local Encrypted Vault เข้ารหัสด้วย AES-256-GCM ที่ `~/.datacore/vault.enc` (file permission 0600) พร้อมไฟล์กุญแจ `~/.datacore/.vault.key` มี Magic header `DCV1` พร้อมระบบ auto-migration จากกุญแจ legacy 32-byte อัตโนมัติ (Issue #81) **คงอยู่ข้ามการปิด-เปิดโปรแกรมและการ restart เครื่อง** โดยไม่ต้องกรอกรหัสผ่านซ้ำ ไม่มีการบันทึก Plaintext ลงไฟล์คอนฟิก และปิดการเรียกใช้งาน OS Keychain โดยสมบูรณ์เพื่อป้องกันหน้าต่างขอสิทธิ์ของระบบปฏิบัติการ
  - **เมื่อไม่เลือก Remember password:** จัดเก็บรหัสผ่านเฉพาะในหน่วยความจำ RAM (In-Memory SessionManager) ชั่วคราวระหว่างการใช้งานในระดับ Session ช่วยให้เปิดแท็บหรือคิวรีต่อเนื่องได้โดยไม่ต้องกรอกรหัสผ่านซ้ำ และจะถูกล้างทิ้งทันทีเมื่อตัดการเชื่อมต่อ (Disconnect) ปิดโปรแกรม หรือ restart เครื่อง (Issue #73) โดยไม่ล้างรหัสใน RAM ทิ้งหากผู้ใช้ไม่ได้ตั้งใจลบ
- เลือกโหมด SSL (`disable`, `prefer`, `require`, `verify-ca`, `verify-full`) พร้อมแท็บจัดการความปลอดภัยและการเชื่อมต่อขั้นสูง (Issue #78):
  - **SSL / TLS Certificates:** กำหนดไฟล์ CA Certificate (`ca_cert_path`), Client Certificate (`client_cert_path`), และ Client Key (`client_key_path`) สำหรับการเชื่อมต่อ mutual TLS (mTLS) ไปยัง PostgreSQL และ MySQL
  - **SSH Tunnel (Jump Host / Bastion):** รองรับการทำ SSH Tunneling ผ่าน Bastion Host ด้วยการพิสูจน์ตัวตนผ่าน Private Key (พร้อม Passphrase) หรือ Password
  - **Advanced Configuration:** ตั้งค่า Connection Timeout (วินาที) และเปิด/ปิดระบบ Auto-reconnect เพื่อฟื้นฟูการเชื่อมต่ออัตโนมัติเมื่อเครือข่ายขัดข้อง
- ปุ่ม Test Connection แสดงผลและเวลาตอบสนอง (latency) แบบ real-time

### 2.3 Table Designer

![Table Designer](images/03-table-designer.png)

- แก้ไขคอลัมน์ ชนิดข้อมูล, Nullable, Primary Key และ Default Value
- แท็บโครงสร้างตารางครอบคลุม: Columns, Indexes (B-Tree, Hash, GIN, GiST, Full-text, Composite, Unique), Foreign Keys, Constraints (CHECK / UNIQUE), และ Security (Row-Level Security / RLS Policy Manager)
- แถบ SQL Preview แสดงคำสั่ง DDL แบบ Real-time พร้อมปุ่มคัดลอก DDL Script

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
- **Filter Bar (แถบตัวกรองข้อมูล):** แถบฟิวเตอร์ค้นหาข้อมูลแบบ Filter Builder สามารถระบุ `[Column] [Operator] [Value]` พร้อมปุ่ม `+ Add Condition` ตัวเชื่อม `AND` / `OR`, Checkbox เปิด/ปิดเงื่อนไข, ปุ่ม Clear, ปุ่ม Apply, กด Enter เพื่อ Apply ทันที และพรีวิว SQL WHERE clause (กรองระดับ Server-side สำหรับ Table Tab และ In-memory สำหรับ Query Tab พร้อมจดจำ State แยกตามแต่ละแท็บ)
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

### ระดับ 2: สำหรับ Remote (เสร็จสมบูรณ์ - Issue #78)

- **SSL/TLS พร้อมเลือก CA / client certificate:** รองรับโหมด SSL หลากหลาย (`disable`, `prefer`, `require`, `verify-ca`, `verify-full`) พร้อมการกำหนด path สำหรับ CA certificate, client certificate, และ client key รองรับ mTLS บน PostgreSQL และ MySQL
- **SSH Tunnel (password / private key):** รองรับการเชื่อมต่อผ่าน Bastion / Jump Host ด้วยการพิสูจน์ตัวตนผ่าน SSH Private Key (พร้อม Passphrase) หรือ Password
- **Connection Timeout และ Auto-reconnect:** กำหนดเวลา timeout เป็นวินาที และเปิด/ปิดระบบ auto-reconnect อัตโนมัติเมื่อหลุดการเชื่อมต่อ
- รองรับ connection string (เช่น `postgres://...`)
- แสดงสถานะการเชื่อมต่อ (Ping / Active state / Latency badge)

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
- **Table Structure Editor & Constraint Management (Phase 23 - เสร็จสมบูรณ์)**:
  - จัดการ Columns, Indexes, Foreign Keys, และ Constraints อย่างเต็มรูปแบบ
  - รองรับ Foreign Key สำหรับ PostgreSQL และ MySQL ผ่าน `ALTER TABLE ... ADD/DROP CONSTRAINT`
  - สำหรับ SQLite ซึ่งไม่รองรับ `ALTER TABLE ADD/DROP CONSTRAINT` ระบบสร้าง Table-rebuild migration script อัตโนมัติ (`PRAGMA foreign_keys = OFF` -> `BEGIN TRANSACTION` -> `CREATE TABLE ..._datacore_rebuild` พร้อม Foreign Key ใหม่โดยคงค่า DEFAULT, UNIQUE, CHECK, AUTOINCREMENT ครบถ้วน -> Copy ข้อมูล -> Drop เดิม -> Rename -> `COMMIT` -> `PRAGMA foreign_keys = ON`) ภายใต้ atomic batch execution และแสดงคำแนะนำแก่ผู้ใช้ (Issue #79)
- **การจัดการตารางและการถ่ายโอนข้อมูลขั้นสูง (ดู [Technical Design Doc](designs/table_management_and_data_transfer.md))**:
  - **Table List View (เสร็จสมบูรณ์)**: หน้าจอภาพรวมตารางระดับ Database/Schema ในรูปแบบ Detailed Metadata Grid (Glide Data Grid แสดง Estimated Rows ปราศจาก Table Lock, Data Size, Index Size, Storage Engine, Collation พร้อม Search Filter ค้นหาชื่อตาราง)
  - **Table List Context Menu**: เมนูคลิกขวาบนแถวตารางใน Table List View (Open Data, Design Structure, Duplicate Table, Copy Table to DB, Export as SQL Dump, Export Table Data, Import as SQL Dump, Import Table Data, Copy Table Name, Drop Table)
  - **Duplicate Table (Native SQL Quick Clone - เสร็จสมบูรณ์)**: เมนูลัดคลิกขวาที่ตารางเพื่อโคลนโครงสร้างและข้อมูลลงใน schema เดียวกันอย่างรวดเร็วระดับมิลลิวินาที ผ่านคำสั่ง Native SQL ของฐานข้อมูลเดิมโดยตรง (`CREATE TABLE ... LIKE / AS SELECT`) ไม่กินหน่วยความจำฝั่ง Client
  - **Cross-Database Table Copy (Cross-Database Data Transfer)**: คัดลอกตารางจากฐานข้อมูล A ไป B ข้ามการเชื่อมต่อและข้ามเอนจิน (SQLite, MySQL, PostgreSQL) พร้อมระบบ Auto Type Mapping และสตรีมข้อมูลผ่าน Batch INSERT ใน Rust โดยใช้ `CellValue` ดั้งเดิมตรงตามประเภทข้อมูล ปราศจากการแปลงเป็น String ที่ทำให้เกิด Data Coercion สูญเสียเลขศูนย์นำหน้า หรือทำให้ข้อความ `"NULL"` กลายเป็นค่าว่าง/SQL NULL (Issue #67)
  - **Data Transfer & Import Reliability**:
    - จัดการ Transaction ในการ Import แบบ atomic อย่างถูกต้องสมบูรณ์ ตรวจจับและส่งต่อข้อผิดพลาด (propagate error) จากคำสั่ง `BEGIN`, `COMMIT`, และ `ROLLBACK` หากเกิดความล้มเหลวในระหว่าง batch พร้อม rollback และแจ้งเตือนผู้ใช้อย่างโปร่งใส ไม่กลืน error (Issue #69)
    - รักษาความถูกต้องของชนิดข้อมูล (Data Integrity): คงค่า empty string `""` และเลขศูนย์นำหน้า (Leading Zeroes) เช่น `"01234"` ไม่แปลงเป็นตัวเลขโดยพลการ พร้อมรองรับตัวเลือก `treat_empty_as_null` และการระบุ `target_type` จาก Schema ต้นทาง/ปลายทาง (Issue #67)
  - **SQL Import / Export (เสร็จสมบูรณ์)**:
    - *Export SQL:* สร้างไฟล์ Dump `.sql` เลือกได้ทั้ง Structure Only, Data Only, หรือ Structure & Data พร้อม Multi-row Batch INSERT (500–1,000 แถว) โดยเมื่อไม่ได้ระบุ tableName (เช่น การ Backup ทั้ง Database/Schema) ระบบจะดึงรายชื่อตารางทั้งหมดในฐานข้อมูลมาสร้าง dump ให้โดยอัตโนมัติ ไม่ได้ไฟล์ dump ว่างเปล่า (Issue #74)
    - *Import SQL:* ตัวอ่านและรันคำสั่งสตรีมมิ่ง `BufReader` ใน Rust รัน statement-by-statement รองรับไฟล์ขนาดใหญ่ระดับหลาย GB (เพดาน RAM < 32MB) กรองและตัดทิ้งคำสั่ง `DELIMITER` ของ MySQL อัตโนมัติ ป้องกัน Syntax Error, ป้องกันการ panic จาก byte/char slice เมื่อพบอักขระ Unicode / ภาษาไทยก่อนคอมเมนต์ (Issue #68) และรองรับการสั่งยกเลิก (Cancellation) ผ่าน Cancellation Token ที่ยกเลิกได้จริงทั้งฝั่ง Frontend และ Backend พร้อม Rollback ทันที (Issue #74)
    - *Streaming Data Import & Cancellation:* ตัวอ่านไฟล์ CSV และ JSON (NDJSON / Array) ทำงานแบบ chunked stream ประมวลผลทีละ batch_size ไม่โหลดไฟล์ทั้งหมดเข้า RAM เป็น `Vec` ในครั้งเดียว และปุ่ม Cancel ใน Data Import Wizard จะส่งสัญญาณ cancellation token ไปยัง Rust backend เพื่อหยุดการประมวลผลและ Rollback transaction ทันที (Issue #74)
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
- ปุ่ม Commit รวมคำสั่ง SQL รันเป็น Atomic Transaction ครอบด้วย `BEGIN` และ `COMMIT` พร้อมสั่ง `ROLLBACK` อัตโนมัติหากมีคำสั่งใดล้มเหลว (Issue #80) และปุ่ม Discard คืนค่าเดิม

### Phase 8: DataGrid Input Sanitization & Smart Type Handling (✅ เสร็จสมบูรณ์ - Issue #32)
- **Data/Time Type Sanitization:** จัดการการแก้ไขช่องวันที่/เวลา (`timestamp`, `timestamptz`, `date`, `time`) อย่างปลอดภัย หากผู้ใช้กรอก `0`, `""` หรือ `null` ในคอลัมน์ที่เป็น Nullable จะถูกแปลงเป็น `NULL` อัตโนมัติ ป้องกัน Database Error เช่น `date/time field value out of range: "0"`
- **Date Keyword Support:** รองรับการพิมพ์คีย์เวิร์ดพิเศษ เช่น `now`, `now()`, `CURRENT_TIMESTAMP` เพื่อกำหนดเป็นเวลาปัจจุบันของฐานข้อมูล
- **Numeric & Nullable Handling:** การเคลียร์ค่าเป็นช่องว่างในคอลัมน์ตัวเลข (`int`, `numeric`, `float`) หรือข้อความที่เป็น Nullable จะถูกแปลงเป็น `NULL` แทน Empty String ป้องกัน Type Mismatch Error ใน PostgreSQL/MySQL
- **User Feedback & Status Badges:** ปรับปรุงข้อความแจ้งเตือนสถานะเมื่อทำการ Auto-Commit หรือเกิด Error ให้สื่อสารชัดเจนและเข้าใจง่าย

### Phase 9: Native Confirmation Dialog & Safe Row Deletion (✅ เสร็จสมบูรณ์ - Issue #33)
- **Async Dialog Handling:** แก้ไขบั๊กการกดยกเลิกการลบแถวแต่รายการยังถูกลบ โดยเปลี่ยนจากการใช้ `window.confirm()` แบบซิงโครนัส (ซึ่งในสภาพแวดล้อม Tauri/WebKit จะคืนค่าเป็น `Promise` เสมอ ทำให้ถูกประเมินเป็น `true` ก่อนที่ผู้ใช้จะคลิก) มาเป็น `confirmDialog()` helper ที่เรียกใช้ `@tauri-apps/plugin-dialog` อย่างเป็นทางการ พร้อม `await` การตัดสินใจของผู้ใช้อย่างแท้จริง
- **Safe Row & Multi-Row Deletion:** การลบแถวเดี่ยวและหลายแถวทั้งใน `DockLayout.tsx` และ `DataGrid.tsx` ต้องรอผลตอบกลับจาก Dialog ก่อนส่งคำสั่ง DELETE ไปยังฐานข้อมูลเสมอ หากกดยกเลิก (Cancel) จะไม่ทำรายการใดๆ ทั้งสิ้น
- **Safe DML Row Scope & Non-PK Guards (Issue #66):** ปรับปรุง `buildWhereClause`, `buildUpdateSql`, และ `buildDeleteSql` ให้ใช้เฉพาะ Primary Key ที่แท้จริง (`is_primary_key === true`) โดยยกเลิกการเดาคอลัมน์จากชื่อ และกรณีตารางไม่มี PK จะใช้ Single-row Guard (`LIMIT 1` บน MySQL, Subquery `rowid` บน SQLite, Subquery `ctid` บน PostgreSQL) เพื่อป้องกันการแก้ไขหรือลบข้อมูลเกิน 1 แถวโดยไม่ตั้งใจ (Mass Update/Delete)
- **Connection Deletion & Mode Toggling:** ปรับปรุงจุดยืนยันทั้งหมดในระบบให้เป็นแบบ Async เช่น การลบ Connection ใน `ObjectBrowser` และการสลับโหมดจาก Staging Mode ไป Auto-Commit เมื่อมี Pending Changes
- **Universal Destructive Action Guards (Issue #76):** ปรับปรุง `LockInspectorModal`, `SavepointModal`, `AuditLogDrawer`, และ `HistorySnippetsDrawer` ให้เรียกใช้ `showConfirmDialog` ของ Tauri เสมอ เพื่อป้องกันการ auto-confirm หรือไม่แสดงกล่องยืนยันใน WebKit/Tauri desktop runtime

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
- **Execution Plan Viewer:** แสดงผลแผนการทำงานของ Query ทั้งแบบ Structured Plan Node Tree, Summary Metrics (Planning/Execution Time, Total Cost, Estimated Rows, Actual Rows) และ Raw Engine Output ให้ตรวจสอบได้อย่างละเอียด โดยมีโมดูล Plan Parser (`planParser.ts`) สกัดโครงสร้าง hierarchy จริง (ทั้ง JSON และ Text) จาก PostgreSQL, MySQL และ SQLite ปราศจากการคาดเดาด้วย indentation เพียงอย่างเดียว (Issue #77)

### Phase 23: Foreign Keys & Constraints Manager in Table Designer (✅ เสร็จสมบูรณ์ - Issue #47)
- **Foreign Key & Constraint SQL Helpers:** เพิ่ม SQL ดึงข้อมูล Metadata ของคีย์นอก (Foreign Keys) และข้อกำหนด (Check/Unique Constraints) สำหรับ PostgreSQL, MySQL, SQLite
- **DDL Builders:** พัฒนาคำสั่ง `buildAddForeignKeySql`, `buildDropForeignKeySql`, `buildAddConstraintSql`, `buildDropConstraintSql` ปลอดภัยตามแต่ละ Dialect
- **Table Structure Editor Sub-tabs:**
  - เพิ่มแถบ "Foreign Keys": ดูรายการ FK, สร้าง Foreign Key ใหม่ระบุ Column, Referenced Table/Column, Action Rules (CASCADE, RESTRICT, SET NULL, NO ACTION) และลบ FK
  - เพิ่มแถบ "Constraints": ดูรายการข้อกำหนด (CHECK / UNIQUE), สร้าง Constraint ใหม่ และลบ Constraint พร้อม Live SQL Preview และ Confirmation Dialog

### Phase 24: Application Brand Icon & Visual Identity Upgrade (✅ เสร็จสมบูรณ์ - Issue #48, #49, #53)
- **Icon Design Concept:** ออกแบบไอคอนแอปพลิเคชัน DataCore สไตล์ Luxury & Minimalist สำหรับ macOS Dock และเดสก์ท็อป โดยใช้รูปทรงกระบอกฐานข้อมูล (Database Cylinder Core) วัสดุ Obsidian/Titanium พร้อมแกนกลางคริสตัลเรืองแสง Sapphire Blue และแสงสะท้อน Frosted Glass Champagne Gold
- **Brightness & Radiance Enhancement (Issue #49):** ปรับจูนระดับความสว่าง (Brightness) และความสดของแกนคริสตัลเรืองแสง (Saturation & Contrast) เพื่อเพิ่มความคมชัด สว่างสดใส และโดดเด่นบนแถบ macOS Dock และพื้นหลังสีเข้ม
- **Squircle Border Masking & Transparent Background (Issue #53):** ตัดพื้นหลังสี่เหลี่ยมทึบภายนอกขอบมน (Squircle Border) ออกให้เป็น Transparent Background ตามดีไซน์ พร้อม Anti-aliasing ขอบมนคมชัด และปรับขนาด Squircle ให้เข้ากับมาตรฐาน macOS Human Interface Guidelines (824x824 ใน canvas 1024x1024) ขจัดขอบสี่เหลี่ยมแข็ง ให้แสดงผลบน macOS Dock อย่างโค้งมน หรูหรา สวยงาม
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

### Phase 27: Row-Level Security (RLS) Manager & In-Transit (TLS) and At-Rest Encryption (✅ เสร็จสมบูรณ์ - Issue #52)
- **1. Row-Level Security (RLS) Management:**
  - **RLS Enable/Disable Toggle:** ควบคุมสิทธิ์ความปลอดภัยระดับแถว (`ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY`) ในแท็บ Security ของ TableStructureEditor พร้อมปิดการใช้งานปุ่ม Toggle บน Driver ที่ไม่รองรับ (MySQL/SQLite) และแปลงค่า `CellValue` Rust อย่างถูกต้อง (Issue #70)
  - **RLS Policy Manager:** ตรวจสอบรายการ Policy (Name, Command, Roles, USING Expression, WITH CHECK Expression), สร้าง Policy ใหม่ และลบ Policy (`CREATE POLICY` / `DROP POLICY`) โดย unwrap ค่า `CellValue` เพื่อไม่ให้แสดงผลเป็น `[object Object]` (Issue #70) พร้อม escape schema/table name ใน query RLS (Issue #64)
- **2. In-Transit Encryption (TLS/SSL):**
  - **Rust Backend SSL Driver Support:** รองรับ `ssl_mode` (`disable`, `prefer`, `require`, `verify-ca`, `verify-full`) บน PostgreSQL และ MySQL (`sqlx::postgres::PgSslMode`, `sqlx::mysql::MySqlSslMode`)
  - **Connection TLS Form & Contract Sync (Issue #63):** เพิ่มตัวเลือก SSL Mode พร้อมคำอธิบายความปลอดภัย และ sync data contract ทั้ง `ssl_mode` และ `sslMode` (serde alias) ระหว่าง Frontend กับ Rust Backend โดยส่งค่าที่ผู้ใช้เลือกไปยัง `testConnection` และ `saveConnection` อย่างครบถ้วน
  - **Live Connection Encryption Inspector:** หน้าจอตรวจสอบสถานะการเชื่อมต่อ TLS แบบ Real-time (Cipher Suite, TLS Protocol Version, Key Exchange Bit Strength) ผ่านคำสั่ง `pg_stat_ssl` / MySQL `Ssl_cipher`
- **3. At-Rest Encryption Status Detection (Issue #72):**
  - ตรวจสอบสถานะการเข้ารหัสข้อมูลระดับดิสก์ (Transparent Data Encryption / Tablespace Encryption) ของฐานข้อมูลจริงอย่างแม่นยำ ปราศจาก False Positive โดยไม่ตัดสินจากเพียง row count (`rows.length > 0`) แต่ตรวจสอบค่า configuration variable จริง (เช่น `innodb_encrypt_tables = 'ON'`, `data_encryption = 'on'`, `PRAGMA cipher_version`) และแยกสถานะ `Encrypted (TDE Active)`, `Unencrypted at Rest`, และ `Unknown / Unsupported` ได้อย่างถูกต้อง
- **3. At-Rest Encryption (การเข้ารหัสขณะจัดเก็บ):**
  - **Local Encrypted Vault Dashboard & Machine-Bound Key (Issue #65):** แสดงสถานะการเข้ารหัสรหัสผ่านในเครื่องด้วย AES-256-GCM (`~/.datacore/vault.enc`, file permission 0600) โดยกุญแจเข้ารหัสถูก obfuscate ด้วย Machine-Derived Key (IOPlatformUUID/SHA-256) ไม่บันทึก plaintext key บนดิสก์, ตรวจสอบผลลัพธ์ของ chmod 0600 อย่างเข้มงวด และล้าง in-memory cache ใน RAM เมื่อตัดการเชื่อมต่อ
  - **Database At-Rest Encryption Status:** ตรวจสอบคุณสมบัติ Transparent Data Encryption (TDE) หรือการเข้ารหัสไฟล์ฐานข้อมูลของเซิร์ฟเวอร์

### Phase 28: Visual ER Diagram Viewer & Designer (✅ เสร็จสมบูรณ์ - Issue #57)
- **1. Schema Introspection for ER Diagram:**
  - ดึงข้อมูล Tables, Columns, Data Types, Nullability, Primary Keys และ Foreign Keys ทั้งหมดของ Database/Schema ในรอบเดียว
  - รองรับทั้ง SQLite (`PRAGMA table_info`, `PRAGMA foreign_key_list`), PostgreSQL (`information_schema`), และ MySQL (`information_schema`)
- **2. Interactive Canvas & Auto-Layout Engine:**
  - Canvas พื้นหลังแบบ Interactive Pan & Zoom พร้อมปุ่ม Zoom In, Zoom Out, Reset Zoom, และ Fit to View
  - อัลกอริทึมจัดวาง Table Nodes แบบ Topological/Grid Hierarchy อัตโนมัติ ป้องกันการทับซ้อน
  - ลากย้ายตำแหน่ง Table Card ได้อย่างอิสระ (Drag & Drop)
  - พับเก็บ/ขยายคอลัมน์ของ Table Card (Collapse/Expand) เพื่อประหยัดพื้นที่
  - วาดเส้นความสัมพันธ์ (Cubic Bézier Foreign Key Lines) พร้อมสัญลักษณ์ Cardinality (1:N, 1:1) และไฮไลท์สีเมื่อนำเมาส์ไปชี้ (Hover Highlight)
- **3. Search, Filter & Export:**
  - ค้นหาตารางในแผนภาพแบบ Quick Search Highlight
  - ส่งออกแผนภาพเป็นไฟล์รูปภาพภาพ SVG (Scalable Vector Graphics) หรือสร้าง DDL SQL Script
- **4. User Interface Integration:**
  - เปิดแท็บ `er-diagram` ได้จากคลิกขวาที่ Database/Schema ใน Object Browser หรือเมนู Tools บน MainToolbar

### Phase 29: Database Schema Comparison & Synchronization (Schema Diff - ✅ เสร็จสมบูรณ์ - Issue #58)
- **1. Schema Introspection & Model Comparison:**
  - เปรียบเทียบโครงสร้างตารางระหว่าง Source และ Target Database (Tables, Columns, Data Types, Nullability, Primary Keys)
  - จำแนกสถานะอย่างแม่นยำ: `identical`, `different`, `only_in_source` (ตาราง/คอลัมน์ใหม่), `only_in_target` (ตาราง/คอลัมน์ที่เกินมา)
- **2. Synchronized DDL Migration Generator:**
  - สร้างคำสั่ง SQL Migration UP Script เพื่อปรับปรุงฐานข้อมูล Target ให้ตรงกับ Source อัตโนมัติ (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `ALTER TABLE DROP COLUMN`, `ALTER TABLE ALTER/MODIFY COLUMN TYPE`)
  - สร้างคำสั่ง SQL Migration DOWN Script สำหรับ Rollback ย้อนคืนการเปลี่ยนแปลง
  - รองรับทั้ง PostgreSQL, MySQL และ SQLite โดยระบุแจ้งเตือน table rebuild บน SQLite สำหรับคำสั่ง ALTER COLUMN/TYPE/NULLABILITY ที่ไม่รองรับ (Issue #71)
  - เพิ่มระบบ Safeguard แยกคำสั่งทำลายข้อมูล (`DROP TABLE`, `DROP COLUMN`) ออกเป็นคอมเมนต์ในค่าเริ่มต้น ป้องกันการลบตารางใน target โดยพลการ โดยต้องเปิดใช้งานตัวเลือก *"Allow destructive DROP"* อย่างชัดเจนก่อนรันคำสั่ง (Issue #71)
  - รองรับการปรับเปลี่ยน Nullability Mismatch (`ALTER COLUMN SET/DROP NOT NULL` บน Postgres และ `MODIFY COLUMN ... NULL/NOT NULL` บน MySQL) (Issue #71)
- **3. Interactive Side-by-Side Diff UI:**
  - หน้าต่าง Modal สลับ Source/Target ได้ในคลิกเดียว พร้อม Quick Search และตัวกรองสถานะ (All, Modified, In Source, In Target)
  - แผงตรวจสอบความแตกต่างของคอลัมน์แบบ Color-coded Side-by-Side Table
  - แถบพรีวิว Migration Scripts พร้อมปุ่ม Copy SQL และ Execute on Target พร้อมระบบ Native Confirmation ป้องกันอุบัติเหตุ
- **4. Toolbar & System Integration:**
  - เชื่อมต่อเมนูเข้าสู่ MainToolbar Tools (`toolbar-tools-schema-diff-btn`) พร้อมเปิดใช้งานได้ทันทีจากทุกหน้าจอ

### Phase 30: Server Activity Monitor & Process List (✅ เสร็จสมบูรณ์ - Issue #59)
- **1. Real-time Process Introspection:**
  - ดึงข้อมูล Active Connections, Sessions, Client Hosts, Running Queries, Execution Durations, และ Lock Waits
  - รองรับทั้ง PostgreSQL (`pg_stat_activity`), MySQL (`information_schema.PROCESSLIST`), และ SQLite (`PRAGMA database_list`)
- **2. Live Metrics & Filtering Suite:**
  - แผงสรุปสถานะการทำงาน: Total Sessions, Active Queries, Idle Connections, Long-running Queries (>10s), และ Locked/Waiting Sessions
  - ตัวกรองข้อความค้นหา (Search Query, User, PID) แบบ Instant Filter
- **3. Real-time Auto-Refresh:**
  - เลือกระยะเวลา Auto-refresh ได้อย่างอิสระ: Manual, ทุก 2 วินาที, ทุก 5 วินาที, ทุก 10 วินาที, หรือทุก 30 วินาที
- **4. Safe Process Cancellation & Termination:**
  - ปุ่มสั่ง Cancel Query เฉพาะคำสั่งที่กำลังรันอยู่โดยไม่ตัดการเชื่อมต่อ (`pg_cancel_backend` / `KILL QUERY`)
  - ปุ่มสั่ง Terminate Session เพื่อตัดการเชื่อมต่อและ Rollback ทรานแซกชันที่ค้างอยู่ (`pg_terminate_backend` / `KILL`) พร้อมกล่องข้อความยืนยันความปลอดภัย Native Confirmation Dialog
  - ลิ้นชัก Query Detail ด้านล่างสำหรับตรวจสอบคำสั่ง SQL ขนาดยาวแบบเต็มพร้อมปุ่ม Copy

### Phase 31: Comprehensive Data Import/Export Wizard (CSV, TSV, JSON - ✅ เสร็จสมบูรณ์ - Issue #60)
- **1. Multi-Step Data Import Wizard (`DataImportWizardModal`):**
  - **Step 1: Source File & Format:** เลือกระบบไฟล์และตรวจจับรูปแบบอัตโนมัติ (CSV, TSV, JSON Array, NDJSON) พร้อมกำหนด Delimiter และ Header Row Toggle
  - **Step 2: Destination Table Selection:** ค้นหาและเลือกตารางเป้าหมายจาก Database/Schema หรือเลือกตารางปัจจุบัน
  - **Step 3: Visual Column Mapping:** จับคู่ Header คอลัมน์จากไฟล์เข้ากับคอลัมน์ของฐานข้อมูล พร้อมตัวเลือกระบุ `-- Ignore Column --` และระบบ Auto-match ชื่อตรงกัน
  - **Step 4: Preview & Error Policy:** พรีวิวข้อมูลตัวอย่าง 10 แถวแรกก่อนเริ่มนำเข้า และกำหนดนโยบายจัดการข้อผิดพลาด: Abort on Error (Rollback อัตโนมัติ) หรือ Skip Bad Rows
  - **Step 5: Execution & Summary Progress:** แสดงหลอดความคืบหน้าแบบ Real-time รายงานจำนวนแถวที่นำเข้าสำเร็จ จำนวนแถวที่ข้าม และระยะเวลาที่ใช้
- **2. Multi-Step Data Export Wizard (`DataExportWizardModal`):**
  - **Step 1: Scope & Format:** เลือกขอบเขตข้อมูล (Entire Table หรือ Filtered Query Rows) และฟอร์แมตไฟล์ (CSV, TSV, JSON Array, NDJSON)
  - **Step 2: Format Options:** ปรับแต่ง Delimiter, Header Row และโครงสร้าง JSON
  - **Step 3: Streaming Destination & Export:** บันทึกไฟล์ผ่าน Native File Picker พร้อมสตรีมข้อมูลขนาดใหญ่และแสดงสรุปผลสำเร็จ
- **3. Toolbar Integration:**
  - เชื่อมต่อเมนู Import Data และ Export Data บน MainToolbar เข้าสู่ระบบ Multi-step Wizard โดยตรง สามารถเลือกตารางเป้าหมายได้แม้ยังไม่ได้เปิดแท็บตารางค้างไว้

### Phase 32: Database User & Privilege Manager (✅ เสร็จสมบูรณ์ - Issue #61)
- **1. User & Role Introspection:**
  - ดึงข้อมูล Database Users, Roles, Hosts, Superuser status, Login permissions, Create DB privileges, และ Assigned Roles / Memberships ผ่าน `pg_auth_members` (PostgreSQL) และ `mysql.default_roles` (MySQL) (Issue #75)
  - รองรับทั้ง PostgreSQL (`pg_roles`) และ MySQL (`mysql.user`)
- **2. User Lifecycle Management:**
  - เพิ่มบัญชีผู้ใช้ใหม่ (Create User/Role) พร้อมตั้งรหัสผ่าน, Host scope, และสิทธิ์พื้นฐาน
  - เปลี่ยนรหัสผ่านผู้ใช้งาน (Alter Password) พร้อมระบบ Input Masking และการยืนยันรหัสผ่าน
  - ลบบัญชีผู้ใช้ (Drop User/Role) พร้อม Native Confirmation Dialog เพื่อความปลอดภัย
- **3. Granular Privilege Configuration (GRANT / REVOKE):**
  - แสดงและปรับแต่งสิทธิ์ระดับตารางและฐานข้อมูลอย่างครบถ้วน: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `ALTER`, `REFERENCES`, `INDEX`, `TRIGGER`, และ `ALL PRIVILEGES` (Issue #75)
  - สั่ง `GRANT` และ `REVOKE` สิทธิ์ไปยังเป้าหมายที่ระบุ (Table / Database) แบบ Real-time
- **4. Integrated Desktop Management Interface:**
  - เมนูเรียกใช้งานจาก Tools dropdown บน MainToolbar (`toolbar-tools-user-manager-btn`)
  - ค้นหาและกรองรายชื่อผู้ใช้งานแบบ Instant Search พร้อมแท็บแยกสัดส่วนชัดเจน: Account Attributes (รวมถึง Assigned Roles Badges), Privileges & Roles, และ Security & Password (Issue #75)
  - ปรับปรุงเสถียรภาพ Lifecycle State Updates (Issue #62) ป้องกัน Infinite Re-render / Infinite Reload Loop ใน React Effect เมื่อโหลดข้อมูลผู้ใช้

---

## 4. สถานะภาพรวมการพัฒนา (Development Status Summary)
- **สถานะ Phase:** ครบถ้วนสมบูรณ์ทั้ง 33 Phase (Phase 1 ถึง Phase 33) พร้อมการแก้ไข Audit & Remediation ทั้ง 19 Issues (#107–#125)
- **ชุดการทดสอบอัตโนมัติ (Automated Test Suite):** รวม 936 tests ผ่าน 100%
  - Rust Backend Unit & Integration Tests: 100/100 passed
  - Frontend Vitest Component & Unit Tests: 836/836 passed
  - Code Quality & Linting: Cargo Clippy (`-D warnings`) ผ่าน 100% ปราศจาก Warning
  - Build & Typecheck: Vite build + tsc ผ่าน 100%
- **ระบบความปลอดภัย (Security):**
  - Zero Plaintext Disk Storage สำหรับรหัสผ่าน (AES-256-GCM Vault)
  - TLS In-Transit Encryption รองรับระดับสูงสุด (`verify-full`)
  - SSH Tunneling พร้อม Guard ป้องกัน Security Bypass
  - Row-Level Security (RLS) และ User Privilege Management (GRANT/REVOKE) บริหารจัดการสิทธิ์ได้ครอบคลุม
  - Tamper-Evident Hash Chain Audit Log (Rust Backend)
  - Mutation Impact Preview Simulation Engine
- **Visual & Platform Polish:**
  - ไอคอนแอปพลิเคชันสไตล์ Luxury Minimalist Squircle ตัดขอบโปร่งใสตามมาตรฐาน Apple macOS HIG
  - รองรับ Apple Silicon ARM64 Native พร้อมทั้ง Dark Mode และ Light Mode อย่างสมบูรณ์แบบ
  - ระบบสองภาษา (i18n: ภาษาไทยและภาษาอังกฤษ) สลับได้ทันทีแบบ Reactive
  - Visual Query Builder (No-Code SELECT Query Builder)
  - Schema-Aware Autocomplete และ SQL Formatter (⌘⇧F) สำหรับ CodeMirror 6
  - Deep Tree Object Browser (Columns/Types/Badges) พร้อม Keyboard Splitter Navigation (A11y)

---

## 5. แผนการปรับปรุงและยกระดับ UX/UI (UX/UI Enhancement Roadmap)

จากการประเมินและตรวจสอบคุณภาพ UX/UI ในระดับ Code-level Review อย่างเป็นระบบเพื่อพัฒนาและยกระดับความสะดวกในการใช้งานอย่างต่อเนื่อง DataCore ได้คะแนนรวม **92 / 120 คะแนน (76.7% — เกรด B)** โดยได้จัดทำแผนงานและเปิด GitHub Issues ครอบคลุมการปรับปรุงทั้งหมด 4 ระยะ ดังนี้:

### 5.1 สรุปตารางคะแนนการประเมิน 12 มิติ
| # | มิติการประเมิน | คะแนน (เต็ม 10) | สถานะ | GitHub Issue ที่เกี่ยวข้อง |
|---|---------------|:--------------:|:-----:|--------------------------|
| 1 | ความสามารถในการใช้งาน (Usability) | **7.5** | 🟡 ดี | Issue #85, #88 |
| 2 | การจัดการการเชื่อมต่อ (Connection Management) | **8.5** | 🟢 ดีมาก | Issue #84, #88 |
| 3 | การสำรวจโครงสร้างข้อมูล (Schema Navigation) | **8.0** | 🟢 ดีมาก | Issue #90, #93 |
| 4 | ตัวแก้ไข SQL (Query Editor) | **8.5** | 🟢 ดีมาก | Issue #87, #89, #91, #92 |
| 5 | การแสดงและแก้ไขข้อมูล (Data Grid) | **8.0** | 🟢 ดีมาก | Issue #89 |
| 6 | ความปลอดภัยและการป้องกันความผิดพลาด (Safety) | **7.0** | 🟡 ดี | Issue #83, #84, #98 |
| 7 | ประสิทธิภาพและการตอบสนอง (Performance & Feedback) | **8.5** | 🟢 ดีมาก | Issue #89 |
| 8 | การจัดการข้อผิดพลาด (Error Handling) | **7.5** | 🟡 ดี | Issue #87 |
| 9 | ความสวยงามและการออกแบบภาพ (Visual Design) | **8.5** | 🟢 ดีมาก | Issue #86 |
| 10 | ความยืดหยุ่นและการปรับแต่ง (Customization) | **6.0** | 🟠 พอใช้ | Issue #86, #90, #94, #97 |
| 11 | การเข้าถึงได้และภาษา (Accessibility & Localization) | **6.5** | 🟠 พอใช้ | Issue #93, #94, #95 |
| 12 | ความเหมาะสมกับกลุ่มผู้ใช้ (User Fit) | **7.5** | 🟡 ดี | Issue #90, #94, #96 |

### 5.2 แผนงานการพัฒนาตามลำดับความสำคัญ (Implementation Phases)

#### 🔴 Phase 0: Critical Safety & State Guardrails (เร่งด่วนที่สุด)
- **Issue #83:** `feat(safety): SQL Guardrail & Dangerous Query Interceptor` — ตรวจจับคำสั่ง `DROP`, `TRUNCATE`, `DELETE/UPDATE` ที่ไม่มี `WHERE` พร้อม Modal ยืนยันความปลอดภัย
- **Issue #84:** `feat(connection): Read-Only Mode & Environment Color Badges (Production/Staging/Development)` — ป้ายสีแยกแวดล้อมและล็อกสิทธิ์อ่านอย่างเดียวบน Production
- **Issue #85:** `feat(workspace): Tab State & Query Content Persistence ข้าม Session` — ป้องกันการสูญเสียแท็บและโค้ด SQL ที่เขียนค้างไว้เมื่อปิดโปรแกรม

#### 🟠 Phase 1: Core UX Polish & Feedback
- **Issue #86:** `fix(theme): บันทึกการตั้งค่า Theme, ขนาด Panel และแก้ไข Hardcoded Dark Mode ในโมดอล` — รองรับ Light Mode 100% และจำขนาดเลย์เอาต์
- **Issue #87:** `feat(editor): SQL Error Positioning ใน CodeMirror และแสดงรายละเอียด Error Callout Panel` — ชี้ตำแหน่งบรรทัดที่ผิดพร้อม Error Callout เต็มรูปแบบ (แยกแยะ Error Code, Error Type, Driver, คำนวณ Line/Column/Offset และไฮไลต์บรรทัดผิดใน CodeMirror พร้อมปุ่ม 1-click Copy Error) *(เสร็จสมบูรณ์)*
- **Issue #88:** `feat(connection): Auto-connect และเปิด Query Tab อัตโนมัติหลังบันทึก Connection ใหม่สำเร็จ` — ลดจำนวนคลิกในการเริ่มต้นใช้งานครั้งแรก
- **Issue #89:** `feat(query): Safe Default LIMIT Guard สำหรับ Custom Query Execution ใน Query Editor` — ป้องกัน RAM เต็มเมื่อรัน custom `SELECT *` ตารางขนาดใหญ่

#### 🟡 Phase 2: Power User Features & Customization
- **Issue #90:** `feat(ux): Command Palette (⌘K) ค้นหาคำสั่ง สลับฐานข้อมูล และเปิดตารางอย่างรวดเร็ว` — ศูนย์กลางสั่งการด้วยคีย์บอร์ดระดับสากล รองรับ ⌘K / ⌘P, จัดหมวดหมู่ Actions, Tables & Views, Connections, ค้นหาแบบ Fuzzy/Prefix (`>`, `@`, `/`), และคีย์ลัดนำทาง Arrow Keys + Enter *(เสร็จสมบูรณ์)*
- **Issue #91:** `feat(editor): Schema-Aware Autocomplete สำหรับ Table, View และ Column ใน SQL Editor` — [COMPLETED]
  - ส่งโครงสร้าง schema dictionary เข้า CodeMirror 6 `sql({ dialect, schema: schemaMap, upperCaseKeywords: true })` ใน `src/components/editor/SqlEditor.tsx`
  - พัฒนา `useSchemaStore` ใน `src/stores/schemaStore.ts` ดึง Metadata ตารางและคอลัมน์ของฐานข้อมูลแบบครบถ้วนในรูปแบบ `Record<string, string[]>`
  - ทำ Cache Invalidation และดึงโครงสร้าง Schema ใหม่แบบอัตโนมัติเมื่อมีการรันคำสั่ง DDL (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`)
- **Issue #92:** `feat(editor): SQL Formatter (⌘⇧F) และ Multi-Result Tabs สำหรับ Batch Script Execution` — [COMPLETED]
  - ผสานรวมไลบรารี `sql-formatter` ใน `src/utils/sqlFormatterHelper.ts` รองรับ dialect ของ PostgreSQL, MySQL และ SQLite
  - เพิ่มปุ่ม Format บน `EditorToolbar.tsx` และคีย์ลัด ⌘⇧F (macOS) / Ctrl+Shift+F (Windows/Linux)
  - พัฒนา Quote-aware SQL Statement Splitter ทั้งใน Rust (`split_sql_statements` ใน `sqlite.rs`) และ Frontend (`sqlSplitter.ts`) ป้องกันปัญหาเครื่องหมาย `;` ใน string literals และ comments
  - รองรับ Multi-Result Tabs บน `DockLayout.tsx` เมื่อรันสคริปต์ที่มีหลาย query statements: แสดงผลลัพธ์แยกแท็บย่อย `Result 1 (users)`, `Result 2 (orders)`, และแท็บ `Messages` สำหรับสรุปผลการรัน
- **Issue #93:** `feat(navigation): ขยาย Object Browser Tree ให้แสดง Columns ใน Sidebar และเพิ่ม Keyboard Splitter Navigation` — [COMPLETED]
  - ขยาย `SchemaNodeType` ทั้งใน Rust (`src-tauri/src/drivers/traits.rs`) และ TypeScript (`src/types/db.ts`) ให้รองรับ `Column`, `Index`, `ForeignKey`, `Trigger`, `Function`, `Procedure`
  - ขยายโหนด Table ใน `src/components/sidebar/ObjectBrowser.tsx` ให้มีลูกศรคลี่ดู Columns พร้อม Data Types และไอคอน PK/FK (โหลดแบบ Lazy-loading เมื่อผู้ใช้กดคลี่ลูกศร)
  - รองรับการลาก (Drag and Drop) คอลัมน์ และการดับเบิลคลิกชื่อคอลัมน์เพื่อแทรกคำลงใน SQL Editor ทันที
  - ปรับปรุง Accessibility ของแถบแบ่งหน้าต่าง (Splitter) ใน `src/components/layout/DockLayout.tsx` เพิ่ม `role="separator"`, `tabIndex={0}`, `aria-orientation="vertical"` และรองรับการปรับขนาดด้วยปุ่มลูกศรซ้าย/ขวาบนคีย์บอร์ด
- **Issue #94:** `feat(shortcuts): Keyboard Shortcuts Expansion และ Keybinding Cheat Sheet Modal (⌘/)` — เพิ่มคีย์ลัดครอบคลุมและหน้าต่างสรุปคีย์ลัด

#### 🟢 Phase 3: Accessibility, Localization & Advanced Capabilities
- **Issue #95:** `feat(i18n): เพิ่มระบบ Internationalization (i18n) รองรับ UI ภาษาไทยและภาษาอังกฤษ` — [COMPLETED]
  - ติดตั้งและตั้งค่า `i18next` และ `react-i18next` พร้อมทรัพยากรแปลภาษาใน `src/locales/th.json` และ `src/locales/en.json`
  - โมดูลหลัก `src/i18n.ts` รองรับการสลับภาษา (th/en) ทันทีโดยไม่ต้อง reload และจำค่าภาษาที่เลือกลงใน `localStorage` (`datacore_language`)
  - เพิ่มปุ่มสลับภาษา (EN / TH) บน MainToolbar และ StatusBar สลับภาษาได้ทันทีแบบ Reactive
  - รองรับการแปลข้อความในส่วนประกอบหลัก ได้แก่ MainToolbar, StatusBar, DockLayout, ConnectionDialog, Export/Import, Tabs และ Modals ต่างๆ
- **Issue #96:** `feat(query): Visual Query Builder (No-Code UI) สำหรับสร้าง SELECT Query` — [COMPLETED]
  - พัฒนาคอมโพเนนต์ `src/components/querybuilder/VisualQueryBuilderTab.tsx` สำหรับสร้าง SELECT Query แบบ No-Code
  - เพิ่มโมดูล `buildSelectQuery` ใน `src/api/queryBuilder.ts` รองรับการสร้าง SQL SELECT ตาม dialect (Postgres, SQLite, MySQL)
  - รองรับการเลือก Base Table, Columns พร้อมตั้งชื่อ Alias, และการประมวลผล Aggregate Function (COUNT, SUM, AVG, MIN, MAX)
  - รองรับการทำ Table JOINs (INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL JOIN) พร้อมกำหนดเงื่อนไข ON
  - รองรับตัวกรองเงื่อนไข (WHERE Filter Conditions: equals, not_equals, contains, starts_with, ends_with, greater_than, less_than, between, is_null, is_not_null) พร้อมสลับการรวมเงื่อนไขแบบ AND / OR
  - รองรับการจัดเรียง (ORDER BY ASC/DESC) และการจำกัดจำนวนแถว (LIMIT / OFFSET) รวมทั้งตัวเลือก DISTINCT
  - แสดงผล Live SQL Preview คู่ขนานแบบ Real-time พร้อมปุ่มคัดลอก SQL ("Copy SQL"), ปุ่มเปิดใน SQL Editor ("Open in SQL Editor"), และปุ่มรัน Query ทันที ("Run Query") แสดงผลลัพธ์ผ่าน DataGrid
  - เชื่อมโยงระบบแท็บผ่าน `openQueryBuilderTab` ใน `src/components/sidebar/tabHelpers.ts`, `src/types/db.ts` และรองรับการเปิดจาก Context Menu ใน Object Browser, Main Toolbar และ Command Palette
- **Issue #97:** `feat(layout): Horizontal Split Layout (Editor ซ้าย / Data Grid ขวา) สำหรับ Ultrawide Monitors` — [COMPLETED]
  - เพิ่มปุ่มสลับ Split Direction บน `EditorToolbar.tsx` รองรับการสลับระหว่าง Vertical Split (บน/ล่าง) และ Horizontal Split (ซ้าย/ขวา)
  - ปรับปรุง Splitter ใน `DockLayout.tsx` และ `SqlEditor.tsx` ให้รองรับการจัดวาง Editor ซ้าย / Data Grid ขวา พร้อมลากปรับสัดส่วนความกว้างได้
  - จดจำการตั้งค่า Split Direction (`datacore-split-direction`) และความกว้าง Editor (`datacore-editor-width`) ลงใน `localStorage` ข้าม session อย่างถาวร
- **Issue #98:** `feat(safety): Impact Preview (Affected Rows Simulation) ก่อนรัน DELETE/UPDATE` — ระบบพรีวิวผลกระทบก่อนรันคำสั่งแก้ไขข้อมูล (Simulation Mode)
  - **Backend IPC:** คำสั่ง `simulate_query_impact(connection_id, sql)` ใน `src-tauri/src/commands/db.rs`
    - ตรวจจับคำสั่งประเภท Mutation (`DELETE` และ `UPDATE`) และชื่อตารางเป้าหมาย
    - รันคำสั่งจำลองภายใต้ Transaction ชั่วคราว (`BEGIN` หรือ `SAVEPOINT`) และการันตีทำการ `ROLLBACK` 100% เสมอ ข้อมูลในฐานข้อมูลจริงไม่เปลี่ยนแปลง
    - ส่งคืนข้อมูล `ImpactSimulationResult` (`is_mutation`, `table_name`, `affected_rows`, `execution_time_ms`, `preview_warning`)
  - **Frontend UI & Safety Guard:**
    - เพิ่มปุ่ม "Impact Preview" (ไอคอน `Eye`) บน `EditorToolbar.tsx`
    - หน้าต่าง `ImpactPreviewModal.tsx` แสดงป้ายเตือนผลกระทบ (เช่น "⚠️ 1,420 rows will be affected")
    - แจ้งเตือนระดับความเสี่ยง (Critical Warning หากไม่มี `WHERE` clause ซึ่งจะลบ/แก้ทั้งตาราง, High Risk หากกระทบเกิน 100 แถว)
    - ปุ่มยืนยัน "Proceed with Run" / "Execute Anyway" หรือ "Cancel" เพื่อความปลอดภัยสูงสุด

---

## 6. แผนการยกระดับความปลอดภัยและสถาปัตยกรรม (Security & Architecture Hardening Roadmap)

จากการประเมินความปลอดภัยตามมาตรฐานระบบจัดการฐานข้อมูล (DBMS Security 10 ด้าน + Desktop/Tauri IPC 2 ด้าน) ได้เปิดและอัปเดต GitHub Issues เพื่อยกระดับความปลอดภัยของ DataCore สู่ระดับ Enterprise-Ready ดังนี้:

### 6.1 ตาราง GitHub Issues ด้านความปลอดภัยและสถาปัตยกรรม
| Issue | หัวข้อ | ระดับความสำคัญ | ขอบเขตงานหลัก |
|---|---|:---:|---|
| **#99** | `security(ssh): เข้ารหัส SSH Passphrase ใน Local Encrypted Vault และล้างสคริปต์ Askpass ใน /tmp ทันทีหลังเชื่อมต่อ` | 🔴 Critical | เข้ารหัส SSH passphrase ใน `vault.enc` ป้องกัน Plaintext ใน `connections.json` และลบไฟล์ askpass ทันทีที่เชื่อมต่อสำเร็จ |
| **#100** | `security(web): กำหนด Content Security Policy (CSP) และเปลี่ยน Table Filter เป็น Parameterized Query ป้องกัน SQL Injection` | 🔴 Critical | กำหนด CSP ใน `tauri.conf.json` และเพิ่มการตรวจสอบ/Sanitize `filter` ใน `fetch_table_data` (บล็อก SQL comment `--`, `/*`, statement termination `;`, stacked queries, และคำสั่งอันตราย `UNION`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `EXEC`, `ALTER`, `TRUNCATE`) |
| **#101** | `security(guardrail): ปรับปรุง Dangerous Query Detector ให้ตรวจจับ Tautology (WHERE 1=1) และตัด String Literals ก่อนตรวจจับ` | 🟠 High | ตัด string literals ก่อนสแกนคีย์เวิร์ด และตรวจจับ Tautology clauses ที่เทียบเท่าคำสั่งลบ/แก้ทั้งตาราง |
| **#102** | `security(privacy): Redact รหัสผ่านใน SQL History/Audit Log และเพิ่มระบบ PII Data Masking บน Data Grid` | 🟠 High | ซ่อนรหัสผ่านในประวัติคำสั่ง (เช่น `CREATE USER ... IDENTIFIED BY`) และเพิ่มปุ่ม Mask ข้อมูลอ่อนไหวบน DataGrid |
| **#103** | `security(audit): ย้าย Audit Log จาก localStorage ไปยัง Rust Backend พร้อม Tamper-Evident Hashing` | 🟠 High | ย้าย Audit Trail ไปบันทึกฝั่ง Rust (`~/.datacore/audit.jsonl` สิทธิ์ 0600) แบบ Append-Only พร้อม Hash Chaining |
| **#104** | `security(transfer): ตรวจสอบความปลอดภัยของพาธไฟล์ (Path Traversal Guard) ใน Data Transfer IPC` | 🟡 Medium | ป้องกัน Path Traversal (`../`) และบล็อกการเขียนทับไฟล์ระบบสำคัญของผู้ใช้ในคำสั่งนำเข้า/ส่งออกข้อมูล |
| **#105** | `security(encryption): เสริมความปลอดภัย Vault Key ด้วย Master Password (Argon2id) และรองรับ SQLCipher สำหรับ SQLite` | 🟡 Medium | เพิ่มตัวเลือก Argon2id Master Password เข้ารหัส `.vault.key` และเปิดฟีเจอร์ SQLCipher สำหรับ SQLite |
| **#106** | `refactor(architecture): แยก Monolithic UI Components (TableStructureEditor, ObjectBrowser, DockLayout) และลบความซ้ำซ้อนใน IPC Parameters` | 🟡 Medium | [COMPLETED] แยก `TableStructureEditor` ออกเป็น 5 Sub-tabs ย่อย, แยก `cellFormatter.ts` และทำความสะอาด Tauri IPC parameters |

### 6.2 การขยายขอบเขตและอัปเดต Issues เดิมที่เกี่ยวข้อง
- **Issue #84 (Read-Only Mode):** [COMPLETED] เพิ่มฟีเจอร์ Environment Color Badges (`development` = สีเขียว Emerald, `staging` = สีส้ม Amber, `production` = สีแดง Red) และ Read-Only Mode พร้อมการบังคับใช้ระดับ **Database Session & Driver (Backend)**: SQLite `PRAGMA query_only = ON;`, PostgreSQL `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`, MySQL `SET SESSION transaction_read_only = 1;` และการป้องกันบน UI (SqlEditor ปฏิเสธ DML/DDL write queries พร้อมแจ้งเตือน Read-Only banner, DataGrid ปิดการแก้ไขเซลล์/เพิ่มแถว/ลบแถว) เพื่อความปลอดภัยสูงสุด
- **Issue #103 (Tamper-Evident Rust Audit Log):** [COMPLETED] ย้ายการจัดเก็บ Audit Trail จาก `localStorage` ใน Frontend ไปยัง Rust Backend อย่างสมบูรณ์:
  - **Secure Storage (`~/.datacore/audit.jsonl`):** บันทึกประวัติกิจกรรมแบบ Append-Only บนดิสก์ด้วยสิทธิ์ 0600 (Unix) ป้องกันการเข้าถึงจาก process อื่น
  - **Tamper-Evident Cryptographic Hash Chain:** ทุกรายการ audit entry มี `prev_hash` และ `entry_hash` คำนวณด้วย SHA-256 เชื่อมโยงกับประวัติก่อนหน้า หากมีการแก้ไข ลบ หรือแทรกข้อมูล ฟังก์ชัน `verify_audit_log_integrity()` จะตรวจจับและระบุ ID รายการที่ถูกแก้ไขทันที
  - **Automatic Log Rotation:** หมุนเวียนไฟล์อัตโนมัติเมื่อขนาดไฟล์เกิน 10MB ไปยัง `audit.<timestamp>.jsonl` โดยยังคงรักษาความต่อเนื่องของ Hash Chain ไว้อย่างสมบูรณ์
  - **IPC Commands & Backend Integration:** เพิ่ม IPC endpoints (`get_audit_logs`, `verify_audit_log_integrity`, `clear_audit_logs`, `record_audit_log`) พร้อมผูกการบันทึก Audit Log เข้ากับ Backend commands โดยตรง (`execute_query`, `open_session`, `close_session`, `export_data`, `import_data`, `duplicate_table`, `export_sql`, `import_sql`)
  - **UI & Store Integration:** อัปเดต `useAuditLogStore` ให้โหลดและซิงค์ข้อมูลกับ Rust Backend พร้อมปุ่ม "Verify Chain" ใน `AuditLogDrawer` เพื่อตรวจสอบความถูกต้องของสาย Hash ได้ทันที
- **Issue #91 (Schema-Aware Autocomplete):** [COMPLETED] ผสานรวมกับ CodeMirror 6 `sql({ schema: schemaMap })` และการจัดการ Cache Invalidation พร้อม `useSchemaStore`
- **Issue #92 (Multi-Statement & Formatter):** [COMPLETED] นำ Quote-aware SQL Splitter ไปใช้ใน Rust Driver เพื่อรองรับ Multi-Statement Execution ที่มีหลาย `SELECT` พร้อมปุ่มจัดรูปแบบโค้ด SQL Formatter (⌘⇧F)
- **Issue #93 (Object Browser Deep Tree & Keyboard Splitter Navigation):** [COMPLETED]
  - ขยาย `SchemaNodeType` ใน Rust (`src-tauri/src/drivers/traits.rs`) และ TypeScript (`src/types/db.ts`) ให้ครอบคลุม `Column`, `Index`, `ForeignKey`, `Trigger`, `Function`, `Procedure`
  - ขยายโหนด Table ใน `ObjectBrowser.tsx` ให้กดคลี่ดู Columns พร้อม data types และไอคอน PK/FK (lazy-loaded เมื่อคลิกขยายลูกศร)
  - รองรับการลาก (Drag and Drop) คอลัมน์ หรือดับเบิ้ลคลิกเพื่อแทรกชื่อคอลัมน์ลงใน SQL Editor ทันที
  - ปรับปรุง Accessibility ของแถบแบ่งหน้าต่าง (Splitter) ใน `DockLayout.tsx` เพิ่ม `role="separator"`, `tabIndex={0}`, `aria-orientation="vertical"`, และรองรับการนำทางปรับขนาดด้วยปุ่มลูกศรซ้าย/ขวาบนคีย์บอร์ด
- **Issue #106 (Refactor Monolithic TableStructureEditor & Clean IPC Parameters):** [COMPLETED]
  - แยก `TableStructureEditor.tsx` (จากเดิม 3,647 บรรทัด) ออกเป็น sub-tabs ขนาดกะทัดรัดไม่เกิน 500-800 บรรทัดใน `src/components/structure/tabs/`:
    - `ColumnsTab.tsx` (จัดการคอลัมน์, เพิ่ม/แก้ไข/ลบคอลัมน์ และ quick presets)
    - `IndexesTab.tsx` (จัดการ Index: B-Tree, Hash, GIN, GiST, Full-text, Composite)
    - `ForeignKeysTab.tsx` (จัดการ Foreign Keys และ Reference Actions: CASCADE, SET NULL, NO ACTION)
    - `ConstraintsTab.tsx` (จัดการ PRIMARY KEY, CHECK และ UNIQUE Constraints)
    - `RlsSecurityTab.tsx` (จัดการ Row-Level Security, Enable/Disable RLS, Add/Drop Policies)
  - ย้ายฟังก์ชัน Runtime `formatCellValue` ออกจาก `src/types/db.ts` ไปไว้ใน `src/utils/cellFormatter.ts` พร้อม unit test ครอบคลุม
  - ทำความสะอาดพารามิเตอร์ IPC ใน `src/api/db.ts` ให้เป็น camelCase มาตรฐานเดียว ปราศจาก redundant aliases ตาม Tauri 2 convention

---

## 7. แผนการปรับปรุงคุณภาพโค้ดและความปลอดภัยเชิงลึก (DataCore 360° Audit & Remediation Roadmap)

อ้างอิงจาก **รายงานการตรวจสอบโค้ดและแผนการแก้ไขฉบับสมบูรณ์ (DataCore 360° Audit & Remediation Guide)** ได้ทำการตรวจสอบซอร์สโค้ดจริงอย่างละเอียด และเปิด GitHub Issues รองรับการแก้ไขปัญหาครอบคลุม 4 มิติ รวม 19 รายการ ดังนี้:

### 7.1 ตาราง GitHub Issues ที่เปิดจากการตรวจสอบเชิงลึก

| Issue | Severity | หัวข้อและขอบเขตปัญหา | ไฟล์หลักฐานที่เกี่ยวข้อง |
| :--- | :---: | :--- | :--- |
| **#107** | 🔴 Critical | แก้ไข `simulate_query_impact_impl` รัน `SAVEPOINT` ก่อน `BEGIN` ป้องกันคำสั่ง `DELETE`/`UPDATE` เผลอลบข้อมูลจริงใน MySQL (ISSUE-01) | `src-tauri/src/commands/db.rs` |
| **#108** | 🟠 High | แก้ไข Race Condition สิทธิ์ไฟล์รหัสผ่าน `/tmp` และป้องกัน SSH Option Injection ใน `ssh_tunnel.rs` (ISSUE-02) | `src-tauri/src/services/ssh_tunnel.rs` |
| **#109** | 🟠 High | แก้ไขการตั้งสิทธิ์โฟลเดอร์ `.datacore` เป็น `0o700` แทน `0o600` ป้องกัน Permission Denied บน macOS/Linux (ISSUE-03) | `src-tauri/src/services/keychain.rs` |
| **#110** | 🟡 Medium | ขยาย `path_guard.rs` ให้บล็อกการเข้าถึงโฟลเดอร์ `.datacore` และไฟล์คอนฟิก/audit ทั้งหมด (ISSUE-04) | `src-tauri/src/services/path_guard.rs` |
| **#111** | 🟡 Medium | Redact รหัสผ่านใน Audit Log และ Query History สำหรับคำสั่ง `CREATE/ALTER USER` (ISSUE-05) | `src-tauri/src/services/audit_logger.rs`, `src/api/auditApi.ts`, `src/stores/queryHistoryStore.ts` |
| **#112** | 🟡 Medium | ปรับปรุงการจัดการ Backslash Escape (`\`) ให้ตรงตาม Dialect (SQLite, PostgreSQL, MySQL) (ISSUE-06) | `src/api/sqlSplitter.ts`, `src-tauri/src/drivers/sqlite.rs`, `src/components/grid/filterUtils.ts`, `src-tauri/src/services/data_transfer.rs`, `src-tauri/src/services/sql_transfer.rs` |
| **#113** | 🟢 Low | ปรับปรุงการทำความสะอาดชื่อ Savepoint ให้รองรับภาษาไทย ตัวเลข และป้องกันชื่อว่าง (ISSUE-07) | `src/api/transactionHelpers.ts` |
| **#114** | 🟠 High | ปรับปรุง `validate_table_filter` ให้ข้ามข้อความใน String Literal (`'...'`) เพื่อไม่บล็อกคำค้นหาปกติ (ISSUE-08) | `src-tauri/src/drivers/traits.rs` |
| **#115** | 🟠 High | แก้ไข `InsertRowModal` ตรวจสอบ Auto-Generated Column ให้ถูกต้อง ไม่ล็อกคอลัมน์ทั่วไปและ Foreign Key เป็น `NULL` (ISSUE-09) | `src/components/grid/InsertRowModal.tsx` |
| **#116** | 🟠 High | ปรับปรุง `filterUtils` ไม่ตัด Quote จากตัวเลขที่มีเลข 0 นำหน้า หรือเมื่อไม่ใช่ Numeric Type บน PostgreSQL (ISSUE-10) | `src/components/grid/filterUtils.ts` |
| **#117** | 🟠 High | แก้ไข Primary Key หายเมื่อคัดลอกตารางข้ามฐานข้อมูลมายัง SQLite ใน `cross_db_transfer` (ISSUE-11) | `src-tauri/src/services/cross_db_transfer.rs` |
| **#118** | 🟡 Medium | ปรับปรุงการ Export ข้อมูล Binary เป็น Hex Literal และดึง Default/PK ของ PostgreSQL ใน `sql_transfer` (ISSUE-12) | `src-tauri/src/services/sql_transfer.rs`, `src-tauri/src/services/data_transfer.rs` |
| **#119** | 🟡 Medium | ป้องกันการสูญเสียความแม่นยำของตัวเลข `BIGINT` และ Decimal ที่เกิน Safe Integer ใน `InsertRowModal` (ISSUE-13) | `src/components/grid/InsertRowModal.tsx`, `src-tauri/src/drivers/postgres.rs`, `mysql.rs` |
| **#120** | 🟢 Low | ซ่อนปุ่ม Terminate Session ใน `ActivityMonitorModal` เมื่อเป็นฐานข้อมูล SQLite (ISSUE-14) | `src/components/modals/ActivityMonitorModal.tsx` |
| **#121** | 🟡 Medium | เพิ่มประสิทธิภาพการคำนวณ Foreign Key ใน `ERDiagramTab` ด้วย Set $O(1)$ ขณะลากการ์ดตาราง (ISSUE-15) | `src/components/diagram/ERDiagramTab.tsx` |
| **#122** | 🟠 High | แก้ไข `FilterBar.tsx` ฮาร์ดโค้ดสี Dark Mode เพื่อให้แสดงผลถูกต้องใน Light Mode (ISSUE-18) | `src/components/grid/FilterBar.tsx` |
| **#123** | 🟠 High | ปรับปรุงสีพื้นหลัง Canvas และสีคอลัมน์ PK/FK ใน `ERDiagramTab` ให้รองรับ Light Mode (ISSUE-19) | `src/components/diagram/ERDiagramTab.tsx` |
| **#124** | 🟡 Medium | เพิ่มตัวแปร CSS Aliases ใน `tokens.css` แก้ปัญหา `PaginationBar` แสดงสีดำใน Light Mode (ISSUE-20) | `src/components/grid/PaginationBar.tsx`, `src/styles/tokens.css` |
| **#125** | 🟡 Medium | ปรับปรุง `DropTableModal` และ `DangerousQueryConfirmModal` ให้รองรับทั้ง Light และ Dark Mode (ISSUE-21) | `src/components/structure/DropTableModal.tsx`, `src/components/dialogs/DangerousQueryConfirmModal.tsx` |

### 7.2 สรุปผลการแก้ไขและการตรวจสอบ (Remediation & Verification Completed - Issues #107 through #125)

การแก้ไขและปรับปรุงทั้ง 19 รายการเสร็จสมบูรณ์ 100% พร้อมผ่านชุดการทดสอบทั้งฝั่ง Rust Backend และ React Frontend:

1. **Issue #107 (Critical): MySQL/Transaction Impact Simulation Fix (`commands/db.rs`)**
   - ตรวจสอบคำสั่ง Mutation เดี่ยวด้วย `split_sql_statements(sql).len() == 1` ป้องกันการรันหลายคำสั่งพร้อมกัน
   - รัน `BEGIN;` ก่อนเริ่มสร้าง `SAVEPOINT _dc_impact_preview;` เพื่อเปิด Transaction ใน MySQL ป้องกัน autocommit ลบข้อมูลจริง พร้อม fallback สู่ SAVEPOINT เดี่ยวในกรณีฐานข้อมูลไม่รองรับ BEGIN ซ้ำซ้อน (เช่น SQLite in-memory)
   - สั่ง `ROLLBACK TO SAVEPOINT _dc_impact_preview;` และ `RELEASE SAVEPOINT _dc_impact_preview;` (หรือ `ROLLBACK;`) รับประกันการคืนค่าข้อมูล 100%

2. **Issue #108 (High): SSH Tunnel Askpass Race Condition & Injection Guard (`services/ssh_tunnel.rs`)**
   - สร้างไฟล์ askpass helper แบบ atomic บน Unix ด้วยสิทธิ์ `0o700` (`OpenOptionsExt::mode(0o700)`) ป้องกันการอ่านรหัสผ่านระหว่างสร้างไฟล์
   - ตรวจสอบ `ssh_host` และ `ssh_user` ไม่ให้ขึ้นต้นด้วยเครื่องหมายลบ (`-`) ป้องกัน SSH Option Injection
   - เปลี่ยนจากการใช้ `echo` เป็น `printf '%s\n'` ใน askpass script เพื่อป้องกัน flag interpretation และแทรก `--` ก่อน host argument

3. **Issue #109 (High): Keychain Folder Permission Fix (`services/keychain.rs`)**
   - เพิ่มฟังก์ชัน `set_secure_dir_permissions` กำหนดสิทธิ์ไดเรกทอรีเป็น `0o700` (`rwx------`) บน Unix
   - ปรับใช้กับการสร้างโฟลเดอร์ `~/.datacore` ใน `set_master_password`, `get_or_create_key`, และ `save_vault_to_disk` แก้ไขปัญหา Permission Denied

4. **Issue #110 (Medium): Path Guard Protection for UNC Paths & `.datacore` Directory (`services/path_guard.rs`)**
   - บล็อก Windows UNC และ network paths (`\\...`, `//...`, `Prefix::UNC`, `Prefix::VerbatimUNC`)
   - บล็อกการเข้าถึงโฟลเดอร์ `.datacore` รวมถึงไฟล์คอนฟิก, vault (`vault.enc`, `.vault.key`), และ audit log ทั้งหมดผ่าน path traversal

5. **Issue #111 (Medium): Sensitive Password Redaction in Audit Log & History (`audit_logger.rs`, `auditApi.ts`, `queryHistoryStore.ts`)**
   - พัฒนาฟังก์ชัน `redact_sensitive_sql` และ `redactSensitiveSql` ตรวจจับคำสั่ง `CREATE USER` และ `ALTER USER` ที่มี `IDENTIFIED BY`, `WITH PASSWORD`, หรือ `PASSWORD [=] '...'`
   - ซ่อนรหัสผ่านเป็น `'********'` ก่อนบันทึกลงใน audit hash chain และ query history

6. **Issue #112 (Medium): Dialect-Aware Backslash Handling (`drivers/sqlite.rs`, `sqlSplitter.ts`, `filterUtils.ts`, `data_transfer.rs`, `sql_transfer.rs`)**
   - ใน SQLite `split_sql_statements` และ `sqlSplitter.ts`: กำหนดให้ backslash (`\`) ภายใน quote เป็น string literal ปกติ (SQLite ใช้เฉพาะ `''` ในการ escape)
   - ใน MySQL data transfer และ SQL export: จัดการ escape `\` เป็น `\\` เฉพาะเมื่อ target dialect เป็น MySQL

7. **Issue #113 (Low): Savepoint Name Sanitization (`api/transactionHelpers.ts`)**
   - พัฒนา `sanitizeSavepointName` แทนที่อักขระที่ไม่ใช่ alphanumeric ด้วย `_`
   - จัดการชื่อว่างโดย fallback เป็น `sp_default` และเติม prefix `sp_` หากชื่อขึ้นต้นด้วยตัวเลข

8. **Issue #114 (High): Quote-Aware Table Filter Validation (`drivers/traits.rs`)**
   - ปรับปรุง `validate_table_filter` ให้ข้ามเนื้อหาภายใน Single Quotes (`'...'`)
   - รองรับ escaped quote ทั้งแบบ `''` และ `\'` ป้องกันการปฏิเสธคำค้นหาที่บังเอิญตรงกับ SQL keywords
   - คืนค่า error ทันทีหากพบ string literal ที่ปิดไม่สมบูรณ์ (Unclosed Quote)

9. **Issue #115 & #119 (High & Medium): InsertRowModal Auto-Generated Column Detection & Safe BigInt (`InsertRowModal.tsx`)**
   - สกัดฟังก์ชัน `isAutoGeneratedColumn` ตรวจสอบคอลัมน์ auto-generated ที่แท้จริง ไม่ล็อกคอลัมน์ทั่วไป เช่น `paid`, `valid`, `grid` หรือ foreign key เช่น `user_id`
   - ป้องกันการสูญเสียความแม่นยำของ `BIGINT` และ `DECIMAL` โดยแปลงเป็นตัวเลขเฉพาะเมื่อ `Number.isSafeInteger(num)` หากเกินขอบเขตจะคงสถานะเป็น String

10. **Issue #116 (High): Safe Unquoted Number Preservation (`filterUtils.ts`)**
    - เพิ่ม `isSafeUnquotedNumber` ป้องกันการตัด quote ออกจากสตริงที่มีเลขศูนย์นำหน้า (เช่น `/^-?0\d+/`) หรือสตริงที่ไม่ใช่ตัวเลข
    - ป้องกันปัญหา Type Mismatch บน PostgreSQL (`character varying = integer`) และการสูญเสียเลข 0 นำหน้าบน SQLite/MySQL

11. **Issue #117 (High): Primary Key Preservation in SQLite Cross-DB Transfer (`services/cross_db_transfer.rs`)**
    - นำเงื่อนไข `&& target_dialect != "sqlite"` ออก ทำให้คำสั่ง `CREATE TABLE` ที่สร้างขึ้นสำหรับ SQLite มีนิยาม `PRIMARY KEY (...)` ครบถ้วน

12. **Issue #118 (Medium): Binary BLOB Export as Hex Literals & PostgreSQL DDL Preservation (`services/sql_transfer.rs`, `services/data_transfer.rs`)**
    - แปลง `CellValue::Bytes` ในคำสั่ง SQL Export จาก Base64 สู่ Hex Literals (`X'...'` สำหรับ SQLite/MySQL และ `'\x...'::bytea` สำหรับ PostgreSQL)
    - รักษาค่า `column_default` และ `PRIMARY KEY (...)` ใน PostgreSQL DDL Export

13. **Issue #120 (Low): Hide Terminate Session for SQLite (`ActivityMonitorModal.tsx`)**
    - ซ่อนปุ่ม Terminate Session ใน Activity Monitor เมื่อไดรเวอร์ที่เชื่อมต่อคือ `sqlite`

14. **Issue #121 & #123 (Medium & High): ER Diagram FK Performance & Light Mode Canvas (`ERDiagramTab.tsx`)**
    - แคช Foreign Key relationships เป็น `Set<string>` ผ่าน `useMemo` ทำให้การตรวจสอบความสัมพันธ์ขณะลากการ์ดตารางทำงานเร็วระดับ $O(1)$
    - ปรับปรุงสี Canvas เป็น `bg-slate-100 dark:bg-[#0b0f17]`, สีคอลัมน์ PK/FK เป็น `text-amber-700 dark:text-amber-300` และ `text-indigo-700 dark:text-indigo-300`

15. **Issue #122 (High): FilterBar Dual-Theme Support (`FilterBar.tsx`)**
    - ปรับเปลี่ยนคลาสสี hardcoded dark mode เป็น dynamic theme classes รองรับทั้ง Light และ Dark mode

16. **Issue #124 (Medium): CSS Variable Aliases for PaginationBar & Dark/Light Mode (`tokens.css`)**
    - เพิ่ม alias variables ใน `:root` และ `.dark` (`--bg-secondary`, `--bg-input`, `--btn-bg`, `--border-color`, `--text-primary`, `--text-secondary`, `--text-disabled`) แก้ไขปัญหาพื้นหลังสีดำของ PaginationBar ใน Light Mode

17. **Issue #125 (Medium): Dual-Theme Modals (`DropTableModal.tsx`, `DangerousQueryConfirmModal.tsx`)**
    - ปรับปรุงคอนเทนเนอร์, หัวข้อ, กรอบข้อความ และปุ่มกดยืนยันใน DropTableModal และ DangerousQueryConfirmModal ให้แสดงผลถูกต้องสวยงามทั้งในโหมด Light และ Dark Mode

18. **Issue #126: Complete Light Mode & Dark Mode Consistency across Sidebar, Tables, and Management Modals (`DockLayout.tsx`, `ObjectBrowser.tsx`, `ConnectionTreeNode.tsx`, `TableListTab.tsx`, `TableMaintenanceModal.tsx`, `CreateTableModal.tsx`, `DuplicateTableModal.tsx`, `RenameTableModal.tsx`, `CrossDbCopyModal.tsx`, `ImportSqlModal.tsx`, `ExportSqlModal.tsx`, `DataGrid.tsx`)**
    - **ObjectBrowser & Sidebar:** ปรับเปลี่ยนสีคอนเทนเนอร์หลักจาก `#181818` เป็น `bg-sidebar border-r border-line text-text` เชื่อมโยงกับ CSS tokens อย่างถูกต้อง พร้อมปรับ Header, Search Box, Context Menus, Action Buttons, TreeNode selection และ PK/FK badges ให้รองรับ Adaptive Dual-Theme
    - **TableListTab:** ปรับ Top toolbar (`bg-gray-50 border-gray-200` ใน Light mode), Table Count badge, Search Input, Refresh button, `<thead>`, `<tbody>` และ Table Context Menus ไม่ให้หลงเหลือสีดำฮาร์ดโค้ดเมื่ออยู่ใน Light Mode
    - **DockLayout Sub-Headers & Tabs:** ปรับแท็บ Table Sub-header (`Data` / `Structure` toggle bar), Explorer label, collapse buttons, tab close buttons ให้ใช้สีตาม theme ที่กำลังเปิดใช้งานอย่างแท้จริง
    - **Database Modals & Forms:** ปรับปรุง TableMaintenanceModal, CreateTableModal, RenameTableModal, DuplicateTableModal, CrossDbCopyModal, ImportSqlModal และ ExportSqlModal ให้ใช้ดีไซน์ Dual-Theme ไม่แสดงพื้นหลังสีดำหรือข้อความสีมืดกลืนกับพื้นหลังใน Light Mode
    - **DataGrid Context Menu:** ปรับเมนูคลิกขวาในตารางข้อมูลให้รองรับ Light Mode (`bg-white text-gray-800 border-gray-200 hover:bg-blue-50`) และ Dark Mode (`bg-[#252526] text-white border-[#3e3e42] hover:bg-[#094771]`)

19. **Issue #127: Professional Table Structure View 2-Tier Architecture & Consistent UI System (`TableStructureEditor.tsx`, `DockLayout.tsx`, `ColumnsTab.tsx`, `IndexesTab.tsx`, `ForeignKeysTab.tsx`, `ConstraintsTab.tsx`, `RlsSecurityTab.tsx`)**
    - **Unified 2-Tier Hierarchy & Zero Redundancy:** ยุบ Header สองชั้นที่ซ้ำซ้อนกัน โดยตัด sub-header ชั้นบนใน `DockLayout.tsx` เมื่ออยู่ในโหมด Structure และรวมเข้าเป็นสถาปัตยกรรม 2-Tier Toolbar:
      - **Tier 1 (Table Master Bar):** สลับโหมด `Data / Structure` สไตล์ Segmented Control + แสดง Table Identity (`schema.table` พร้อม driver badge) + เครื่องมือระดับตาราง (`Refresh`, `DDL`, `Partitions`, `Maintain`, `Rename`, `Drop`) ชัดเจนด้านขวา
      - **Tier 2 (Sub-navigation & Tab Actions Toolbar):** Sub-tabs 6 แท็บ (`Columns`, `Indexes`, `Foreign Keys`, `Constraints`, `Security / RLS`, `SQL Preview`) พร้อม Count Badge ทรง Capsule ที่สวยงาม + เพิ่มช่อง **Quick Search Filter Box** แบบเรียลไทม์ + **Primary Action Button** ด้วยสีน้ำเงิน Professional Blue สม่ำเสมอทุกแท็บ (`bg-blue-600 hover:bg-blue-500`) แทนที่สีสะเปะสะปะเดิม
    - **Sub-tab Real-time Filter & Accessibility:** รองรับการค้นหาและกรองแบบเรียลไทม์ใน Columns, Indexes, Foreign Keys, และ Constraints พร้อมทั้งใส่ `aria-label` สำหรับ Screen Readers และ automated testing
    - **Dual-Theme Contrast & Modern Empty States:** แก้ไขปัญหาตัวหนังสือจาง `text-gray-300` บนพื้นขาวใน Light Mode สำหรับ Indexed Columns, Foreign Key References, และ Constraint Expressions; ปรับปรุง Empty States ให้เป็นการ์ดโมเดิร์นพร้อมไอคอนที่ประณีตและคำอธิบายชัดเจน

20. **Issue #128: Table View & Explorer Synchronization, Auto-Reveal/Scroll Highlight, and Safe Disconnected State (`DisconnectedTableScreen.tsx`, `DockLayout.tsx`, `ObjectBrowser.tsx`, `ConnectionTreeNode.tsx`)**
    - **Safe Disconnected State (Zero Auto-Fetch):** ยับยั้งการแอบส่งคำสั่งดึงข้อมูลตารางอัตโนมัติเมื่อเปิดแท็บค้างไว้ข้ามเซสชัน หากการเชื่อมต่อยังไม่ได้เปิดใช้งาน (`!connectedConnectionIds.includes(...)`) โดยแสดงหน้าจอ `DisconnectedTableScreen` แจ้งเตือนสถานะ พร้อมสรุปบริบทของตาราง (Table, Connection Name, Driver, Environment, Database/Schema, Host) และ 2 ปุ่มคำสั่งชัดเจน: "Connect & Load Data" (เชื่อมต่อจริง ซิงค์ Explorer และโหลดข้อมูล) และ "Close Tab" (ปิดแท็บ)
    - **Full Breadcrumb Context:** ปรับปรุง Sub-header ของ Table Data View ให้แสดงเส้นทางเต็มชัดเจน: `[Icon] Server Name › Database/Schema › Table Name` พร้อม Driver & Environment Badges ป้องกันความสับสนกรณีมีตารางชื่อซ้ำกันในหลายฐานข้อมูล พร้อมเพิ่ม Tooltip ละเอียดและ Disconnected Dot บน Tab Bar
    - **Auto-Reveal / Scroll into View & Active Highlight in Explorer:** เมื่อเปิดหรือสลับแท็บไปยังตารางใด Explorer จะทำการคลี่ (Auto-expand) โหนดบรรพบุรุษที่เกี่ยวข้อง, เลื่อนตำแหน่ง (Auto-scroll into view) ไปยังโหนดตารางนั้นทันที, และแสดง Active Tab Highlight (`ring-1 ring-blue-500` พร้อมป้าย `active`) รวมทั้งแถบระบุสถานะ Active Connection ด้านซ้ายอย่างสมบูรณ์แบบ

21. **Issue #129: Connection Schema Tree Expansion Fix, Strict On-Demand Table Data Loading, and Refined Tree Highlights (`ConnectionTreeNode.tsx`, `ObjectBrowser.tsx`, `DockLayout.tsx`, `tabStore.ts`)**
    - **Connection Schema Expansion & Loading Status:** แก้ไขปัญหาการคลิกเปิดหรือเชื่อมต่อ Connection แล้วขึ้น `(No tables or views found)` ขณะที่กำลังโหลด schema หรือยังไม่ได้ดึง schema โดยแสดงโหนด `Loading schema...` พร้อม trigger การดึงโครงสร้างอัตโนมัติเมื่อตรวจพบการเชื่อมต่อ และปรับปรุงการ Auto-Reveal ให้คลี่และเลื่อนไปยังโหนดของแท็บประเภท `table-list` ด้วย
    - **Explicit On-Demand Per-Tab Data Loading:** จัดการสถานะ `isLoaded` แยกอิสระในระดับแท็บ และ strip ออกจาก localStorage เพื่อไม่ให้แท็บที่กู้คืนข้ามเซสชันแอบดึงข้อมูลเบื้องหลังอัตโนมัติ แม้ว่าการเชื่อมต่อของเซิร์ฟเวอร์นั้นจะเชื่อมต่อแล้วก็ตาม โดยแสดงหน้าจอ "Table Data Not Loaded" พร้อมปุ่ม "Load Table Data" ให้ผู้ใช้เลือกโหลดเมื่อต้องการจริง
    - **Refined Explorer Tree Highlights:** ปรับปรุง Active Connection Highlight ให้เป็นกรอบโค้งมนที่สมบูรณ์สวยงาม (`border border-blue-500/50` พร้อม badge `ACTIVE`) โดยตัดขอบเส้น `border-l-4` ที่เคยยื่นลอยแปลกๆ ออก และปรับขอบ Active Table Node ให้เป็นกล่องมนครบ 360 องศา ไม่ถูกตัดขอบจาก Virtual List container

22. **Issue #130: Sticky Context Breadcrumb Bar in Sidebar Explorer (`ExplorerBreadcrumb.tsx`, `ObjectBrowser.tsx`)**
    - **Persistent Database & Schema Context:** เพิ่มแถบ Sticky Context Breadcrumb Bar ติดอยู่ใต้ช่องค้นหา (Search tables/views) ใน Sidebar Explorer แสดงลำดับชั้นของฐานข้อมูลที่กำลังเปิดใช้งาน เช่น `[PG] POS V2 › 🛢️ postgres › 📁 public › ▦ sale_lines` ป้องกันปัญหา Loss of Context เมื่อเลื่อนดูรายการตารางที่ยาวมาก
    - **Interactive Click-to-Locate Navigation:** ผู้ใช้สามารถคลิกที่แต่ละ segment ใน Breadcrumb เพื่อเลื่อน Virtual Tree กลับไปหาโหนด Connection, Database, Schema หรือ Table ได้ทันที พร้อมปุ่มไอคอน "Locate Active Node" (Focus/Target) สำหรับคลิกเดียวกลับมาที่ตารางปัจจุบัน
    - **Dynamic State Synchronization:** แถบ Breadcrumb จะแสดงผลอย่างชาญฉลาดเมื่อมีการเชื่อมต่อหรือมีแท็บที่กำลังทำงานอยู่ และซิงค์เปลี่ยนตามการสลับแท็บโดยอัตโนมัติ

23. **Issue #131: Source/Destination Connection Selectors in Backup/Import/Export and Categorized Tools Menu Redesign (`MainToolbar.tsx`, `ExportSqlModal.tsx`, `ImportSqlModal.tsx`, `DataImportWizardModal.tsx`, `DataExportWizardModal.tsx`)**
    - **Source Server & Database Context in Backup / SQL Dump (`ExportSqlModal.tsx`):** เพิ่มแถบ Context Card สรุปและเลือก Connection / Server และ Schema ต้นทางได้โดยตรงใน Modal พร้อม Driver Badge เพื่อความชัดเจนและป้องกันการ Export ข้อมูลผิดเซิร์ฟเวอร์
    - **Destination Server & Database Context in Execute SQL Script (`ImportSqlModal.tsx`):** เพิ่มแถบ Destination Target Context Card พร้อม Dropdown ให้เลือก Connection และ Schema ปลายทางที่จะ Execute คำสั่ง SQL ได้จากหน้าต่าง เพื่อความปลอดภัยในการนำเข้าข้อมูล
    - **Data Import & Export Wizards Context Headers (`DataImportWizardModal.tsx`, `DataExportWizardModal.tsx`):** เพิ่ม Destination Context Banner ใน Step 1 ของ Data Import Wizard และ Source Target Banner ใน Data Export Wizard ระบุเซิร์ฟเวอร์และตารางที่เกี่ยวข้องอย่างโปร่งใส
    - **Categorized 2-Line Tools Menu Redesign (`MainToolbar.tsx`):** ปรับขนาดเมนู Tools ให้กว้างขึ้น (`min-w-[340px]`) พร้อมจัดหมวดหมู่ 4 กลุ่มชัดเจน (Performance & Monitoring, Design & Modeling, Security & Administration, Productivity) และแสดงข้อความ 2 บรรทัด (ชื่อเครื่องมือตัวหนา + คำอธิบายประโยชน์และการใช้งานสั้นๆ 1 บรรทัด) ป้องกันปัญหาข้อความโดนตัดและช่วยให้ผู้ใช้งานเข้าใจหน้าที่ของเครื่องมือแต่ละตัวทันที

24. **Issue #132: Equalize Dropdown & Input Heights and Adapt Schema Context by Database Driver (`index.css`, `ExportSqlModal.tsx`, `ImportSqlModal.tsx`, `CrossDbCopyModal.tsx`, `SchemaDiffModal.tsx`, `App.tsx`)**
    - **Equalized Dropdown (<select>) & Input Height:** กำหนด Base CSS Normalization ใน `src/index.css` (`select:not([multiple]) { min-height: 34px }`) และใส่คลาส `h-[34px]` ควบคู่กันบน Dropdown และ Input ในทุกฟอร์มและโมดอล ป้องกันปัญหา WebKit Native Select หดสั้นกว่า Input Textbox บน macOS
    - **Driver-Aware Schema Adaptation:** ปรับเปลี่ยนการแสดงผลและค่าของ Schema ตาม Driver ของฐานข้อมูลที่เลือก:
      - **SQLite:** ปิดใช้งาน (Disabled) ช่อง Schema พร้อมแสดง placeholder `N/A (SQLite)` และบังคับค่าเป็นว่างเปล่า (`undefined`) โดยใน Target Scope จะแสดงเฉพาะชื่อตารางตรงๆ เช่น `categories` หรือ `All database tables` โดยไม่มีคำว่า `public.` นำหน้า
      - **PostgreSQL:** เปิดใช้งานช่อง Schema ตามปกติ ค่าเริ่มต้น `public` และแสดง Target Scope เป็น `public.tableName`
      - **MySQL:** ปรับ Label เป็น `Database / Schema:` และดึงชื่อ Database ใน connection configuration มาเป็นค่าเริ่มต้น ไม่ใช้คำว่า `public`
      - **Dynamic Switching:** เมื่อผู้ใช้เปลี่ยน Connection ใน Dropdown ระบบจะรีเซ็ตและปรับ Schema ให้สอดคล้องกับ Driver ใหม่อัตโนมัติทันที

25. **Issue #133: Fix Duplicate `jobId` in Transfer IPC Options Causing Cross-DB Transfer Failure (`CrossDbCopyModal.tsx`, `ImportSqlModal.tsx`, `dataTransferApi.ts`, `transfer.rs`)**
    - **Root Cause & IPC Contract Fix:** แก้ไขปัญหาคำสั่ง `copy_table_cross_db` ล้มเหลวพร้อม error `duplicate field 'jobId'` ซึ่งเกิดจากโมดอล `CrossDbCopyModal.tsx` ส่งทั้ง `job_id` และ `jobId` ไปใน payload เดียวกัน ทำให้ Serde ในฝั่ง Rust ปฏิเสธการ Deserialization เนื่องจากมี duplicate field mapping
    - **Comprehensive Deduplication:** ลบ duplicate keys ออกจาก `CrossDbCopyModal.tsx` และ `ImportSqlModal.tsx` โดยส่งเฉพาะ `jobId` ตาม camelCase serialization contract
    - **API & Serde Model Normalization:** แก้ไขฟังก์ชัน `cancelTransfer` ใน `src/api/dataTransferApi.ts` ให้ส่ง `{ jobId }` ตัวเดียว และปรับโครงสร้าง Rust struct ใน `src-tauri/src/models/transfer.rs` (`CrossDbCopyTableOptions`, `SqlExportOptions`) ให้ใช้ `#[serde(default, alias = "job_id")]` อย่างถูกต้องเพื่อรองรับทั้ง camelCase และ snake_case โดยไม่มี redundant alias
    - **Automated Verification:** เพิ่ม unit tests ทั้งฝั่ง Frontend (`CrossDbCopyModal.test.tsx`, `ImportSqlModal.test.tsx`, `dataTransferApi.test.ts`) เพื่อยืนยันว่า payload ไม่มีคีย์ซ้ำ และฝั่ง Rust (`cross_db_transfer_test.rs`) เพื่อยืนยันการ deserialize ตัวเลือกจากทั้ง camelCase และ snake_case อย่างสมบูรณ์

26. **Issue #134: Functional Progress Bar for Cross-DB Transfer, Disable Auto-Refresh Tree After Copy, and Dedicated Columns Button in Explorer Tree (`cross_db_transfer.rs`, `CrossDbCopyModal.tsx`, `ObjectBrowser.tsx`, `ConnectionTreeNode.tsx`)**
    - **Functional Progress Bar with Live Percentages (`cross_db_transfer.rs`, `CrossDbCopyModal.tsx`):**
      - ฝั่ง Rust backend คำนวณจำนวนแถวของตารางต้นทางจริงด้วย `SELECT COUNT(*)` เมื่อระบุ `copy_data: true`
      - ส่ง Progress event ตั้งแต่ช่วงเริ่มต้นเตรียมโครงสร้าง (Preparing table structure), การลบตารางเดิมถ้ามี (Dropping target table), การสร้างตารางใหม่ (Creating table structure) และการสตรีมถ่ายโอนข้อมูลแต่ละ chunk พร้อมสถิติจริง `Transferring rows: X / Y (Z%)` และปิดท้ายด้วย `Transfer completed successfully`
      - ปรับปรุง Frontend ไม่ให้หลอดแสดงความคืบหน้ากระโดดเป็น 100% ล่วงหน้า โดยแสดง animated pulse แบบ indeterminate ระหว่างรอ และแสดงความกว้างของหลอดตามเปอร์เซ็นต์จริง `(current_row / total_rows) * 100`% พร้อมตัวเลข `X / Y (Z%)`
    - **Manual Tree Refresh After Copy (`ObjectBrowser.tsx`):**
      - นำ `fetchSchema(...)` ออกจาก callback การคัดลอกตารางสำเร็จ เพื่อไม่ให้ tree ทำการรีเฟรชเองโดยอัตโนมัติ ให้ผู้ใช้จัดการกดปุ่มรีเฟรชได้เองตามความต้องการ
    - **Dedicated Column Toggle Button on Hover in Explorer Tree (`ConnectionTreeNode.tsx`):**
      - เพิ่มปุ่มไอคอน `<Columns3>` สีฟ้า (`Show Columns`) วางอยู่ข้างๆ ปุ่มไอคอน `<Play>` สีเขียว (`Query Table`) บนแถบ Hover Action Buttons ของโหนดตารางใน Sidebar Explorer Tree
      - เมื่อผู้ใช้คลิกปุ่มไอคอนคอลัมน์ ระบบจะดึงข้อมูลโครงสร้างคอลัมน์ของตารางนั้นและคลี่เปิด/ปิดรายการคอลัมน์ใน Tree ได้ทันทีโดยตรง

27. **Issue #135: Prevent Table Row Click From Auto-Expanding Columns in Explorer Tree (`ConnectionTreeNode.tsx`)**
    - **Separate Row Selection from Column Expansion:** แก้ไขฟังก์ชัน `handleClick` บนโหนดประเภท Table และ View ไม่ให้ trigger `node.toggle()` หรือดึงรายการคอลัมน์ออกมาเมื่อคลิกที่ชื่อตาราง โดยคงไว้เฉพาะการเลือกแถว (`node.select()`)
    - **Explicit Column Expansion Control:** การเปิดดูและคลี่รายการคอลัมน์ใต้ตารางจะเกิดขึ้นเฉพาะเมื่อผู้ใช้คลิกปุ่มเฉพาะ **Show Columns** (ไอคอนสีฟ้าข้างปุ่ม Play) หรือคลิกที่ลูกศร Chevron เท่านั้น ป้องกันปัญหาโครงสร้าง tree ขยายกางคอลัมน์ออกมารกโดยไม่ตั้งใจ

28. **Issue #136: Replace Text Active Badge with Sleek Luminous Status Symbol & Refine Spacing (`ConnectionTreeNode.tsx`)**
    - **Luminous Active Dot Indicator:** เปลี่ยนจากป้ายตัวอักษรข้อความ `ACTIVE` ก้อนเหลี่ยม เป็นไอคอนสัญลักษณ์สถานะเรืองแสงสไตล์โมเดิร์น แสดงผลบนโหนด Connection ที่เชื่อมต่ออยู่กับแท็บปัจจุบัน และโหนด Table/View ที่กำลังเปิดใช้งานอยู่ใน Active Tab
    - **Driver Badge Spacing Decoupling:** จัดตำแหน่งด้วย `ml-auto` และเพิ่มระยะเว้นช่องว่างระหว่าง Active Dot กับป้าย Driver Badge (`PG`, `MY`, `SQ`) เป็น `mr-2.5` (~10px) ช่วยให้ไม่เบียดชิดติดกันจนอึดอัด ดูสะอาดตา สบายตา และเป็นระเบียบตามหลัก UI/UX

29. **Issue #137: Change Luminous Active Dot Color to Emerald Green (`ConnectionTreeNode.tsx`)**
    - **Green Luminous Tone (`bg-emerald-500`):** เปลี่ยนโทนสีของจุด Luminous Active Dot จากสีฟ้าเดิม เป็นสีเขียวมรกต (`bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.85)] ring-2 ring-emerald-500/20`) ทั้งบน Connection Node และ Table/View Node
    - **Consistency with Connected Status:** ให้ความรู้สึก Active / Online / Connected สอดคล้องกับโทนสีเขียวของระบบ DataCore (เช่น ไอคอนสถานะ Connection ที่เชื่อมต่อสำเร็จ และปุ่ม Action หลัก) อย่างกลมกลืน

30. **Issue #138: Optimize Schema Diff Performance and Fix Cross-Dialect Migration & Duplicate Columns (`schemaDiffApi.ts`, `erDiagramApi.ts`, `SchemaDiffModal.tsx`)**
    - **Ultra-Fast Bulk Schema Extraction:** เปลี่ยนการดึงข้อมูล Schema สำหรับเปรียบเทียบจากการวนลูปทีละตารางพร้อมคำนวณ ER Layout มาเป็นการใช้ Single Bulk Query สำหรับ PostgreSQL (`information_schema.columns` ร่วมกับ subquery เฉพาะ Primary Key) และ MySQL (`information_schema.columns`) และใช้ Parallel `Promise.all` สำหรับ SQLite ลดจำนวน roundtrips จาก 80-200 ครั้ง เหลือ 1 ครั้ง ทำให้การเปรียบเทียบเร็วขึ้น 50x-100x
    - **Fix Duplicate Column Extraction in PostgreSQL:** แก้ไขบั๊กคอลัมน์ซ้ำ (เช่น `branch_id` ขึ้น 2 แถว) ใน PostgreSQL ทั้งใน Schema Diff และ ER Diagram โดยเปลี่ยนจาก `LEFT JOIN information_schema.key_column_usage` ทั่วไป มาเป็นการ join กับ subquery ที่กรองเฉพาะ `tc.constraint_type = 'PRIMARY KEY'`
    - **Cross-Dialect Data Type Mapping:** เพิ่มการแปลง Data Type สำหรับ Migration DDL ข้าม Driver (PostgreSQL $\leftrightarrow$ MySQL $\leftrightarrow$ SQLite) เช่น แปลง `uuid`, `jsonb`, `character varying`, `timestamptz` เป็น `TEXT` เมื่อ Target เป็น SQLite
    - **Clean SQL Execution & Accurate Error Reporting:** กรอง statement ที่เป็น comment ล้วนๆ (เช่น `-- [SQLITE REBUILD REQUIRED]...`) ออกจากการ execute และแสดง error message จริงจาก Database Driver แทนการแสดง `Execution failed: Unknown error`

31. **Issue #139: Support Index/FK/PK Comparison for Existing Tables, Driver Capability Skip Engine, Button Layout, and High-Contrast Text Color (`schemaDiff.ts`, `schemaDiffApi.ts`, `SchemaDiffModal.tsx`)**
    - **Comprehensive Existing Table Diff (PK, FK, Indexes):** ขยายการเปรียบเทียบตารางเดิมที่มีอยู่แล้วให้ครอบคลุม Primary Keys, Foreign Keys, และ Indexes ควบคู่กับ Columns ช่วยให้ตรวจพบความต่างของโครงสร้างตารางได้อย่างแม่นยำ
    - **Target Capability Check & Safe Skip Engine:** ตรวจสอบความสามารถของ Driver ปลายทาง: สำหรับ SQLite ที่ไม่สามารถทำ `ALTER TABLE ADD PRIMARY KEY` หรือ `ADD CONSTRAINT FOREIGN KEY` หรือแก้ `NOT NULL` บนตารางเดิมได้ ระบบจะทำการ "ข้าม (Skip)" คำสั่งที่ไม่รองรับเหล่านี้ออกจากการ Execute จริงโดยอัตโนมัติ เพื่อไม่ให้สคริปต์ล้มเหลว ส่วนคำสั่งที่ SQLite รองรับ (เช่น `CREATE INDEX IF NOT EXISTS`) จะถูกนำมาสร้างเป็นสคริปต์ที่รันได้จริง พร้อมบันทึก Skipped Changes Report แสดงรายละเอียดและเหตุผลทางเทคนิคอย่างชัดเจน
    - **Driver Limitations & Skipped UI Warnings:** เพิ่มแถบแจ้งเตือน Skipped Banner และรายละเอียดข้อจำกัดของฐานข้อมูลในแท็บ Diff Details และในส่วนหัวของ Migration Script
    - **Button Toolbar Layout Refinement:** แก้ไขปัญหากลุ่มปุ่ม Action (เช่น Execute on Target) โดนบีบหรือล้นขอบขวา โดยกำหนด `shrink-0` และปรับ responsive spacing ให้สวยงาม สะอาดตา
    - **High-Contrast Text Color:** ปรับปรุงโทนสีของกล่องแสดงโค้ด SQL จากสีเขียวอ่อนเดิมที่กลืนกับพื้นหลัง เป็น High-Contrast Theme (`text-slate-900 dark:text-slate-100` บน `bg-slate-50 dark:bg-slate-950/80`) ทำให้อ่านสคริปต์และคอมเมนต์ได้อย่างชัดเจนทั้งในโหมดสว่างและโหมดมืด

32. **Issue #140: High-Contrast Error Alert Styling and Stale/Dropped Table State Recovery (`TableStructureEditor.tsx`, `DockLayout.tsx`, `sqlErrorParser.ts`)**
    - **Dual-Theme High-Contrast Error Styling:** แก้ไขสีของกล่องแจ้งเตือนข้อผิดพลาดใน `TableStructureEditor.tsx` ที่เคยฮาร์ดโค้ดเป็นโทนเข้ม (`bg-red-950/30 text-red-300 border-red-800/60`) โดยเปลี่ยนมาใช้ชุดสีตามมาตรฐาน WCAG ที่คมชัดทั้ง Light Mode (`bg-red-50 border-red-200 text-red-900` พร้อมข้อความ error สี `text-red-700` และปุ่ม Retry สี `bg-red-600 text-white`) และ Dark Mode (`dark:bg-red-950/40 dark:border-red-900/50 dark:text-red-200`) แก้ปัญหาตัวหนังสือจางกลืนกับพื้นหลัง
    - **Intelligent Dropped/Missing Table Detection:** ตรวจจับประเภทข้อผิดพลาดกรณีตารางถูกลบหรือไม่พบในฐานข้อมูล (เช่น `Undefined Table`, `no such table`, หรือ `relation ... does not exist`) ที่อาจเกิดขึ้นจากการรัน Migration หรือแก้ไขภายนอกขณะที่เครื่องพับจอไว้ (Sleep/Idle)
    - **Dedicated Table Not Found Recovery Screen:** เมื่อตรวจพบว่าตารางไม่มีอยู่แล้ว ในหน้า Structure View จะแสดงหน้าจอ Empty/Recovery State ที่ประณีต พร้อมสรุปข้อมูลตารางและปุ่ม Action สำคัญ:
      - **Close Tab:** ปิดแท็บที่ stale ออกได้ทันทีในคลิกเดียวโดยไม่ต้องเล็งกากบาทเล็กบน Tab Bar
      - **Refresh Schema:** ส่งคำสั่งซิงค์โครงสร้างและอัปเดตสถานะใน Sidebar Explorer ให้ตรงกับฐานข้อมูลจริง
      - **Retry:** ลองเชื่อมต่อและดึงข้อมูลใหม่อีกครั้ง
    - **Stale Cached Data Banner in Data View:** ในมุมมอง Data View (Grid) หากการโหลดข้อมูลล้มเหลวเนื่องจากตารางไม่มีอยู่ในฐานข้อมูลแล้ว ระบบจะแสดงแถบแจ้งเตือน Warning สีอำพันด้านบนของ DataGrid ระบุชัดเจนว่าข้อมูลที่เห็นเป็น Snapshot เก่าที่แคชไว้ และมีปุ่มให้กดปิดแท็บหรือรีเฟรชได้ทันที

33. **Issue #141: Capture-Phase Outside Click Context Menu Dismissal (`ObjectBrowser.tsx`, `ConnectionTreeNode.tsx`, `TableListTab.tsx`)**
    - **Capture-Phase Pointerdown Dismissal:** ปรับเปลี่ยนการดักจับการคลิกนอกพื้นที่ Context Menu จาก `window.addEventListener('click', ...)` แบบ Bubble Phase เดิม มาเป็นการใช้ `mousedown` / `contextmenu` ในช่วง Capture Phase (`capture: true`) ป้องกันปัญหา `e.stopPropagation()` ภายใน Tree Node บล็อกสัญญาณไม่ให้ถึง `window`
    - **Seamless Multi-Node Switching:** เมื่อผู้ใช้เปิด Context Menu ที่ตารางหนึ่ง (เช่น `customers`) แล้วคลิกซ้ายหรือคลิกขวาที่ตารางอื่น (เช่น `categories` หรือ `sale_items`) Context Menu เดิมจะถูก Dismiss ปิดตัวเองทันทีอย่างราบรื่นตามมาตรฐาน Desktop GUI (macOS/Windows)
    - **Defensive Direct Callback:** เพิ่ม `onCloseContextMenu` ลงใน `ObjectBrowserContext` และเรียกใช้ใน `handleClick` บนโหนดของ Tree เพื่อรับประกันการปิดเมนู 100% ควบคู่กับ Capture Listener

34. **Issue #142: High-Contrast Filter Button Styling & Active State Indicator (`DataGrid.tsx`, `FilterBar.tsx`)**
    - **Dual-Theme High-Contrast Inactive Button:** แก้ไขสีของปุ่ม Filter ใน DataGrid Toolbar ที่เคยฮาร์ดโค้ดเป็น `color: '#ffffff'` ทำให้ใน Light Mode กลืนไปกับพื้นหลังสีเทาอ่อน (`--btn-bg: #e4e4e7`) โดยเปลี่ยนมาใช้ `color: 'var(--text-primary, #ffffff)'` สอดคล้องกับปุ่ม Inspect Cell และ Export ทำให้อ่านคมชัด 100%
    - **Contextual State Color Adaptation:**
      - **Filter Bar Open (`isFilterVisible`):** ปรับโทนสีให้แสดงชัดเจนว่าบาร์ตัวกรองกำลังเปิดใช้งาน (Light: ฟ้าอ่อนไฮคอนทราสต์ `bg-blue-50 text-blue-700 border-blue-300`, Dark: `bg-blue-900/60 text-blue-100 border-blue-500`)
      - **Filter Active (`isFilterActive`):** เปลี่ยนเป็น Primary Blue เด่นชัด พร้อมแสดงจำนวนเงื่อนไขที่ใช้งานอยู่จริง เช่น `Filter (1)` เพื่อให้ผู้ใช้ทราบสถานะการกรองข้อมูลทันที

35. **Issue #143: Optimize ER Diagram Loading, Canvas Controls, Quick-Jump, and Native SVG Save (`erDiagramApi.ts`, `ERDiagramTab.tsx`, `transfer_commands.rs`)**
    - **Ultra-Fast Bulk Introspection (10x-50x Faster):** เปลี่ยนการโหลดข้อมูล ER Diagram จากการวนลูปทีละตาราง (60-100 คิวรีแบบ sequential) เป็นการใช้ Bulk Query ระดับ Schema:
      - **PostgreSQL:** รันเพียง 2 คิวรี (1 คิวรีสำหรับคอลัมน์ + PK ทั้งหมด และ 1 คิวรีสำหรับ Foreign Keys ทั้งหมดของทั้ง Schema)
      - **MySQL:** รันเพียง 2 คิวรีผ่าน `information_schema.columns` และ `information_schema.key_column_usage`
      - **SQLite:** ดึงข้อมูลทุกตารางแบบคู่ขนานผ่าน `Promise.all`
    - **Event Isolation (Fix Zoom vs Field Scroll):** ใส่ `onWheel={(e) => e.stopPropagation()}` ที่กล่องรายการฟิลด์ของตาราง ช่วยให้ผู้ใช้เลื่อนดูคอลัมน์ภายในตารางได้อย่างอิสระโดยไม่ไปกระตุ้น Canvas Zoom โดยไม่ได้ตั้งใจ
    - **Ergonomic Canvas Navigation & Table Quick-Jump:**
      - รองรับการ Pan ด้วย Middle Mouse Button หรือ Spacebar + Drag หรือคลิกซ้ายลากบนพื้นที่ว่างของ Canvas
      - เพิ่มเมนู Table Quick-Jump Search ใน Toolbar: เลือกตารางแล้ว Canvas จะพุ่งเป้าไปที่ตารางนั้นตรงกึ่งกลางหน้าจอพร้อมแอนิเมชันไฮไลต์
      - เพิ่ม Mini-Map (Radar View) ย่อขนาดเล็กมุมล่างขวา เพื่อดูตำแหน่งภาพรวมและคลิกเปลี่ยนตำแหน่ง Viewport ได้ทันที
    - **Native Destination-Picker for SVG Export:**
      - เพิ่ม IPC Command `save_text_file` ใน Rust พร้อมตรวจสอบความปลอดภัยผ่าน `validate_safe_transfer_path`
      - สลับจากการใช้เบราว์เซอร์ดาวน์โหลดอัตโนมัติมาเป็นการเปิด Native Save Dialog (`@tauri-apps/plugin-dialog`) ให้ผู้ใช้เลือกโฟลเดอร์ปลายทางและตั้งชื่อไฟล์ SVG ได้ตามต้องการ

36. **Issue #144: Fix ER Diagram Card Dragging Jitter, Flickering, and Lag (`ERDiagramTab.tsx`)**
    - **Remove CSS Transition on Transform:** ตัด `transition-all duration-200` ออกจากการ์ดตาราง โดยเปลี่ยนเป็น `transition-[border-color,box-shadow]` เพื่อไม่ให้เกิด animation delay 200ms บน `transform: translate(x, y)` ส่งผลให้การ์ดขยับตามพิกัดเมาส์ทันที 0ms ปราศจากอาการ rubber-banding หรือดีดกระตุก
    - **Synchronized SVG Connectors:** แก้ปัญหาเส้นเชื่อมโยงกระพริบและหลุดออกจากการ์ด โดยการเคลื่อนที่ของทั้งการ์ดและเส้น SVG ทำงานสอดประสานกันแบบเรียลไทม์ 100%
    - **Window-Level Drag Tracking:** ย้าย event listener ของ `mousemove` และ `mouseup` ไปที่ `window` ขณะที่ผู้ใช้กำลังลากการ์ดหรือแพน Canvas ป้องกันปัญหาการลากหลุดขอบการ์ดหรือปล่อยเมาส์นอกขอบ container แล้วการ์ดค้างติดเคอร์เซอร์
    - **Screen Frame Throttling (rAF):** ใช้ `requestAnimationFrame` ควบคุมรอบการ dispatch พิกัด ช่วยให้ React render สอดคล้องกับอัตรา Refresh Rate ของหน้าจอ (60Hz/120Hz ProMotion) เฟรมเรตไม่ตก
    - **Hardware GPU Acceleration:** ใส่ `willChange: isDragging ? 'transform' : undefined` และยกเลเยอร์ของการ์ดที่ถูกลากด้วย `z-20 shadow-2xl` ลอยเหนือการ์ดอื่นๆ อย่างลื่นไหล

37. **Issue #145: Deselect Table and Highlighted Relationships on Empty Canvas Click and Escape Key (`ERDiagramTab.tsx`)**
    - **Deselect on Canvas Background Click:** เพิ่มการดักจับการคลิกบนพื้นที่ว่างของ Canvas เพื่อรีเซ็ต `setSelectedTableId(null)` ทำให้เส้นความสัมพันธ์ (SVG Connectors) และการ์ดตารางกลับสู่สถานะปกติทันที ไม่ค้างสว่าง
    - **Pan vs Click Differentiation:** ตรวจวัดระยะการเลื่อนเมาส์ (Drag distance) ระหว่าง `mousedown` และ `mouseup` โดยหากเป็นการลากเพื่อ Pan มุมมองเกิน 5px ระบบจะคงสถานะ Selection เดิมไว้ แต่หากเป็นการคลิกปล่อยที่เดิม จะสั่ง Deselect ทันที
    - **Keyboard Escape Support:** ดักจับการกดปุ่ม `Escape` บนคีย์บอร์ดเพื่อสั่งรีเซ็ตการเลือกตารางและล้างเส้นความสัมพันธ์ที่สว่างค้างอยู่ได้ทันทีตามมาตรฐาน Desktop GUI

38. **Issue #146: Copy Column Names and Data Types from Explorer Tree (`ObjectBrowser.tsx`, `ConnectionTreeNode.tsx`)**
    - **Single & Multi-selection Support:** ปรับปรุง `handleClick` ใน `ConnectionTreeNode.tsx` ให้รองรับการเลือกแบบหลายคอลัมน์ด้วย `Cmd + Click` / `Ctrl + Click` (`node.selectMulti()` หรือ `node.deselect()`) และ `Shift + Click` (`node.selectContiguous()`) ผ่าน `react-arborist`
    - **Keyboard Shortcut (`Cmd+C` / `Ctrl+C`):** ดักจับคีย์ลัดคัดลอกในพื้นที่ Explorer Tree เมื่อมีการเลือกคอลัมน์ โดยจะคัดลอกเฉพาะชื่อคอลัมน์ (`col1, col2, col3`) ลง Clipboard พร้อมแสดง Toast แจ้งเตือน
    - **Context Menu Options on Column Nodes:**
      - **Copy Column Name(s):** คัดลอกเฉพาะชื่อคอลัมน์ (เช่น `id, name, phone`)
      - **Copy Name and Type(s):** คัดลอกชื่อพร้อมประเภทข้อมูล (เช่น `id varchar, name varchar, phone varchar`)
      - ปรับปรุง `handleContextMenu` ให้คง Selection เดิมไว้หากคลิกขวาบนโหนดที่อยู่ในกลุ่มที่ถูกเลือกอยู่แล้ว

39. **Issue #147: Equalize Dropdown and Textbox Heights across Form Controls (`AuditLogDrawer.tsx`, `VisualQueryBuilderTab.tsx`, `FilterBar.tsx`, `CreateTableModal.tsx`)**
    - **AuditLogDrawer Search & Filter Height Alignment:** กำหนด Explicit Height `h-[34px]` ควบคู่กันบน Search Input Textbox และ Select Dropdowns (`All Actions`, `All Status`) เพื่อแก้ปัญหา WebKit บน macOS ละเลย padding บน Native Select จน Dropdown หดสั้นเหลือเพียง 27px เทียบกับ Textbox 45px
    - **Search Icon Precision Centering:** ปรับตำแหน่งไอคอน `<Search>` ด้วย `top-1/2 -translate-y-1/2` แทนการฮาร์ดโค้ด `top-2.5` เพื่อให้อยู่กึ่งกลางแนวตั้งเป๊ะสมบูรณ์
    - **Query Builder & Filter Bar Height Normalization:** กำหนด Explicit Height บน Form Controls คู่ขนานกันใน `VisualQueryBuilderTab.tsx` (`h-[30px]`), `FilterBar.tsx` (`h-[28px]`), และ `CreateTableModal.tsx` (`h-[30px]`) ให้มีความสูงเท่ากันทุกจุด 100%

40. **Issue #148: Equalize Dropdown and Button Heights in SqlEditor Toolbar (`EditorToolbar.tsx`, `PaginationBar.tsx`, `GridBottomBar.tsx`)**
    - **SqlEditor Toolbar Height Alignment:** กำหนด Explicit Height `height: '28px'` และ `boxSizing: 'border-box'` ให้กับ `<select>` ทั้งสองตัวใน Editor Toolbar ได้แก่ Isolation Level Selector (`Read Committed`) และ Safe Limit Selector (`1,000 (Safe Default)`) รวมถึงปุ่มคำสั่งทั้งหมดใน Toolbar ให้มีขนาด 28px เท่ากันทั้งหมด 100% ป้องกัน macOS WebKit ย่อขนาด dropdown ต่ำกว่าปุ่มข้างเคียง
    - **Auto-Commit Toggle Text Contrast:** กำหนดสีตัวอักษรของป้าย `Auto-Commit: ON/OFF` ให้ชัดเจน ไม่กลืนกับพื้นหลังของ Toolbar
    - **Grid Pagination Height Normalization:** กำหนด Explicit Height `h-[24px]` บนตัวเลือก Rows per page ใน `PaginationBar.tsx` และ `GridBottomBar.tsx` ให้มีขนาดสูงเท่ากับปุ่มควบคุมหน้า

41. **Issue #149: Comprehensive UI Localization (EN/TH) & Automated Parity Enforcement (`docs/designs/comprehensive_ui_localization.md`)**
    - **100% UI Localization Coverage:** ขยายการรองรับภาษาไทย (`th`) และอังกฤษ (`en`) ครอบคลุม UI ทั้งหมด 100% ทั้ง MainToolbar, StatusBar, ObjectBrowser, SqlEditor, DataGrid, ConnectionDialog, TableList, Diagnostic Modals, Data Transfer Wizards และ Toast Envelopes
    - **Database Technical Terminology Lexicon:** กำหนดมาตรฐานการทับศัพท์ภาษาไทยโดยคงคำศัพท์เทคนิคฐานข้อมูลเป็นภาษาอังกฤษเดิมเสมอ (เช่น "รัน Query", "เลือก Schema", "ดู Execution Plan", "Primary Key", "Index", "Transaction", "Rollback") เพื่อความถูกต้องและสะดวกต่อการใช้งานของนักพัฒนา
    - **Raw Database Engine Error Preservation:** ข้อความแจ้งเตือนข้อผิดพลาดจาก Database Engine และ Rust Driver (PostgreSQL, SQLite, MySQL) จะคงข้อความดิบดั้งเดิมไว้เพื่อการวินิจฉัยปัญหา โดยห่อหุ้มด้วย Notification Envelope ภาษาไทยที่ปลอดภัย ผ่านยูทิลิตี้ `formatTauriError` ใน `src/utils/error.ts` และแสดงผลผ่าน `sonner`
    - **TypeScript Compile-Time Validation:** เสริม Custom Type Declaration ใน `src/types/i18next.d.ts` บนโมดูล `'i18next'` ด้วย `defaultNS: 'translation'` และ `typeof en` ช่วยตรวจจับคีย์ที่สะกดผิดหรือไม่มีอยู่จริงตั้งแต่ตอน compile (`pnpm check` / `tsc`)
    - **Automated Vitest Parity Test Suite:** สร้างชุดทดสอบ `src/test/i18nParity.test.ts` ตรวจสอบความสมบูรณ์ของคีย์คำแปลระหว่าง `en.json` และ `th.json` แบบ recursive ให้ตรงกัน 100%, ปราศจากค่าว่าง, และมีตัวแปร interpolation (`{{var}}`) ตรงกันทุกจุด ป้องกัน translation regressions ใน CI
    - **Phased Implementation Rollout:** แบ่งการพัฒนาออกเป็น 2 เฟส:
      - **Phase 1:** Core Infrastructure (Type definitions, `i18nParity.test.ts`, `src/utils/error.ts`), MainToolbar, StatusBar, ObjectBrowser, ConnectionTreeNode, ConnectionDialog, DriverForm, SqlEditor, ExecutionPlanDrawer, HistorySnippetsDrawer, DataGrid, GridBottomBar, CellDetailDrawer, CommandPaletteModal
      - **Phase 2:** TableListTab, Structure Modals (`CreateTableModal`, `DropTableModal`, `RenameTableModal`, `TableMaintenanceModal`), Diagnostic Modals (`DatabaseMetricsModal`, `LockInspectorModal`, `SchemaDiffModal`, `AuditLogDrawer`, `ActivityMonitorModal`, `UserPrivilegeManagerModal`), Data Transfer Wizards (`DataImportWizardModal`, `DataExportWizardModal`, `ExportSqlModal`, `ImportSqlModal`, `CrossDbCopyModal`)

42. **Issue #150: Phase 2 UI Localization for Table Management, Diagnostic Modals, and Data Transfer Wizards (`docs/designs/comprehensive_ui_localization.md`)**
    - **Table Structure & Designer Modals:** แปลและรองรับสองภาษา (EN/TH) ในหน้าต่างจัดการตาราง ได้แก่ `TableListTab.tsx`, `CreateTableModal.tsx`, `DropTableModal.tsx`, `RenameTableModal.tsx`, และ `TableMaintenanceModal.tsx`
    - **Diagnostic & Performance Monitoring:** แปลและรองรับสองภาษาในหน้าต่างตรวจวัดและวิเคราะห์ ได้แก่ `DatabaseMetricsModal.tsx`, `TablePartitionsModal.tsx`, `LockInspectorModal.tsx`, `SchemaDiffModal.tsx`, `AuditLogDrawer.tsx`, `ActivityMonitorModal.tsx`, และ `UserPrivilegeManagerModal.tsx`
    - **Data Transfer Wizards & Visual Tools:** แปลและรองรับสองภาษาในตัวช่วยนำเข้า/ส่งออกข้อมูล `DataImportWizardModal.tsx`, `DataExportWizardModal.tsx`, `ExportSqlModal.tsx`, `ImportSqlModal.tsx`, `CrossDbCopyModal.tsx`, `ERDiagramTab.tsx`, และ `VisualQueryBuilderTab.tsx`
    - **Strict Parity & Lexicon Standard:** รักษาความสมบูรณ์ 100% ระหว่าง `en.json` และ `th.json` ด้วย `src/test/i18nParity.test.ts` พร้อมคงคำศัพท์เทคนิคฐานข้อมูลตามมาตรฐานสากลเสมอ

43. **Issue #184: Light Mode Scrollbar & CellDetailDrawer Dual-Theme Compliance (`tokens.css`, `index.css`, `DataGrid.tsx`, `CellDetailDrawer.tsx`, `JsonTreeView.tsx`)**
    - **Dual-Theme CSS Tokens & Native Color Scheme:** นิยามตัวแปร `--bg-primary`, `--bg-tertiary`, `--bg-editor`, `--bg-card`, `--badge-bg`, `--badge-text`, `--scrollbar-thumb`, `--scrollbar-thumb-hover` และตัวแปร syntax/code สำหรับ Light Mode, Dark Mode และ High-Contrast ใน `src/styles/tokens.css` พร้อมกำหนด `color-scheme: light` (`:root`) และ `color-scheme: dark` (`.dark`)
    - **Clean Light Mode Scrollbars:** ปรับ `src/index.css` ให้ใช้ `var(--scrollbar-thumb)` / `var(--scrollbar-thumb-hover)` พร้อมเพิ่ม `::-webkit-scrollbar-corner { background: transparent; }` และเปลี่ยนพื้นหลังของ `DataGrid` container (`data-grid-container`) จาก `var(--bg-primary, #181818)` เป็น `var(--bg-grid)` เพื่อไม่ให้พื้นหลังสีดำทะลุขึ้นมาใต้ track ของ scrollbar ใน Light Mode
    - **CellDetailDrawer & JsonTreeView Light Mode Support:** ปรับสีพื้นหลัง, แถบ meta, ปุ่ม View/Edit, Staged Diff Banner, Foreign Key Banner, Date & Time Intelligence Banner, Image Preview Box, Edit Textarea และ `JsonTreeView` ให้ใช้ CSS variables จาก `tokens.css` ทั้งหมด แทนที่สี dark-only ที่เคยฮาร์ดโค้ดไว้

44. **Issue #185: Accurate Row Count for Small/Unanalyzed Tables & StatusBar Sync (`drivers/mod.rs`, `postgres.rs`, `mysql.rs`, `mssql.rs`, `DockLayout.tsx`)**
    - **Approximate Count Threshold (`APPROX_COUNT_THRESHOLD = 10_000`):** ปรับ drivers ของ PostgreSQL, MySQL และ MSSQL ให้ใช้ค่าประมาณจาก metadata (`reltuples`, `TABLE_ROWS`, `sys.partitions`) เฉพาะตารางที่มีค่าประมาณตั้งแต่ `10,000` แถวขึ้นไป หากน้อยกว่านี้ให้รัน `SELECT COUNT(*)` จริงโดยอัตโนมัติ แก้ปัญหาตารางขนาดเล็กที่ยังไม่ได้ `ANALYZE` แสดงยอดคลาดเคลื่อน
    - **Page-Level Row Count Reconciliation (`reconcile_page_row_count`):** หากจำนวนแถวที่ดึงได้ในหน้าปัจจุบันน้อยกว่า `limit` (และอยู่ที่ `offset = 0` หรือได้ข้อมูล > 0 แถว) ระบบจะปรับ `rows_affected` เป็น `offset + rows.len()` และล้าง `is_approximate_count` ทันทีทั้งฝั่ง Rust และ Frontend (`DockLayout.tsx`)
    - **Exact Count StatusBar Sync:** อัปเดต `useStatusStore` (`rowCount: exactCount`) ใน `handleExactCount` ของ `DockLayout.tsx` ให้ `StatusBar` ด้านล่างสุดแสดงจำนวนแถวจริงตรงกับ `GridBottomBar` ทันทีหลังกดปุ่ม "นับจริง"

45. **Issue #186: Excel-like Fast Edit Mode (`fastEditStore.ts`, `fastEditUtils.ts`, `DataGrid.tsx`, `GridBottomBar.tsx`, `gridUtils.ts`, `tableEditHelpers.ts`)**
    - **Per-Connection Persistence & Default OFF:** สร้าง `useFastEditStore` เก็บสถานะการเปิด-ปิดแยกตาม `connectionId` ใน `localStorage` (`datacore-fast-edit-mode`) โดยค่าเริ่มต้นเป็นปิดสำหรับทุกฐานข้อมูลที่ยังไม่เคยเปิด
    - **Forced Staging Mode:** เมื่อเปิดใช้งานโหมดแก้ไขแบบเร็ว ระบบจะบังคับปิด `Auto-Commit` (เข้าสู่ Staging Mode) และล็อกปุ่มสลับ `Auto-Commit` พร้อม tooltip อธิบาย จนกว่าจะปิดโหมดแก้ไขแบบเร็ว ผู้ใช้ต้องกดปุ่ม **Commit** หรือใช้คีย์ลัด `Cmd+S` / `Ctrl+S` เพื่อบันทึกข้อมูลจริงเสมอ
    - **Excel-like Inline Editing & Multi-Cell Paste:**
      - เมื่อเปิดโหมดแก้ไขแบบเร็ว การคลิกแล้วพิมพ์ (`editOnType`), กด `Enter` หรือดับเบิลคลิก จะแก้ไขข้อมูลในเซลล์ตรงๆ โดยไม่เปิด `CellDetailDrawer`
      - รองรับการ Paste (`Cmd+V` / `Ctrl+V`) ทั้งแบบเซลล์เดียว หลายเซลล์ และหลายแถวจาก Excel/Sheets หรือในตารางเอง (รวมถึงการวางบนตารางที่ยังว่างอยู่ 0 แถว)
      - หากจำนวนแถวที่วางเกินแถวที่มีอยู่ ระบบจะสร้างแถวใหม่ต่อท้าย (`addedRows`) อัตโนมัติโดยละคอลัมน์ที่ไม่ได้วางค่าไว้ (`undefined`) เพื่อให้ `DEFAULT` ของฐานข้อมูลทำงานตอน Commit และตัดคอลัมน์ส่วนเกินทิ้งอัตโนมัติ
    - **Data Type Validation & Security Guards:** ตรวจสอบประเภทข้อมูลก่อน stage (เช่น ปฏิเสธข้อความ/วันที่ในคอลัมน์ตัวเลข, ตรวจสอบ Boolean `true`/`false`/`1`/`0`, JSON, Date/Time) พร้อมแจ้งเตือนเมื่อไม่ถูกต้อง และล็อกคอลัมน์ที่ถูก Mask PII (แจ้งให้กด Unmasked ก่อนแก้) รวมถึงคอลัมน์ `Bytes`

46. **Issue #187: Add `#portal` Container for Glide Data Grid Inline Overlay Editor (`index.html`, `src/index.css`)**
    - **Overlay Editor Portal Mount:** เพิ่ม `<div id="portal" style="position: fixed; left: 0; top: 0; z-index: 9999;"></div>` ใน `index.html` เพื่อให้ `@glideapps/glide-data-grid` สามารถ mount กล่องแก้ไขในเซลล์ (`DataGridOverlayEditor`) ได้เมื่อเปิดโหมดแก้ไขเร็ว
    - **WKWebView Text Selection:** เพิ่มกฎ `#portal input, #portal textarea { user-select: text; -webkit-user-select: text; }` ใน `src/index.css` เพื่อไม่ให้ `user-select: none` บน `body` ขัดขวางการเลือกข้อความในกล่องแก้ไข

47. **Issue #188: Warning Confirmation Dialogs for Fast Edit Mode & Commit (`DataGrid.tsx`, `en.json`, `th.json`)**
    - **Confirm Before Enabling Fast Edit Mode:** แสดง Confirm Dialog ระดับ `warning` พร้อมคำเตือนทุกครั้งก่อนเปิดใช้งานโหมดแก้ไขเร็ว (ทั้ง EN/TH) หากผู้ใช้กดยกเลิกจะไม่เปิดโหมดแก้ไขเร็ว
    - **Confirm Before Commit:** แสดง Confirm Dialog ระดับ `warning` พร้อมจำนวนรายการที่รอ Commit และคำเตือนก่อนบันทึกลงฐานข้อมูลจริง ทั้งเมื่อกดปุ่ม **Commit** และกดคีย์ลัด `Cmd+S` / `Ctrl+S`

48. **Issue #189: In-Place Table Row Update After Commit, Insert & Delete (`tableEditHelpers.ts`, `DockLayout.tsx`)**
    - **No Full-Table Reload on Save:** เพิ่ม helper `toCellValue` และ `applyTableMutations` ใน `src/components/grid/tableEditHelpers.ts` สำหรับอัปเดต `cellEdits`, `addedRows` และ `deletedRowIndices` ลงใน state ของตารางบนหน้าจอโดยตรง
    - **Instant In-Place State & Count Sync:** ปรับ `handleCommitChanges`, `handleSubmitInsertRow`, `handleDeleteRow` และ `handleRowsDelete` ใน `DockLayout.tsx` ให้อัปเดต `tableStates` และ `useStatusStore` (`rowCount`) ทันทีหลังบันทึกสำเร็จโดยไม่ต้องเรียก `loadTableData` ซ้ำ ลดความหน่วงบนตารางขนาดใหญ่

49. **Issue #190: Auto-Generated ID & Default Value Retrieval on INSERT (`queryBuilder.ts`, `mssql.rs`, `tableEditHelpers.ts`, `DockLayout.tsx`)**
    - **`INSERT ... RETURNING *` / `OUTPUT INSERTED.*`:** เพิ่ม option `returning?: boolean` ใน `buildInsertSql` สำหรับ PostgreSQL/SQLite (`RETURNING *`) และ MSSQL (`OUTPUT INSERTED.*`) พร้อมปรับ `mssql.rs` ให้คืนแถวผลลัพธ์สำหรับคำสั่งที่มี `OUTPUT`
    - **MySQL `LAST_INSERT_ID()` Fallback:** สำหรับ MySQL จะดึงเฉพาะแถวล่าสุด 1 แถวผ่าน `LAST_INSERT_ID()` (เมื่อมีคอลัมน์ auto-increment)
    - **In-Place Row Hydration:** `handleCommitChanges` และ `handleSubmitInsertRow` ใน `DockLayout.tsx` นำแถวที่ฐานข้อมูลคืนกลับมาอัปเดตลงในตารางทันที ทำให้เห็น `id` และค่า `DEFAULT` โดยไม่ต้องโหลดข้อมูลใหม่ทั้งตาราง

50. **Issue #191: Primary Key Management, Equalized Dropdown/Input Heights & Enlarged Structure Modals (`ColumnsTab.tsx`, `ConstraintsTab.tsx`, `ForeignKeysTab.tsx`, `IndexesTab.tsx`, `RlsSecurityTab.tsx`, `tableStructureHelpers.ts`, `tableManagementHelpers.ts`, `queryBuilder.ts`, `index.css`)**
    - **Primary Key Management (Columns & Constraints):**
      - เพิ่มตัวเลือก `Primary Key` ใน Modal **Add Column** และ **Edit Column** ของ `ColumnsTab.tsx` พร้อมบังคับปิด `Allow NULL` อัตโนมัติเมื่อเลือก PK และสร้าง SQL สำหรับ PostgreSQL (`SET NOT NULL` + `ADD/DROP CONSTRAINT PRIMARY KEY`), MySQL (`ADD/DROP PRIMARY KEY`), และ SQLite (Table Rebuild ผ่าน `buildSqliteRebuildScript`)
      - เพิ่มชนิด `PRIMARY KEY` ใน `ConstraintsTab.tsx`, `getFetchConstraintsSql`, `parseConstraintsFromQueryResult`, `buildAddConstraintSql` และ `buildDropConstraintSql` เพื่อให้ดู เพิ่ม และลบ Primary Key Constraint (รวมถึง Composite PK) ได้โดยตรง
    - **Additional Structure Edge Cases:**
      - แก้ไข `parseColumnsFromQueryResult` สำหรับ SQLite ให้รองรับ Composite PK (`Number(pkVal) > 0` แทน `=== '1'`)
      - แก้ไขการเปรียบเทียบ Data Type ใน `ColumnsTab` Edit Column ให้เป็น Case-Insensitive เพื่อไม่ให้เกิดคำสั่ง `ALTER COLUMN TYPE` โดยไม่จำเป็น (เช่น `VARCHAR` vs `varchar`)
    - **Equalized Dropdown & Textbox Heights:** ปรับ `select:not([multiple])` ใน `src/index.css` ให้ใช้ `appearance: none` พร้อม custom SVG chevron และกำหนดความสูง `h-9` ให้ `<select>` และ `<input>` เท่ากันทุก Modal บน macOS WebKit
    - **Enlarged Structure Modals:** ขยายขนาด Form Modals ของ `ColumnsTab`, `IndexesTab`, `ForeignKeysTab`, `ConstraintsTab`, และ `RlsSecurityTab` เป็น `max-w-2xl` พร้อม Layout ที่โปร่งและอ่าน SQL Preview ได้สะดวกขึ้น

51. **Issue #192: Batch Multi-Column Row Updates into Single UPDATE Query (`queryBuilder.ts`, `DockLayout.tsx`)**
    - **Multi-Column `buildUpdateSql`:** เพิ่ม option `updates?: Array<{ colIndex: number; newValue: unknown }>` ใน `BuildUpdateOptions` ของ `src/api/queryBuilder.ts` เพื่อรวมการแก้ไขหลายคอลัมน์ในแถวเดียวกันเป็นคำสั่ง `UPDATE ... SET "col1" = ..., "col2" = ... WHERE ...;` เพียงคำสั่งเดียว (พร้อมคง Single-row Guard สำหรับตารางที่ไม่มี PK)
    - **Row-Level Batching in `handleCommitChanges`:** ปรับ `DockLayout.tsx` ให้สร้างคำสั่ง `UPDATE` เพียง 1 query ต่อ 1 แถวที่ถูกแก้ไข (แทนการยิงแยกทีละคอลัมน์) โดยอ้างอิงค่าเดิมของแถวใน `WHERE` ลดจำนวน Query, Transaction overhead และ Audit Log entries เมื่อแก้ไขข้อมูลจำนวนมาก

52. **Issue #193: MSSQL `TOP (1)` Single-Row Guard & Non-Comparable Type Filtering for Non-PK Tables (`queryBuilder.ts`)**
    - **MSSQL Non-PK Single-Row Guard:** เพิ่ม branch สำหรับ `mssql` / `sqlserver` ใน `buildUpdateSql` (`UPDATE TOP (1) ... WHERE ...;`) และ `buildDeleteSql` (`DELETE TOP (1) FROM ... WHERE ...;`) สำหรับตารางที่ไม่มี Primary Key แทนการตกไปใช้ `ctid` ของ PostgreSQL
    - **Safe Non-PK `WHERE` Fallback:** ปรับ `buildWhereClause` ให้ข้ามคอลัมน์ชนิดที่ไม่รองรับ operator `=` ใน `WHERE` (เช่น `json`, `xml`, `bytea`, `blob`, `binary`, `varbinary`, `image`, `ntext`, และ `text` ใน MSSQL) เมื่อมีคอลัมน์อื่นที่เปรียบเทียบได้อยู่ในแถว

53. **Issue #194: User-Toggleable Screen Sharing Protection / Privacy Mode (`commands/db.rs`, `menu.rs`, `privacyStore.ts`, `ConnectionSecurityModal.tsx`, `MainToolbar.tsx`, `CommandPaletteModal.tsx`, `App.tsx`)**
    - **Native Content Protection (macOS `NSWindowSharingNone`):** เพิ่ม Tauri Command `set_screen_protection(enabled: bool)` ฝั่ง Rust โดยเรียก `WebviewWindow::set_content_protected(enabled)` เพื่อป้องกันไม่ให้โปรแกรมแชร์หน้าจอ/อัดหน้าจอ (เช่น Zoom, Microsoft Teams, OBS, QuickTime) จับภาพหน้าต่าง DataCore ได้เมื่อเปิดใช้งาน
    - **Zustand State & Persistence:** สร้าง `privacyStore.ts` เก็บสถานะ `screenProtectionEnabled` ใน `localStorage` (`datacore-screen-protection`) และ sync สถานะกับหน้าต่าง Tauri อัตโนมัติเมื่อเปิดแอป (`syncScreenProtection`)
    - **Multi-Surface Toggle UI:** เพิ่มสวิตช์เปิด-ปิดใน `ConnectionSecurityModal`, เมนูสลับด่วนพร้อมสถานะใน `MainToolbar` (Tools -> Security & Administration), คำสั่งใน `CommandPaletteModal` (`⌘K`), และรายการเมนู `Toggle Screen Sharing Protection` ใน macOS Native Menu Bar (`View`) พร้อมรองรับภาษาไทย/อังกฤษ (`en.json`, `th.json`)

54. **Issue #195: Query Tab Dropdown Padding Fix (`EditorToolbar.tsx`)**
    - **Chevron Overlap Fix:** ปรับ inline padding ของ `<select>` สำหรับ `Isolation Level` และ `Safe Limit` ใน `src/components/editor/EditorToolbar.tsx` จาก `0 6px` เป็น `0 28px 0 8px` เพื่อเว้นพื้นที่ให้ custom SVG chevron ใน `src/index.css` ไม่ทับข้อความตัวเลือก (เช่น `1,000 (Safe Default)` และ `Read Committed`)

55. **Issue #196: Refresh All Only Refreshes Connected Databases (`ObjectBrowser.tsx`)**
    - **Selective Schema Refresh:** ปรับปุ่ม `Refresh All` ใน `src/components/sidebar/ObjectBrowser.tsx` ให้เรียก `handleRefreshAll` ซึ่งโหลดรายการ connection ล่าสุดผ่าน `loadConnections()` และเรียก `fetchSchema(c.id)` เฉพาะฐานข้อมูลที่อยู่ใน `connectedConnectionIds` เท่านั้น ป้องกันการเชื่อมต่อฐานข้อมูลที่ยังไม่ได้เชื่อมต่อโดยอัตโนมัติ

---

## 6. แผนงานระยะถัดไป: Enterprise Hardening & Ecosystem Expansion (Phase 34 - 38)

แผนงานยกระดับความสามารถของ DataCore ต่อยอดสู่ระดับ Production Enterprise-Grade ครอบคลุมด้านความปลอดภัย, ความสะดวกในการใช้งาน, การจัดการ Database Objects ขั้นสูง, การขยาย Database Engines และมาตรฐานการเผยแพร่แอปบน macOS:

### Phase 34: Security Hardening, Type-Safe IPC & Production Guardrails (Issue #151 - P0) [Completed]
- **34.1 In-Memory Secret Zeroization (`zeroize`) [Completed]:** ติดตั้ง crate `zeroize` และห่อหุ้ม Master Password, Vault Cache, Connection Password, และ SSH Passphrase ด้วย `Zeroizing` พร้อม Implement `Drop` เพื่อล้างหน่วยความจำทันทีที่ Lock หรือ Disconnect
- **34.2 Type-Safe IPC Contract (`tauri-specta`) [Completed]:** ติดตั้ง `specta` และ `tauri-specta` พร้อมคำสั่ง `pnpm bindings` สร้าง TypeScript Bindings จาก Rust Struct Models อัตโนมัติ (`src/types/bindings.ts`) ป้องกัน IPC type drift
- **34.3 Structured / Parameterized Filter Builder & AST [Completed]:** ออกแบบ `FilterCondition` AST แทนการต่อ String `WHERE` ป้องกัน SQL Injection อย่างเด็ดขาด พร้อม validation
- **34.4 Opt-in macOS Keychain Sync [Updated in Issue #197/#199]:** สร้างโมดูล `src-tauri/src/services/macos_keychain.rs` และเชื่อมโยงกับ Vault จัดเก็บ Master Password (ผ่าน `security -i` stdin) พร้อม Toggle Opt-in ใน Connection Security Modal โดยคง Local Encrypted Vault เป็นค่าเริ่มต้นแบบ Zero-popup (ยกเลิกคำกล่าวอ้างเรื่อง Biometric/Touch ID ที่ยังไม่ได้ implement ใน Phase 54)
- **34.5 Production Environment Guardrails & Safe Mode [Completed]:** เพิ่มแถบสีระบุ Environment (`local`, `staging`, `production`) และระบบ Safe Mode บังคับพิมพ์ยืนยันก่อนรันคำสั่งแก้ไข/ลบข้อมูลที่มีความเสี่ยงสูง
- **34.6 PII Sensitive Column Masking [Completed]:** สร้างระบบตรวจจับข้อมูลอ่อนไหวอัตโนมัติ (`src/utils/piiDetector.ts`) ครอบคลุม Passwords, Secrets, Tokens, Identifiers (SSN, Citizen ID), Financial (Cards, CVV), และ Contact (Email, Phone) พร้อมปุ่ม Toggle บน DataGrid Bottom Bar และระบบป้องกันการคัดลอก PII ใน Clipboard

### Phase 35: UX/UI Ergonomics & Workspace Persistence (Issue #152 - P1)
- **35.1 Session & Workspace State Persistence [Completed]:** บันทึกและกู้คืน Document Tabs, Active Connection, SQL Drafts, Splitter Ratio และ Data Grid Column Widths อัตโนมัติ โดยใช้ Atomic Write บนไฟล์ `~/.datacore/workspace_state.json` สิทธิ์ 0600 พร้อม Debounced auto-save (500ms) และ Hydration กู้คืนสถานะ tabs, active connection, sidebar width/collapsed
- **35.2 Data Grid Ergonomics & Foreign Key Popover [Completed]:** รองรับการกด ⌘+Click / Peek เพื่อดูข้อมูลแถวปลายทางของ Foreign Key ทันทีผ่าน `ForeignKeyPeekPopover` พร้อมปุ่ม Jump to Record และ Rich Cell Detail Drawer รองรับ Interactive JSON Tree View, Date & Time Intelligence (Local, UTC, Relative), Image Preview, และ Foreign Key Reference
- **35.3 Data Grid 'Copy As' Context Menu [Completed]:** เมนูคลิกขวา Context Menu "Copy As >" คัดลอกข้อมูลเป็น SQL INSERT, JSON, Markdown Table, SQL `IN (...)`, และ RFC-4180 CSV พร้อมรองรับ PII Sensitive Data Masking
- **35.4 Keyboard Shortcut Presets & Command Palette [Completed]:** ระบบ Keymap Presets (`shortcutStore.ts`) รองรับพรีเซ็ตคีย์ลัดที่หลากหลายตามความคุ้นเคยของผู้ใช้ (DataCore Default, Alternate DB Styles, และ VS Code) พร้อมตัวเลือกสลับ Preset บน `KeyboardShortcutsModal` และ Jump Search ใน Command Palette (⌘K) รองรับ Prefix Filters (`>` Actions, `@` Tables & Views, `$` Snippets & Templates, `/` Connections) เชื่อมโยงกับ `snippetStore`

### Phase 36: Deep Object Browser & Native Backup/Restore Suite (Issue #153 - P1)
- **36.1 Deep Object Browser Tree [Completed]:** ขยาย `fetch_schema_tree` ใน Rust drivers (SQLite, PostgreSQL, MySQL) และ IPC command `get_object_ddl` รองรับการสำรวจและจัดกลุ่ม Triggers, Stored Procedures, Functions, Sequences, และ Custom Types/Enums พร้อม Context Menu "View DDL / Source" เปิดไฟล์นิยาม DDL ใน Query Tab ทันที
- **36.2 Native Backup & Restore Wrapper Service [Completed]:** สร้าง Service ฝั่ง Rust (`src-tauri/src/services/native_backup.rs`) ตรวจจับและควบคุม CLI `pg_dump`, `pg_restore`, `mysqldump`, `sqlite3` แบบ Real-time Child Process พร้อม IPC streaming events (`native://progress`) และระบบยกเลิกงาน (Cancellation) เชื่อมต่อกับ UI Wizard `NativeBackupModal` และ `NativeRestoreModal`
- **36.3 Query Explain History & Plan Diff [Completed]:** ระบบจัดเก็บบันทึกประวัติ `ExplainSnapshot` ใน `explainHistoryStore.ts` และหน้าต่างเปรียบเทียบ `ExplainPlanDiffModal` แสดงผลเปรียบเทียบ Cost Delta, Execution Time Delta, Scan Type Highlight (Seq Scan to Index Scan) พร้อม Side-by-Side Plan Nodes Tree และปุ่ม Save Snapshot บน `ExecutionPlanDrawer`

### Phase 37: Engine Expansion & Local-First AI Assistant (Issue #154 - P2) [Completed]
- **37.1 Embedded Analytics Engine (DuckDB) [Completed]:**
  - **Embedded In-Process Engine:** ผสานการทำงานผ่าน `duckdb` crate ใน Rust Backend รองรับ In-Memory (`:memory:`) และ Local Database File (`.duckdb`, `.db`)
  - **Direct File Analytics:** รองรับการคิวรีไฟล์ `.parquet`, `.csv`, `.tsv`, `.json` โดยตรงผ่าน DuckDB functions (`read_parquet`, `read_csv_auto`) พร้อมประสิทธิภาพสูงแบบ Columnar
  - **Schema & Query Integration:** ดึง Schema Metadata (Tables, Views) และรันคิวรีพร้อม Pagination (`LIMIT ... OFFSET ...`) แสดงผลบน DataGrid
  - **Frontend UI:** เพิ่มตัวเลือกไดรเวอร์ DuckDB ใน `DriverForm` และ `ConnectionDialog` พร้อม File Browser Picker
- **37.2 Microsoft SQL Server (MSSQL) Driver [Completed]:**
  - **Native TDS Driver:** เชื่อมต่อผ่าน `tiberius` crate พร้อมรองรับ SQL Server Authentication (Username/Password), Port เริ่มต้น 1433, และ TLS Encryption (`trust_server_certificate`)
  - **Schema Introspection:** ดึง Schemas (`sys.schemas`), Tables (`sys.tables`), Views (`sys.views`), และ Columns (`INFORMATION_SCHEMA.COLUMNS`)
  - **Query Execution:** รัน T-SQL queries และ Pagination ด้วย `OFFSET ... ROWS FETCH NEXT ... ROWS ONLY`
- **37.3 Local-First AI Assistant [Removed - Issue #156]:**
  - ฟีเจอร์ AI Assistant (aiStore, AiAssistantDrawer และ Toolbar Button) ถูกถอดออกเพื่อคงความเรียบง่าย คลีน รวดเร็ว และโฟกัสกับเครื่องมือการจัดการฐานข้อมูลหลักระดับมืออาชีพโดยไม่มีส่วนประกอบ AI รบกวนหน้าต่างการทำงาน

### Phase 38: Distribution, Auto-Updater & Accessibility Standards (Issue #155 - P1) [Completed]
- **38.1 macOS Hardened Runtime, Code Signing & Notarization [Completed]:**
  - **Entitlements Definition:** สร้าง `src-tauri/entitlements.plist` รองรับ Network Client (`com.apple.security.network.client`), User-selected Read/Write Files (`com.apple.security.files.user-selected.read-write`), Downloads Read/Write, JIT & Unsigned Executable Memory สำหรับ WebKit/V8 engine
  - **Tauri Bundle Configuration:** ปรับแต่ง `src-tauri/tauri.conf.json` กำหนด `bundle.macOS` พร้อม `entitlements`, `minimumSystemVersion: "11.0"`, `signingIdentity`, และ `bundle.macOS.dmg` layout
  - **Automated CI/CD Workflow:** สร้าง `.github/workflows/release.yml` รันบน `macos-14` (Apple Silicon) พร้อมกระบวนการ Sign Developer ID Application, Notarize ผ่าน `xcrun notarytool` และ Staple ลงบน `.dmg`
- **38.2 Auto-Updater Integration (`tauri-plugin-updater`) [Completed]:**
  - ติดตั้งและตั้งค่า `tauri-plugin-updater` ใน Rust backend และ plugins ใน `tauri.conf.json`
  - รองรับ Public Key Signature Verification ป้องกันการปลอมแปลงไฟล์อัปเดต
  - หน้าต่าง UI `UpdateCheckerModal` แจ้งเตือนเวอร์ชันใหม่ แสดง Release Notes และ Progress การดาวน์โหลด พร้อมปุ่ม Check for Updates บน MainToolbar
- **38.3 Diagnostic Bundle Export [Completed]:**
  - สร้าง Service รวบรวมข้อมูล System Environment (OS, Arch, CPU, App Version), Active Connection Configs แบบ Sanitized (Scrubbed and Redacted: ป้องกัน Passwords, SSH Keys, SSL Certs, Tokens, และ Query Data รั่วไหล 100%), Active Tabs Count และ Timestamps
  - หน้าต่าง UI `DiagnosticBundleModal` พร้อม Preview JSON, ปุ่มคัดลอก และปุ่มดาวน์โหลดไฟล์ `datacore-diagnostic-YYYYMMDD.json`
  - เมนูบน MainToolbar Tools สำหรับ Export Diagnostic Bundle
- **38.4 WCAG 2.1 AA Accessibility Standards [Completed]:**
  - เพิ่มโหมด High-Contrast Theme (`.high-contrast` และ `.dark.high-contrast`) พร้อมรองรับ `@media (prefers-contrast: more)` อัตโนมัติจาก macOS System Settings (Contrast Ratio >= 7:1)
  - Focus Trap และ Keyboard Navigation (Esc, Tab, Enter) ใน Dialogs และ Drawers ผ่าน Radix UI Dialog
  - เพิ่ม ARIA Live Region (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`) สำหรับ Screen Reader บน `StatusBar` และ `role="alert"`, `aria-live="assertive"` บน `SqlEditor` Error Callout Panel

### Phase 39: Editor Ergonomics & Polish (Issue #157, #158) [Completed]
- **39.1 Click Anywhere to Focus Query Editor [Completed - Issue #157]:**
  - เพิ่ม CodeMirror extension `editorFullHeightTheme` กำหนด `.cm-content` และ `.cm-gutters` ให้มี `minHeight: 100%` และ `cursor: text` พร้อม `.cm-scroller` `height: 100%`
  - เพิ่ม Event Handler บน `sql-editor-container` เพื่อดักการคลิกบนพื้นที่ว่างใดๆ ใต้ข้อความ แล้วส่งโฟกัสเคอร์เซอร์ไปยังบรรทัดที่ 1 / ตำแหน่งข้อความทันทีโดยไม่ต้องเล็งคลิกที่แถว 1 เท่านั้น
- **39.2 Resolve Cmd+/ Shortcut Collision (SQL Line Comment vs Cheat Sheet) [Completed - Issue #158]:**
  - ย้ายคีย์ลัดสำหรับเปิด Shortcuts Cheat Sheet Modal เป็น `Cmd+Shift+/` (`⌘?` / `Ctrl+Shift+/`) หรือกด `?` ตอนไม่ได้อยู่ในช่อง input ตามมาตรฐานแอป macOS
  - ปลดล็อก `Cmd+/` ใน `useShortcuts.ts` ให้ปล่อยผ่าน (not intercepted) เพื่อให้ CodeMirror ใน `SqlEditor.tsx` ทำหน้าที่ Toggle Line Comment (`--`) บนบรรทัดหรือข้อความที่เลือกผ่าน `toggleComment` จาก `@codemirror/commands`
  - อัปเดตรายการคีย์ลัดใน `KeyboardShortcutsModal`, `MainToolbar` (ปุ่มคีย์ลัดพร้อม aria-label/title `Keyboard Shortcuts (⌘?)`), และ Localization ทั้งภาษาไทยและภาษาอังกฤษ

### Phase 40: Toolbar Connection State Guarding & Disconnected Safety Checks (Issue #159) [Completed]
- **40.1 Toolbar Buttons Disabled State When Disconnected:**
  - ปรับปรุงการตรวจสอบสถานะการเชื่อมต่อบน `MainToolbar.tsx` ให้ผูกกับ `connectedConnectionIds` จาก `useConnectionStore`
  - กำหนดให้ปุ่ม **Query ใหม่ (New Query)**, **ตาราง (Table)**, **เครื่องมือ (Tools)**, **สำรองข้อมูล (Backup)**, **นำเข้า (Import)** และ **ส่งออก (Export)** ถูก `disabled` ทันทีเมื่อไม่มีการเชื่อมต่อกับฐานข้อมูล (`connectedConnectionIds` เป็นค่าว่าง หรือ connection ปัจจุบันไม่ได้อยู่ใน `connectedConnectionIds`)
  - ปรับสถานะจุดสีและข้อความใน Connection Badge มุมขวาบนของ Toolbar ให้แสดงจุดสีเขียวเมื่อเชื่อมต่อจริงเท่านั้น หากเลือก connection ที่ไม่ได้เชื่อมต่อจะแสดงจุดสีเทาพร้อมข้อความ `(Disconnected)`
- **40.2 StatusBar Connection Indicator Accuracy:**
  - อัปเดต `StatusBar.tsx` ให้แสดงสถานะ `Connected` พร้อมจุดสีเขียวเฉพาะเมื่อ `activeConnectionId` มีอยู่ใน `connectedConnectionIds` เท่านั้น หากเลือก connection แต่ยังไม่ได้เชื่อมต่อจริงจะแสดง `Disconnected`
- **40.3 App & Shortcut Guards:**
  - เพิ่ม Guard ใน `handleNewQuery`, `handleOpenTable` (`App.tsx`) และคีย์ลัด `Cmd+T` (`useShortcuts.ts`) ไม่ให้เปิดแท็บบน connection ที่ยังไม่ได้เชื่อมต่อ
- **40.4 Global System Actions in Command Palette:**
  - เพิ่ม "Check for Updates..." และ "Export Diagnostic Bundle..." เข้าสู่ Command Palette (`⌘K`) เพื่อให้เรียกใช้งานได้ตลอดเวลาแม้ไม่ได้เชื่อมต่อฐานข้อมูล

### Phase 41: Database Session Readiness & Race Condition Elimination (Issue #160) [Completed]
- **41.1 In-Flight Promise Deduplication & Session Cache in dbApi (`src/api/db.ts`):**
  - เพิ่ม `inFlightSessions` Map และ `establishedSessions` Set เพื่อป้องกันการยิง `open_session` ซ้ำซ้อนขณะที่ connection handshake กำลังทำงานอยู่
  - คืนค่า Promise เดียวกันเมื่อมีการเรียก `openSession(connectionId, tabId)` พร้อมกันหลายจุด
  - เคลียร์ Cache อย่างถูกต้องเมื่อเรียก `closeSession` หรือ `disconnectConnection`
- **41.2 Pre-execution Session Guarantee in SqlEditor (`src/components/editor/SqlEditor.tsx`):**
  - เพิ่ม `ensureSession` helper ก่อนรัน `executeSql`, `handleExplain`, `handleToggleAutoCommit`, และ `handleSetIsolationLevel`
  - ป้องกันข้อผิดพลาด `Session for tab '...' not found` เมื่อผู้ใช้กด Run (⌘Enter) ทันทีหลังเปิดแท็บ
- **41.3 Eager Session Pre-warming (`src/components/sidebar/tabHelpers.ts`):**
  - เริ่มเปิด Session เบื้องหลังล่วงหน้าทันทีที่ผู้ใช้คลิกเปิดแท็บ Query ผ่าน `openQueryTab` ก่อนที่ component จะ render เสร็จ
- **41.4 Backend Session Idempotency (`src-tauri/src/commands/db.rs`):**
  - ตรวจสอบ `session_mgr.has_session(tab_id)` ใน `open_session_impl` เพื่อคืนค่า `Ok(())` ทันทีหาก session ถูกเปิดไว้เรียบร้อยแล้ว

### Phase 42: Connection State Synchronization & Query Editor Disconnected Guard (Issue #161) [Completed]
- **42.1 Accurate Explorer Connection Indicator (`src/components/sidebar/ConnectionTreeNode.tsx`):**
  - ปรับปรุง `indicator-active-connection` ให้ตรวจสอบ `isTargetActiveConnection && Boolean(data.isConnected)`
  - ป้องกันการแสดงจุดเขียว (`●`) บนโหนดฐานข้อมูลที่ยังไม่ได้เชื่อมต่อจริง
- **42.2 Query Editor Disconnected Banner & Connect Flow (`src/components/editor/SqlEditor.tsx`, `EditorToolbar.tsx`):**
  - ตรวจสอบสถานะ `isConnected` ใน `SqlEditor` และแสดงแถบ Disconnected Banner สีส้ม พร้อมปุ่ม **"เชื่อมต่อ (Connect)"**
  - ปิดการทำงาน (Disabled) ของปุ่ม Run, Explain, Analyze เมื่อยังไม่ได้เชื่อมต่อฐานข้อมูล
  - เพิ่มฟังก์ชัน `handleConnectDatabase` ใน `SqlEditor` เพื่อเชื่อมต่อ, อัปเดต `connectedConnectionIds` และโหลด Schema
- **42.3 Status Bar Active Tab Connection Synchronization (`src/components/chrome/StatusBar.tsx`):**
  - อัปเดตการ resolve connection ให้ใช้ `activeTab?.connectionId ?? activeConnectionId` เพื่อให้สถานะเชื่อมต่อตรงกับ MainToolbar และ Explorer เสมอ

### Phase 43: Context Menu Boundary Clamping & Auto-Flip Positioning (Issue #162) [Completed]
- **43.1 Context Menu Position Hook (`src/hooks/useContextMenuPosition.ts`):**
  - พัฒนาฟังก์ชัน pure logic `calculateContextMenuPosition` สำหรับตรวจจับการชนขอบจอ (Collision Detection)
  - พลิกทิศทางเมนูขึ้นด้านบน (Auto-Flip Upward) หรือกลับด้านซ้ายอัตโนมัติเมื่อใกล้ขอบล่าง/ขวาของหน้าต่าง
  - ปรับใช้ `useContextMenuPosition` hook เพื่อคำนวณตำแหน่ง element แบบ synchronous ก่อนการ paint
- **43.2 Object Browser & Table List Context Menus Integration (`src/components/sidebar/ObjectBrowser.tsx`, `src/components/tablelist/TableListTab.tsx`):**
  - นำตำแหน่งคำนวณมาใช้แทนการกำหนดพิกัดเมาส์ตรงๆ
  - กำหนด `max-h-[calc(100vh-16px)] overflow-y-auto` ให้เมนูเลื่อน scroll ได้ ป้องกันเมนูล้นจอในหน้าจอขนาดเล็ก

### Phase 44: สถาปัตยกรรมรองรับข้อมูลขนาดใหญ่ (Large Scale Data Architecture — Issues #163 - #174) [Completed]
> อ้างอิงเอกสารสถาปัตยกรรม: `large-data-architecture-and-optimization-guide-v2.1.md` ใน Obsidian Vault

แผนงานยกระดับสถาปัตยกรรมของ DataCore เพื่อรองรับการทำงานกับฐานข้อมูลและตารางขนาดใหญ่ระดับ 10–20 GB+ ได้อย่างมีเสถียรภาพ ประหยัดทรัพยากรหน่วยความจำ ไม่ค้าง และรักษาความถูกต้องของข้อมูล (Data Integrity) ไว้อย่างสมบูรณ์ แบ่งออกเป็น 4 ระยะย่อย:

#### เฟส 1a: ความถูกต้องของข้อมูลและความปลอดภัย (Data Integrity & Security — ทำก่อน)
- **44.1 Single-Statement Stream Query (`DatabaseConnection` Trait & Export Engine — Issue #163):**
  - เพิ่มเมธอด `stream_query` ใน `DatabaseConnection` trait พร้อม Default Implementation
  - Override `stream_query` บน PostgreSQL ด้วย `sqlx::raw_sql(sql).fetch_many` ผ่าน bounded `tokio::sync::mpsc::Sender<Chunk>` เพื่อให้เกิด Backpressure จริง
  - ปรับ `export_data_impl`, `export_sql_impl` และ `copy_table_cross_db_impl` ให้เลิกใช้ `LIMIT ... OFFSET ...` เพื่อป้องกันปัญหาข้อมูลซ้ำหรือตกหล่น (P1, §4.1)
- **44.2 ป้องกันข้อมูลสูญหายจาก Silent NULL ในการ Import (Issue #164):**
  - ปรับปรุง `format_sql_literal_with_options` เลิกแปลงค่า parse error เป็น `"NULL"` เงียบ ๆ
  - คืนค่า Error ในโหมด Abort หรือบันทึกแถวที่เสียลงไฟล์ `*.rejects.csv` พร้อมรายงานเลขแถวในโหมด Skip (P5, §4.7.3)
- **44.3 ความปลอดภัยรหัสผ่าน MySQL ในกระบวนการ Native Backup (Issue #165):**
  - ย้าย `tempfile` เข้าสู่ `[dependencies]` ใน `Cargo.toml`
  - ส่งรหัสผ่านผ่านไฟล์คอนฟิกชั่วคราว `--defaults-extra-file` สิทธิ์ `0600` เป็นตัวเลือกแรกสุดของคำสั่ง ป้องกันรหัสผ่านรั่วไหลใน `ps aux` (P10, §4.8)
- **44.4 ปรับปรุง `applySafeLimit` ใน Editor ให้รับรู้ชนิดไดรเวอร์ (Issue #166):**
  - ส่ง `driver` เข้า `applySafeLimit`: ไม่ต่อ `LIMIT` ดื้อ ๆ บน MSSQL และจัดการไม่ให้ต่อชนกับคอมเมนต์ท้ายบรรทัด `-- ...` (P9, §4.4)

#### เฟส 1b: การควบคุมงานและการป้องกันทรัพยากร (Work Control & Resource Protection)
- **44.5 Transfer Job Registry & Server-Side Cancel (Issue #167):**
  - พัฒนา Registry จัดเก็บ Connection Handle ของงาน Transfer เพื่อให้ `cancel_transfer` เรียก `conn.cancel()` ตัดคำสั่งบน Server ได้จริง
  - ส่ง `AppHandle` เข้า `export_data` เพื่อยิง event `transfer://progress` สดไปยัง UI และลบไฟล์ไม่สมบูรณ์เมื่อถูกยกเลิก (P6, P7, §4.5)
- **44.6 Backend Row & Byte Hard Cap ใน Query Editor (Issue #168):**
  - กำหนดเพดานตัดแถวและขนาดไบต์ที่ระดับ Backend Stream ใน `execute_query` พร้อมสั่ง cancel query ทันทีเมื่อชนเพดาน เพื่อป้องกัน RAM ล้น (P2, §4.3)
- **44.7 ขยาย `stream_query` ให้ครบทุกไดรเวอร์ (Issue #169):**
  - Override `stream_query` สำหรับ MySQL (`fetch_many`), SQLite (`spawn_blocking`), DuckDB (Native interface) และ MSSQL (`Tiberius::QueryStream`) (§4.1, §5)

#### เฟส 2: ความเร็วและสเกล (High-Throughput & Scaling)
- **44.8 Import หลายโหมด (Atomic, Chunked, Staging) และ Bisect Skip (Issue #170):**
  - เพิ่มตัวเลือก Chunked Commit (เช่น ทุก 50,000 แถว) เพื่อป้องกัน WAL/Undo log บวม และระบบ Checkpoint/Resume
  - ตรวจชนิดข้อมูลฝั่ง Client และใช้อัลกอริทึม Bisect (Binary Search) หาแถวเสียเมื่อ Batch พัง พร้อมจำกัด batch ของ MSSQL ไม่เกิน 1,000 แถว (P3, P4, §4.7)
- **44.9 PostgreSQL Wire COPY Protocol & Streaming Compression (Issue #171):**
  - รองรับการ Export/Import ผ่าน `copy_out_raw` / `copy_in_raw` บน PostgreSQL
  - เพิ่มการบีบอัด stream `.gz` / `.zst` On-the-fly ผ่าน `tokio::task::spawn_blocking` (§4.6, §4.10)
- **44.10 เสริมความแข็งแกร่ง Native CLI (Issue #172):**
  - รองรับ Parallel jobs `pg_dump -Fd -j` และปลด `--single-transaction` เมื่อใช้ `-j` ใน `pg_restore`
  - เพิ่ม `--single-transaction` ให้ `mysqldump` สำหรับตาราง InnoDB และส่งสัญญาณ SIGTERM ก่อน SIGKILL พร้อมลบไฟล์ตกค้าง (P11, P12, §4.8)

#### เฟส 3: ประสบการณ์ใช้งานและการจัดการตารางใหญ่ (UX & Big Data Management)
- **44.11 Approximate Row Count & Keyset Pagination (Issue #173):**
  - เลิกสั่ง `SELECT COUNT(*)` สดทุกครั้งที่เปิดตาราง โดยเปลี่ยนไปดึงค่าประมาณจาก System Catalog (`pg_class.reltuples`, `information_schema.tables.table_rows`)
  - เพิ่มตัวเลือกการแบ่งหน้าแบบ Keyset Pagination (Cursor-based) (§5.7, §8)
- **44.12 Transfer Monitor Dashboard & Table Partitioning UI (Issue #174):**
  - พัฒนาหน้าจอแสดงความเร็วการถ่ายโอนแบบ Live (MB/s, ETA)
  - ขยาย UI สำหรับจัดการ Range Partitioning (สร้าง, Detach, Drop) เพื่อการจัดเก็บข้อมูลย้อนหลัง (Archive) (§5.7)

### Phase 45: การตรวจสอบและแก้ไขช่องโหว่ ความถูกต้องของโปรแกรม และการจัดการโค้ดที่ไม่ได้ใช้งาน (Security, Correctness & Dead Code Audit Remediation — Issue #175) [Completed]

จากการตรวจสอบซอร์สโค้ดทั้งหมดของโปรเจกต์ทั้งฝั่ง Backend (`src-tauri/src/`) และ Frontend (`src/`) ได้กำหนดขอบเขตและแนวทางการแก้ไขปัญหาทั้ง 3 หมวดหมู่ดังนี้:

#### 45.1 การอุดช่องโหว่ด้านความปลอดภัย (Security Vulnerabilities)
- **Native Backup & Restore Path Guard & CLI Argument Injection (`transfer_commands.rs`, `native_backup.rs`):**
  - **ปัญหา:** `start_native_backup` และ `start_native_restore` ไม่ได้ตรวจสอบพาธผ่าน `validate_safe_transfer_path()`, MySQL restore ใช้ `--execute=source <path>` ที่เสี่ยงต่อการแทรกคำสั่ง, ส่งรหัสผ่านผ่าน `--password=...` บน CLI argv, และไม่ได้ตรวจสอบพารามิเตอร์ที่ขึ้นต้นด้วย `-`
  - **วิธีการแก้ไข:** บังคับใช้ `validate_safe_transfer_path` พร้อม `ALLOWED_BACKUP_EXTS`, สร้างตัวตรวจสอบ `validate_cli_arg_no_leading_dash` สำหรับ `host`, `user`, `database`, `tables`, `schemas`, เปลี่ยนการส่งรหัสผ่าน MySQL ไปใช้ `--defaults-extra-file` สิทธิ์ `0600` หรือ `MYSQL_PWD` (สอดคล้องกับ Issue #165), และกรองอักขระต้องห้าม (`;`, `\n`, `\r`, `\0`) ใน `input_file` ของ MySQL restore
- **MSSQL SSH Tunnel Bypass, TLS Trust & Zeroization (`drivers/mssql.rs`):**
  - **ปัญหา:** `MssqlConnection::connect` เพิกเฉยต่อ `config.ssh_tunnel`, เรียก `trust_cert()` ถาวรโดยไม่สนใจ `ssl_mode`, และเก็บ `password: Option<String>` ธรรมดาไว้โดยไม่ได้ใช้งาน
  - **วิธีการแก้ไข:** เชื่อมต่อผ่าน `SshTunnelHandle::establish` เมื่อ `ssh_tunnel.enabled == true` พร้อมเก็บ handle ใน `MssqlConnection`, ตั้งค่า TLS certificate validation ตาม `ssl_mode` (ไม่เรียก `trust_cert()` เมื่อเป็น `verify-ca`/`verify-full`), และลบฟิลด์ `password` ที่ไม่ได้ใช้ (หรือใช้ `Zeroizing`)
- **SSH Passphrase Isolation (`ConnectionDialog.tsx`, `connectionStore.ts`, `connection_store.rs`):**
  - **ปัญหา:** เมื่อไม่เลือก Remember password (`rememberPassword === false`) ค่า `ssh_tunnel.passphrase` ยังติดไปบันทึกใน `vault.enc` บนดิสก์และค้างอยู่ใน Zustand state
  - **วิธีการแก้ไข:** เพิ่มคำสั่ง IPC เก็บ SSH passphrase ชั่วคราวใน `SessionManager` (RAM) และล้างค่า `passphrase` ออกจาก `config.ssh_tunnel` / `config.sshTunnel` ทั้งก่อนส่งบันทึกและก่อนจัดเก็บใน `useConnectionStore`
- **File Permissions ของ `connections.json` (`connection_store.rs`):**
  - **ปัญหา:** `ConnectionStore::persist_connections` ไม่ได้จำกัดสิทธิ์ไดเรกทอรี (`0700`) และไฟล์ (`0600`)
  - **วิธีการแก้ไข:** เรียกใช้ `set_secure_dir_permissions` (`0700`) และ `set_secure_permissions` (`0600`) ใน `persist_connections`
- **SQL Injection ใน User Manager & SVG/DDL Injection ใน ER Diagram (`userManagerApi.ts`, `erDiagramApi.ts`):**
  - **ปัญหา:** `userManagerApi.ts` ไม่ได้ escape `host` และ `\` ในรหัสผ่าน MySQL รวมถึงไม่ได้ตรวจ whitelist ของ `privilege`; `erDiagramApi.ts` ไม่ได้ทำ XML escaping ใน `exportERDiagramAsSvg` และไม่ใช้ `quoteIdentifier` ใน `generateERDiagramSql`
  - **วิธีการแก้ไข:** ใช้ dialect-aware literal escaping สำหรับ `name`, `host`, `password` พร้อมตรวจสอบ `SUPPORTED_PRIVILEGES` และ quote object name ใน `userManagerApi.ts`; เพิ่มฟังก์ชัน `escapeXml()` สำหรับ SVG และใช้ `quoteIdentifier()` ใน `generateERDiagramSql`

#### 45.2 การแก้ไขความถูกต้องของโปรแกรมและการเชื่อมโยง (Program Correctness & Wiring Bugs)
- **รวม AuditLogger เป็น Instance เดียวและเลิกบันทึกซ้ำ (`audit_logger.rs`, `lib.rs`, `SqlEditor.tsx`):**
  - **ปัญหา:** `lib.rs` ลงทะเบียน `AuditLogger::default()` แยกกับ `AuditLogger::global()` ที่ใช้ใน `db.rs` และ `transfer_commands.rs` อีกทั้ง `SqlEditor.tsx` ส่ง `record_audit_log` ซ้ำกับ Backend ทำให้มีบันทึก 2 บรรทัดต่อ 1 Query และ Hash Chain เสียหายเมื่อเขียนสลับ instance
  - **วิธีการแก้ไข:** ปรับ `AuditLogger::default()` ให้คืนค่า `AuditLogger::global().clone()` เพื่อใช้ `last_hash_cache` และ `write_lock` ร่วมกัน และยกเลิกการส่ง `record_audit_log` ซ้ำจาก `SqlEditor.tsx` สำหรับ Query ที่ Backend บันทึกให้แล้ว
- **รองรับ Session Password & SSH Passphrase ใน Schema Tree, DDL และ Transfer (`db.rs`, `transfer_commands.rs`):**
  - **ปัญหา:** `get_schema_tree`, `get_object_ddl` และคำสั่งทั้งหมดใน `transfer_commands.rs` อ่านรหัสผ่านจากดิสก์ (`ConnectionStore`) เท่านั้น และไม่ดึง `ssh.passphrase` ในหลายจุด
  - **วิธีการแก้ไข:** สร้าง helper กลาง `resolve_connection_credentials` เพื่อดึง `password` และ `ssh.passphrase` จาก `SessionManager` (RAM) ก่อนแล้วจึง fallback ไปยัง `ConnectionStore` และนำไปใช้ครบทุก endpoint
- **Primary Key Metadata & Multi-Column Row Staging (`sqlite.rs`, `postgres.rs`, `mysql.rs`, `DockLayout.tsx`):**
  - **ปัญหา:** Drivers ไม่เติม `ColumnMeta.is_primary_key` / `is_auto_increment` ใน `fetch_table_data` และ `DockLayout.tsx` (`handleCommitChanges`) อ้างอิง `originalRow` เดิมตลอดเมื่อแก้ไขหลายคอลัมน์ในแถวเดียวกันในโหมด Manual Commit
  - **วิธีการแก้ไข:** เติมค่า `is_primary_key` และ `is_auto_increment` จาก Metadata ของ SQLite, PostgreSQL, MySQL (รวมถึง fallback ใน `DockLayout.tsx`) และปรับ `handleCommitChanges` ให้อัปเดต `workingRow` ระหว่างวนลูปสร้างคำสั่ง `UPDATE` ของแถวเดียวกัน
- **SQLite `.schema` Backup, `read_only` Enforcement & MSSQL `rows_affected` (`native_backup.rs`, `mssql.rs`, `duckdb.rs`):**
  - **ปัญหา:** SQLite `schema_only` พิมพ์ออก `stdout` ไม่ลงไฟล์ปลายทาง; `MssqlConnection` และ `DuckdbConnection` (in-memory) ไม่บังคับใช้ `read_only`; และ `MssqlConnection::execute_query` คืน `rows_affected = 0` สำหรับ DML
  - **วิธีการแก้ไข:** เขียนผลลัพธ์ `.schema` ลงไฟล์ `output_file`, บังคับตรวจ `self.read_only` ปฏิเสธคำสั่ง write ใน `execute_query` ของ MSSQL/DuckDB, และใช้ `client.execute(...)` สำหรับคำสั่ง DML/DDL ใน MSSQL เพื่อคืนค่า `rows_affected` ที่ถูกต้อง
- **Frontend Feature Wiring (`useShortcuts.ts`, `MainToolbar.tsx`, `CommandPaletteModal.tsx`, `db.rs`):**
  - **วิธีการแก้ไข:** เชื่อม `useShortcuts.ts` เข้ากับ `useShortcutStore` เพื่อใช้ Keymap Presets จริง, เปิดให้กดปุ่ม `Tools` บน `MainToolbar.tsx` เพื่อเข้าถึง `Check for Updates...` และ `Export Diagnostic Bundle...` ได้แม้ยังไม่ต่อฐานข้อมูล, ใช้ `changeLanguage()` จาก `src/i18n.ts` ใน `CommandPaletteModal.tsx` เพื่อบันทึกลง `localStorage`, และเปลี่ยน `disconnect_connection_impl` ให้ล้าง cache ของ `store.vault()` แทน `clear_mock_store()`

#### 45.3 การลบโค้ดและไฟล์ที่ไม่ได้ใช้งาน (Unused / Dead Code Removal)
- **ไฟล์ Frontend ที่ไม่ได้ถูก import ใน Production:** ลบ `src/components/grid/PaginationBar.tsx` (พร้อมอัปเดต `DataGrid.test.tsx`), `src/components/layout/TitleBar.tsx` (+ test), `src/hooks/useCommandPalette.ts` (+ test), `src/utils/error.ts` (+ test), และ `src/assets/react.svg`
- **Rust Backend Dead Code:** ลบคำสั่งตัวอย่าง `greet` ใน `lib.rs`, ค่าคงที่/wrapper ที่ไม่ได้ใช้ใน `keychain.rs` (`SERVICE_NAME`, `Vault::vault_dir`, `is_mock_mode`, `unlock_vault`, `lock_vault`, `is_keychain_opt_in`, `set_keychain_opt_in`, `unlock_vault_from_keychain`), `SessionManager::clear_all_session_secrets`, `ConnectionStore::save_ssh_passphrase`, `WorkspaceStore::storage_path`, `SchemaNode::with_metadata`, และ `format_sql_literal` ใน `data_transfer.rs`
- **Frontend Unused Exports & Types:** ลบ `cancelTransfer` ที่ซ้ำซ้อนและ re-exports ของ `auditApi` ใน `src/api/db.ts`, `redactSensitiveSql` re-export ใน `src/api/auditApi.ts`, `ConnectionEnvironment` และ `formatCellValue` re-export ใน `src/types/db.ts`, `AtRestStatusInfo` ใน `src/api/securityHelpers.ts`, unused schema types ใน `connectionSchema.ts` / `tableSchema.ts`, `isDiffModalOpen`/`setDiffModalOpen` ใน `explainHistoryStore.ts`, และ re-exports ที่ไม่ได้ใช้ใน `tableEditHelpers.ts`

### Phase 46: ระบบจัดการไฟล์ขยะและตรวจสอบพื้นที่ดิสก์ (Makefile Disk & Junk Management — Issue #176) [Completed]

- **เพิ่มคำสั่งจัดการพื้นที่ดิสก์แบบแบ่งระดับใน `Makefile`:**
  - `make disk-usage`: แสดงสรุปขนาดโฟลเดอร์หลัก (`src-tauri/target`, `node_modules`, `dist`, `.vite`, `.git`), พื้นที่ build ของ `datacore` ที่ลบแบบเร็วได้ (`cargo clean -p datacore --dry-run`), และรายการไฟล์ขยะชั่วคราว (`repomix-output*`, `.superpowers`, `.perch`, `*.log`, `*.tmp`, `*.bak`)
  - `make clean-junk`: ลบเฉพาะ build artifacts ของ `datacore` (`cargo clean -p datacore`), `incremental/`, `flycheck*`, และ build cache ซ้ำซ้อนของ `libduckdb-sys-*` (เก็บไว้เฉพาะชุดล่าสุด) รวมถึงไฟล์ขยะ frontend/ระบบ (`dist`, `.vite`, `.superpowers`, `.perch`, `repomix-output*`, `*.log`, `*.tmp`, `*.bak`, `.DS_Store`) โดยคง compiled 3rd-party dependencies ไว้เพื่อไม่ต้องเสียเวลาคอมไพล์ DuckDB ใหม่
  - `make clean`: ลบ build artifacts ทั้งหมด (`cargo clean`, `src-tauri/target`, `dist`, `.vite`) และไฟล์ขยะชั่วคราวทั้งหมด
  - `make clean-all`: เรียก `make clean` และลบ `node_modules` ทั้งหมด (Deep Clean)
- **ปรับปรุง `src-tauri/Cargo.toml` และ `.gitignore`:**
  - ลด `crate-type` ของ `datacore_lib` จาก `["staticlib", "cdylib", "rlib"]` เหลือ `["rlib"]` เพื่อไม่ให้สร้างไฟล์ `libdatacore_lib.a` ขนาด ~2.4 GB ที่ไม่จำเป็นต่อ macOS Desktop build
  - เพิ่ม `repomix-output*`, `*.tmp`, `*.bak` ใน `.gitignore`

### Phase 47: การปรับปรุงมาตรฐานและข้อกำหนดหลังการรีวิวโค้ด (Post-Review Standards & Spec Refinements — Issue #177) [Completed]

- **แก้ไขมาตรฐานและ i18n / Design System:**
  - ลบคีย์ `"common.actions"` ที่ซ้ำกันใน `src/locales/th.json` และ `src/locales/en.json` พร้อมเพิ่มคีย์ `editor.truncationWarning` และ `editor.approximateRows` แทนข้อความภาษาไทยที่เคย hardcode ใน `DockLayout.tsx` และ `GridBottomBar.tsx`
  - รวมฟังก์ชันแปลงขนาดไฟล์ `formatCapBytes` ใน `DockLayout.tsx` ให้ใช้ `formatBytes` จาก `transferMonitorStore.ts`
  - ปรับสีของ `TransferMonitorModal.tsx` และ `TablePartitionsModal.tsx` ให้ใช้ CSS Design Tokens (`bg-panel`, `border-line`, `text-text`, `text-muted`, `bg-accent`) ตาม `DataCore-UX-UI-Redesign-Guide.md`
  - แทนที่ `QueryResult.truncation_reason: Option<String>` ด้วย enum `TruncationReason` (`RowCapReached` / `ByteCapReached`) ใน `src-tauri/src/models/query.rs` และ `src/types/db.ts`
- **แก้ไขความครบถ้วนและความถูกต้องของ Data Transfer / Keyset:**
  - ส่งค่า `target_type` ใน `ColumnMapping` จาก `ImportModal.tsx` และ `DataImportWizardModal.tsx` รวมถึงเพิ่มการ probe ชนิดคอลัมน์จากฐานข้อมูลใน `import_data_impl` เมื่อ `target_type` เป็น `None` เพื่อให้ Client-side Type Validation ป้องกัน silent NULL ทำงานได้จริงทุกเส้นทาง
  - ใช้ `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` (`execute_batch_with_savepoint`) ในโหมด `Chunked` + `Skip` ของ `data_transfer.rs` ป้องกันสถานะ transaction aborted (`25P02`) บน PostgreSQL ระหว่าง `bisect_insert_rows`
  - เพิ่ม UI controls สำหรับ `ImportMode` (`Atomic`/`Chunked`/`Staging`), `resume_from_checkpoint`, `use_native_copy`, ตัวเลือกบีบอัดไฟล์ Export (`.gz`/`.zst` ผ่าน `pickExportFile`), และการอัปเดตสถานะ `cancelJob`/`failJob` ใน `catch` ของทุก Transfer Modal
  - เพิ่มการลบไฟล์ `.sql` ที่เขียนค้างเมื่อยกเลิกหรือเกิด error ใน `export_sql_impl` (`sql_transfer.rs`)
  - แก้ไข `fetch_table_data_keyset_impl` (`src-tauri/src/commands/db.rs`) ให้เติม `is_primary_key = Some(true)` และคืนค่า `has_more` ที่ถูกต้องเมื่อเลื่อนย้อนหน้า (`prev`) พร้อมคง metadata คอลัมน์ใน `DockLayout.tsx`

### Phase 48: การออกแบบและจัดวางระบบเมนู MainToolbar และ 2-Column Bento Tools Menu ใหม่ (Issue #178) [Completed]

- **จัดกลุ่มปุ่มบน `MainToolbar` ตามลำดับ Workflow พร้อมเส้นคั่น (`MainToolbar.tsx`):**
  - แบ่งกลุ่มเป็น `[เชื่อมต่อ]` `|` `[Query ใหม่ · ตาราง]` `|` `[นำเข้า ▾ · ส่งออก ▾ · สำรองข้อมูล]` `|` `[เครื่องมือ ▾]` พร้อมตัวบ่งชี้ `ChevronDown` บนปุ่มที่มีดรอปดาวน์
- **ปรับเมนู `เครื่องมือ` เป็น 2-Column Categorized Bento Popover (`w-[580px]`):**
  - คอลัมน์ซ้าย: *ประสิทธิภาพและการตรวจวัด* + *การออกแบบและ Schema*
  - คอลัมน์ขวา: *ความปลอดภัยและการจัดการ* + *เครื่องมือเพิ่มความเร็วในการทำงาน*
  - แถบล่าง (Footer Bar): *ระบบและการวินิจฉัย* (`ตรวจสอบอัปเดต...`, `ส่งออกข้อมูลวินิจฉัยระบบ...`)
  - ใช้กรอบไอคอน (`Icon Badge`) ร่วมกันทุกเมนู รวมถึงอัปเกรดเมนูย่อย `นำเข้า` และ `ส่งออก` ให้มีคำอธิบายย่อย 2 บรรทัด
  - ลบ `uppercase` ออกจากหัวข้อหมวดหมู่ตามแนวทาง `DataCore-UX-UI-Redesign-Guide.md` และเพิ่มคีย์แปลภาษาไทยใน `th.json` / `en.json` ครบ 100%

### Phase 49: ตัวบอกความคืบหน้าแบบ Real-time Percentage (`0%–100%`) สำหรับ Export, Import และ Backup/Restore (Issue #179) [Completed]

- **Data Contract (`src-tauri/src/models/transfer.rs`, `src/types/dataTransfer.ts`):**
  - เพิ่ม `percent: Option<f64>` (`percent?: number`) ใน `TransferProgress` เพื่อสื่อสารเปอร์เซ็นต์ความคืบหน้า (`0.0–100.0`) ข้าม Tauri IPC โดยตรง
  - เพิ่ม `total_rows: Option<usize>` (`total_rows?: number`) ใน `ExportOptions` เพื่อให้ Frontend ส่งจำนวนแถวเป้าหมายที่ทราบอยู่แล้วให้ Backend ใช้คำนวณเปอร์เซ็นต์ได้ทันที
- **Rust Backend Percentage Calculation & Event Emission (`transfer_commands.rs`, `sql_transfer.rs`, `data_transfer.rs`, `cross_db_transfer.rs`):**
  - **`export_sql` (`export_sql_with_progress_impl`):** ประมาณการจำนวนแถวรวมล่วงหน้าผ่าน `get_table_list_metadata_impl`, ส่ง `transfer://progress` พร้อม `percent`, `current_row`, `total_rows`, `bytes_written` และ `"done"` (`100.0%`)
  - **`import_sql_impl`:** ติดตามอัตราส่วนขนาดไบต์ที่อ่านเทียบกับไฟล์ทั้งหมด (`bytes_read / total_file_bytes`) ส่ง `percent` ต่อเนื่องจนถึง `100.0%` เมื่อจบสคริปต์
  - **`export_data_with_progress_impl`:** ใช้ `options.total_rows` หรือประมวลผล `SELECT COUNT(*)` แบบ best-effort เพื่อส่ง `total_rows` และ `percent` (รองรับทั้ง PostgreSQL Fast COPY, CSV และ JSON)
  - **`import_data_impl`:** นับจำนวนเรคคอร์ดในไฟล์ล่วงหน้า (`count_import_file_records` ผ่าน `spawn_blocking`) เพื่อส่ง `total_rows` และ `percent` อย่างแม่นยำทั้ง Batch Loop และ PostgreSQL Fast COPY
  - **`copy_table_cross_db_impl`:** ส่ง `percent`, `job_id`, `rows_processed` และ `elapsed_ms` ครบถ้วนทุก batch
- **Frontend UI & Transfer Monitor (`transferMonitorStore.ts`, `TransferMonitorModal.tsx`, `StatusBar.tsx` และ Modals ทั้ง 6 + Native CLI):**
  - เพิ่ม `calculateTransferPercent`, `estimateNativeProgressPercent` และฟิลด์ `percent: number | null` ใน `useTransferMonitorStore` พร้อมแสดง `%` บน `StatusBar` และ `TransferMonitorModal`
  - เพิ่มแถบ Progress Bar พร้อมตัวเลข `0%–100%` แบบ Real-time ใน `ExportSqlModal.tsx`, `ImportSqlModal.tsx`, `ExportModal.tsx`, `DataExportWizardModal.tsx`, `ImportModal.tsx` และ `DataImportWizardModal.tsx`
  - เพิ่มตัวคำนวณ Progress จาก log ของ Native CLI (`pg_dump`/`pg_restore`/`mysqldump` และ `native://progress`) ใน `NativeBackupModal.tsx` และ `NativeRestoreModal.tsx` แสดง `0%–95%` ระหว่างทำงาน (และ `100%` เมื่อเสร็จสิ้น)

### Phase 50: ความสอดคล้องของ Light / Dark Theme ด้วย Semantic CSS Design Tokens (Issue #180) [Completed]

- แทนที่สี hardcode (`bg-gray-900`, `bg-[#1e1e1e]`, `border-gray-800` ฯลฯ) ด้วย Semantic Design Tokens (`bg-panel`, `bg-sidebar`, `bg-grid`, `border-line`, `text-text`, `text-muted`, `bg-accent`) ตาม `docs/DataCore-UX-UI-Redesign-Guide.md` ครอบคลุม Modals และ Structure Editor:
  - Transfer Modals: `ImportModal.tsx`, `ExportSqlModal.tsx`, `ImportSqlModal.tsx`, `NativeBackupModal.tsx`, `NativeRestoreModal.tsx`, `DuplicateTableModal.tsx`
  - Editor & Grid: `ExplainPlanDiffModal.tsx`, `FilterBar.tsx` (พร้อมอัปเดต `FilterBar.test.tsx`)
  - Structure Editor & Sub-tabs: `CreateTableModal.tsx`, `TableMaintenanceModal.tsx`, `TableStructureEditor.tsx`, `ColumnsTab.tsx`, `IndexesTab.tsx`, `ForeignKeysTab.tsx`, `ConstraintsTab.tsx`, `RlsSecurityTab.tsx`

### Phase 51: ความครอบคลุมของภาษาไทยและภาษาอังกฤษ 100% (i18n Coverage 100% — Issue #181) [Completed]

- เพิ่มคำแปลภาษาไทย/อังกฤษให้ครบ 100% ใน `src/locales/en.json` และ `src/locales/th.json` พร้อมตรวจสอบความเท่าเทียมของคีย์และตัวแปร Interpolation ผ่าน `src/test/i18nParity.test.ts` และ `src/i18n.test.tsx`
- เชื่อมต่อ `useTranslation()` ใน Component ที่ยังไม่มีการแปล:
  - **Transfer:** `ExportModal.tsx`, `ImportModal.tsx`, `DataExportWizardModal.tsx`, `DataImportWizardModal.tsx`, `DuplicateTableModal.tsx`, `NativeBackupModal.tsx`, `NativeRestoreModal.tsx`
  - **Grid & Table:** `FilterBar.tsx`, `GridBottomBar.tsx`, `CellDetailDrawer.tsx`, `InsertRowModal.tsx`, `ForeignKeyPeekPopover.tsx`, `DisconnectedTableScreen.tsx`
  - **Structure, Editor, Security, Transactions & Dialogs:** `TableStructureEditor.tsx`, `EditorToolbar.tsx`, `ImpactPreviewModal.tsx`, `DangerousQueryConfirmModal.tsx`, `ConnectionSecurityModal.tsx`, `UpdateCheckerModal.tsx`, `SavepointModal.tsx`, `FolderModal.tsx`

### Phase 52: ฟีเจอร์ UX เสริมจาก DataCore-UX-UI-Redesign-Guide.md (Issue #182) [Completed]

- **Grid ▦ | Form ☰ Record Form View (`src/components/grid/RecordFormView.tsx`):**
  - เพิ่มมุมมอง Record Form View แนวตั้ง (1 แถวต่อหน้า) พร้อมปุ่มเลื่อน Previous/Next Record, ช่องค้นหาคอลัมน์, Badge `PK`/`FK`/`NULL`, ปุ่ม `Set NULL`, ปุ่มกระโดดไปยังตาราง FK และรองรับการแก้ไขข้อมูลผ่าน Staging/Auto-Commit โดยเชื่อมต่อกับ `DataGrid.tsx` และ `GridBottomBar.tsx` (`viewMode` + `onViewModeChange`)
- **แยกโมดูล `TableStructureEditor.tsx` & `SqlPreviewTab`:**
  - แยก state และ `loadStructure` ออกเป็น custom hook `src/components/structure/useTableStructureData.ts`
  - แยกแท็บ SQL Schema Definition เป็น `src/components/structure/tabs/SqlPreviewTab.tsx` พร้อมปุ่ม `Open in Query Editor`, ปุ่ม `Copy SQL` และแบนเนอร์แจ้งเตือน Destructive DDL (`DROP COLUMN` / `ALTER COLUMN ... TYPE`)
- **Native macOS Menu Bar (`src-tauri/src/menu.rs`, `src-tauri/src/lib.rs`, `src/App.tsx`):**
  - สร้างเมนูเนทีฟ macOS ผ่าน `tauri::menu` (`DataCore`, `File`, `Edit`, `View`, `Window`, `Help`) ส่ง event `menu://action` (`new-connection`, `new-query`, `close-tab`, `refresh-schema`, `toggle-theme`, `command-palette`, `keyboard-shortcuts`, `check-updates`, `export-diagnostics`) ไปยัง Frontend `App.tsx` พร้อม Unit Test ฝั่ง Rust (`menu::tests`)

### Phase 53: หน้าต่าง About DataCore (Issue #183) [Completed]

- **`src/components/dialogs/AboutModal.tsx`:** แสดงชื่อโปรแกรม เวอร์ชัน (ดึงจาก Tauri `getVersion()` พร้อม fallback), ฐานข้อมูลที่รองรับ (PostgreSQL, MySQL, SQLite, DuckDB, SQL Server), จุดเด่นด้านความปลอดภัย (AES-256-GCM / Argon2id Local Vault) และประสิทธิภาพ, ผู้พัฒนา, ลิงก์ GitHub พร้อมปุ่ม `Copy Info`, `Check for Updates...`, `Close` รองรับ Light/Dark (Design Tokens) และ i18n ไทย/อังกฤษ (`about.*`)
- **จุดเข้าถึง:** Native macOS Menu (`DataCore -> About DataCore`, event `menu://action` = `about`), MainToolbar เมนู Tools หมวด `System & Diagnostics`, และ Command Palette (`About DataCore...`)
- **Tests:** `AboutModal.test.tsx` และอัปเดต `menu::tests` (10 actions)

### Phase 54: การยกระดับความปลอดภัยและความพร้อมใช้งานระดับ Production (Security Hardening & Readiness — Issue #197) [Completed]

- **Vault Master Password UI & Keychain Security (`commands/db.rs`, `lib.rs`, `macos_keychain.rs`, `ConnectionSecurityModal.tsx`):**
  - เปิดใช้งาน Tauri commands `vault_set_master_password`, `vault_change_master_password`, `vault_remove_master_password` พร้อม UI ตั้ง/เปลี่ยน/ลบ Master Password เพื่ออัปเกรดจากโหมด Machine-bound (`DCV1`) เป็น Argon2id + AES-256-GCM (`DCV2`)
  - ตัดคำกล่าวอ้างเรื่อง Touch ID ที่ยังไม่ได้ implement ออกจาก UI และบังคับให้เปิด macOS Keychain Sync ได้เฉพาะเมื่อตั้ง Master Password แล้ว
  - เปลี่ยน `save_to_macos_keychain` ให้ส่ง secret ผ่าน `security -i` stdin แทน command-line argument `-w` เพื่อป้องกันการรั่วไหลผ่าน `ps`
- **TLS Security Inspector & Default SSL Mode (`ConnectionSecurityModal.tsx`, `ConnectionDialog.tsx`):**
  - ยกเลิกการเดา `TLSv1.3` / `AES-256-GCM` เมื่อ query ตรวจสอบจากเซิร์ฟเวอร์ล้มเหลว โดยแสดงสถานะ `Unknown / Unverified` อย่างตรงไปตรงมา
  - ปรับค่าเริ่มต้น `sslMode` ของการเชื่อมต่อเครือข่าย (PostgreSQL, MySQL, MSSQL) จาก `prefer` เป็น `require`
- **Credential Exposure Mitigation (`commands/db.rs`, `src/api/db.ts`, `ConnectionDialog.tsx`):**
  - แทนที่ `get_stored_password` ที่ส่งรหัสผ่าน plaintext กลับไปยัง Webview ด้วย `has_stored_password` (คืนค่า `bool`)
- **Read-Only Enforcement & Defense-in-Depth (`drivers/mod.rs`, `sqlite.rs`, `duckdb.rs`, `mssql.rs`):**
  - เพิ่ม `is_read_only_blocked_sql` ที่ tokenize แยก statement ข้าม comments และ string literals ครอบคลุม multi-statement, CTE write (`WITH ... INSERT/UPDATE/DELETE`), `SELECT ... INTO`, `PRAGMA`, `EXEC`/`CALL`, `COPY`, `ATTACH`/`DETACH`, `VACUUM` และบังคับใช้ใน SQLite, DuckDB, และ MSSQL
- **Audit Log HMAC-SHA256 & SSH Tunnel Hardening (`audit_logger.rs`, `ssh_tunnel.rs`):**
  - อัปเกรด Audit Hash Chain เป็น keyed **HMAC-SHA256** (`.audit.hmac.key` สิทธิ์ `0600`) ครอบคลุมทุกฟิลด์สำคัญ (พร้อม backward compatibility กับ legacy log ที่ยังไม่มี key)
  - ปรับ `SSH_ASKPASS` ใน `ssh_tunnel.rs` ให้อ่าน passphrase จาก env var `DATACORE_SSH_PASSPHRASE` แทนการเขียน secret literal ลงดิสก์
- **CSP, Entitlements, Updater, CI & Governance (`tauri.conf.json`, `capabilities/default.json`, `entitlements.plist`, `.github/workflows/ci.yml`, `release.yml`, `LICENSE`, `SECURITY.md`):**
  - เพิ่ม CSP directives (`object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none';`), ลบ `tauri-plugin-opener` ที่ไม่ได้ใช้, เพิ่ม `updater:default`, ลบ `disable-library-validation` และ `allow-unsigned-executable-memory` ออกจาก `entitlements.plist`
  - เพิ่ม `LICENSE` (MIT), `SECURITY.md`, และ CI workflow (`.github/workflows/ci.yml`) พร้อมปรับตัวเลขเทสใน `README.md` ให้ตรงความจริง
- **Production Updater Keypair & Unpublished Release UX (Issue #198, Commit `49983c4`):**
  - สร้าง production minisign keypair แทน demo key ใน `tauri.conf.json` และจัดเก็บ Private Key ใน GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`
  - ปรับ `UpdateCheckerModal.tsx` ให้แสดงข้อความแจ้งเตือนที่ชัดเจนเมื่อยังไม่มี Release เผยแพร่ (404 / missing `latest.json`)

### Phase 55: แก้ไขผลตรวจความปลอดภัยรอบ 2 — CI Pipeline, Vault Unlock, Keychain Consistency, Audit HMAC Fail-Closed & TLS Fallback (Issue #199) [Completed]

- **CI Pipeline & Dependency Cleanup (`pnpm-workspace.yaml`, `package.json`, `.github/workflows/ci.yml`):**
  - เพิ่ม `packages: ['.']` ใน `pnpm-workspace.yaml`, pin `packageManager: "pnpm@12.14.0"` ให้ตรงกับ CI, ถอด `@tauri-apps/plugin-opener` ที่ไม่ได้ใช้, จัดรูปแบบ Rust ด้วย `cargo fmt`, และเพิ่ม `audit` job (`pnpm audit --prod --audit-level=high` + `cargo audit` ผ่าน `taiki-e/install-action@cargo-audit`)
- **Vault Unlock Flow & Rate Limiting (`keychain.rs`, `commands/db.rs`, `lib.rs`, `VaultUnlockModal.tsx`, `App.tsx`):**
  - เพิ่ม `vault_status` Tauri command และ `VaultUnlockModal` สำหรับปลดล็อก Vault เมื่อเปิดแอปหรือเมื่อเกิด error `"Vault is locked"`, พร้อม rate limiting (ล็อก 30 วินาทีเมื่อผิด 5 ครั้ง) และบันทึก `VAULT_UNLOCK` ลง Audit Log
- **macOS Keychain Consistency (`keychain.rs`, `ConnectionSecurityModal.tsx`):**
  - อัปเดต Keychain อัตโนมัติเมื่อเรียก `change_master_password`, ล้าง flag `.vault.keychain_opt_in` ทั้งฝั่ง Backend และ UI เมื่อลบ Master Password, และปฏิเสธการเปิด Keychain opt-in หากยังไม่มี Master Password หรือ Vault ล็อกอยู่
- **Audit Log HMAC Fail-Closed (`audit_logger.rs`, `audit_logger_test.rs`):**
  - ย้ายตำแหน่งคีย์ HMAC ออกนอกโฟลเดอร์ log (`~/.datacore_audit_keys/`), เพิ่ม `hash_algo` ต่อ entry (`hmac-sha256` / legacy `sha256`), คำนวณ HMAC จาก canonical JSON ของทุกฟิลด์ (รวม `error_message`, `execution_time_ms`, `rows_affected`, `connection_name`), และบังคับ fail-closed เมื่อคีย์หายหรือพบการ downgrade algorithm
- **Backend SSL Fallback & Legacy Warning (`postgres.rs`, `mysql.rs`, `ConnectionSecurityModal.tsx`):**
  - เปลี่ยน fallback SSL mode ใน `postgres.rs` และ `mysql.rs` เป็น `Require` / `Required` และแสดงแบนเนอร์เตือนเมื่อ connection เดิมใช้ `prefer` / `allow` / `disable`

### Phase 56: ปิด Residual Risks จากการตรวจความปลอดภัยรอบที่ 3 (R1–R8 — Issue #200) [Completed]

- **Audit Log Anti-Downgrade, Anti-Truncation & Key Migration (`audit_logger.rs`, `audit_logger_test.rs`):**
  - เพิ่มไฟล์ signed anchor (`AuditAnchorState`) เก็บ `hmac_enabled_since`, `active_entries`, `last_entry_hash`, และ `anchor_hmac` นอก `log_dir` เพื่อตรวจจับทั้งการลบ/rewrite ทั้งไฟล์เป็น SHA-256 (R1) และการลบ log ส่วนท้าย (R2) แบบ fail-closed
  - เพิ่มการ migrate คีย์ HMAC จากตำแหน่งเดิม (`<log_dir>/.audit.hmac.key`) ไปยังตำแหน่งใหม่ภายนอกอัตโนมัติ (R5) และระบุขอบเขต threat model ใน `SECURITY.md` (R4)
- **Shared Master Password Rate Limiter (`keychain.rs`, `keychain_test.rs`):**
  - รวมศูนย์ `verify_master_password_with_backoff` ให้ใช้ร่วมกันทั้ง `unlock`, `change_master_password`, `remove_master_password`, และ `verify_master_password` (R3)
- **i18n Parity, Locked-Vault UX & Manual Lock (`th.json`, `en.json`, `db.ts`, `ConnectionDialog.tsx`, `ConnectionSecurityModal.tsx`, `menu.rs`, `App.tsx`):**
  - เพิ่มคีย์แปลภาษาไทย/อังกฤษสำหรับ `VaultUnlockModal`, แบนเนอร์ `legacySslWarning`, และปุ่ม/ข้อความล็อก Vault ครบถ้วน (R6)
  - Wrap `hasStoredPassword` ด้วย `dispatchVaultLockedIfNeeded` และแสดงแบนเนอร์แจ้งเตือนเมื่อแก้ไข connection ขณะ Vault ล็อกอยู่ (R7)
  - เพิ่มปุ่ม `Lock Vault` ใน `ConnectionSecurityModal` และเมนู `Lock Credential Vault` ใน macOS Menu Bar (R8)

### Phase 57: ปิดข้อสังเกตจากการตรวจความปลอดภัยรอบที่ 4 (N1–N5, 8.9, R9 — Issue #201) [Completed]

- **DCK2 Key Format & Anti-Anchor-Deletion (`audit_logger.rs`, `audit_logger_test.rs`):**
  - อัปเกรดไฟล์คีย์เป็นรูปแบบ `DCK2` (44 bytes: `magic + key + epoch`) พร้อม one-time bootstrap จาก `DCK1` (32 bytes) และบังคับ fail-closed เมื่อคีย์ถูก initialize แล้วแต่ไฟล์ anchor หาย (N1)
- **Rotated Archive Integrity, Self-Heal & Timestamp Parsing (`audit_logger.rs`, `audit_logger_test.rs`):**
  - ขยาย `AuditAnchorState` ให้เก็บ `archives: Vec<ArchiveState>` และ `archives_adopted` พร้อมแยก `verify_file_chain()` ใช้ร่วมกันทั้งไฟล์ archive และ active log รวมถึง adopt-once สำหรับ anchor เก่า (N2)
  - อัปเดต `last_hash_cache` ทันทีหลังเขียน entry แล้วบันทึก anchor แบบ best-effort เพื่อ self-heal ใน write ถัดไป (N3)
  - เปลี่ยนการเทียบเวลา downgrade เป็น `chrono::DateTime<Utc>` และ normalize `hmac_enabled_since` เป็น UTC RFC3339 (N4)
- **Complete i18n, Stale Closure Fix & UI Polish (`th.json`, `en.json`, `ConnectionSecurityModal.tsx`, `VaultUnlockModal.tsx`, `App.tsx`, `ConnectionDialog.tsx`):**
  - แปลสตริงทั้งหมดใน `ConnectionSecurityModal` และ `VaultUnlockModal` ครบทั้งไทย/อังกฤษ, ใช้ `i18n.t` แก้ stale closure ใน `App.tsx` (N5)
  - ครอบปุ่ม `Lock Vault` ด้วย `try/catch` + `toast.error` และล้าง `vaultLockedNotice` ใน `ConnectionDialog` เมื่อได้รับ event `datacore:vault-unlocked` (8.9)
- **Dependency Policy (`dependabot.yml`, `ci.yml`):**
  - เพิ่ม `.github/dependabot.yml` (npm/cargo weekly, github-actions monthly) และระบุวันที่/owner/เงื่อนไขถอน allowlist ใน `ci.yml` (R9)

### Phase 58: แก้ไขผลตรวจความปลอดภัยรอบที่ 5 — Write-Path Anchor Verification, Legacy DCK1→DCK2 Migration, Verify Self-Heal, AuditLogDrawer i18n, Dependabot Policy และ Key-Anchor Binding (M1–M6 — Issue #216) [Completed]

- **Write-Path Anchor Verification (M1 — `audit_logger.rs`, `audit_logger_test.rs`):**
  - เพิ่ม `read_verified_anchor()` เพื่อตรวจสอบลายเซ็นและสถานะของ Anchor (`AuditAnchorState`) ก่อนใช้งานหรือเซ็นซ้ำทั้งใน `log()`, `rotate_log_file()`, `clear_logs()` และ `verify_integrity()` ป้องกันการ re-baseline anchor ที่เสียหายหรือเซ็นทับ anchor ปลอมแบบ fail-closed
- **Legacy Anchor Compatibility & DCK1→DCK2 Promotion (M2 — `audit_logger.rs`, `audit_logger_test.rs`):**
  - เพิ่ม `compute_legacy_anchor_hmac()` รองรับ anchor รูปแบบเดิม (`anchor|since|entries|last`) และเลื่อนระดับคีย์จาก `DCK1` (32 bytes) เป็น `DCK2` (44 bytes) โดยอัตโนมัติตั้งแต่การตรวจสอบหรือการเขียนที่ผ่านการยืนยันครั้งแรก ลด false positive หลังอัปเกรดและเปิดใช้งาน anti-anchor-deletion สำหรับเครื่องเดิม
- **Bounded Forward-Lag Self-Heal on Verify (M3 — `audit_logger.rs`, `audit_logger_test.rs`):**
  - ปรับ `verify_integrity()` ให้ตรวจสอบ prefix hash (`hash_at_entry_index`) และ HMAC chain ของ entry ส่วนเกินเมื่อ anchor ตามหลัง log (`count > active_entries`, ไม่เกิน 100 รายการ) พร้อม self-heal anchor อัตโนมัติ โดยยังคง fail-closed เมื่อพบการตัดทอน (`count < active_entries`) และปรับเทส `test_anchor_write_failure_does_not_break_chain_and_self_heals` ให้ทดสอบบน path เดิม
- **Key↔Anchor Epoch & Fingerprint Binding (M6 — `audit_logger.rs`, `audit_logger_test.rs`, `SECURITY.md`):**
  - เพิ่ม `key_epoch` และ `key_fingerprint` ลงใน `AuditAnchorPayload` / `AuditAnchorState` เพื่อตรวจจับการปลอมแปลง epoch ของคีย์หรือการลดระดับ `DCK2`→`DCK1` พร้อมอัปเดต `SECURITY.md` ให้ตรงตามขอบเขตการทำงานจริง
- **AuditLogDrawer Complete i18n & Security Literal Guard (M4 — `AuditLogDrawer.tsx`, `en.json`, `th.json`, `AuditLogDrawer.test.tsx`):**
  - เพิ่มคำแปลภาษาไทย/อังกฤษครบ 47 คีย์ภายใต้ `security.*` รวมถึงข้อความแนะนำแนวทางกู้คืนเมื่อตรวจพบความเสียหายของ anchor/log และเพิ่มเทสตรวจสอบการแสดงผลภาษาไทยและป้องกันสตริงภาษาอังกฤษนอก `t()`
- **Dependabot Grouping Policy & Stale PR Cleanup (M5 — `.github/dependabot.yml`):**
  - เพิ่ม `groups` (`npm-minor-patch`, `cargo-minor-patch`, `actions-all`), `open-pull-requests-limit: 5`, `labels: ["dependencies"]` และ `ignore` สำหรับ `version-update:semver-major` (`tailwindcss`, `sqlx`, `sha2`, `base64`, `zstd`) พร้อมเปิด Dependabot vulnerability alerts และปิด PR ค้างรุ่นเก่า (`#202`–`#215`)

### Phase 59: แก้ไขผลตรวจความปลอดภัยรอบที่ 6 — Transactional Log Rotation, Untracked Archive Recovery, Safe Clear Logs, Write-Path Health Observability & Threat Model Alignment (S1–S6 — Issue #224) [Completed]

- **Transactional Rotation & Untracked Archive Reconciliation (S1 — `audit_logger.rs`, `audit_logger_test.rs`):**
  - ปรับ `rotate_log_file_with_state()` ให้ทำงานแบบ transactional โดย rollback `fs::rename` และคืนค่า `AuditAnchorState` ในหน่วยความจำหาก `write_anchor()` ล้มเหลว เพื่อไม่ให้สถานะบนดิสก์ขัดแย้งกัน
  - เพิ่มการตรวจจับและรับเข้า rotated archives ที่ตกหล่นหลัง crash (`verify_integrity_locked()` และ pre-append check ใน `log_inner()`) เฉพาะไฟล์ที่ผ่านการตรวจ HMAC chain ครบและยังคง `last_entry_hash` เดิมของ anchor โดยไม่ต่ำกว่าจำนวนรายการเดิม
- **Safe `clear_logs()` Ordering & UI Error Propagation (S2 — `audit_logger.rs`, `auditLogStore.ts`, `AuditLogDrawer.tsx`):**
  - ปรับ `clear_logs()` ให้เขียน anchor สถานะว่างลงดิสก์ก่อนลบไฟล์ `audit.jsonl` และ rotated archives (พร้อมคืน anchor เดิมหากลบไฟล์ล้มเหลว)
  - ปรับ `useAuditLogStore.clearLogs()` เป็น `async` ที่ propagate error จาก Tauri IPC และให้ `AuditLogDrawer.handleClearLogs()` `await` พร้อมแสดง error toast เมื่อ backend ปฏิเสธ
- **Write-Path Health Observability (S3 — `audit_logger.rs`, `audit_commands.rs`, `lib.rs`, `auditApi.ts`, `auditLogStore.ts`, `AuditLogDrawer.tsx`, `en.json`, `th.json`):**
  - เพิ่ม `AuditHealth`, `AuditLogger::health()`, และ Tauri command `get_audit_health` เพื่อติดตาม `last_write_error` เมื่อ `log()` fail-closed และล้างค่าเมื่อเขียน/ตรวจสอบ/ล้างบันทึกสำเร็จ
  - เพิ่ม `checkHealth()`, event `datacore:audit-degraded` ใน `auditLogStore.ts` และแบนเนอร์เตือน write failure พร้อมคำแนะนำการกู้คืนใน `AuditLogDrawer.tsx`
- **Total Entries Accounting & Threat Model Clarity (S4, S5 — `audit_logger.rs`, `SECURITY.md`):**
  - ปรับ `AuditIntegrityResult.total_entries` ให้รวมจำนวนรายการใน rotated archives (`archived_entries + count`) เพื่อให้ตรงกับการตรวจจริงหลัง rotation
  - เพิ่มคำอธิบายข้อจำกัดกรณี anchor rollback ร่วมกับ log truncation ใน `SECURITY.md`
- **Dependabot Security Updates & Advisory Alignment (S6 — `.github/dependabot.yml`, `.github/workflows/ci.yml`):**
  - เปิดใช้งาน Dependabot security updates (`automated-security-fixes`) และบันทึกกำหนดการทบทวน major dependencies รายไตรมาส (Quarterly Major Review) พร้อมสถานะ moderate alerts 2 รายการ (`glib 0.18.5`, `minimatch`) ใน `.github/workflows/ci.yml` และ `.github/dependabot.yml`

### Phase 60: ระบบ Multi-Theme และธีม Warm Paper / Sketch (Issue #225) [Completed]

- **Design Tokens & Zero-Overhead CSS Switching (`src/styles/tokens.css`, `tailwind.config.js`, `src/types/theme.ts`):**
  - รองรับ `AppTheme = 'light' | 'dark' | 'warm-paper'` โดยใช้ `Default` (`light` / `dark`) เป็นค่าเริ่มต้นและเพิ่ม `[data-theme="warm-paper"]` เป็นตัวเลือกที่ 2
  - กำหนดชุดสี Warm Paper / Cream Pastel (`--bg-toolbar: #ede6d8`, `--bg-sidebar: #f6f1e7`, `--bg-panel: #f3ede2`, `--bg-grid: #faf6ef`, `--row-alt: #f0e9dc`, `--border: #2c2a26`, `--accent: #4d8b55`) พร้อม `--grid-header-bg` (Warm Sage `#dce5d5`) และสไตล์เส้นขอบคมชัดแบบ Sketch
  - การสลับธีมทำงานผ่าน CSS attribute (`data-theme`) และคลาส `.dark` บน `document.documentElement` โดยไม่ unmount component หรือ re-fetch ข้อมูล
- **Theme State & Toolbar Picker (`src/App.tsx`, `src/components/chrome/MainToolbar.tsx`, `src/locales/en.json`, `src/locales/th.json`):**
  - บันทึกและกู้คืนค่า `datacore-theme` จาก `localStorage` อย่างเข้ากันได้ย้อนหลังกับ `'light'` / `'dark'` เดิม
  - เพิ่ม Theme Picker Popover ใน `MainToolbar` ให้เลือก `Default Light`, `Default Dark`, และ `Warm Paper` พร้อมจุดสีตัวอย่าง (color swatch) และรองรับคีย์ลัดสลับธีมเดิม
- **Static Memoized Themes & Semantic Token Refactor (`DataGrid.tsx`, `SqlEditor.tsx`, `ObjectBrowser.tsx`, `DockLayout.tsx`, `ERDiagramTab.tsx`, `TableListTab.tsx`, `VisualQueryBuilderTab.tsx`, `DisconnectedTableScreen.tsx`, `InsertRowModal.tsx`):**
  - เพิ่ม `warmPaperGridTheme` แบบ module-level constant ใน `DataGrid.tsx` (หัวตาราง Warm Sage คมชัด, cell selection สีเขียวพาสเทล) และ `warmPaperEditorTheme` แบบ static extension ใน `SqlEditor.tsx`
  - เพิ่มไอคอนตารางเวกเตอร์แบบแถบหัวตารางสีพาสเทล (เขียว, อำพัน, ฟ้า) และ active pill styling สำหรับ `warm-paper` ใน `ObjectBrowser.tsx` และ `DockLayout.tsx`
  - ปรับคอมโพเนนต์ที่ยังฮาร์ดโค้ดสี `theme === 'dark'` ให้ใช้ semantic tokens เพื่อให้เปลี่ยนตามทุกธีมได้อย่างสอดคล้อง

### Phase 61: ป้องกันการแก้ไขข้อมูลในเซลล์แบบ Inline เมื่อโหมดแก้ไขเร็วปิดอยู่ (Issue #226) [Completed]

- **Strict Fast Edit Guard (`gridUtils.ts`, `DataGrid.tsx`):**
  - ปรับ `createCellContent` ให้เปิด `allowOverlay` และปลด `readonly` เฉพาะเมื่อ `fastEditMode === true` (และไม่ติด `lockInline`) สำหรับทุกชนิดข้อมูล (`null`, `number`, `boolean`, `text`)
  - จำกัด `<DataEditor onCellEdited={...} />` ใน `DataGrid.tsx` ให้ทำงานเฉพาะเมื่อ `activeIsFastEdit && !effectiveReadOnly` โดยยังคงให้ผู้ใช้แก้ไขผ่าน `CellDetailDrawer` ด้านขวาได้ตามปกติเมื่อ `isEditable === true`









