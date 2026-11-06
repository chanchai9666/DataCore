# แผนการพัฒนา DataCore MVP (DataCore MVP Implementation Plan)

> **สำหรับ Agentic Workers:** REQUIRED SUB-SKILL: ใช้ superpowers:subagent-driven-development (แนะนำ) หรือ superpowers:executing-plans ในการพัฒนาทีละ Task ตามแผนนี้ โดยแต่ละ Step จะใช้เครื่องหมาย Checkbox (`- [ ]`) ในการติดตามสถานะ

**เป้าหมาย (Goal):** สร้างโปรแกรมจัดการฐานข้อมูลแบบ Desktop น้ำหนักเบาสไตล์ Native macOS (DataCore) รองรับ SQLite, PostgreSQL และ MySQL ด้วย Tauri 2, Rust และ React

**สถาปัตยกรรม (Architecture):** แอป Desktop พัฒนาด้วย Tauri 2 โดยฝั่ง Rust Backend ทำหน้าที่จัดการความปลอดภัยผ่าน macOS Keychain, ทำ Connection Pooling และจัดสรร Dedicated Session แยกเฉพาะต่อแท็บสำหรับรัน SQL ที่มี Transaction พร้อมแปลงผลลัพธ์ Dynamic Query เป็น Data Contract กลาง (`QueryResult`) เพื่อส่งผ่าน Tauri IPC ไปยัง React 18 + Vite Frontend ที่ขับเคลื่อนด้วย Dockview สำหรับระบบหลายแท็บและ Glide Data Grid สำหรับแสดงผลตารางข้อมูลความเร็วสูง

**Tech Stack:** Tauri 2, Rust (Tokio, sqlx, keyring, serde), React 18, TypeScript, Vite, Glide Data Grid, react-arborist, dockview, CodeMirror 6, Tailwind CSS, shadcn/ui, Zustand

**เอกสารข้อกำหนด (Spec):** `docs/db-manager-plan.md`

## ข้อกำหนดระดับโปรเจกต์ (Global Constraints)

- **Platform:** รองรับ macOS Apple Silicon (ARM64 `aarch64-apple-darwin`)
- **การจัดสไตล์หน้าต่าง (Window Styling):** กำหนด `titleBarStyle: "Overlay"` พร้อมเว้นระยะ Traffic Light (ปุ่มแดง/เหลือง/เขียว) ให้ดูเป็น Native macOS อย่างแท้จริง
- **Database Drivers:** ใช้ `sqlx` รองรับ `sqlite`, `postgres`, `mysql`, `tls-rustls`
- **ความปลอดภัย (Security):** จัดเก็บรหัสผ่านอย่างปลอดภัยใน macOS Keychain ด้วย Crate `keyring`
- **สถาปัตยกรรม Session:** แยก Shared Pool สำหรับดึง Metadata ใน Object Browser และใช้ Dedicated Session ต่อ 1 แท็บใน Query Editor สำหรับจัดการ Transaction
- **Table Viewer:** แบ่งหน้าแสดงผลทีละ 100 แถวเป็นค่าเริ่มต้น เพื่อลดภาระ Payload และความหน่วงของ Tauri IPC

## จุดที่ต้องโฟกัสในการตรวจสอบ (Review Focus)

1. **Data Type เฉพาะหรือยังไม่รองรับ** (เช่น Postgres `GEOMETRY`, Composite types) ต้อง Fallback กลับเป็น String อย่างปลอดภัย แทนที่จะทำให้ Query ล้มเหลวทั้งหมด
2. **การรั่วไหลของ Transaction Isolation** ป้องกันไม่ให้เกิดสถานะค้างเมื่อผู้ใช้ปิดแท็บในขณะที่ยังมี Transaction เปิดอยู่ (ต้อง Rollback อัตโนมัติเมื่อปิดแท็บ)
3. **Connection หลุดหรือเกิด Network Timeout** ระหว่างรัน Query ต้องดักจับ Error และส่งกลับมาที่ UI ได้อย่างราบรื่น ไม่ทำให้ Tokio Runtime หรือแอปค้าง
4. **Race Condition ในการ Cancel Query** รับมือกรณีคำสั่งบน Database Server ทำงานเสร็จในจังหวะเดียวกับที่คำสั่ง Cancel ถูกส่งไปถึง
5. **การสลับ Theme (Dark/Light)** ต้อง Sync สีระหว่าง Tailwind CSS กับ HTML5 Canvas ของ Glide Data Grid ให้กลมกลืน ไม่ผิดเพี้ยน

