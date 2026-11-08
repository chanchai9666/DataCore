# DataCore – แนวทางปรับ UX/UI สู่ "Classic Desktop DB Client"

> เอกสารนี้ใช้เป็น spec ภายในสำหรับปรับ design ของ DataCore ให้มี **ความหนาแน่นสูง เน้น toolbar และ data grid** แบบเครื่องมือจัดการฐานข้อมูลบนเดสก์ท็อปทั่วไป
> ใช้ *pattern และหลักการ UX ทั่วไป* เท่านั้น ไม่คัดลอกงานออกแบบเฉพาะของผลิตภัณฑ์ใดผลิตภัณฑ์หนึ่ง (ดูหัวข้อ [0. ข้อกำหนดด้านลิขสิทธิ์](#0-ข้อกำหนดด้านลิขสิทธิ์และเครื่องหมายการค้า))

---

## 0. ข้อกำหนดด้านลิขสิทธิ์และเครื่องหมายการค้า

**ทำได้ (แนวคิด/pattern ทั่วไป ไม่ได้รับการคุ้มครอง)**
- โครงหน้าจอแบบ: toolbar บน, connection tree ซ้าย, แท็บเอกสารตรงกลาง, status bar ล่าง
- Interaction: double-click เปิดตาราง, คลิกขวาเปิด context menu, แก้ไขใน grid แล้ว commit/discard
- ความหนาแน่นของข้อมูล (ฟอนต์ 12–13px, แถวสูง 22–24px)
- ชื่อฟังก์ชันทั่วไป เช่น Open Table, Design Table, Filter, Sort, Export

**ห้ามทำ**
- ห้ามใช้ชื่อ โลโก้ ไอคอน หรือ asset จากผลิตภัณฑ์อื่น (รวมถึงไอคอนที่ extract จากแอปคู่แข่ง)
- ห้ามคัดลอกพาเลตต์สี ไอคอนชุดเฉพาะ หรือ layout แบบ pixel-for-pixel จนเป็น trade dress เดียวกัน
- ห้ามคัดลอกข้อความ UI, ข้อความช่วยเหลือ หรือเอกสารของผลิตภัณฑ์อื่น
- ห้ามใช้โลโก้ฐานข้อมูล (ช้าง/โลมา ฯลฯ) เป็นไฟล์ที่ไม่ได้รับอนุญาต

**แหล่ง asset ที่ปลอดภัย**
| ประเภท | แหล่ง | หมายเหตุ |
|---|---|---|
| ไอคอน UI | `lucide-react` (ISC) | ใช้อยู่แล้ว |
| ไอคอนชนิด DB | วาดเอง หรือ `simple-icons` (CC0) | ตรวจ guideline ของแต่ละแบรนด์ก่อนใช้ ถ้าไม่แน่ใจให้ใช้สัญลักษณ์กลางเป็นตัวย่อ `PG` `MY` `SQ` ในกล่องสี |
| ฟอนต์ | ฟอนต์ระบบ (SF Pro, Sukhumvit Set, Thonburi) | ไม่ต้อง bundle |
| สี | กำหนดเองจาก design token ด้านล่าง | ไม่ลอกค่าจากผลิตภัณฑ์อื่น |

> ✅ **Checklist ก่อน release:** ไม่มีคำว่าชื่อคู่แข่งใน UI/ซอร์ส/ไฟล์ asset, ไอคอนทุกตัวมีที่มาและ license ชัดเจน, มีไฟล์ `THIRD_PARTY_LICENSES` ครอบคลุม dependency ทั้งหมด

---

## 1. สรุปช่องว่างของ UI ปัจจุบัน

| ด้าน | ปัจจุบัน | เป้าหมาย |
|---|---|---|
| ความหนาแน่น | padding เยอะ ปุ่มใหญ่ ฟอนต์ ~15px | ฟอนต์ 12–13px, แถว 22–24px, ปุ่มสูง 24px |
| การนำทางหลัก | มีแค่ปุ่ม New Connection | Main toolbar แบบไอคอน + label |
| Sidebar | หัวข้อ "EXPLORER / OBJECT BROWSER" ซ้อน 2 ชั้น ตัวพิมพ์ใหญ่ | Search + tree อย่างเดียว |
| Tabs | pill/segmented | document tabs + sub-tabs แบบคลาสสิก |
| สีปุ่ม | เขียว/น้ำเงิน/แดงสดหลายจุด | ปุ่มเทาเรียบ ใช้ accent เฉพาะปุ่มหลัก |
| Table Designer | modal เพิ่มทีละคอลัมน์ | inline editable grid + แผง properties |
| Data grid | filter panel ใหญ่ด้านล่าง | filter bar บรรทัดเดียว + bottom action bar |
| Theme | dark navy | light เป็น default, dark เป็นเทาถ่าน |
| Status bar | ไม่มี | มี (SQL ล่าสุด, จำนวนแถว, เวลา) |

**บั๊กที่พบ:** ปุ่ม New Connection แสดง `+ + New Connection` (ไอคอน lucide + ตัวอักษร `+` ในข้อความ) → ลบ `+` ออกจาก label

---

## 2. Design System

### 2.1 Typography & Density

```css
:root {
  --font-ui: -apple-system, "SF Pro Text", "Sukhumvit Set", "Thonburi", system-ui, sans-serif;
  --font-mono: "SF Mono", ui-monospace, Menlo, "Sukhumvit Set", monospace;
}
```

- ขนาดฟอนต์ UI: `12px` (ข้อความทั่วไป), `11px` (label รอง), `13px` (หัวข้อ dialog)
- หัวข้อ sidebar/section: ตัวปกติ น้ำหนัก 600 สีเทา **เลิกใช้ `uppercase tracking-widest`**
- monospace ใช้เฉพาะ SQL, ชื่อคอลัมน์ใน designer, ค่าชนิด UUID/JSON

### 2.2 Tailwind config

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-ui)'], mono: ['var(--font-mono)'] },
      fontSize: {
        xs:   ['11px', '16px'],
        sm:   ['12px', '18px'],
        base: ['13px', '20px'],
      },
      borderRadius: { DEFAULT: '4px', md: '5px', lg: '6px' },
      colors: {
        toolbar: 'var(--bg-toolbar)',
        sidebar: 'var(--bg-sidebar)',
        grid:    'var(--bg-grid)',
        panel:   'var(--bg-panel)',
        line:    'var(--border)',
        accent:  'var(--accent)',
        sel:     'var(--sel)',
        muted:   'var(--text-muted)',
      },
      height: { row: '24px', 'row-sm': '22px', btn: '24px', toolbar: '56px', status: '22px' },
    },
  },
};
```

### 2.3 Color Tokens

> ค่าด้านล่างเป็นชุดสีที่กำหนดขึ้นเอง ปรับแต่งได้ตามแบรนด์ DataCore

```css
:root {                       /* Light (default) */
  --bg-toolbar: #ececee;
  --bg-sidebar: #f4f4f6;
  --bg-panel:   #fafafb;
  --bg-grid:    #ffffff;
  --row-alt:    #f7f8fb;
  --border:     #d6d6da;
  --text:       #1c1c1e;
  --text-muted: #6e6e73;
  --accent:     #2d6cdf;
  --sel:        #cfe0fb;
  --danger:     #d33a3a;
  --success:    #2e9e5b;
  --warn:       #c9861a;
}

