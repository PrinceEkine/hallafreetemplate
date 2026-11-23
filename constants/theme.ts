export type ThemeName = 'light' | 'dark';

export type ThemeColors = {
  ink: string;
  inkSoft: string;
  paper: string;
  bg: string;
  card: string;
  text: string;
  subtext: string;
  border: string;
  primary: string;
  primaryDark: string;
  accent: string;
  danger: string;
  warning: string;
  success: string;
};

export const lightColors: ThemeColors = {
  ink: '#000000',
  inkSoft: '#1C1C1E',
  paper: '#FFFFFF',
  bg: '#F4F4F5',
  card: '#EDEDEF',
  text: '#141416',
  subtext: '#6E6E73',
  border: '#E2E2E6',
  primary: '#000000',
  primaryDark: '#000000',
  accent: '#3EE6C4',
  danger: '#E5484D',
  warning: '#F5A623',
  success: '#16A34A',
};

export const darkColors: ThemeColors = {
  ink: '#FFFFFF',
  inkSoft: '#F4F4F5',
  paper: '#101014',
  bg: '#17171C',
  card: '#232329',
  text: '#F5F5F7',
  subtext: '#A7A7B0',
  border: '#2E2E36',
  primary: '#FFFFFF',
  primaryDark: '#EDEDEF',
  accent: '#3EE6C4',
  danger: '#FF7A80',
  warning: '#F5A623',
  success: '#4ADE80',
};

/** Full palette for the given theme. Prefer `useColors()` in components. */
export function paletteFor(theme: ThemeName): ThemeColors {
  return theme === 'dark' ? darkColors : lightColors;
}

/**
 * Light palette, kept so screens not yet migrated to `useColors()` keep
 * rendering exactly as before. New and touched code should use the hook.
 */
export const colors: ThemeColors = lightColors;

export const radius = {
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pop: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
} as const;

export const fonts = {
  heading: 'Oswald_700Bold',
  headingSemi: 'Oswald_600SemiBold',
} as const;
