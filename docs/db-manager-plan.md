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

- ซ้าย: ต้นไม้ connection → database → schema → table พร้อมจุดสถานะการเชื่อมต่อ และการควบคุม Connect / Disconnect ผ่าน Context Menu โดยค่าเริ่มต้นจะไม่กางโครงสร้าง Tree อัตโนมัติหลัง Login หรือบันทึกการเชื่อมต่อ เพื่อความเป็นระเบียบและให้ผู้ใช้คลิกเลือกกางดูตามต้องการ
- บน: หลายแท็บ (Query, Table, Designer) แถบเครื่องมือ พร้อมปุ่ม Auto-Commit / Commit / Rollback
- กลาง: SQL editor พร้อม syntax highlighting และ autocomplete
- ล่าง: กริดผลลัพธ์ แก้ไขช่องได้ แสดง NULL ชัดเจน แบ่งหน้าทีละ 100 แถว พร้อมปุ่มเปิด Cell Detail Drawer สำหรับดู JSON/Text ยาว

### 2.2 หน้าต่างสร้าง Connection

![สร้าง Connection](images/02-connection-dialog.png)

- เลือกชนิดฐานข้อมูล, ใส่ host/port/user/password
- รองรับการกรอกรหัสผ่านโดยตรงและตัวเลือก Remember password (จัดเก็บในระดับ In-Memory Session เท่านั้น ปิดการเรียกใช้งาน OS Keychain โดยสมบูรณ์เพื่อป้องกันหน้าต่างขอสิทธิ์ของระบบปฏิบัติการ)
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
| `keyring` | เก็บรหัสผ่านใน macOS Keychain |
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
         pub columns: Vec<ColumnMeta>,       // name, data_type, nullable
         pub rows: Vec<Vec<CellValue>>,       // Value variant: Null, String, Number, Bool, Bytes(base64), Json
         pub execution_time_ms: u64,
         pub rows_affected: Option<u64>,
     }
     ```
3. **กลไก Cancel Query ที่สมบูรณ์:**
   - นอกจากการ drop async task บน Tokio แล้ว ฝั่ง Rust มีกลไกส่งคำสั่งยกเลิกไปยัง Database Server จริง (เช่น ส่ง `pg_cancel_backend(pid)` ใน Postgres หรือ `KILL QUERY <id>` ใน MySQL)

### 3.3 Frontend (npm packages)

| Package | ใช้ทำอะไร |
|---|---|
| Glide Data Grid | กริดข้อมูล virtual scrolling แก้ไขในช่องได้ (Canvas-based) |
| react-arborist | ต้นไม้ Object Browser |
| dockview | แท็บและแผงลาก-วางได้ (Docking system) |
| CodeMirror 6 + `@codemirror/lang-sql` | SQL editor พร้อม syntax & autocomplete |
| Zustand | จัดการ client state (Connections, Tabs, Settings) |
| TanStack Query | จัดการการโหลดข้อมูลและ server cache |
| Tailwind CSS + shadcn/ui | หน้าตาและ UI component |
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
- เก็บรหัสผ่านใน macOS Keychain

**Object Browser**
- ต้นไม้ connection → database → schema → table / view
- ค้นหาในต้นไม้ (Quick filter)
- คลิกขวาเมนู: เปิดตาราง, ลบ, เปลี่ยนชื่อ, refresh
- ใช้ Connection Pool แยกเฉพาะ ไม่รบกวน Session ของ Editor

**Table Viewer**
- แสดงข้อมูลแบบกริด Glide Data Grid (Virtual Scrolling)
- แบ่งหน้าทีละ 100 แถว เพื่อประสิทธิภาพและความเร็วของ Tauri IPC
- เรียงลำดับและกรองข้อมูล
- แก้ไขช่อง (Inline Edit), เพิ่มแถว, ลบแถว แล้ว commit/rollback
- แสดง `NULL` ชัดเจน
- **Cell Detail Drawer / Modal:** ดูและแก้ไขข้อมูลยาว เช่น ข้อความยาว, JSON, หรือข้อมูล Binary

**Query Editor**
- หลายแท็บ (**Dedicated Connection ต่อ 1 แท็บ**)
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

- Export: CSV, JSON, SQL (INSERT), Excel
- Import: CSV, JSON, SQL file
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