---

### Task 1: เตรียมสภาพแวดล้อมและขึ้นโครงสร้างโปรเจกต์ (Environment & Project Scaffolding)

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src-tauri/Cargo.toml`
- สร้าง: `src-tauri/tauri.conf.json`
- สร้าง: `src-tauri/src/main.rs`
- สร้าง: `src-tauri/src/lib.rs`
- สร้าง: `package.json`
- สร้าง: `vite.config.ts`
- สร้าง: `tsconfig.json`
- สร้าง: `src/App.tsx`
- สร้าง: `src/main.tsx`

**Interfaces:**
- Produces: โครงสร้างโปรเจกต์ Tauri 2 + Vite React TypeScript ที่ตั้งค่า macOS Overlay Window พร้อมรันได้

- [ ] **Step 1: ตรวจสอบและติดตั้งเครื่องมือที่จำเป็น (Prerequisites)**
ตรวจสอบ `rustc`, `cargo` และ `pnpm` หากยังไม่มี Rust ให้ติดตั้งผ่าน `rustup` สำหรับ target `aarch64-apple-darwin`

- [ ] **Step 2: เริ่มต้นขึ้นโครงโปรเจกต์ด้วย Tauri 2 และ pnpm**
รันคำสั่ง `pnpm create tauri-app@latest . --template react-ts` (หรือสร้างไฟล์คอนฟิกตามโครงสร้างมาตรฐาน)

- [ ] **Step 3: ตั้งค่า `src-tauri/tauri.conf.json` สำหรับ macOS Overlay Window**
กำหนดค่า `windows[0].titleBarStyle` เป็น `"Overlay"` และกำหนดขนาดหน้าต่างเริ่มต้นรวมถึงขนาดขั้นต่ำ (minWidth, minHeight)

- [ ] **Step 4: ตรวจสอบการคอมไพล์โค้ดฝั่ง Backend**
รัน: `cargo check --manifest-path src-tauri/Cargo.toml`
ผลลัพธ์ที่คาดหวัง: PASS คอมไพล์ผ่านโดยไม่มีข้อผิดพลาด

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git init
git add .
git commit -m "chore: scaffold tauri 2 react-ts project with macos overlay window"
```

---

### Task 2: ออกแบบ Data Contract และ Type Serialization สำหรับผลลัพธ์ Query (Rust)

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src-tauri/src/models/mod.rs`
- สร้าง: `src-tauri/src/models/query.rs`
- ทดสอบ: `src-tauri/src/models/query_test.rs`
- แก้ไข: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces:
  ```rust
  #[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
  pub enum CellValue {
      Null,
      Text(String),
      Integer(i64),
      Float(f64),
      Boolean(bool),
      Json(serde_json::Value),
      Bytes(String), // base64 encoded
  }

  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct ColumnMeta {
      pub name: String,
      pub data_type: String,
      pub nullable: bool,
  }

  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct QueryResult {
      pub columns: Vec<ColumnMeta>,
      pub rows: Vec<Vec<CellValue>>,
      pub execution_time_ms: u64,
      pub rows_affected: Option<u64>,
  }
  ```

- [ ] **Step 1: เขียน Unit Test สำหรับการ Serialize ของ `CellValue` และ `QueryResult`**
ใน `src-tauri/src/models/query_test.rs` ทดสอบว่า `QueryResult` สามารถแปลงเป็น JSON ที่สอดคล้องกับ Type ฝั่ง TypeScript ได้อย่างถูกต้อง

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `cargo test --manifest-path src-tauri/Cargo.toml test_query_result_serialization`
ผลลัพธ์ที่คาดหวัง: FAIL (เนื่องจากยังไม่ได้นิยาม Struct/Enum)

- [ ] **Step 3: พัฒนา Data Models ใน `src-tauri/src/models/query.rs`**
นิยาม `CellValue`, `ColumnMeta` และ `QueryResult` พร้อมตั้งค่า Serde macros และฟังก์ชันแปลงค่าพื้นฐาน

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `cargo test --manifest-path src-tauri/Cargo.toml test_query_result_serialization`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add src-tauri/src/models
git commit -m "feat(backend): define core query result models and cell value serializers"
```

---

