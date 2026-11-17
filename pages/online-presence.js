// Counts signed-in users running this version of the site, not tabs. Presence is
// ephemeral; no profile data is sent over the Realtime channel.
export function startOnlinePresence(client, userId, onCount) {
  let channel, stopped = false, connected = false, last = null;
  const report = value => { if (value !== last) { last = value; onCount(value); } };
  const timer = setInterval(() => {
    if (!connected || !channel) { report(null); return; }
    report(Object.keys(channel.presenceState()).length);
  }, 500);
  (async () => {
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`shahmat-online:${userId}`));
      if (stopped) return;
      const key = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
      channel = client.channel('site-online-v1', { config: { presence: { key } } });
      channel.subscribe(async status => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          const result = await channel.track({});
          if (!stopped && result === 'ok') connected = true;
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { connected = false; report(null); }
      });
    } catch { report(null); }
  })();
  return () => { stopped = true; clearInterval(timer); if (channel) void client.removeChannel(channel); };
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
