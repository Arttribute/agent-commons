/* UI text and model output are escaped before rendering. No remote scripts or HTML. */
(() => {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const icons = {
    history: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M6 19c0-6 12-6 12 0"/>',
    compose:
      '<path d="M14 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-9M17 3l4 4-10 10-5 1 1-5z"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    arrow: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    folder: '<path d="M3 6h6l2 2h10v12H3z"/>',
    refresh: '<path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/>',
    file: '<path d="M14 2H5v20h14V7zM14 2v6h5"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.file}</svg>`;
  document.querySelectorAll('[data-icon]').forEach((node) => {
    node.innerHTML = icon(node.dataset.icon);
  });
  const post = (type, props = {}) => vscode.postMessage({ type, ...props });
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );
  const saved = vscode.getState() || {};
  let state = {},
    panel = 'chat',
    projectOnly = false,
    rendering = false;
  const drafts = saved.drafts || {};
  let draftKey = 'new';
  $('prompt').value = saved.drafts?.new || saved.draft || '';
  function persist() {
    drafts[draftKey] = $('prompt').value;
    vscode.setState({ drafts, panel });
  }
  function resize() {
    $('prompt').style.height = 'auto';
    $('prompt').style.height = Math.min($('prompt').scrollHeight, 240) + 'px';
  }
  function inline(text) {
    return escape(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, target) => {
        if (/^https?:\/\//.test(target)) return `<a href="${target}" rel="noreferrer">${label}</a>`;
        if (/^(?:[a-z]+:|#)/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) return full;
        return `<button class="file-link" data-file="${target}">${label}</button>`;
      });
  }
  function markdown(text) {
    return String(text)
      .split(/(```[\s\S]*?(?:```|$))/g)
      .map((part) => {
        if (part.startsWith('```')) {
          const lines = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
          return `<pre><code>${escape(lines)}</code></pre>`;
        }
        return part
          .split(/\n\n+/)
          .filter(Boolean)
          .map((block) => {
            if (/^#{1,6} /.test(block)) return `<h3>${inline(block.replace(/^#{1,6} /, ''))}</h3>`;
            if (/^[-*] /m.test(block) && block.split('\n').every((l) => /^[-*] /.test(l)))
              return `<ul>${block
                .split('\n')
                .map((l) => `<li>${inline(l.slice(2))}</li>`)
                .join('')}</ul>`;
            return `<p>${inline(block).replace(/\n/g, '<br>')}</p>`;
          })
          .join('');
      })
      .join('');
  }
  function age(value) {
    if (!value) return '';
    const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
    return seconds < 60
      ? 'now'
      : seconds < 3600
      ? Math.floor(seconds / 60) + 'm'
      : seconds < 86400
      ? Math.floor(seconds / 3600) + 'h'
      : Math.floor(seconds / 86400) + 'd';
  }
  function sessionRows(items, rename = false) {
    return items
      .map(
        (s) =>
          `<div class="session-row"><button class="session-open" data-session="${escape(
            s.sessionId
          )}"><span>${escape(s.title || 'Untitled chat')}</span><time>${age(
            s.createdAt
          )}</time></button>${
            rename
              ? `<button class="rename" data-rename="${escape(
                  s.sessionId
                )}" title="Rename chat" aria-label="Rename ${escape(
                  s.title || 'chat'
                )}">···</button>`
              : ''
          }</div>`
      )
      .join('');
  }
  function history() {
    const query = $('search').value.toLowerCase();
    const sessions = (state.sessions || []).filter(
      (s) =>
        (s.title || '').toLowerCase().includes(query) &&
        (!projectOnly || (s.root && s.root.split(/[\\/]/).pop() === state.folder))
    );
    $('session-list').innerHTML =
      sessionRows(sessions, true) || '<p class="empty-note">No chats found.</p>';
    $('all-filter').classList.toggle('active', !projectOnly);
    $('local-filter').classList.toggle('active', projectOnly);
  }
  function messageHtml(m) {
    const activities = m.activities || [],
      changes = m.changes || [];
    const counts = (added, removed) =>
      `<span class="counts"><span class="added">+${added}</span> <span class="removed">−${removed}</span></span>`;
    return `<article class="message ${m.role}" data-message="${escape(
      m.id
    )}"><div class="message-content">${
      m.role === 'user' ? escape(m.content) : markdown(m.content)
    }</div>${
      m.attachments?.length
        ? `<div class="chips">${m.attachments
            .map((name) => `<span class="chip">${icon('file')}<span>${escape(name)}</span></span>`)
            .join('')}</div>`
        : ''
    }${
      activities.length
        ? `<details class="activity-group" data-detail="activities-${escape(m.id)}"><summary>${
            activities.some((a) => a.status === 'running') && state.busy ? 'Working' : 'Activity'
          } · ${activities.length} steps</summary>${activities
            .map(
              (a) =>
                `<details class="activity ${a.status}" data-detail="${escape(a.id)}"><summary>${
                  a.status === 'done' ? '✓' : a.status === 'error' ? '!' : '○'
                } ${escape(a.label)}</summary><pre>${escape(a.detail)}</pre></details>`
            )
            .join('')}</details>`
        : ''
    }${
      changes.length
        ? `<details class="changes" open data-detail="changes-${escape(m.id)}"><summary>Edited ${
            changes.length
          } file${changes.length === 1 ? '' : 's'} ${counts(
            changes.reduce((sum, c) => sum + c.added, 0),
            changes.reduce((sum, c) => sum + c.removed, 0)
          )}</summary>${changes
            .map(
              (c) =>
                `<details class="change-row" data-detail="change-${escape(
                  c.id
                )}"><summary><span class="change-path" title="${escape(c.path)}">${escape(
                  c.path.replace(/^.*[/\\]([^/\\]+[/\\][^/\\]+)$/, '$1')
                )}</span>${counts(c.added, c.removed)}</summary><pre>${escape(
                  c.preview
                )}</pre><button data-diff="${escape(c.id)}">Review in editor ↗</button></details>`
            )
            .join('')}</details>`
        : ''
    }${
      m.role === 'assistant' && m.content
        ? `<div class="message-meta"><button data-copy="${escape(
            m.id
          )}" aria-label="Copy response" title="Copy response">${icon('copy')}</button><time>${
            m.timestamp
              ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''
          }</time></div>`
        : ''
    }</article>`;
  }
  function render() {
    const main = $('main'),
      nearBottom = main.scrollHeight - main.scrollTop - main.clientHeight < 90;
    const authenticated = state.account?.authenticated;
    $('welcome').hidden = Boolean(authenticated);
    $('signin').hidden = Boolean(state.device);
    $('device').hidden = !state.device;
    $('device-code').textContent = state.device?.code || '';
    $('signin').querySelector('button').disabled = Boolean(state.signingIn);
    $('signin').querySelector('button').textContent = state.signingIn
      ? 'Opening sign-in…'
      : 'Continue with Commons ↗';
    $('chat').hidden = !authenticated || panel !== 'chat';
    $('history').hidden = !authenticated || panel !== 'history';
    $('account').hidden = !authenticated || panel !== 'account';
    $('composer-area').hidden = !authenticated || panel !== 'chat';
    $('title').textContent =
      panel === 'history'
        ? 'Chats'
        : panel === 'account'
        ? 'Account'
        : state.current?.title || 'Commons';
    $('folder').textContent = state.folder || 'Your project';
    $('agent').textContent = state.agent || 'Default agent';
    $('mode').value = state.mode || 'ask';
    $('mode').disabled = Boolean(state.busy);
    $('agent').disabled = Boolean(state.busy || state.current);
    $('prompt').disabled = Boolean(state.signingIn || state.loading);
    const messages = state.current?.messages || [];
    $('empty').hidden = messages.length > 0;
    $('recent').hidden = messages.length > 0 || !state.sessions?.length;
    $(
      'recent'
    ).innerHTML = `<div class="recent-heading">Recent chats <button id="view-all">View all</button></div>${sessionRows(
      (state.sessions || []).slice(0, 3)
    )}`;
    // Preserve each disclosure's state and scroll position while tokens arrive.
    const details = new Map(
      [...$('messages').querySelectorAll('details[data-detail]')].map((node) => [
        node.dataset.detail,
        node.open,
      ])
    );
    $('messages').innerHTML = messages.map(messageHtml).join('');
    $('messages')
      .querySelectorAll('details[data-detail]')
      .forEach((node) => {
        if (details.has(node.dataset.detail)) node.open = details.get(node.dataset.detail);
      });
    $('working').hidden = !state.busy;
    $('attachments').innerHTML = (state.attachments || [])
      .map(
        (f) =>
          `<span class="chip">${icon('file')}<span>${escape(
            f.name
          )}</span><button type="button" data-remove="${escape(f.id)}" aria-label="Remove ${escape(
            f.name
          )}">×</button></span>`
      )
      .join('');
    $('send').innerHTML = icon(state.busy ? 'stop' : 'arrow');
    $('send').setAttribute('aria-label', state.busy ? 'Stop response' : 'Send message');
    $('send').title = state.busy ? 'Stop response' : 'Send message';
    $('send').disabled =
      !state.busy &&
      ((!$('prompt').value.trim() && !state.attachments?.length) || Boolean(state.loading));
    $('feedback').hidden = !state.error && !state.loading;
    $('feedback').textContent = state.error || (state.loading ? 'Loading conversation…' : '');
    $('approval').hidden = !state.approval;
    if (state.approval) {
      $('approval-title').textContent =
        state.approval.tool === 'write_file' ? 'Allow this file edit?' : 'Allow this command?';
      $('approval-detail').textContent = state.approval.message;
      $('approval-summary').textContent = state.approval.message.split('\n')[0];
    }
    $('account-name').textContent = state.account?.name || 'Commons account';
    $('account-email').textContent = state.account?.email || state.account?.userId || '';
    $('account-workspace').textContent = state.account?.workspaceId
      ? `Workspace · ${state.account.workspaceId}`
      : 'Personal account';
    $('avatar').textContent = (state.account?.name || state.account?.email || 'C')
      .slice(0, 1)
      .toUpperCase();
    history();
    if (nearBottom && panel === 'chat' && messages.length) main.scrollTop = main.scrollHeight;
  }
  function queueRender() {
    if (rendering) return;
    rendering = true;
    requestAnimationFrame(() => {
      rendering = false;
      render();
    });
  }
  function show(next) {
    panel = panel === next && next !== 'chat' ? 'chat' : next;
    persist();
    render();
    if (panel === 'history') $('search').focus();
  }
  $('history-toggle').onclick = () => {
    show('history');
    post('action', { action: 'refresh' });
  };
  $('account-toggle').onclick = () => show('account');
  $('home').onclick = () => show('chat');
  $('search').oninput = history;
  $('all-filter').onclick = () => {
    projectOnly = false;
    history();
  };
  $('local-filter').onclick = () => {
    projectOnly = true;
    history();
  };
  $('prompt').oninput = () => {
    resize();
    persist();
    $('send').disabled = !state.busy && !$('prompt').value.trim() && !state.attachments?.length;
  };
  $('prompt').onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!state.busy) $('composer').requestSubmit();
    }
  };
  $('composer').onsubmit = (event) => {
    event.preventDefault();
    if (state.busy) post('action', { action: 'stop' });
    else if (!state.loading && ($('prompt').value.trim() || state.attachments?.length))
      post('send', { prompt: $('prompt').value });
  };
  $('add').onclick = () => {
    $('add-menu').hidden = !$('add-menu').hidden;
    $('add').setAttribute('aria-expanded', String(!$('add-menu').hidden));
  };
  $('mode').onchange = () => post('mode', { mode: $('mode').value });
  $('allow').onclick = () => post('approve', { id: state.approval?.id, allow: true });
  $('deny').onclick = () => post('approve', { id: state.approval?.id, allow: false });
  document.addEventListener('click', async (event) => {
    const node = event.target.closest('button');
    if (!event.target.closest('.add-wrap')) {
      $('add-menu').hidden = true;
      $('add').setAttribute('aria-expanded', 'false');
    }
    if (!node) return;
    if (node.dataset.action) {
      post('action', { action: node.dataset.action });
      $('add-menu').hidden = true;
      if (node.dataset.action === 'start') panel = 'chat';
    }
    if (node.dataset.session) post('resume', { id: node.dataset.session });
    if (node.dataset.rename) post('rename', { id: node.dataset.rename });
    if (node.dataset.file) post('openFile', { path: node.dataset.file });
    if (node.dataset.diff) post('diff', { id: node.dataset.diff });
    if (node.dataset.remove) post('removeAttachment', { id: node.dataset.remove });
    if (node.dataset.prompt) {
      $('prompt').value = node.dataset.prompt;
      resize();
      persist();
      $('prompt').focus();
      render();
    }
    if (node.dataset.copy) {
      const m = state.current?.messages?.find((m) => m.id === node.dataset.copy);
      if (m) {
        try {
          await navigator.clipboard.writeText(m.content);
          node.title = 'Copied';
        } catch {
          node.title = 'Copy unavailable';
        }
      }
    }
    if (node.id === 'view-all') show('history');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      $('add-menu').hidden = true;
      panel = 'chat';
      render();
      $('prompt').focus();
    }
  });
  async function receiveFiles(files) {
    if (!files.length || state.busy) return;
    if (
      files.length + (state.attachments?.length || 0) > 10 ||
      files.some((f) => f.size > 10_000_000)
    ) {
      $('feedback').hidden = false;
      $('feedback').textContent = 'Attach up to 10 files, each under 10 MB.';
      return;
    }
    const uploaded = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () =>
              resolve({
                name: file.name,
                mime: file.type,
                data: String(reader.result).split(',')[1],
              });
            reader.readAsDataURL(file);
          })
      )
    );
    post('drop', { files: uploaded });
  }
  $('composer').ondragover = (event) => {
    event.preventDefault();
    $('composer').classList.add('dragging');
  };
  $('composer').ondragleave = () => $('composer').classList.remove('dragging');
  $('composer').ondrop = (event) => {
    event.preventDefault();
    $('composer').classList.remove('dragging');
    void receiveFiles([...event.dataTransfer.files]);
  };
  $('prompt').onpaste = (event) => {
    const files = [...event.clipboardData.files];
    if (files.length) {
      event.preventDefault();
      void receiveFiles(files);
    }
  };
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'state') {
      const key = `${message.account?.userId || 'signed-out'}:${
        message.current?.sessionId || 'new'
      }`;
      if (key !== draftKey) {
        persist();
        draftKey = key;
        $('prompt').value = drafts[key] || '';
        resize();
      }
      state = message;
      queueRender();
    }
    if (message.type === 'draft') {
      $('prompt').value = message.text;
      persist();
      resize();
      $('prompt').focus();
    }
    if (message.type === 'panel') {
      panel = message.panel;
      render();
    }
  });
  resize();
  post('ready');
})();