.dark {                       /* Dark – เทาถ่าน ไม่ใช่ navy */
  --bg-toolbar: #323234;
  --bg-sidebar: #262628;
  --bg-panel:   #2b2b2d;
  --bg-grid:    #1e1e20;
  --row-alt:    #232325;
  --border:     #3e3e42;
  --text:       #e8e8ea;
  --text-muted: #9a9aa0;
  --accent:     #4a8bf0;
  --sel:        #264f8c;
  --danger:     #ef6b6b;
  --success:    #4cc17f;
  --warn:       #e0a840;
}
```

- ตั้งค่าเริ่มต้นตาม `prefers-color-scheme` และให้ผู้ใช้เลือกทับได้ (System / Light / Dark)
- ทดสอบ contrast ตัวอักษร/badge ให้ผ่าน **WCAG AA (4.5:1)**

### 2.4 Button Hierarchy

| ระดับ | สไตล์ | ใช้กับ |
|---|---|---|
| Primary | พื้น `accent` ตัวอักษรขาว | OK / Save / Apply ใน dialog เท่านั้น |
| Default | พื้นเทา ขอบบาง สูง 24px | ปุ่มทั่วไป |
| Toolbar | ไม่มีพื้น แสดงพื้นเมื่อ hover, ไอคอน + label | แถบเครื่องมือ |
| Danger | ตัวอักษรแดง ไม่มีพื้น (พื้นแดงเฉพาะใน confirm dialog) | Delete / Drop |

เลิกใช้ปุ่มเขียวสำหรับ Add Row / Add Column / Add Index → เปลี่ยนเป็นปุ่ม Toolbar

### 2.5 Icon Style
- `lucide-react` ขนาด 14–16px (toolbar หลัก 22–24px), `strokeWidth={1.5}`
- สีไอคอนใน tree ให้เป็นกลาง (muted / accent อ่อน) ไม่ใช้เขียวทั้งต้นไม้

---

## 3. Layout หลัก

```
┌────────────────────────────────────────────────────────────┐
│ ● ● ●   [Connect][Query][Table][View][Backup][Import]…     │ ← Main Toolbar
├─────────────┬──────────────────────────────────────────────┤
│ Search 🔍   │ [Objects] [categories_copy ×]            ⊕   │ ← Document tabs
│ Connection  ├──────────────────────────────────────────────┤
│ Tree        │ Context toolbar (Open | Design | New | Del)  │
│ 🐘 POS V2   │ ──────────────────────────────────────────── │
│  └ public   │   Data grid / Designer / Query editor        │
│   └ Tables  ├──────────────────────────────────────────────┤
│             │ ＋ － ✓ ✕ ⟳ ⏹ │ |◀ ◀ Page 1 ▶ ▶| │ ▦ ☰      │ ← Grid bottom bar
├─────────────┴──────────────────────────────────────────────┤
│ SELECT * FROM "public"."categories_copy" LIMIT 100 │ 10 rows │ ← Status bar
└────────────────────────────────────────────────────────────┘
```

### 3.1 Main Toolbar
- ความสูง ~56px ไอคอน 22–24px + label 10–11px ด้านล่าง
- รายการเริ่มต้น: **Connect · New Query · Table · View · Import · Export · Backup**
- ย้ายปุ่ม New Connection จาก title bar มาไว้ที่นี่
- Title bar เหลือชื่อ connection ที่ active ตรงกลาง
- ใส่ `data-tauri-drag-region` ที่ toolbar เพื่อให้ลากหน้าต่างได้

```tsx
// components/MainToolbar.tsx (โครงตัวอย่าง)
type ToolbarItem = { id: string; label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean };

