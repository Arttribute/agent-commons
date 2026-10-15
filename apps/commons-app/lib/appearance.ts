export const APPEARANCE_KEY = 'agc:appearance';
export type Appearance = 'light' | 'dark' | 'system';
export function appearanceValue(value: unknown): Appearance {
  return value === 'dark' || value === 'system' ? value : 'light';
}
export function resolvedAppearance(value: Appearance, systemDark: boolean) {
  return value === 'system' ? (systemDark ? 'dark' : 'light') : value;
}

// Runs before first paint in both the hosted app and bundled desktop renderer.
export const APPEARANCE_SCRIPT = `(()=>{let t='light';try{const s=localStorage.getItem('${APPEARANCE_KEY}');if(s==='light'||s==='dark'||s==='system')t=s}catch{}const d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';document.documentElement.dataset.appearance=t})()`;
