
'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const initialTheme = storedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    // Set the state in React
    setThemeState(initialTheme);

    // Also apply the class to the documentElement immediately
    if (document.documentElement.className !== initialTheme) {
      document.documentElement.className = initialTheme;
      document.documentElement.style.colorScheme = initialTheme;
    }
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    // 1. Update the React state.
    setThemeState(newTheme);
    // 2. Persist to localStorage.
    localStorage.setItem('theme', newTheme);
    // 3. Directly update the DOM.
    document.documentElement.className = newTheme;
    document.documentElement.style.colorScheme = newTheme;
  }, []);

  return { theme, setTheme };
}
