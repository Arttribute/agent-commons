"use client";

import { Monitor, Moon, Sun } from 'lucide-react';
import { useAppearance } from '@/context/AppearanceContext';
import { Button } from '@/components/ui/button';

export function AppearanceSettings() {
  const { appearance, setAppearance } = useAppearance();
  return <div className="space-y-3 border-b border-border pb-5">
    <h3 className="text-sm font-medium">Appearance</h3>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span>Theme</span>
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Appearance theme">
        {([{ value: 'system', label: 'System', Icon: Monitor }, { value: 'light', label: 'Light', Icon: Sun }, { value: 'dark', label: 'Dark', Icon: Moon }] as const).map(({ value, label, Icon }) =>
          <Button key={value} variant="ghost" size="sm" aria-pressed={appearance === value} onClick={() => setAppearance(value)} className={`gap-2 ${appearance === value ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}><Icon className="h-4 w-4" strokeWidth={1.75} />{label}</Button>)}
      </div>
    </div>
  </div>;
}