export function MainToolbar({ items }: { items: ToolbarItem[] }) {
  return (
    <div data-tauri-drag-region className="h-toolbar bg-toolbar border-b border-line flex items-end gap-1 pl-[78px] pr-2 pb-1">
      {items.map(({ id, label, icon: Icon, onClick, disabled }) => (
        <button key={id} onClick={onClick} disabled={disabled}
          className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40">
          <Icon size={22} strokeWidth={1.5} />
          <span className="text-[10px] text-muted">{label}</span>
        </button>
      ))}
    </div>
  );
}
```
> `pl-[78px]` เว้นที่ให้ปุ่ม traffic light ของ macOS

### 3.2 Sidebar (Connection Tree)
- ลบหัว "EXPLORER" และ "OBJECT BROWSER" เหลือ **search box + tree**
- Row height 22px, indent 14px
- Selected = พื้น `--sel` เต็มแถว
- ไอคอนชนิด DB: ใช้ badge ตัวย่อหรือไอคอนที่มี license ชัดเจน
- สถานะ connection: จุดเขียว = เชื่อมต่ออยู่, เทา = ปิดอยู่
- เก็บ context menu (Radix) ทุกระดับ: Connect/Disconnect, Open Table, Design Table, Copy Name, Truncate, Drop

### 3.3 Objects View (หน้ารายการอ็อบเจ็กต์)
เมื่อคลิก "Tables" หรือ schema ให้เปิดแท็บ **Objects** แสดงตารางเป็น grid

| Name | Rows (est.) | Size | Engine/Type | Modified | Comment |
|---|---|---|---|---|---|

- Toolbar: `Open Table · Design Table · New Table · Delete Table · Import · Export`
- มุมมอง: List / Detail ปุ่มสลับที่มุมขวา
- ดึงข้อมูลจาก `information_schema` / `pg_class` / `SHOW TABLE STATUS` / `sqlite_master`

### 3.4 Status Bar
- ซ้าย: SQL ล่าสุดที่รัน (truncate, คลิกเพื่อดูเต็ม)
- กลาง/ขวา: จำนวนแถว, เวลาที่ใช้ (ms), ตำแหน่ง record ที่เลือก
- สูง 22px ตัวอักษร 11px

---

## 4. Table Viewer (Data Tab)

### 4.1 Toolbar บน
`Begin Transaction · Filter · Sort · Text/Hex view · Import · Export`
แทนแถบ "5 columns (307 ms)" (ย้ายข้อมูลนั้นไป status bar)

### 4.2 Filter Bar (แทน Filter Panel ใหญ่)
- แสดงเป็น **บรรทัดเดียว** ใต้ toolbar: `[column ▾] [operator ▾] [value] [＋] [Apply] [Clear]`
- กด `＋` เพื่อเพิ่มเงื่อนไข (stack แนวตั้งไม่เกิน 3 แถวก่อน scroll)
- AND/OR เป็น dropdown เล็กๆ ไม่ใช่ segmented ใหญ่
- ซ่อนเป็นค่าเริ่มต้น เปิดด้วยปุ่ม Filter หรือ `⌘F`

### 4.3 Bottom Action Bar
```
[＋ เพิ่มแถว] [－ ลบ] [✓ Commit] [✕ Discard] [⟳ Refresh] [⏹ Stop]  |◀ ◀ Page [1] of N ▶ ▶|  [Grid ▦ | Form ☰]
```
- ย้ายปุ่ม Add Row / Delete Row จากด้านบนมาไว้ที่นี่
- **Pending changes:** การแก้ไขค้างไว้ (ไฮไลต์เซลล์/แถว) จนกด ✓ Commit หรือ ✕ Discard
- Rows per page เป็น dropdown ขนาดเล็กใน bar เดียวกัน
- Form View: แสดง 1 record แนวตั้ง (label : value) เหมาะกับตารางกว้าง

### 4.4 Glide Data Grid Theme

```ts
import type { Theme } from '@glideapps/glide-data-grid';