### Task 3: ระบบบันทึกคอนฟิก Connection และความปลอดภัยด้วย macOS Keychain

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src-tauri/src/models/connection.rs`
- สร้าง: `src-tauri/src/services/keychain.rs`
- สร้าง: `src-tauri/src/services/connection_store.rs`
- ทดสอบ: `src-tauri/src/services/connection_store_test.rs`

**Interfaces:**
- Consumes: Crate `keyring` สำหรับจัดเก็บรหัสผ่าน
- Produces:
  ```rust
  pub enum DatabaseDriver { Sqlite, Postgres, Mysql }
  pub struct ConnectionConfig {
      pub id: String,
      pub name: String,
      pub driver: DatabaseDriver,
      pub host: Option<String>,
      pub port: Option<u16>,
      pub database: String,
      pub user: Option<String>,
      pub folder: Option<String>,
  }
  pub fn save_password(connection_id: &str, password: &str) -> Result<(), AppError>;
  pub fn get_password(connection_id: &str) -> Result<Option<String>, AppError>;
  pub fn delete_password(connection_id: &str) -> Result<(), AppError>;
  ```

- [ ] **Step 1: เขียน Unit Test จำลองการบันทึก Connection และรหัสผ่าน**
ทดสอบการจัดเก็บคอนฟิก Connection ลงในไฟล์ JSON ของแอป (โดยไม่มีรหัสผ่าน) และแยกการเก็บรหัสผ่านไว้ใน Keychain Wrapper

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `cargo test --manifest-path src-tauri/Cargo.toml test_connection_storage`
ผลลัพธ์ที่คาดหวัง: FAIL

- [ ] **Step 3: พัฒนา `keychain.rs` และ `connection_store.rs`**
พัฒนาฟังก์ชันเชื่อมต่อ macOS Keychain ผ่าน Crate `keyring` และระบบบันทึกรายการ Connection ลงใน Application Data Directory

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `cargo test --manifest-path src-tauri/Cargo.toml test_connection_storage`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add src-tauri/src/services
git commit -m "feat(backend): add connection manager and keychain storage integration"
```

---

### Task 4: เอนจินรันคำสั่งฐานข้อมูล Dynamic Drivers (SQLite, Postgres, MySQL)

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src-tauri/src/drivers/mod.rs`
- สร้าง: `src-tauri/src/drivers/sqlite.rs`
- สร้าง: `src-tauri/src/drivers/postgres.rs`
- สร้าง: `src-tauri/src/drivers/mysql.rs`
- สร้าง: `src-tauri/src/drivers/traits.rs`
- ทดสอบ: `src-tauri/src/drivers/sqlite_test.rs`

**Interfaces:**
- Consumes: `sqlx`, `rusqlite`, `QueryResult`, `ConnectionConfig`
- Produces:
  ```rust
  #[async_trait]
  pub trait DatabaseConnection: Send + Sync {
      async fn test_connection(&self) -> Result<u64, AppError>; // คืนค่า Latency (ms)
      async fn execute_query(&self, sql: &str) -> Result<QueryResult, AppError>;
      async fn fetch_table_data(&self, schema: Option<&str>, table: &str, limit: u32, offset: u32) -> Result<QueryResult, AppError>;
      async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError>;
      async fn commit(&self) -> Result<(), AppError>;
      async fn rollback(&self) -> Result<(), AppError>;
      async fn cancel(&self) -> Result<(), AppError>;
  }
  ```

- [ ] **Step 1: เขียน Integration Test สำหรับการรัน Query และ Pagination ของ SQLite**
ใน `src-tauri/src/drivers/sqlite_test.rs` สร้าง In-memory SQLite Database, สร้างตารางทดสอบ, Insert ข้อมูลที่มีทั้ง Null, ตัวเลข, สตริง และทดสอบดึงข้อมูลแบบมี Limit/Offset

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `cargo test --manifest-path src-tauri/Cargo.toml test_sqlite_query_execution`
ผลลัพธ์ที่คาดหวัง: FAIL

- [ ] **Step 3: พัฒนา Trait และ Driver สำหรับ SQLite, Postgres และ MySQL**
พัฒนา Dynamic Column Extraction เพื่อแปลง Data Type ของแต่ละฐานข้อมูลเข้าสู่ `CellValue` และจับเวลาการประมวลผล (execution_time_ms)

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `cargo test --manifest-path src-tauri/Cargo.toml test_sqlite_query_execution`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add src-tauri/src/drivers
git commit -m "feat(backend): implement dynamic database drivers with sqlite, postgres, and mysql"
```

