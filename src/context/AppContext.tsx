import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  createInitialState,
  loadAppState,
  saveAppState,
  type AppState,
} from '../data/store';
import type { ScreenRoute, ThemeName } from '../types';

type AppContextValue = {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  route: ScreenRoute;
  navigate: (next: ScreenRoute) => void;
  goBack: () => void;
  theme: ThemeName;
  toggleTheme: () => void;
  toast: string | null;
  showToast: (msg: string) => void;
  resetDemo: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const THEME_KEY = '@ophixe:theme';

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadAppState());
  const [history, setHistory] = useState<ScreenRoute[]>(() => [
    loadAppState().signedIn ? { kind: 'tab', tab: 'feed' } : { kind: 'welcome' },
  ]);
  const [theme, setTheme] = useState<ThemeName>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const route = history[history.length - 1] ?? { kind: 'tab', tab: 'feed' };

  function navigate(next: ScreenRoute) {
    setHistory((prev) => {
      if (next.kind === 'tab' || next.kind === 'welcome') {
        return [next];
      }
      return [...prev.slice(-12), next];
    });
  }

  function goBack() {
    setHistory((prev) => {
      if (prev.length <= 1) return [{ kind: 'tab', tab: 'feed' }];
      return prev.slice(0, -1);
    });
  }

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 2800);
  }

  function resetDemo() {
    const fresh = createInitialState();
    setState(fresh);
    setHistory([{ kind: 'tab', tab: 'feed' }]);
    showToast('Workspace reset to initial demo data');
  }

  return (
    <AppContext.Provider
      value={{
        state,
        setState,
        route,
        navigate,
        goBack,
        theme,
        toggleTheme,
        toast,
        showToast,
        resetDemo,
      }}
    >
      <div className={theme === 'dark' ? 'dark' : ''}>{children}</div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
