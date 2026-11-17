# DataCore — Native macOS Database Manager
# Shell environment configuration
SHELL := /bin/bash
export PATH := $(HOME)/.cargo/bin:$(PATH)

.PHONY: help install dev dev-web test test-backend test-frontend check lint build build-frontend disk-usage clean-junk clean clean-all

## แสดงคำสั่งทั้งหมดที่สามารถใช้งานได้
help:
	@echo "================================================================="
	@echo "  DataCore — Native Database Client for macOS Apple Silicon"
	@echo "================================================================="
	@echo "  make install        - ติดตั้ง Dependencies ของ Frontend ทั้งหมด"
	@echo "  make dev            - รันแอปพลิเคชันในโหมด Development (Tauri Desktop)"
	@echo "  make dev-web        - รันเฉพาะ Frontend Vite Dev Server ใน Browser"
	@echo "  make test           - รัน Unit/Integration Tests ทั้งหมด (Rust + Frontend)"
	@echo "  make test-backend   - รัน Tests ฝั่ง Rust Backend อย่างเดียว"
	@echo "  make test-frontend  - รัน Tests ฝั่ง React Frontend (Vitest) อย่างเดียว"
	@echo "  make check          - ตรวจสอบ Typecheck และ Compilation ทั้งระบบ"
	@echo "  make lint           - ตรวจสอบ Code Quality ด้วย Cargo Clippy"
	@echo "  make build          - Build ติดตั้ง Production App (.app / .dmg)"
	@echo "  make build-frontend - Build เฉพาะ Production Bundle ฝั่ง Web (Vite)"
	@echo "  make disk-usage     - ตรวจสอบพื้นที่ใช้งานและไฟล์ขยะในโปรเจกต์"
	@echo "  make clean-junk     - ล้างไฟล์ขยะและ Cache แบบรวดเร็ว (เก็บ Rust Dependencies ไว้)"
	@echo "  make clean          - ลบไฟล์ Build Artifacts ทั้งหมด (Rust target + Frontend dist)"
	@echo "  make clean-all      - ล้างข้อมูลทั้งหมดรวมถึง node_modules (Deep Clean)"
	@echo "================================================================="

## ติดตั้ง Dependencies
install:
	@echo "📦 กำลังติดตั้ง dependencies..."
	pnpm install

## รันแอปพลิเคชันในโหมด Development (Tauri 2 Desktop App)
dev:
	@echo "🚀 กำลังเปิด DataCore ในโหมด Development..."
	pnpm tauri dev

## รันเฉพาะ Web Dev Server (Vite)
dev-web:
	@echo "🌐 กำลังเปิด Vite Dev Server..."
	pnpm dev

## รัน Tests ทั้งหมด (Backend + Frontend)
test: test-backend test-frontend

## รัน Tests ฝั่ง Rust Backend
test-backend:
	@echo "🦀 กำลังรัน Rust Unit & Integration Tests..."
	cargo test --manifest-path src-tauri/Cargo.toml

## รัน Tests ฝั่ง React Frontend
test-frontend:
	@echo "⚛️  กำลังรัน Vitest Unit & Component Tests..."
	pnpm test

## ตรวจสอบ Type และการคอมไพล์
check:
	@echo "🔍 กำลังตรวจสอบการคอมไพล์ทั้งระบบ..."
	cargo check --manifest-path src-tauri/Cargo.toml
	pnpm run build

## ตรวจสอบ Code Quality และคำเตือน
lint:
	@echo "🧹 กำลังตรวจสอบ Code Quality ด้วย Cargo Clippy..."
	cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

## Build Production App (.app / .dmg สำหรับ macOS ARM64)
build:
	@echo "🔨 กำลัง Build DataCore Production Desktop Application..."
	pnpm tauri build

## Build เฉพาะ Frontend Bundle (Vite)
build-frontend:
	@echo "📦 กำลัง Build Frontend Production Assets..."
	pnpm build

