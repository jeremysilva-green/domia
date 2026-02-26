// Force rebundle: 2026-02-04T21:30:00 - Yellow is #facc15
export const colors = {
  // Primary palette - Dark theme
  primary: {
    50: '#fefce8',
    100: '#fef9c3',
    200: '#fef08a',
    300: '#fde047',
    400: '#facc15',
    500: '#facc15',
    600: '#eab308',
    700: '#ca8a04',
    800: '#a16207',
    900: '#854d0e',
  },

  // Accent - Yellow/Gold for calls to action
  accent: {
    50: '#fefce8',
    100: '#fef9c3',
    200: '#fef08a',
    300: '#fde047',
    400: '#facc15',
    500: '#facc15',
    600: '#eab308',
    700: '#ca8a04',
    800: '#a16207',
    900: '#854d0e',
  },

  // Yellow highlight color
  yellow: '#facc15',

  // Semantic colors
  success: {
    light: '#22c55e20',
    main: '#22c55e',
    dark: '#16a34a',
  },
  warning: {
    light: '#facc1520',
    main: '#facc15',
    dark: '#eab308',
  },
  error: {
    light: '#ef444420',
    main: '#ef4444',
    dark: '#dc2626',
  },

  // Dark theme grays
  gray: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
  },

  // Dark theme base colors
  white: '#ffffff',
  black: '#000000',
  background: '#0f0f14',
  surface: '#1a1a24',
  surfaceLight: '#252532',
  text: {
    primary: '#ffffff',
    secondary: '#a1a1aa',
    disabled: '#52525b',
    inverse: '#0f0f14',
  },
  border: '#2a2a3a',
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
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
};

export const theme = {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
};

export type Theme = typeof theme;
