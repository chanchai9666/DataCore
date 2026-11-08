# Design Document: Table Copy & In-Grid Search (DataCore)

- **Date:** 2026-11-08
- **Status:** Approved by Builder Check & User
- **Target Branch:** `feature/new-features`

---

## 1. Intent & The Why

DataCore เป็น desktop database manager สไตล์ Navicat บน macOS ที่ผู้ใช้ต้องโต้ตอบกับตารางข้อมูลเป็นหลัก ในการใช้งานจริง ผู้ใช้ต้องการ:
1. คัดลอกข้อมูลในตารางได้อย่างยืดหยุ่น ทั้งระดับช่อง (Cell), ทั้งแถวแนวนอน (Single/Multi-row), ทั้งคอลัมน์แนวดิ่ง (Column selection), และทั้งตาราง (Select All)
2. มีตัวเลือกในการคัดลอกแบบ "รวมชื่อหัวคอลัมน์" (Copy with Headers) หรือ "เฉพาะค่าข้อมูล" (Copy without Headers) เพื่อนำไป Paste ลงใน Spreadsheet (Excel, Google Sheets), CSV หรือ Text Editor ได้ทันที
3. ค้นหาข้อมูลในตารางอย่างรวดเร็วด้วยคีย์ลัดสากล `Cmd+F` โดยมี In-Grid Find Bar แสดงจำนวนผลลัพธ์และกระโดดไฮไลท์ไปยังเซลล์ที่ตรงคำค้นหา

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Selection Types:**
  - **Cell / Range Selection:** คลิกและลากเลือกช่วงเซลล์
  - **Row / Multi-Row Selection:** คลิกที่เลขแถวเพื่อเลือกทั้งแถว และรองรับ Shift / Cmd คลิกเพื่อเลือกหลายแถว
  - **Column Selection:** คลิกที่หัวคอลัมน์เพื่อเลือกทั้งคอลัมน์แนวตั้ง (Single / Multi-column)
  - **Select All (`Cmd+A`):** เลือกทุกช่อง/ทุกแถวในตารางปัจจุบัน
- **Column Header Interaction:**
  - คลิกปกติที่หัวคอลัมน์: **เลือกคอลัมน์ (Select Column)** เพื่อเตรียมคัดลอกข้อมูลในแนวดิ่ง
  - กด `Alt + คลิก` ที่หัวคอลัมน์: **เรียงลำดับข้อมูล (Sort Column: ASC → DESC → None)**
- **Copying & Formatting:**
  - กด `Cmd+C` คัดลอกข้อมูลที่เลือก (Default: ค่าข้อมูลล้วน ไม่มี Headers)
  - กด `Cmd+Shift+C` หรือคลิกขวาเลือก "Copy with Headers" เพื่อคัดลอกรวมแถวชื่อคอลัมน์
  - ฟอร์แมต Clipboard:
    - ถ้าเลือกคอลัมน์เดียวแนวตั้ง: คั่นแต่ละแถวด้วย newline (`\n`)
    - ถ้าเลือกหลายคอลัมน์: คั่นแต่ละคอลัมน์ด้วย Tab (`\t`) และคั่นแต่ละแถวด้วย newline (`\n`) ตามมาตรฐาน TSV สากล
- **In-Grid Search (`Cmd+F`):**
  - กด `Cmd+F` เมื่อตารางเปิดอยู่เพื่อเปิด In-Grid Find Bar
  - พิมพ์ค้นหาแบบ Real-time, ไฮไลท์เซลล์ที่ตรงกันทั้งหมด และมีกล่องแสดง Match Count (เช่น `1 of 5`)
  - กด `Enter` เพื่อไปยังผลลัพธ์ถัดไป (Next Match), `Shift+Enter` เพื่อไปยังผลลัพธ์ก่อนหน้า (Previous Match)
  - กด `Escape` หรือปุ่มปิดบน Find Bar เพื่อปิดการค้นหา
- **Context Menu:**
  - คลิกขวาบนตารางแสดงเมนู:
    - `Copy` (`⌘C`)
    - `Copy with Headers` (`⇧⌘C`)
    - `Select All` (`⌘A`)
    - `Find in Table` (`⌘F`)

### Non-Goals
- การแก้ปัญหา Global Search ข้ามหลายตาราง/ข้าม Database (เน้น In-Grid Search เฉพาะตารางที่เปิดอยู่)
- การ Search ด้วย Regex ซับซ้อนในระยะนี้ (เน้น Substring case-insensitive match)
- การแทนที่ข้อมูล (Find and Replace) ข้อมูลในระดับฐานข้อมูล

### Anti-Goals
- ห้ามดึงข้อมูลใหม่จาก Database มารองรับการค้นหา (In-Grid Search ค้นหาจากแถวที่โหลดมาในหน้าปัจจุบันตาม pagination)
- ห้ามทำให้ประสิทธิภาพการเลื่อนตาราง (Virtual Scroll ของ Glide Data Grid) ช้าลง

