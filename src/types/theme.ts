export type AppTheme = 'light' | 'dark' | 'warm-paper';

export interface ThemeOption {
  id: AppTheme;
  labelKey: string;
  fallbackLabel: string;
  descriptionKey: string;
  fallbackDescription: string;
  swatches: [string, string, string];
}

export const THEME_STORAGE_KEY = 'datacore-theme';

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    labelKey: 'theme.defaultLight',
    fallbackLabel: 'Default Light',
    descriptionKey: 'theme.defaultLightDesc',
    fallbackDescription: 'Clean macOS light appearance',
    swatches: ['#ececee', '#ffffff', '#2d6cdf'],
  },
  {
    id: 'dark',
    labelKey: 'theme.defaultDark',
    fallbackLabel: 'Default Dark',
    descriptionKey: 'theme.defaultDarkDesc',
    fallbackDescription: 'Charcoal dark appearance',
    swatches: ['#262628', '#1e1e20', '#4a8bf0'],
  },
  {
    id: 'warm-paper',
    labelKey: 'theme.warmPaper',
    fallbackLabel: 'Warm Paper',
    descriptionKey: 'theme.warmPaperDesc',
    fallbackDescription: 'Cream paper with crisp sketch borders',
    swatches: ['#ede6d8', '#faf6ef', '#c8e4b8'],
  },
];

export function isDarkTheme(theme: AppTheme): boolean {
  return theme === 'dark';
}

export function isWarmPaperTheme(theme: AppTheme): boolean {
  return theme === 'warm-paper';
}

export function normalizeTheme(raw: string | null | undefined): AppTheme | null {
  if (raw === 'light' || raw === 'dark' || raw === 'warm-paper') {
    return raw;
  }
  return null;
}