## ตรวจสอบพื้นที่ใช้งานและไฟล์ขยะในโปรเจกต์
disk-usage:
	@echo "📊 สรุปการใช้พื้นที่ดิสก์ของโปรเจกต์ DataCore:"
	@echo "-----------------------------------------------------------------"
	@du -sh src-tauri/target node_modules dist .vite .git 2>/dev/null || true
	@echo "-----------------------------------------------------------------"
	@echo "🔍 พื้นที่ Build ของ datacore ที่ลบได้ทันทีโดยไม่ต้องคอมไพล์ Dependencies ใหม่:"
	@cargo clean --manifest-path src-tauri/Cargo.toml -p datacore --dry-run 2>&1 || true
	@echo "-----------------------------------------------------------------"
	@echo "🗑️  ไฟล์ขยะและไฟล์ชั่วคราวที่ตรวจพบ:"
	@found=0; for f in repomix-output* .superpowers .perch *.log *.tmp *.bak; do \
		if [ -e "$$f" ]; then du -sh "$$f"; found=1; fi; \
	done; \
	if [ "$$found" -eq 0 ]; then echo "  (ไม่พบไฟล์ชั่วคราวในระดับ Root)"; fi

## ล้างไฟล์ขยะและ Cache แบบรวดเร็ว (เก็บ Rust Dependencies เช่น DuckDB ไว้ ไม่ต้องรอนานตอน Build ใหม่)
clean-junk:
	@echo "🧹 กำลังล้างไฟล์ขยะและ Artifacts เก่าของ datacore (เก็บ 3rd-party dependencies ไว้)..."
	cargo clean --manifest-path src-tauri/Cargo.toml -p datacore
	rm -f src-tauri/target/*/libdatacore_lib.a src-tauri/target/*/libdatacore_lib.dylib src-tauri/target/*/deps/libdatacore_lib.a src-tauri/target/*/deps/libdatacore_lib.dylib
	rm -rf src-tauri/target/debug/incremental src-tauri/target/release/incremental src-tauri/target/flycheck*
	@echo "🧹 กำลังลบ DuckDB build cache รุ่นเก่าที่ซ้ำซ้อน (เก็บเฉพาะรุ่นล่าสุด)..."
	@ls -dt src-tauri/target/debug/build/libduckdb-sys-*/out 2>/dev/null | tail -n +2 | while IFS= read -r dir; do rm -rf "$${dir%/out}"; done
	@ls -dt src-tauri/target/debug/deps/liblibduckdb_sys-*.rlib 2>/dev/null | tail -n +2 | while IFS= read -r f; do rm -f "$$f"; done
	@echo "🧹 กำลังลบไฟล์ชั่วคราว, Frontend cache และไฟล์ขยะระบบ (.DS_Store, repomix, logs)..."
	rm -rf dist .vite .superpowers .perch repomix-output* *.log *.tmp *.bak
	find . -name ".DS_Store" -not -path "./.git/*" -delete 2>/dev/null || true
	@echo "✨ ล้างขยะแบบรวดเร็ว (clean-junk) เรียบร้อยแล้ว!"

## ทำความสะอาด Build Artifacts ทั้งหมด (Rust target + Frontend dist)
clean:
	@echo "🧹 กำลังลบโฟลเดอร์ build artifacts ทั้งหมด..."
	cargo clean --manifest-path src-tauri/Cargo.toml
	rm -rf dist src-tauri/target .vite .superpowers .perch repomix-output* *.log *.tmp *.bak
	find . -name ".DS_Store" -not -path "./.git/*" -delete 2>/dev/null || true
	@echo "✨ Clean เรียบร้อยแล้ว"

## ล้างข้อมูลทั้งหมดรวมถึง node_modules (Deep Clean)
clean-all: clean
	@echo "🧨 กำลังลบ node_modules ทั้งหมด..."
	rm -rf node_modules
	@echo "✨ Clean-all เรียบร้อยแล้ว (กรุณารัน 'make install' ก่อนเริ่มพัฒนาครั้งถัดไป)"
