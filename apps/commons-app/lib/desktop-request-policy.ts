export function desktopRequestPolicy(input: { server: boolean; local: boolean; path: string; mainToken?: string; suppliedToken: string | null }) {
  if (!input.server) return 'cloud';
  if (input.path.startsWith('/api/') && input.mainToken && input.suppliedToken === input.mainToken) return 'native';
  if (!input.local) return 'cloud';
  if (input.path === '/api/auth/session') return 'local-session';
  if (input.path === '/api/auth/csrf' || input.path === '/api/auth/signout') return 'auth';
  if (input.path.startsWith('/api/')) return 'block-cloud-api';
  return 'local-page';
}