---

### Task 5: ระบบจัดการ Session ประจำแท็บ และ Tauri IPC Commands

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src-tauri/src/session/mod.rs`
- สร้าง: `src-tauri/src/commands/mod.rs`
- สร้าง: `src-tauri/src/commands/db.rs`
- แก้ไข: `src-tauri/src/main.rs`
- ทดสอบ: `src-tauri/src/commands/db_test.rs`

**Interfaces:**
- Produces: ชุดคำสั่ง Tauri Commands สำหรับฝั่ง Frontend เรียกใช้งาน:
  - `test_connection(config: ConnectionConfig, password: Option<String>) -> Result<u64, String>`
  - `open_session(connection_id: String, tab_id: String) -> Result<(), String>`
  - `close_session(tab_id: String) -> Result<(), String>`
  - `execute_query(tab_id: String, sql: String) -> Result<QueryResult, String>`
  - `cancel_query(tab_id: String) -> Result<(), String>`
  - `set_autocommit(tab_id: String, enabled: bool) -> Result<(), String>`
  - `commit_transaction(tab_id: String) -> Result<(), String>`
  - `rollback_transaction(tab_id: String) -> Result<(), String>`
  - `get_schema_tree(connection_id: String) -> Result<Vec<SchemaNode>, String>`

- [ ] **Step 1: เขียน Unit Test ตรวจสอบวงจรการทำงานของ Session (Session Lifecycle)**
ใน `src-tauri/src/commands/db_test.rs` ทดสอบว่าการเปิด Session จะสร้าง Dedicated Handle ประจำ Tab ID และการปิด Session จะปลดปล่อยทรัพยากรอย่างถูกต้อง

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `cargo test --manifest-path src-tauri/Cargo.toml test_session_lifecycle`
ผลลัพธ์ที่คาดหวัง: FAIL

- [ ] **Step 3: พัฒนา `SessionManager` และลงทะเบียนคำสั่ง Tauri Commands ใน `src-tauri/src/main.rs`**
สร้าง `SessionManager` ถือ State `HashMap<TabId, Box<dyn DatabaseConnection>>` และผูกกับ Tauri Invoke Handler

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `cargo test --manifest-path src-tauri/Cargo.toml test_session_lifecycle`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add src-tauri/src/session src-tauri/src/commands src-tauri/src/main.rs
git commit -m "feat(backend): add session manager and expose tauri ipc db commands"
```

---

### Task 6: โครงสร้าง State และ API Client ฝั่ง Frontend (TypeScript/React)

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src/types/db.ts`
- สร้าง: `src/api/db.ts`
- สร้าง: `src/stores/connectionStore.ts`
- สร้าง: `src/stores/tabStore.ts`
- ทดสอบ: `src/stores/tabStore.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/api/core` `invoke`
- Produces:
  ```typescript
  export interface Tab {
    id: string;
    connectionId: string;
    type: 'query' | 'table';
    title: string;
    autoCommit: boolean;
    queryContent: string;
  }
  export const useTabStore = create<TabStoreState>(...);
  ```

- [ ] **Step 1: เขียน Vitest Unit Test ตรวจสอบการจัดการแท็บใน `src/stores/tabStore.test.ts`**
ทดสอบการเพิ่มแท็บใหม่, การสลับแท็บที่กำลัง Active และการปิดแท็บ

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `pnpm test tabStore.test.ts`
ผลลัพธ์ที่คาดหวัง: FAIL

- [ ] **Step 3: พัฒนา `types/db.ts`, `api/db.ts` และ Zustand Stores**
สร้าง Type Definitions ฝั่ง Frontend, พัฒนา API Wrapper ที่ครอบคำสั่ง `invoke` ของ Tauri และสร้าง Zustand Store จัดการ State

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `pnpm test tabStore.test.ts`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add src/types src/api src/stores
git commit -m "feat(frontend): create tauri ipc client layer and tab state stores"
```

---