export const lightGridTheme: Partial<Theme> = {
  bgCell: '#ffffff',
  bgCellMedium: '#f7f8fb',
  bgHeader: '#f0f0f2',
  bgHeaderHovered: '#e6e6e9',
  bgHeaderHasFocus: '#e0e0e4',
  borderColor: '#d6d6da',
  horizontalBorderColor: '#e4e4e8',
  textDark: '#1c1c1e',
  textMedium: '#6e6e73',
  textHeader: '#333336',
  accentColor: '#2d6cdf',
  accentLight: '#cfe0fb',
  fontFamily: '-apple-system, "Sukhumvit Set", system-ui, sans-serif',
  baseFontStyle: '12px',
  headerFontStyle: '600 12px',
  editorFontSize: '12px',
  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,
};

export const darkGridTheme: Partial<Theme> = {
  bgCell: '#1e1e20',
  bgCellMedium: '#232325',
  bgHeader: '#2b2b2d',
  bgHeaderHovered: '#343437',
  borderColor: '#3e3e42',
  horizontalBorderColor: '#2f2f33',
  textDark: '#e8e8ea',
  textMedium: '#9a9aa0',
  textHeader: '#d0d0d4',
  accentColor: '#4a8bf0',
  accentLight: '#264f8c',
  fontFamily: '-apple-system, "Sukhumvit Set", system-ui, sans-serif',
  baseFontStyle: '12px',
  headerFontStyle: '600 12px',
  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,
};

