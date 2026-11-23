import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  lightColors,
  paletteFor,
  type ThemeColors,
  type ThemeName,
} from '../constants/theme';

const THEME_KEY = '@ophixe:theme';

type ThemeContextValue = {
  theme: ThemeName;
  dark: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  dark: false,
  colors: lightColors,
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (stored === 'dark' || stored === 'light') setThemeState(stored);
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeName = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      dark: theme === 'dark',
      colors: paletteFor(theme),
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Active palette; re-renders the caller when the theme changes. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Shorthand for the active palette. */
export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}
