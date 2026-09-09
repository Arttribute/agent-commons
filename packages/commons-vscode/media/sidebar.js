const vscode = acquireVsCodeApi();
const prompt = document.getElementById('prompt');
const form = document.getElementById('composer');
const feedback = document.getElementById('feedback');
const submit = form.querySelector('button[type=submit]');
prompt.value = vscode.getState()?.draft || '';
prompt.addEventListener('input', () => vscode.setState({ draft: prompt.value }));
form.addEventListener('submit', event => {
  event.preventDefault();
  submit.disabled = true;
  feedback.className = '';
  feedback.textContent = 'Opening terminal…';
  vscode.postMessage({ type: 'start', prompt: prompt.value });
  // A cancelled multi-folder picker should leave the composer usable.
  setTimeout(() => { submit.disabled = false; }, 1500);
});
prompt.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') form.requestSubmit();
});
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => vscode.postMessage({ type: 'action', action: button.dataset.action }));
}
window.addEventListener('message', ({ data }) => {
  if (data.type === 'state') {
    document.getElementById('folder').textContent = data.folder;
    document.getElementById('agent').textContent = data.agent;
    document.getElementById('mode').textContent = { ask: 'Ask before changes', 'read-only': 'Local reads only', off: 'Local tools off' }[data.mode];
    document.getElementById('sessions').textContent = data.sessions ? `${data.sessions} terminal${data.sessions === 1 ? '' : 's'}` : '';
    submit.disabled = !data.trusted;
  } else if (data.type === 'started') {
    submit.disabled = false;
    prompt.value = '';
    vscode.setState({ draft: '' });
    feedback.className = '';
    feedback.textContent = 'Session opened. Continue in the terminal.';
  } else if (data.type === 'error') {
    submit.disabled = false;
    feedback.className = 'error';
    feedback.textContent = data.message;
  }
});
vscode.postMessage({ type: 'ready' });
