export const colors = {
  background: '#0A0E1A',
  surface: '#141829',
  surfaceGlass: 'rgba(255,255,255,0.05)',
  primary: '#00D4AA',
  primaryDim: 'rgba(0,212,170,0.15)',
  secondary: '#7C5CFC',
  secondaryDim: 'rgba(124,92,252,0.15)',
  danger: '#FF4757',
  warning: '#FFA502',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.35)',
  border: 'rgba(255,255,255,0.08)',
};

export const typography = {
  family: 'Inter',
  sizes: {
    h1: 28,
    h2: 22,
    h3: 18,
    body: 16,
    caption: 13,
    small: 11,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const glassStyle = () => ({
  backgroundColor: colors.surfaceGlass,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: borderRadius.lg,
});

export const Theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  glassStyle,
};

export type ThemeType = typeof Theme;
