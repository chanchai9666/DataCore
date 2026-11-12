# Agent Instructions for DataCore

## Language & Communication
- **ภาษาที่ใช้สื่อสาร:** สื่อสารด้วยภาษาไทยเป็นหลักเสมอ
- **การใช้ภาษาอังกฤษ/ทับศัพท์:** อนุญาตให้ใช้ภาษาอังกฤษ ศัพท์เทคนิค โค้ด คำสั่ง shell ชื่อไฟล์ หรือคำทับศัพท์ได้หากจำเป็น เพื่อความถูกต้องและเข้าใจง่ายทางเทคนิค

## Development Workflow & Guidelines (ข้อปฏิบัติในการพัฒนา)
ทุกครั้งที่มีการเพิ่มฟีเจอร์ใหม่หรือแก้ไขโค้ดโปรแกรม ให้ปฏิบัติตามขั้นตอนต่อไปนี้อย่างเคร่งครัด:

1. **เปิด GitHub Issue ก่อนเริ่มงาน:**
   - ใช้ `gh issue create` สร้าง issue ใหม่ โดยระบุหัวข้อ ขอบเขตงาน และรายละเอียดความต้องการให้ชัดเจน
2. **อัปเดตเอกสารสเปค (Specification):**
   - อัปเดตเอกสารสเปคหลักของโปรเจกต์ (`docs/db-manager-plan.md` หรือเอกสารที่เกี่ยวข้องใน `docs/`) ให้สอดคล้องกับฟีเจอร์หรือการเปลี่ยนแปลงที่เกิดขึ้นเสมอ
3. **พัฒนาและทดสอบ:**
   - พัฒนาโค้ดตามมาตรฐาน TDD พร้อมเขียน automated test ให้ครอบคลุม
   - ตรวจสอบความถูกต้องด้วย `pnpm test` และ `pnpm build` (รวมถึง `cargo test` หากมีการแก้ไขโค้ดฝั่ง Rust) ให้ผ่าน 100% เสมอ
4. **บันทึก Commit และปิด GitHub Issue:**
   - Commit โค้ดพร้อมระบุข้อความอธิบายการเปลี่ยนแปลงและอ้างอิง issue (เช่น `closes #<issue_number>`)
   - ปิด issue ด้วย `gh issue close <issue_number> --comment "..."` พร้อมสรุปรายละเอียดงานที่ทำและ commit hash
   - Push การเปลี่ยนแปลงขึ้น Git remote branch

## Architecture (Tauri 2 Desktop App)
- **สอง runtime ที่ต้องสอดคล้องกัน:** Frontend คือ React 18 + TypeScript (`src/`) ติดต่อกับ Backend ผ่าน Tauri IPC เท่านั้น — wrapper อยู่ที่ `src/api/db.ts` Backend คือ Rust (`src-tauri/`) แบ่งเป็น `commands/` (IPC handlers) → `drivers/` (SQLite/Postgres/MySQL) → `services/`, `session/`
- **Data contract:** โครงสร้างข้อมูลที่ส่งข้าม IPC (เช่น `QueryResult`, `CellValue`) ต้องแก้ทั้งสองฝั่งให้ตรงกัน — Rust ที่ `src-tauri/src/models/` และ TypeScript ที่ `src/types/db.ts`
- **State:** ใช้ Zustand เท่านั้น (`src/stores/tabStore.ts`, `connectionStore.ts`)
- ออกแบบสำหรับ macOS Apple Silicon; รหัสผ่านจัดเก็บใน **Local Encrypted Vault (AES-256-GCM)** ในระดับเครื่อง (`~/.datacore/vault.enc` สิทธิ์ 0600) เมื่อเลือก "Remember password" ป้องกันการบันทึก Plaintext ลงดิสก์ และไม่เรียกใช้ OS Keychain เพื่อหลีกเลี่ยง Authorization Popups รบกวน โดยจำรหัสผ่านข้ามการปิด-เปิดแอปและการ restart เครื่องได้อย่างปลอดภัย (หากไม่เลือก Remember password จะเก็บเฉพาะใน RAM ชั่วคราวระดับ Session เท่านั้น) (รายละเอียดเพิ่มเติมดู `README.md` และ `docs/db-manager-plan.md`)

## Commands
- ใช้ **pnpm** เสมอ (ไม่ใช่ npm/yarn) และ `make` เป็นจุดเริ่มต้นสำหรับงานทั่วไป:
  - `make dev` — รันแอป desktop (Tauri) | `make dev-web` — รันเฉพาะ Vite dev server
  - `make test` — รัน tests ทั้งหมด (Rust + Frontend)
  - `make check` — `cargo check` + `pnpm build` (typecheck) | `make lint` — cargo clippy (`-D warnings`)
  - `make build` — build .app/.dmg | `make clean` — ลบ `dist/` และ `src-tauri/target/`
- **รันเทสไฟล์เดียว / เทสเดียว (ประหยัดเวลามาก):**
  - Front: `pnpm test src/stores/tabStore.test.ts` (vitest, jsdom, globals, setup ที่ `src/test/setup.ts`)
  - Back: `cargo test --manifest-path src-tauri/Cargo.toml <ชื่อเทส>`
- **ตำแหน่งเทส:** Vitest เก็บเทสแบบ colocated ข้างโค้ด (`src/**/*.test.ts`) และ E2E workflow ที่ `tests/e2e/`; Rust เทสอยู่ใน `src-tauri/src/**/*_test.rs`

## Gotchas
- **Vite dev server ต้องใช้ port 1420 เท่านั้น** (`strictPort: true` ตามที่ Tauri กำหนด) ถ้า port ติดแอปจะรันไม่ได้ — อย่าเปลี่ยน port
- แก้ Rust แล้วต้อง verify ด้วย `cargo test` ใน `src-tauri/Cargo.toml` อย่างชัดเจน (`pnpm test` ไม่รันฝั่ง Rust)
- อย่าแก้ไฟล์ภายใต้ `src-tauri/gen/` (generated โดย Tauri ครับ)
