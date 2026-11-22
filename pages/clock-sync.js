// The server is authoritative. Between snapshots we use a monotonic clock;
// small same-turn corrections are slewed so network jitter cannot reverse it.
export function createClockSync() {
  let state = null, pending = null, reanchor = false;
  const project = (source, at, color) => {
    const initial = source[color];
    if (source.status !== 'active' || source.turn !== color) return initial;
    const elapsed = Math.max(0, at - source.at);
    const correction = Math.sign(source.drift || 0) * Math.min(Math.abs(source.drift || 0), elapsed * .1);
    return Math.max(0, initial - elapsed + correction);
  };
  return {
    update(game, at) {
      const same = state && state.id === game.id;
      const previous = same ? {w:project(state,at,'w'), b:project(state,at,'b')} : null;
      const values = {w:Math.max(0, Number(game.white_ms) || 0), b:Math.max(0, Number(game.black_ms) || 0)};
      // A snapshot was generated during the request, not at receipt. Half RTT is
      // only an estimate: the authoritative result always remains on the server.
      const age = Math.min(2000, Math.max(0, Number(game._clock_age_ms) || 0));
      if (game.status === 'active' && (game.turn === 'w' || game.turn === 'b')) values[game.turn] = Math.max(0, values[game.turn] - age);
      const continuing = !reanchor && same && state.status === 'active' && game.status === 'active' && state.turn === game.turn && state.version === game.version;
      let drift = 0;
      if (continuing) {
        drift = Math.max(-10000, Math.min(10000, values[game.turn] - previous[game.turn]));
        values[game.turn] = previous[game.turn];
      }
      state = {id:game.id, version:game.version, status:game.status, turn:game.turn, at, ...values, drift};
      pending = null; reanchor = false;
    },
    resync() { reanchor = true; },
    beginMove(at, incrementMs = 0) {
      if (!state || state.status !== 'active') return;
      const values = {w:project(state,at,'w'), b:project(state,at,'b')};
      values[state.turn] += Math.max(0, Number(incrementMs) || 0);
      pending = {...state, ...values, at, turn:state.turn === 'w' ? 'b' : 'w', drift:0};
    },
    cancelMove() { pending = null; },
    turn() { return (pending || state)?.turn || null; },
    value(color, at) { const source = pending || state; return source ? project(source,at,color) : null; },
    clear() { state = null; pending = null; reanchor = false; },
  };
}