---

## 3. Constraints

- **Platform & Framework:** Tauri 2 (macOS Apple Silicon) + React 18 + TypeScript
- **Grid Engine:** `@glideapps/glide-data-grid` 6.x ซึ่งมี native selection และ search props ในตัว
- **Clipboard API:** รองรับทั้ง `navigator.clipboard.writeText` สำหรับการส่งค่าเข้า Clipboard
- **Keyboard Conventions:** macOS shortcuts (`Cmd` แทน `Ctrl`, `Shift+Cmd+C`, `Esc`, `Alt+Click`)

---

## 4. Architectural & Behavioral Decisions (As Decided)

### 4.1 Selection Model & Header Interaction
- `DataEditor` จะเปิดใช้งาน `columnSelect="multi"`, `rangeSelect="rect"`, และ `rowSelect="multi"`
- กำหนด `columnSelectionBlending="exclusive"`, `rowSelectionBlending="exclusive"`, และ `rangeSelectionBlending="exclusive"` เพื่อให้การเลือกแต่ละแบบตัดกันอย่างชัดเจน ป้องกันปัญหา State ซ้อนทับ
- พฤติกรรม Header:
  - ในฟังก์ชัน `onHeaderClicked(colIndex, event)`:
    - ถ้า `event.altKey` เป็น `true`: เรียกคำสั่งสลับการ Sort คอลัมน์ (ASC → DESC → None)
    - ถ้าคลิกปกติ: เซ็ต `gridSelection.columns` เป็นคอลัมน์นั้น (และรองรับ Multi-column selection เมื่อกด Shift/Cmd)

### 4.2 Clipboard Formatter Engine
สร้าง helper module แยก `src/components/grid/clipboardUtils.ts`:
```ts
export function formatSelectionAsText(
  selection: GridSelection,
  data: QueryResult,
  includeHeaders: boolean
): string;
```
- ตรวจสอบชนิด selection:
  - **Column Selection (`selection.columns`):** ดึงข้อมูลของคอลัมน์ที่เลือกทุกแถว หากเลือกคอลัมน์เดียวให้คั่นด้วย `\n` หากเลือกหลายคอลัมน์คั่นด้วย `\t` ในแต่ละแถว
  - **Row Selection (`selection.rows`):** ดึงข้อมูลของทุกคอลัมน์ในแถวที่เลือก คั่นด้วย `\t` ระหว่างคอลัมน์ และ `\n` ระหว่างแถว
  - **Cell Range Selection (`selection.current?.range`):** ดึงข้อมูลเฉพาะพิกัด rectangle ที่เลือก
  - **Single Cell Selection (`selection.current?.cell`):** ดึงข้อมูลเซลล์เดียว
- หาก `includeHeaders === true`: เพิ่มแถวแรกเป็นชื่อคอลัมน์คั่นด้วย `\t`

### 4.3 In-Grid Search Engine Integration
- นำ Glide Data Grid Native Search เข้ามาใช้งานอย่างสมบูรณ์:
  - ส่ง `getCellsForSelection={true}` ให้กับ `<DataEditor>` เพื่อให้ Engine ค้นหาและคัดลอกข้อมูลได้
  - ส่ง `showSearch={showSearch}` และ `onSearchClose={() => setShowSearch(false)}`
  - รองรับการเปิด/ปิดผ่านปุ่มลัด `Cmd+F` / `Ctrl+F`

### 4.4 Keyboard Shortcuts & Event Handling
เชื่อมต่อ keydown listener ที่ระดับ Container ของ DataGrid:
- `Cmd+A` / `Ctrl+A`: สั่งเลือกทุกแถวและทุกคอลัมน์ (`handleSelectAll`)
- `Cmd+C` / `Ctrl+C`: คัดลอกสิ่งที่เลือก (`handleCopy(false)`)
- `Cmd+Shift+C` / `Ctrl+Shift+C`: คัดลอกพร้อม Headers (`handleCopy(true)`)
- `Cmd+F` / `Ctrl+F`: สลับเปิดแถบค้นหา In-Grid (`setShowSearch(true)`)

---

## 5. What's Left to the Builder (Settled Calls)

1. **Context Menu:** เพิ่ม Context Menu เมื่อคลิกขวาบน DataGrid ให้มีตัวเลือก `Copy`, `Copy with Headers`, `Select All`, และ `Find in Table`
2. **Visual Feedback:** แสดง Toast notification ผ่าน `sonner` (เช่น `Copied to clipboard`) เมื่อกดคัดลอกสำเร็จ
3. **Automated Unit Tests:**
   - Unit test สำหรับ `clipboardUtils.test.ts` ครอบคลุมการแปลง format ทุกแบบ (Single Column, Multi-column, Row selection, Cell range, Header on/off)
   - Component test สำหรับ `DataGrid.test.tsx` ทดสอบ Header click (select vs alt-click sort), `Cmd+A`, `Cmd+C`, `Cmd+Shift+C`, และ `Cmd+F`