// <DataEditor rowHeight={24} headerHeight={26} theme={isDark ? darkGridTheme : lightGridTheme} ... />
```

> Glide วาดบน canvas — ธีมต้องส่งผ่าน `theme` prop ไม่ใช่ Tailwind

### 4.5 รายละเอียดเพิ่มเติม
- หัวคอลัมน์ PK มีไอคอนกุญแจ, FK มีไอคอนลิงก์
- ความกว้างคอลัมน์ UUID ให้พอแสดงเต็ม (36 ตัวอักษร) หรือมี auto-fit เมื่อ double-click ขอบหัวคอลัมน์
- `NULL` แสดงเป็น `(NULL)` ตัวเอียงสีเทา (ทำไว้แล้ว เก็บไว้)
- แถวสลับสี (`--row-alt`) เป็นตัวเลือกใน settings

---

## 5. Table Designer (Structure Tab)

เปลี่ยนจาก "รายการ + modal" เป็น **หน้า Designer เดียวพร้อม sub-tabs**

```
[Fields] [Indexes] [Foreign Keys] [Triggers] [Options] [Comment] [SQL Preview]
```

### 5.1 Toolbar
`Save · Add Field · Insert Field · Delete Field · 🔑 Primary Key · ↑ Move Up · ↓ Move Down`

### 5.2 Fields – Inline Editable Grid

| # | Name | Type | Length | Decimal | Not Null | Key | Comment |
|---|---|---|---|---|---|---|---|
| 1 | id | varchar | 255 | | ☑ | 🔑 | |

- คลิกเซลล์เพื่อแก้ไขทันที, `Tab` เลื่อนช่อง, `Enter` ยืนยัน
- Type เป็น dropdown ในเซลล์ แยกกลุ่ม (Numeric / Text / Date-Time / Other) ตามชนิด DB ที่เชื่อมต่อ
- แทน badge `YES/NO` ด้วย **checkbox** และ badge `PK` ด้วยไอคอนกุญแจ
- แถวที่แก้ไข/เพิ่ม/ลบ แสดงสถานะสี (เพิ่ม = เขียวอ่อน, แก้ = เหลืองอ่อน, ลบ = แดงอ่อน + ขีดฆ่า)

### 5.3 Properties Panel (ล่าง)
แสดงสำหรับ field ที่เลือก: Default, Collation, Auto Increment/Identity, Generated expression, Comment

### 5.4 SQL Preview
- แท็บแสดง `ALTER TABLE ...` ทั้งหมดที่จะรันก่อนกด Save (แทนปุ่ม DDL เดิม)
- ใช้ CodeMirror แบบ read-only พร้อมปุ่ม Copy
- รองรับ dry-run: แสดงคำเตือนเมื่อมีคำสั่งอันตราย (DROP COLUMN, เปลี่ยนชนิดแบบสูญเสียข้อมูล)

### 5.5 Indexes Sub-tab
Grid แก้ไขได้: `Name | Fields (multi-select) | Type (BTREE/HASH/…) | Unique ☑ | Comment`

### 5.6 ความปลอดภัยของ action
- ย้ายปุ่ม **Drop** (แดง) ออกจากแถบปุ่มปกติ ไปอยู่ใน context menu คลิกขวาของตารางใน tree
- Confirm dialog แบบ AlertDialog: ให้พิมพ์ชื่อตารางยืนยันก่อน Drop/Truncate
- ปุ่ม Quick Presets ใน modal เดิม (VARCHAR(30) ฯลฯ) เก็บไว้เป็นเมนูย่อยตอนเลือก Type

---

## 6. Connection Dialog

- เลือกชนิด DB ก่อนด้วย **grid การ์ดขนาดใหญ่ 3 ใบ** (PostgreSQL / MySQL / SQLite) หรือ dropdown "Connection Type"
- จากนั้นแสดง **tabs: General · Advanced · SSL · SSH Tunnel** (SSL/SSH ใส่โครงไว้ก่อน ปิดการใช้งานด้วย "Coming soon" ได้)
- General: Name, Folder, Host, Port, Database, User, Password (ปุ่มตา), ☑ Save password
- Footer: `Test Connection` ชิดซ้าย · `Cancel` / `OK` ชิดขวา
- ข้อความ "Saved in local encrypted vault…" ย่อเป็นไอคอนโล่/กุญแจ พร้อม tooltip
- Input สูง 24px, dialog กว้างพอดีเนื้อหา (≈ 520px)
- แสดงผล Test Connection แบบ inline ใน footer (✓ Connected in 42 ms / ✕ error message) ไม่ใช้เฉพาะ toast

---

## 7. Query Editor

- Toolbar: `▶ Run (⌘↵) · Run Selected · ⏹ Stop · Explain · Beautify · Save`
- ผลลัพธ์อยู่ใต้ editor (resizable) แบ่งแท็บ `Result 1 | Messages | Profile`
- Line numbers, ⌘/ comment, ⌘↵ run
- Autocomplete ชื่อตาราง/คอลัมน์จาก schema cache
- CodeMirror theme ใช้ token สีเดียวกับ design system (สร้าง theme extension แยก light/dark)
- Cancel query จริงผ่าน `sqlite3_interrupt` / pg cancel (มีอยู่แล้ว) เชื่อมกับปุ่ม Stop

---

## 8. Native macOS Polish (Tauri 2)

```jsonc
// tauri.conf.json (ส่วนหน้าต่าง)
{
  "app": {
    "windows": [{
      "titleBarStyle": "Overlay",
      "hiddenTitle": true,
      "transparent": true,
      "windowEffects": { "effects": ["sidebar"], "state": "followsWindowActiveState" }
    }]
  }
}
```

- **Vibrancy:** sidebar ใช้พื้นหลังโปร่งแสง (`background: transparent` + effect `sidebar`)
- **Native menu bar:** ใช้ Tauri Menu API → File / Edit / View / Query / Window / Help
- **Shortcuts:** ⌘N (new connection) · ⌘T (new query tab) · ⌘W (close tab) · ⌘R (refresh) · ⌘↵ (run) · ⌘F (filter) · ⌘S (commit/save)
- **Theme:** ตามระบบ (`prefers-color-scheme`) เป็นค่าเริ่มต้น + ตัวเลือกใน Preferences แทนปุ่มดวงอาทิตย์
- **Accessibility:** focus ring ชัดเจน, รองรับ keyboard navigation ใน tree/grid, aria-label ครบ

---

## 9. โครงสร้างไฟล์ที่แนะนำ

```
src/
  styles/
    tokens.css            # CSS variables light/dark
    globals.css
  components/
    chrome/
      MainToolbar.tsx
      StatusBar.tsx
      TitleBar.tsx
    sidebar/
      ConnectionTree.tsx
      TreeRow.tsx
      DbBadge.tsx         # ไอคอนชนิด DB (asset ของเราเอง)
    objects/
      ObjectsView.tsx
    table-viewer/
      DataGrid.tsx        # + gridTheme.ts
      FilterBar.tsx
      GridBottomBar.tsx
      FormView.tsx
    designer/
      TableDesigner.tsx
      FieldsGrid.tsx
      IndexesGrid.tsx
      PropertiesPanel.tsx
      SqlPreview.tsx
    connection/
      ConnectionDialog.tsx
    ui/                   # primitives: Button, Input, Select, Tabs, Checkbox (ปรับขนาด/สี)
  stores/
    tabStore.ts
    connectionStore.ts
    pendingChangesStore.ts   # ใหม่: เก็บการแก้ไขที่ยังไม่ commit
    settingsStore.ts         # ธีม, density, แถวสลับสี
