# DataCore — Native macOS Database Manager
# Shell environment configuration
SHELL := /bin/bash
export PATH := $(HOME)/.cargo/bin:$(PATH)

.PHONY: help install dev dev-web test test-backend test-frontend check lint build build-frontend clean

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
	@echo "  make clean          - ลบไฟล์ Build Artifacts ทั้งหมด"
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

## ทำความสะอาด Build Artifacts
clean:
	@echo "🧹 กำลังลบโฟลเดอร์ build artifacts..."
	cargo clean --manifest-path src-tauri/Cargo.toml
	rm -rf dist src-tauri/target
	@echo "✨ Clean เรียบร้อยแล้ว"
