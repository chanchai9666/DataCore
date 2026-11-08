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
  textHeaderSelected: '#ffffff',
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
  bgHeaderHasFocus: '#38383c',
  borderColor: '#3e3e42',
  horizontalBorderColor: '#2f2f33',
  textDark: '#e8e8ea',
  textMedium: '#9a9aa0',
  textHeader: '#d0d0d4',
  textHeaderSelected: '#ffffff',
  accentColor: '#4a8bf0',
  accentLight: '#264f8c',
  fontFamily: '-apple-system, "Sukhumvit Set", system-ui, sans-serif',
  baseFontStyle: '12px',
  headerFontStyle: '600 12px',
  editorFontSize: '12px',
  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,
};

export default { lightGridTheme, darkGridTheme };
