# DataCore ⚡️

> โปรแกรมจัดการฐานข้อมูลแบบ Desktop สไตล์ **Navicat / TablePlus** ที่ออกแบบมาสำหรับ **macOS Apple Silicon (M1/M2/M3/M4)** โดยเฉพาะ มีขนาดเล็ก (~10 MB), เปิดเร็ว, กินแรมน้อย และรองรับ SQLite, PostgreSQL และ MySQL

[![Tauri 2](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.85+-orange?logo=rust)](https://www.rust-lang.org/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-Passing%20(96%2F96)-brightgreen)](https://github.com/)

---

## 📸 ภาพตัวอย่างหน้าจอ (UI Mockups)

| หน้าต่างหลัก (Object Browser + Editor + Data Grid) | หน้าต่างสร้าง Connection (Keychain & SSH) |
|---|---|
| ![Main Window](docs/01-main-window.png) | ![Connection Dialog](docs/02-connection-dialog.png) |

---

## 🌟 จุดเด่นและฟีเจอร์หลัก (Features)

* **ความเร็วและประสิทธิภาพสูงบน Apple Silicon:** พัฒนาด้วย **Tauri 2 + Rust + React 18** ให้แอปขนาดเล็ก รันแบบ Native ARM64 และใช้ทรัพยากรเครื่องน้อย
* **รองรับ 3 ฐานข้อมูลหลัก:** เชื่อมต่อ **SQLite** (ทั้งไฟล์และ In-memory), **PostgreSQL** และ **MySQL**
* **ความปลอดภัยระดับระบบปฏิบัติการ (macOS Keychain):** รหัสผ่านฐานข้อมูลถูกบันทึกใน **macOS Keychain** ผ่าน Crate `keyring` โดยไม่มีการเก็บ Plaintext Password ลงในไฟล์คอนฟิก
* **Dedicated Transaction Sessions:** แยก Session การเชื่อมต่ออิสระต่อ 1 แท็บใน Query Editor รองรับคำสั่ง Transaction (`BEGIN`, `COMMIT`, `ROLLBACK`), Session Variables และ Temporary Tables ไม่ปนเปื้อนข้ามแท็บ
* **Object Browser Tree View:** แสดงแผนผัง Connection → Database → Tables / Views ด้วย `react-arborist` พร้อมช่องค้นหากรองรายชื่อ และ Context Menu (เปิดตาราง, สร้าง Query, รีเฟรช Schema)
* **SQL Query Editor ทรงพลัง:** พัฒนาด้วย CodeMirror 6 รองรับ SQL Syntax Highlighting ตาม Dialect ของฐานข้อมูล, คีย์ลัด `⌘+Enter` (รันเฉพาะข้อความที่เลือกหรือทั้งไฟล์), ปุ่ม Cancel Query, สวิตช์ Auto-Commit ON/OFF, และปุ่ม Commit / Rollback
* **ตารางข้อมูลความเร็วสูง (Glide Data Grid):** เรนเดอร์บน HTML5 Canvas ลื่นไหลแม้ข้อมูลมีปริมาณมาก, แบ่งหน้าทีละ 100 แถวเพื่อลดภาระ Tauri IPC, แสดงผลค่า `NULL` ชัดเจน, รองรับ Inline Edit และมี **Cell Detail Drawer** สำหรับดู/คัดลอก JSON หรือข้อความยาว
* **ดีไซน์กลมกลืนกับ macOS (Native Look & Feel):** หน้าต่างสไตล์ Overlay Titlebar เว้นระยะปุ่ม Traffic Light (`pl-20`), ปรับขนาด Editor และ Grid ได้ด้วย Split Resizer, และรองรับทั้ง **Dark Mode** และ **Light Mode**

---

## 🛠 Tech Stack

### Backend (Rust)
- **Tauri 2**: Framework สำหรับ Desktop Application
- **Tokio**: Asynchronous Runtime ประสิทธิภาพสูง
- **sqlx**: Database Driver สำหรับ PostgreSQL และ MySQL พร้อมระบบ Connection Pooling
- **rusqlite**: Database Driver สำหรับ SQLite (เปิดใช้ feature `bundled` และ `column_decltype`)
- **keyring**: จัดเก็บรหัสผ่านใน macOS Keychain
- **serde / serde_json**: Serialization / Deserialization ข้อมูลระหว่าง Rust และ Frontend

### Frontend (React & TypeScript)
- **React 18 + TypeScript + Vite**: UI Framework และ Build Tool
- **@glideapps/glide-data-grid**: Data Grid ประสิทธิภาพสูงบน HTML5 Canvas
- **CodeMirror 6 (@codemirror/lang-sql)**: SQL Editor พร้อม Syntax & Keymaps
- **react-arborist**: Tree Component สำหรับ Object Browser
- **Zustand**: Client State Management (`connectionStore`, `tabStore`)
- **Tailwind CSS**: Styling และ Theme Management
- **lucide-react**: ไอคอนสไตล์โมเดิร์น
- **Vitest**: Unit & Component Testing

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
DataCore/
├── src-tauri/                     # Rust Backend (Tauri 2)
│   ├── Cargo.toml                 # Rust dependencies
│   ├── tauri.conf.json            # การตั้งค่าหน้าต่าง macOS Overlay
│   └── src/
│       ├── main.rs / lib.rs       # Entry point และ Tauri Builder
│       ├── models/                # Data Contract (QueryResult, CellValue, ConnectionConfig)
│       ├── drivers/               # Database Drivers (SQLite, Postgres, MySQL)
│       ├── services/              # Keychain & Connection Store
│       ├── session/               # SessionManager (Dedicated Tab Sessions)
│       └── commands/              # Tauri IPC Command Handlers
├── src/                           # React Frontend (TypeScript)
│   ├── api/                       # Tauri IPC API Wrapper (`api/db.ts`)
│   ├── stores/                    # Zustand Stores (`tabStore.ts`, `connectionStore.ts`)
│   ├── types/                     # TypeScript Type Definitions (`types/db.ts`)
│   └── components/
│       ├── sidebar/               # Object Browser Tree View
│       ├── editor/                # SQL Query Editor & Transaction Toolbar
│       ├── grid/                  # Glide Data Grid, Pagination & Cell Detail Drawer
│       ├── dialogs/               # Connection Manager Dialog & Driver Forms
│       └── layout/                # TitleBar (macOS Traffic Lights) & DockLayout
├── docs/                          # เอกสารข้อกำหนดและแผนการพัฒนา
│   ├── db-manager-plan.md         # แผนโปรเจกต์และ Tech Stack
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

# 2. รันแอปพลิเคชันในโหมด Desktop Development
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
| `make test` | รันชุดการทดสอบทั้งหมด (ทั้ง Rust Backend 13 tests และ Vitest 83 tests) |
| `make test-backend` | รันเฉพาะ Unit & Integration Tests ฝั่ง Rust Backend |
| `make test-frontend`| รันเฉพาะ Unit & Component Tests ฝั่ง React Frontend |
| `make check` | ตรวจสอบ Compilation และ TypeScript Type Checking ทั้งระบบ |
| `make lint` | ตรวจสอบ Code Quality และคำเตือนด้วย Cargo Clippy |
| `make build` | Build เป็น Production Desktop Application สำหรับ macOS (.app / .dmg) |
| `make build-frontend`| Build เฉพาะ Production Bundle ฝั่ง Web Assets (Vite) |
| `make clean` | ลบไฟล์ Build Artifacts ทั้งหมด (`dist/` และ `src-tauri/target/`) |

---

## 🧪 การทดสอบ (Testing)

โปรเจกต์นี้ได้รับการพัฒนาด้วยแนวทาง **Test-Driven Development (TDD)** โดยมีชุดการทดสอบที่ครอบคลุม:

```bash
# รันเทสต์ทั้งหมด
make test
```

* **Rust Backend (13 tests):**
  - Data Contract Serialization & Roundtrip
  - Keychain CRUD Lifecycle & Password Isolation
  - Connection Store Atomic Persistence
  - SQLite Dynamic Type Extraction, Pagination & Transaction Lifecycle
  - Dedicated Session Lifecycle & Explicit Rollback on Close
  - Schema Metadata Connection Isolation
* **React Frontend (83 tests):**
  - Zustand Stores (`tabStore`, `connectionStore`)
  - Object Browser Tree Component, Node Navigation, Context Menu
  - CodeMirror 6 SQL Editor, Dialects, Keymap (`⌘+Enter`), Toolbar Actions
  - Glide Data Grid Canvas Integration, NULL Indicators, Cell Detail Drawer
  - Connection Dialog Form Switching, Latency Measurement, Keychain Preservation
  - End-to-End User Journey Workflow Test

---

## 🗺 แผนการพัฒนาในอนาคต (Roadmap)

- [x] **ระดับ 1 (MVP):**
  - Connection Manager (SQLite, PostgreSQL, MySQL) พร้อม Keychain Security
  - Object Browser Tree View พร้อมระบบกรองและ Context Menu
  - Table Viewer (Glide Data Grid, 100-row pagination, Cell Detail Drawer)
  - Query Editor (CodeMirror 6, ⌘+Enter, Auto-Commit, Commit, Rollback, Cancel)
  - macOS Overlay Titlebar, Split Resizer, Dark/Light Mode
- [ ] **ระดับ 2 (Remote Connections):**
  - SSL/TLS พร้อมเลือก CA / Client Certificates
  - SSH Tunnel (Password / Private Key Authentication) ผ่าน Crate `russh`
  - Connection Timeout และ Auto-reconnect
- [ ] **ระดับ 3 (Structure Management):**
  - Table Designer: แก้ไข Columns, Data Types, Primary Key, Foreign Keys, Indexes
  - Preview SQL ก่อนรันคำสั่งแก้ไขโครงสร้างจริง
- [ ] **ระดับ 4 (Data Import & Export):**
  - Export: CSV, JSON, SQL (INSERT statements), Excel
  - Import: CSV, JSON, SQL script
  - Database Backup & Dump
- [ ] **ระดับ 5 (Advanced Tools):**
  - ER Diagram Visualizer
  - Schema Comparison & Diff
  - Query Execution Plan (EXPLAIN / ANALYZE)

---

## 📄 ใบอนุญาต (License)

โปรเจกต์นี้อยู่ภายใต้ใบอนุญาต [MIT License](LICENSE)
