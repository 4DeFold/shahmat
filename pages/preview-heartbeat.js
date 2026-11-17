// The whole signed-in preview, not just the chess iframe, reports presence.
export function startPreviewHeartbeat(client, win) {
  let stopped = false, pending = false;
  const beat = async () => {
    if (stopped || pending) return;
    pending = true;
    try { await client.functions.invoke('matchplay-preview', { body:{ action:'heartbeat' }, timeout:8000 }); }
    catch { /* A missed beat is never invented locally. */ }
    finally { pending = false; }
  };
  void beat();
  const timer = win.setInterval(beat, 10000);
  const visible = () => { if (!win.document.hidden) void beat(); };
  win.document.addEventListener('visibilitychange', visible);
  win.addEventListener('online', beat);
  return () => { stopped = true; win.clearInterval(timer); win.document.removeEventListener('visibilitychange', visible); win.removeEventListener('online', beat); };
}
