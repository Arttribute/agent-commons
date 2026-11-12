export const COMMONS_PAGE_MODULE = '@agent-commons/page';
/** Optional browser-only bridge. It can request a draft, never credentials or an agent run. */
export const COMMONS_PAGE_RUNTIME = `
export function pageContext() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return { slug: hash.get('commonsPage'), hostOrigin: hash.get('commonsHost'), nonce: hash.get('commonsNonce'), chatEnabled: hash.get('commonsChat') === '1' };
}
function requestAction(action) {
  const context = pageContext();
  if (window.parent === window || !context.hostOrigin || !context.nonce) return Promise.reject(new Error('Open this page through its Commons project link to use chat.'));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); };
    const receive = event => {
      if (event.source !== window.parent || event.origin !== context.hostOrigin || event.data?.type !== 'commons-page:reply' || event.data?.id !== id || event.data?.nonce !== context.nonce) return;
      cleanup(); event.data.ok ? resolve({ opened: true }) : reject(new Error(event.data.error || 'Chat is unavailable.'));
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('The Commons page host did not respond.')); }, 8000);
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'commons-page:' + action, id, nonce: context.nonce }, context.hostOrigin);
  });
}
export function openChat() { return requestAction('chat'); }
export function openRegistration() { return requestAction('register'); }
`;
