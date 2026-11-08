# DataCore UX/UI Redesign: Classic Desktop DB Client

* **Author:** chanchai9666 & EGM Synthesizer Swarm
* **Date:** 2026-11-08
* **Status:** Brainstorm Complete — Phase 1 Ready for Implementation
* **Reference Spec:** [DataCore-UX-UI-Redesign-Guide.md](file:///Users/chanchai/Downloads/DataCore-UX-UI-Redesign-Guide.md)
* **Active Issue:** [#28 (UI/UX & Design Customization)](https://github.com/chanchai9666/DataCore/issues/28)

---

## 1. Executive Summary & Problem Statement

DataCore มีโครงสร้างพื้นฐาน backend (Tauri IPC) และ driver การเชื่อมต่อที่แข็งแกร่ง (SQLite, PostgreSQL, MySQL) แต่ UI ปัจจุบันยังคงมีลักษณะแบบเว็บแอปพลิเคชันสมัยใหม่:
- ความหนาแน่นของข้อมูลต่ำ (low information density) ฟอนต์ขนาดใหญ่ (~15px) และ padding มากเกินไป
- สีปุ่มแบบ saturated (เขียว, น้ำเงิน, แดง) กระจายตัวหลายจุดโดยไม่มี visual hierarchy ที่เหมาะสม
- ขาด Global Desktop Chrome มาตรฐาน: ยังไม่มี Main Toolbar ด้านบน (56px), Status Bar ด้านล่าง (22px), และ Sub-tabs แบบ structured
- มี UI bug เช่น อักขระซ้ำ `+ + New Connection` ใน TitleBar

เป้าหมายของการ Redesign คือการปรับ DataCore สู่ **"Classic Desktop DB Client"** ที่เน้นความหนาแน่นสูง (compact rows 22–24px, ฟอนต์ 12–13px), การจัดวาง Desktop Chrome ตาม macOS Human Interface Guidelines, และการแก้ไขข้อมูลที่ปลอดภัย (Pending Changes with staging/commit) ภายใต้ข้อกำหนดการไม่ละเมิดลิขสิทธิ์หรือเครื่องหมายการค้าของโปรดักต์อื่น

---

## 2. Design System & Tokens (Phase 1 Foundation)

### 2.1 Typography & Density
- **UI Font Family:** `-apple-system, "SF Pro Text", "Sukhumvit Set", "Thonburi", system-ui, sans-serif`
- **Monospace Font:** `"SF Mono", ui-monospace, Menlo, "Sukhumvit Set", monospace`
- **Font Sizes:**
  - `xs`: 11px (line-height 16px) — status indicators, secondary labels, metadata
  - `sm`: 12px (line-height 18px) — grid cell text, tree nodes, inputs
  - `base`: 13px (line-height 20px) — modal headings, section titles
- **Row & Component Heights:**
  - Grid rows: 22–24px
  - Input & button controls: 24px
  - Main Toolbar: 56px
  - Status Bar: 22px
- **Visual Cleanup:** นำ `uppercase tracking-widest` ออกจากหัวข้อ sidebar และ explorer

### 2.2 Color Tokens & Theme Architecture
- **Light Theme (Default):**
  - `--bg-toolbar`: `#ececee` | `--bg-sidebar`: `#f4f4f6` | `--bg-panel`: `#fafafb` | `--bg-grid`: `#ffffff`
  - `--border`: `#d6d6da` | `--text`: `#1c1c1e` | `--text-muted`: `#6e6e73`
  - `--accent`: `#2d6cdf` | `--sel`: `#cfe0fb`
- **Dark Theme (Charcoal / Off-black, ไม่ใช่ dark navy):**
  - `--bg-toolbar`: `#323234` | `--bg-sidebar`: `#262628` | `--bg-panel`: `#2b2b2d` | `--bg-grid`: `#1e1e20`
  - `--border`: `#3e3e42` | `--text`: `#e8e8ea` | `--text-muted`: `#9a9aa0`
  - `--accent`: `#4a8bf0` | `--sel`: `#264f8c`
- **Status Colors:**
  - Success: `#2e9e5b` (light) / `#4cc17f` (dark)
  - Warning: `#c9861a` (light) / `#e0a840` (dark)
  - Danger: `#d33a3a` (light) / `#ef6b6b` (dark)

### 2.3 Neutral Button Hierarchy
- **Primary:** Solid accent (`var(--accent)`), ตัวอักษรสีขาว ใช้เฉพาะปุ่มยืนยันขั้นสุดท้าย (Save, Apply, OK ใน dialogs)
- **Default:** พื้นสีเทาเรียบ ขอบบาง สูง 24px สำหรับปุ่มทั่วไป
- **Toolbar / Ghost:** ไม่มีพื้นหลัง แสดงพื้นเมื่อ hover ไอคอน Lucide (14–16px) + label ย่อย แทนที่ปุ่มเขียวเดิม
- **Danger:** ตัวอักษรสีแดง ไม่มีพื้นหลัง (พื้นแดงเฉพาะใน Confirm Dialog ยืนยันการลบ)

---

## 3. Window Chrome & Navigation Architecture

```
┌────────────────────────────────────────────────────────────┐
│ ● ● ●   [Connect][Query][Table][View][Backup][Import]…     │ ← Main Toolbar (56px)
├─────────────┬──────────────────────────────────────────────┤
│ Search 🔍   │ [Objects] [categories_copy ×]            ⊕   │ ← Document Tabs
│ Connection  ├──────────────────────────────────────────────┤
│ Tree        │ Context Toolbar (Open | Design | New | Del)  │
│ [PG] POS V2 ├──────────────────────────────────────────────┤
│  └ public   │ Data Grid / Designer / Query Editor          │
│   └ Tables  ├──────────────────────────────────────────────┤
│             │ ＋ － ✓ Commit ✕ Discard ⟳ ⏹ │ |◀ ◀ 1 ▶ ▶|   │ ← Bottom Action Bar
├─────────────┴──────────────────────────────────────────────┤
│ SELECT * FROM "public"."categories" LIMIT 100 │ 10 rows │  │ ← Status Bar (22px)
└────────────────────────────────────────────────────────────┘
```

1. **Main Toolbar (Top, 56px):**
   - อยู่นอก tab view ในระดับ Root layout
   - มี `pl-[78px]` เว้นระยะให้ traffic lights ของ macOS
   - กำหนด `data-tauri-drag-region` เพื่อให้ลากหน้าต่างได้อย่างเป็นธรรมชาติ
   - รวม Action หลัก: Connect, New Query, Table, View, Import, Export, Backup
2. **Sidebar (Connection Tree):**
   - ช่อง Search เดียว + ต้นไม้การเชื่อมต่อ (ลบหัวข้อซ้ำซ้อน EXPLORER / OBJECT BROWSER)
   - จุดแสดงสถานะ: เขียว = เชื่อมต่ออยู่, เทา = ไม่ได้เชื่อมต่อ
   - DB badges: ตัวย่อสไตล์กลาง `PG`, `MY`, `SQ` ไม่ใช้โลโก้เครื่องหมายการค้า
3. **Status Bar (Bottom, 22px):**
   - ซ้าย: SQL ล่าสุดที่รัน (truncate พร้อมคลิกดูเต็ม)
   - กลาง/ขวา: เวลา execution time (ms), จำนวนแถว, ตำแหน่งเซลล์ที่ active

---

## 4. Key Workspaces: Data Grid & Table Designer

### 4.1 Table Viewer & Safe Pending Changes
- **Filter Bar:** One-line filter bar เหนือ grid (`[column ▾] [operator ▾] [value] [＋] [Apply] [Clear]`) ซ่อนเป็นค่าเริ่มต้นและเปิดด้วย ⌘F
- **Bottom Action Bar:** รวมคำสั่งแถว (`＋ Add`, `－ Delete`, `✓ Commit`, `✕ Discard`, `⟳ Refresh`, `⏹ Stop`) และ Pagination
- **Pending Changes Store:** Staging diffs ใน frontend zustand store เซลล์ที่ถูกแก้จะไฮไลต์สถานะจนกว่าจะกด Commit หรือ Discard
- **Glide Grid Themes:** ส่ง theme config (`lightGridTheme`, `darkGridTheme`) ตรงไปยัง Canvas theme prop ของ `@glideapps/glide-data-grid`

### 4.2 Table Designer
- **Inline Editable Grid:** มี Sub-tabs (`Fields`, `Indexes`, `Foreign Keys`, `Triggers`, `Options`, `SQL Preview`)
- **Fields Editing:** คลิกแก้ในเซลล์ได้ทันที (ชื่อ, ชนิดข้อมูล, ขนาด, Checkbox Not Null, Key toggle)
- **SQL Preview:** CodeMirror แบบ read-only แสดง `ALTER TABLE` DDL พร้อมระบบ dry-run แจ้งเตือนก่อนกด Save

---

## 5. Phased Delivery Roadmap

| Phase | Scope | Deliverables | Risk Level |
|---|---|---|---|
| **Phase 1** | **Foundations & Design Tokens** | `src/styles/tokens.css`, อัปเดต `tailwind.config.js`, button hierarchy, แก้บั๊ก `+ +` ใน `TitleBar.tsx` | 🟢 Low (Zero backend/logic change) |
| **Phase 2** | **Window Chrome & Layout Shell** | `MainToolbar` (56px), `StatusBar` (22px), ทำความสะอาด Sidebar headers, DB badge components | 🟡 Medium |
| **Phase 3** | **Table Viewer & Pending Changes** | Glide theme integration, one-line filter bar, bottom action bar, `pendingChangesStore` | 🟡 Medium |
| **Phase 4** | **Table Designer & Objects View** | Inline editable fields grid, PostgreSQL/MySQL DDL generator, SQL preview tab | 🔴 High |
| **Phase 5** | **macOS Native Polish** | Tauri vibrancy window effects, native macOS menus, keyboard shortcut bindings | 🟢 Low |

---

## 6. Phase 1 Implementation Plan (Immediate Next Step)

1. **Step 1: CSS Variables (`src/styles/tokens.css`):**
   - กำหนดตัวแปรสีทั้ง `:root` (Light default) และ `.dark` (Charcoal)
   - กำหนดตัวแปรฟอนต์ `--font-ui`, `--font-mono` และขนาดความสูงองค์ประกอบ
   - ทำการ import เข้าสู่ `src/index.css`
2. **Step 2: Tailwind Extension (`tailwind.config.js`):**
   - เพิ่มขนาดฟอนต์ `xs: ['11px', '16px']`, `sm: ['12px', '18px']`, `base: ['13px', '20px']`
   - เพิ่มความสูงเฉพาะ `row: '24px'`, `btn: '24px'`, `toolbar: '56px'`, `status: '22px'`
   - ผูกสี semantic tokens เข้ากับ CSS variables
3. **Step 3: Fix `TitleBar.tsx` Bug & Apply Button Tokens:**
   - แก้ไขบรรทัดที่แสดง `+ + New Connection` โดยนำอักขระ `+ ` ออกจากป้ายกำกับ
   - ปรับแต่งปุ่มใน `TitleBar.tsx` ให้ใช้ class และสไตล์ตาม button hierarchy ใหม่
4. **Step 4: Quality & Verification:**
   - รัน `pnpm test`
   - รัน `pnpm build`
   - รัน `cargo test --manifest-path src-tauri/Cargo.toml`
