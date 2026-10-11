import { useCallback, useEffect, useState, ReactNode } from 'react';
import { safeStorageGetItem, safeStorageSetItem } from '@/lib/safe-storage';
import { ThemeProviderContext } from '@/hooks/useTheme';

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: string;
  storageKey?: string;
};

type Theme = 'light' | 'dark';

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

const applyTheme = (theme: Theme) => {
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
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = safeStorageGetItem(storageKey);
    if (isTheme(storedTheme)) return storedTheme;
    return isTheme(defaultTheme) ? defaultTheme : 'light';
  });

  useEffect(() => {
    applyTheme(theme);
    safeStorageSetItem(storageKey, theme);
  }, [theme, storageKey]);

  const updateTheme = useCallback((nextTheme: string) => {
    if (!isTheme(nextTheme)) return;
    startThemeTransition();
    applyTheme(nextTheme);
    safeStorageSetItem(storageKey, nextTheme);
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