### Task 7: หน้าต่างแสดงโครงสร้าง Object Browser (Tree View)

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src/components/sidebar/ObjectBrowser.tsx`
- สร้าง: `src/components/sidebar/ConnectionTreeNode.tsx`
- ทดสอบ: `src/components/sidebar/ObjectBrowser.test.tsx`

**Interfaces:**
- Consumes: `react-arborist`, `useConnectionStore`, `get_schema_tree` API
- Produces: Sidebar Tree View แสดง Connection -> Database -> Tables / Views พร้อม Context Menu (เปิดตาราง, รีเฟรช)

- [ ] **Step 1: เขียน Component Test จำลองการแสดงผล Tree View**
ทดสอบว่าเมื่อส่งข้อมูล Mock Schema เข้าไป Component สามารถ Render โหนด Database และเมื่อคลิกขยายจะแสดงรายการ Tables พร้อมเปิดแท็บได้เมื่อดับเบิลคลิก

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `pnpm test ObjectBrowser.test.tsx`
ผลลัพธ์ที่คาดหวัง: FAIL

- [ ] **Step 3: พัฒนา `ObjectBrowser.tsx` ด้วย `react-arborist`**
ใส่ช่องค้นหากรองรายชื่อ (Filter), ไอคอนจาก `lucide-react` และคลิกขวาเพื่อเปิด Context Menu

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `pnpm test ObjectBrowser.test.tsx`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add src/components/sidebar
git commit -m "feat(frontend): implement object browser tree with react-arborist"
```

---

### Task 8: เครื่องมือเขียน SQL (Query Editor) และแถบควบคุม Transaction

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src/components/editor/SqlEditor.tsx`
- สร้าง: `src/components/editor/EditorToolbar.tsx`
- ทดสอบ: `src/components/editor/SqlEditor.test.tsx`

**Interfaces:**
- Consumes: CodeMirror 6 (`@codemirror/lang-sql`), `useTabStore`, `execute_query`, `cancel_query`, `set_autocommit`
- Produces: โปรแกรมแก้ไข SQL พร้อมคีย์ลัด ⌘+Enter, ปุ่ม Run/Cancel และสวิตช์ Auto-Commit ON/OFF

- [ ] **Step 1: เขียน Component Test ตรวจสอบคีย์ลัดและการสั่งรัน Query**
ใน `SqlEditor.test.tsx` ทดสอบว่าเมื่อกดปุ่ม Cmd+Enter ระบบจะเรียกฟังก์ชันรัน Query พร้อมส่งข้อความ SQL ที่เลือกไว้ (หรือทั้งหมด)

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `pnpm test SqlEditor.test.tsx`
ผลลัพธ์ที่คาดหวัง: FAIL

- [ ] **Step 3: พัฒนา `SqlEditor.tsx` และ `EditorToolbar.tsx`**
ติดตั้ง CodeMirror 6 พร้อม SQL Dialect, ซิงค์ Dark/Light Theme, สวิตช์ Auto-Commit, ปุ่ม Commit, Rollback และ Cancel

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `pnpm test SqlEditor.test.tsx`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add src/components/editor
git commit -m "feat(frontend): implement codemirror 6 sql editor and transaction toolbar"
```

---

### Task 9: ตารางแสดงผลข้อมูล (Glide Data Grid) และหน้าต่างดูรายละเอียด Cell

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src/components/grid/DataGrid.tsx`
- สร้าง: `src/components/grid/CellDetailDrawer.tsx`
- สร้าง: `src/components/grid/PaginationBar.tsx`
- ทดสอบ: `src/components/grid/DataGrid.test.tsx`

**Interfaces:**
- Consumes: `@glideapps/glide-data-grid`, `QueryResult`
- Produces: ตารางข้อมูล Canvas ประสิทธิภาพสูง แบ่งหน้าทีละ 100 แถว, มีแถบระบุ `NULL` ชัดเจน, ดับเบิลคลิกแก้ไขค่า และมี Drawer ดูข้อความยาว/JSON

- [ ] **Step 1: เขียน Test ตรวจสอบการแมป Column และ Row เข้าสู่ Grid**
ทดสอบว่า `QueryResult` สามารถแปลงเข้า Cell Accessor ของ Glide Data Grid ได้ถูกต้อง และการเปลี่ยนหน้า (Pagination) สั่งโหลดข้อมูลใหม่

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `pnpm test DataGrid.test.tsx`
ผลลัพธ์ที่คาดหวัง: FAIL

- [ ] **Step 3: พัฒนา `DataGrid.tsx` และ `CellDetailDrawer.tsx`**
ตั้งค่า Glide Data Grid พร้อมฟังก์ชัน Sync สี Theme ไปยัง Canvas, แถบเปลี่ยนหน้าด้านล่าง (ทีละ 100 แถว) และ Drawer ด้านข้างสำหรับแสดง JSON หรือ Text ยาว

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `pnpm test DataGrid.test.tsx`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add src/components/grid
git commit -m "feat(frontend): implement glide data grid with pagination and cell detail drawer"
```

