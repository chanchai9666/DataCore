import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import i18n, {
  changeLanguage,
  getCurrentLanguage,
  getSavedLanguage,
  LANGUAGE_STORAGE_KEY,
} from './i18n';
import { StatusBar } from './components/chrome/StatusBar';
import { MainToolbar } from './components/chrome/MainToolbar';
import { useConnectionStore } from './stores/connectionStore';
import { useStatusStore } from './stores/statusStore';

describe('i18n Internationalization System', () => {
  beforeEach(async () => {
    localStorage.clear();
    await act(async () => {
      await changeLanguage('en');
    });
    useStatusStore.getState().reset();
    useConnectionStore.setState({
      connections: [],
      activeConnectionId: null,
      loading: false,
      error: null,
    });
  });

  describe('Core i18n Configuration and Helper Functions', () => {
    it('initializes with English translations by default', () => {
      expect(getCurrentLanguage()).toBe('en');
      expect(i18n.t('toolbar.connect')).toBe('Connect');
      expect(i18n.t('status.ready')).toBe('Ready');
      expect(i18n.t('connection.newConnection')).toBe('New Connection');
      expect(i18n.t('common.save')).toBe('Save');
    });

    it('switches language to Thai and persists to localStorage', async () => {
      await act(async () => {
        await changeLanguage('th');
      });

      expect(getCurrentLanguage()).toBe('th');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('th');
      expect(i18n.t('toolbar.connect')).toBe('เชื่อมต่อ');
      expect(i18n.t('status.ready')).toBe('พร้อมทำงาน');
      expect(i18n.t('connection.newConnection')).toBe('สร้างการเชื่อมต่อใหม่');
      expect(i18n.t('common.save')).toBe('บันทึก');
    });

    it('switches back to English and persists to localStorage', async () => {
      await act(async () => {
        await changeLanguage('th');
        await changeLanguage('en');
      });

      expect(getCurrentLanguage()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
      expect(i18n.t('toolbar.connect')).toBe('Connect');
      expect(i18n.t('status.ready')).toBe('Ready');
    });

    it('reads initial language from localStorage correctly', () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'th');
      expect(getSavedLanguage()).toBe('th');

      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
      expect(getSavedLanguage()).toBe('en');

      localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      localStorage.setItem('datacore-language', 'th');
      expect(getSavedLanguage()).toBe('th');

      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'invalid');
      expect(getSavedLanguage()).toBe('en');
    });
  });

  describe('UI Component Integration and Dynamic Switching', () => {
    it('StatusBar language toggle button switches between English and Thai without reload', async () => {
      render(<StatusBar />);

      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('Disconnected')).toBeInTheDocument();

      const langToggleBtn = screen.getByTestId('status-language-btn');
      expect(langToggleBtn).toHaveTextContent('EN');

      await act(async () => {
        fireEvent.click(langToggleBtn);
      });

      expect(screen.getByText('พร้อมทำงาน')).toBeInTheDocument();
      expect(screen.getByText('ไม่ได้เชื่อมต่อ')).toBeInTheDocument();
      expect(langToggleBtn).toHaveTextContent('TH');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('th');

      // Click again to toggle back to EN
      await act(async () => {
        fireEvent.click(langToggleBtn);
      });

      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      expect(langToggleBtn).toHaveTextContent('EN');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    });

    it('MainToolbar displays translated labels and allows language toggling', async () => {
      render(<MainToolbar />);

      expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /new query/i })).toBeInTheDocument();

      const toolbarLangBtn = screen.getByTestId('toolbar-language-btn');
      expect(toolbarLangBtn).toHaveTextContent('EN');

      await act(async () => {
        fireEvent.click(toolbarLangBtn);
      });

      expect(toolbarLangBtn).toHaveTextContent('ไทย');
      expect(screen.getByText('เชื่อมต่อ')).toBeInTheDocument();
      expect(screen.getByText('คิวรีใหม่')).toBeInTheDocument();
      expect(screen.getByText('ตาราง')).toBeInTheDocument();
      expect(screen.getByText('เครื่องมือ')).toBeInTheDocument();
      expect(screen.getByText('สำรองข้อมูล')).toBeInTheDocument();

      // Click again to toggle back to English
      await act(async () => {
        fireEvent.click(toolbarLangBtn);
      });

      expect(toolbarLangBtn).toHaveTextContent('EN');
      expect(screen.getByText('Connect')).toBeInTheDocument();
      expect(screen.getByText('New Query')).toBeInTheDocument();
    });
  });
});
