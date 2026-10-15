"use client";

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { APPEARANCE_KEY, appearanceValue, resolvedAppearance, type Appearance } from '@/lib/appearance';
import { useWorkspacePreferences } from '@/hooks/use-workspace-preferences';

const AppearanceContext = createContext<{ appearance: Appearance; resolvedTheme: 'light' | 'dark'; setAppearance: (value: Appearance) => void }>({ appearance: 'light', resolvedTheme: 'light', setAppearance: () => {} });

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setValue] = useState<Appearance>('light');
  const [initialized, setInitialized] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const preferences = useWorkspacePreferences();
  const setAppearance = useCallback((value: Appearance) => {
    const next = appearanceValue(value);
    try { localStorage.setItem(APPEARANCE_KEY, next); } catch { /* Still apply in this window when storage is unavailable. */ }
    setValue(next);
    preferences.setAppearance(next);
  }, [preferences.setAppearance]);
  useEffect(() => {
    setValue(appearanceValue(document.documentElement.dataset.appearance));
    setInitialized(true);
    const sync = (event: StorageEvent) => { if (event.key === APPEARANCE_KEY || event.key === null) setValue(appearanceValue(event.newValue)); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (preferences.appearance) {
      const value = appearanceValue(preferences.appearance);
      setValue(value);
      try { localStorage.setItem(APPEARANCE_KEY, value); } catch {}
    }
  }, [preferences.appearance]);
  useEffect(() => {
    if (!initialized) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = resolvedAppearance(appearance, media.matches);
      setResolvedTheme(resolved);
      document.documentElement.classList.toggle('dark', resolved === 'dark');
      document.documentElement.style.colorScheme = resolved;
      document.documentElement.dataset.appearance = appearance;
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [appearance, initialized]);
  return <AppearanceContext.Provider value={{ appearance, resolvedTheme, setAppearance }}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() { return useContext(AppearanceContext); }
