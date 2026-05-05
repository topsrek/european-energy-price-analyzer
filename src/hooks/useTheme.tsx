
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: string;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: string;
  setTheme: (theme: string) => void;
};

const initialState: ThemeProviderState = {
  theme: 'light',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const applyTheme = (theme: string) => {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
};

let themeTransitionTimeout: number | undefined;

const startThemeTransition = () => {
  const root = window.document.documentElement;
  root.classList.add('theme-transitioning');

  if (themeTransitionTimeout) {
    window.clearTimeout(themeTransitionTimeout);
  }

  themeTransitionTimeout = window.setTimeout(() => {
    root.classList.remove('theme-transitioning');
    themeTransitionTimeout = undefined;
  }, 180);
};

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem(storageKey);
    return storedTheme || defaultTheme;
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(storageKey, theme);
  }, [theme, storageKey]);

  const updateTheme = useCallback((nextTheme: string) => {
    startThemeTransition();
    applyTheme(nextTheme);
    localStorage.setItem(storageKey, nextTheme);
    setTheme(nextTheme);
  }, [storageKey]);

  const value = {
    theme,
    setTheme: updateTheme,
  };

  return (
    <ThemeProviderContext.Provider value={value} {...props}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
