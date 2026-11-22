// A best-effort wake-up signal, not an authority or a peer-to-peer move.
// The public broadcast carries no position or player identity; forged, missing,
// delayed or duplicated hints can only trigger a rate-limited server snapshot.
export function createMatchSignal(client, onHint) {
  let channel = null, gameId = null, connected = false, serial = 0;
  function remove(old) {
    if (!old) return;
    try { void Promise.resolve(client.removeChannel(old)).catch(() => {}); } catch { /* The poller is independent. */ }
  }
  function setGame(id) {
    if (id === gameId) return;
    const old = channel; gameId = id; channel = null; connected = false; const token = ++serial;
    remove(old);
    if (!id || typeof client.channel !== 'function') return;
    try {
      const next = client.channel(`match-hint-v1:${id}`, {config:{broadcast:{self:false}}});
      channel = next;
      next.on('broadcast', {event:'changed'}, message => {
        if (token !== serial || !connected) return;
        const version = message?.payload?.version;
        if (Number.isSafeInteger(version) && version >= 0 && version <= 2001) onHint(id,version);
      });
      next.subscribe(status => { if (token === serial) connected = status === 'SUBSCRIBED'; });
    } catch { remove(channel); channel = null; connected = false; }
  }
  function publish(id, version) {
    if (id !== gameId || !channel || !connected || !Number.isSafeInteger(version) || version < 0 || version > 2001) return;
    try { void Promise.resolve(channel.send({type:'broadcast',event:'changed',payload:{version}})).catch(() => {}); } catch { /* Polling remains available. */ }
  }
  return {setGame,publish,destroy(){setGame(null);}};
}
