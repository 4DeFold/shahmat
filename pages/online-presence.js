// Ephemeral, best-effort presence. Keys identify a user or a guest browser, not tabs.
// Public usernames are optional and unverified; older clients do not publish them.
export function startOnlinePresence(client, userId, onCount, { username = null, onNames = () => {} } = {}) {
  let channel, stopped = false, connected = false, synced = false, last = null, lastNames = null;
  const report = value => { if (value !== last) { last = value; onCount(value); } };
  const timer = setInterval(() => {
    if (!connected || !synced || !channel) { report(null); if (lastNames !== null) { lastNames = null; onNames(null); } return; }
    const state = channel.presenceState();
    report(Object.keys(state).length);
    const names = [...new Set(Object.values(state).flat().map(p => p.username).filter(n => typeof n === 'string' && /^[A-Za-z0-9_]{3,24}$/.test(n)))].sort();
    const serialized = JSON.stringify(names); if (serialized !== lastNames) { lastNames = serialized; onNames(new Set(names)); }
  }, 500);
  (async () => {
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`shahmat-online:${userId}`));
      if (stopped) return;
      const key = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
      channel = client.channel('site-online-v1', { config: { presence: { key, enabled: true } } });
      channel.on('presence', { event: 'sync' }, () => { synced = true; });
      channel.subscribe(async status => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          const result = await channel.track(username && /^[A-Za-z0-9_]{3,24}$/.test(username) ? { username } : {});
          if (!stopped && result === 'ok') connected = true;
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { connected = false; synced = false; report(null); lastNames = null; onNames(null); }
      });
    } catch { report(null); }
  })();
  return () => { stopped = true; clearInterval(timer); if (channel) return client.removeChannel(channel); };
}

export function createOnlineCounter(document) {
  const element = document.getElementById('online-value'), container = document.getElementById('online-counter');
  let target = null, displayed = 0, frame = 0;
  const win = document.defaultView;
  return value => {
    if (value === target) return;
    target = value; win.cancelAnimationFrame(frame);
    if (!Number.isSafeInteger(value) || value < 0) { displayed = 0; element.textContent = '—'; container.setAttribute('aria-label', 'Онлайн: нет соединения'); return; }
    container.setAttribute('aria-label', `Онлайн: ${value}`);
    const from = displayed, started = win.performance.now();
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches || from === value) { displayed = value; element.textContent = String(value); return; }
    const animate = now => {
      const t = Math.min(1, (now - started) / 400);
      displayed = Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3)));
      element.textContent = String(displayed);
      if (t < 1) frame = win.requestAnimationFrame(animate);
    };
    frame = win.requestAnimationFrame(animate);
  };
}

// Shared across tabs of the same browser; never reused as an account identity.
export function guestPresenceId(win) {
  try {
    let id = win.localStorage.getItem('shahmat.guest-presence');
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); win.localStorage.setItem('shahmat.guest-presence', id); }
    return `guest:${id}`;
  } catch { return `guest:${Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')}`; }
}
