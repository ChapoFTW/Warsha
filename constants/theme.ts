import { Platform } from 'react-native';

export const colors = {
  background: '#050505',
  surface: '#0E0E0E',
  surfaceElevated: '#171717',
  surfaceSoft: '#212121',
  border: '#262626',
  borderSoft: '#1C1C1C',
  textPrimary: '#F7F7F7',
  textSecondary: '#A4A4A4',
  textMuted: '#6E6E6E',
  white: '#FFFFFF',
  success: '#7FC89A',
  warning: '#D8BA72',
  error: '#D97979',
  transparent: 'transparent',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 } as const;
export const typography = {
  family: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 7,
  },
};

// Backwards-compatible export for useful starter components that remain in the project.
export const Colors = {
  light: { text: colors.textPrimary, background: colors.background, tint: colors.white, icon: colors.textSecondary, tabIconDefault: colors.textMuted, tabIconSelected: colors.white },
  dark: { text: colors.textPrimary, background: colors.background, tint: colors.white, icon: colors.textSecondary, tabIconDefault: colors.textMuted, tabIconSelected: colors.white },
};
export const Fonts = { sans: typography.family, serif: 'serif', rounded: typography.family, mono: 'monospace' };
