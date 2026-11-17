// Smooth network jitter while leaving the server authoritative. Corrections are
// slewed at at most 10% of real time, so a running clock never goes backwards.
export function createClockSync() {
  let state = null;
  const project = (at, color) => {
    const initial = state[color];
    if (state.status !== 'active' || state.turn !== color) return initial;
    const elapsed = Math.max(0, at - state.at);
    const correction = Math.sign(state.drift) * Math.min(Math.abs(state.drift), elapsed * .1);
    return Math.max(0, initial - elapsed + correction);
  };
  return {
    update(game, at) {
      const same = state && state.id === game.id;
      const previous = same ? {w:project(at,'w'), b:project(at,'b')} : null;
      const w = Math.max(0, Number(game.white_ms) || 0), b = Math.max(0, Number(game.black_ms) || 0);
      const continuing = same && state.status === 'active' && game.status === 'active' && state.turn === game.turn && state.version === game.version;
      const values = {w,b}; let drift = 0;
      if (continuing) {
        values[game.turn] = previous[game.turn];
        drift = Math.max(-10000, Math.min(10000, (game.turn === 'w' ? w : b) - values[game.turn]));
      } else if (same && state.status === 'active') {
        // No time control here has increment: latency cannot add time to the
        // side that was running just before the turn or result changed.
        values[state.turn] = Math.min(values[state.turn], previous[state.turn]);
      }
      state = {id:game.id, version:game.version, status:game.status, turn:game.turn, at, ...values, drift};
    },
    value(color, at) { return state ? project(at, color) : null; },
    clear() { state = null; },
  };
}