```

---

## 10. Roadmap

| Phase | งาน | ผลลัพธ์ | ความเสี่ยง |
|---|---|---|---|
| 1 | Design tokens: ฟอนต์, spacing, radius, สี, light theme, ปรับปุ่ม, แก้บั๊ก `+ +` | UI ดูเปลี่ยนทันที ไม่แตะ logic | ต่ำ |
| 2 | Chrome: Main toolbar, status bar, ล้าง sidebar, DB badge, bottom bar | โครงหน้าจอใหม่ | ต่ำ–กลาง |
| 3 | Table viewer: filter bar, pending changes + commit/discard, Form view, grid theme | แก้ข้อมูลปลอดภัยขึ้น | กลาง (ต้องแตะ logic การเขียน) |
| 4 | Designer inline grid, SQL Preview, Objects view | ฟีเจอร์ที่ผู้ใช้ DB tool คาดหวัง | สูง (generate ALTER ต่อ dialect) |
| 5 | Native polish: vibrancy, menu bar, shortcuts, theme ตามระบบ | ความรู้สึกแอป Mac จริง | ต่ำ |

### Definition of Done (ต่อ Phase)
- [ ] ผ่าน `make check`, `make lint`, `make test`
- [ ] มี snapshot/visual test อย่างน้อยหน้า Table Viewer และ Designer ทั้ง light/dark
- [ ] Contrast ผ่าน WCAG AA
- [ ] ทดสอบกับข้อมูลภาษาไทยและตารางกว้าง (>30 คอลัมน์) / ยาว (>100k แถว)
- [ ] ตรวจ checklist ลิขสิทธิ์ในหัวข้อ 0

---

## 11. คำถามที่ควรตัดสินใจก่อนเริ่ม

1. **Theme หลัก:** Light เป็นค่าเริ่มต้น หรือคง Dark เป็นหลัก? (token รองรับทั้งสอง)
2. **ขอบเขต Designer:** รองรับ ALTER ครบทั้ง PostgreSQL / MySQL / SQLite หรือเริ่มจาก PostgreSQL ก่อน? (SQLite ALTER จำกัดมาก ต้องใช้วิธีสร้างตารางใหม่)
3. **Pending changes:** ใช้ transaction จริงฝั่ง Rust หรือเก็บ diff ฝั่ง frontend แล้วส่งตอน commit?
4. **ไอคอนชนิด DB:** วาดเอง หรือใช้ชุดที่มี license ชัดเจน?
