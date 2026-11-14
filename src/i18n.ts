import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import th from './locales/th.json';

export const LANGUAGE_STORAGE_KEY = 'datacore_language';

export const getSavedLanguage = (): 'en' | 'th' => {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) || localStorage.getItem('datacore-language');
    if (saved === 'th' || saved === 'en') {
      return saved;
    }
  }
  return 'en';
};

export const resources = {
  en: { translation: en },
  th: { translation: th },
} as const;

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: getSavedLanguage(),
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
    });
}

export const changeLanguage = async (lng: 'en' | 'th'): Promise<void> => {
  await i18n.changeLanguage(lng);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    localStorage.setItem('datacore-language', lng);
  }
};

export const getCurrentLanguage = (): 'en' | 'th' => {
  const current = i18n.language;
  if (current?.startsWith('th')) return 'th';
  return 'en';
};

export default i18n;