---

### Task 10: หน้าต่างจัดการและสร้าง Connection (Connection Manager Dialog)

**ไฟล์ที่เกี่ยวข้อง:**
- สร้าง: `src/components/dialogs/ConnectionDialog.tsx`
- สร้าง: `src/components/dialogs/DriverForm.tsx`
- ทดสอบ: `src/components/dialogs/ConnectionDialog.test.tsx`

**Interfaces:**
- Consumes: `useConnectionStore`, `test_connection` API
- Produces: Modal Dialog สำหรับเพิ่ม/แก้ไขการเชื่อมต่อ SQLite (เลือกไฟล์), Postgres และ MySQL พร้อมปุ่ม Test Connection แสดง Latency

- [ ] **Step 1: เขียน Test ตรวจสอบ Form Validation และปุ่มทดสอบการเชื่อมต่อ**
ทดสอบว่าเมื่อเลือก Driver สลับระหว่าง SQLite กับ Postgres ฟิลด์ฟอร์มจะเปลี่ยนตามความเหมาะสม และการกด Test Connection จะแสดงค่า Latency

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `pnpm test ConnectionDialog.test.tsx`
ผลลัพธ์ที่คาดหวัง: FAIL

- [ ] **Step 3: พัฒนา `ConnectionDialog.tsx` และ `DriverForm.tsx`**
สร้างฟอร์มกรอกข้อมูล Host, Port, User, Password, SSL Mode และปุ่ม Test Connection พร้อมแถบสีสถานะ (เขียวเมื่อผ่าน / แดงเมื่อต่อไม่ติด)

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `pnpm test ConnectionDialog.test.tsx`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add src/components/dialogs
git commit -m "feat(frontend): implement connection manager dialog with test connection"
```

---

### Task 11: ประกอบหน้าต่างหลัก (Main Window Shell) และทดสอบแบบ End-to-End

**ไฟล์ที่เกี่ยวข้อง:**
- แก้ไข: `src/App.tsx`
- สร้าง: `src/components/layout/TitleBar.tsx`
- สร้าง: `src/components/layout/DockLayout.tsx`
- ทดสอบ: `tests/e2e/workflow.test.ts`

**Interfaces:**
- Consumes: Component ทั้งหมดจาก Task 6–10 และ `dockview`
- Produces: แอปพลิเคชันที่ประกอบสมบูรณ์พร้อมรัน รองรับการลาก-วางแท็บ, เมนูด้านข้าง และหน้าต่าง Overlay แบบ Mac

- [ ] **Step 1: เขียน Integration Test สำหรับ Workflow หลักของแอป**
ทดสอบขั้นตอน: เปิดแอป -> สร้างการเชื่อมต่อ SQLite -> ดูรายชื่อตารางใน Object Browser -> เปิด Query Editor -> สั่งรันคำสั่ง `CREATE TABLE` และ `SELECT` -> แสดงผลลัพธ์ลงใน Grid

- [ ] **Step 2: รัน Test เพื่อยืนยันว่า Test ล้มเหลว (Red)**
รัน: `pnpm test workflow.test.ts`
ผลลัพธ์ที่คาดหวัง: FAIL

- [ ] **Step 3: ประกอบ Component เข้าด้วยกันใน `DockLayout` และ `App.tsx`**
สร้าง `TitleBar` ที่เว้นระยะปุ่ม Traffic Light ของ Mac, วาง Sidebar Object Browser ทางซ้าย และใช้ `dockview` จัดการพื้นที่แท็บหลัก

- [ ] **Step 4: รัน Test เพื่อยืนยันว่าผ่าน (Green)**
รัน: `pnpm test workflow.test.ts`
ผลลัพธ์ที่คาดหวัง: PASS

- [ ] **Step 5: ตรวจสอบและทดสอบการ Build ทั้งหมดบน macOS ARM64**
รัน: `cargo test --all && pnpm build`
ผลลัพธ์ที่คาดหวัง: ผ่านการทดสอบทั้งหมดและสามารถ Build แอปได้สำเร็จ

- [ ] **Step 6: บันทึกการเปลี่ยนแปลง (Commit)**
```bash
git add .
git commit -m "feat: complete datacore mvp integration and verification"
```
