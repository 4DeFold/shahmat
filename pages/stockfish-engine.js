// Stockfish.js 17.1, GPLv3: https://github.com/nmrugg/stockfish.js/tree/Stockfish17.1
// A worker is created only when a game actually needs the engine. King uses
// the full network, while lower levels use the lighter network and UCI limits.
export const BOT_LEVELS = [
  { piece:'P', name:'Пешка', skill:0, elo:1320, ms:250, description:'Первый шаг: знакомство с игрой.' },
  { piece:'N', name:'Конь', skill:4, elo:1550, ms:350, description:'Неожиданные ходы и первые комбинации.' },
  { piece:'B', name:'Слон', skill:8, elo:1800, ms:500, description:'Диагонали, тактика и позиционная игра.' },
  { piece:'R', name:'Ладья', skill:12, elo:2100, ms:700, description:'Сильнее в открытых позициях и эндшпиле.' },
  { piece:'Q', name:'Ферзь', skill:16, elo:2450, ms:1000, description:'Серьёзный соперник для опытного игрока.' },
  { piece:'K', name:'Король', skill:20, elo:null, ms:2500, description:'Полная сеть Stockfish, без ограничения силы.' },
];
export function createStockfish(level, { WorkerClass = globalThis.Worker, timeoutMs = 90000 } = {}) {
  const config = BOT_LEVELS[level];
  if (!config || !WorkerClass) throw new Error('Движок недоступен в этом браузере.');
  const script = level === 5 ? 'stockfish-17.1-single-a496a04.js' : 'stockfish-17.1-lite-single-03e3232.js';
  const worker = new WorkerClass(`/stockfish/${script}`);
  let pending = null, stopped = false, initialized = false, readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve=resolve; readyReject=reject; });
  // Consumers may cancel before anyone awaits ready.
  ready.catch(() => {});
  const timer = setTimeout(() => fail(new Error('Не удалось загрузить Stockfish. Проверь соединение.')), timeoutMs);
  function fail(error) {
    if (stopped) return;
    stopped = true; clearTimeout(timer); worker.terminate(); readyReject(error);
    if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; }
  }
  worker.onerror = () => fail(new Error('Не удалось запустить Stockfish в этом браузере.'));
  worker.onmessage = event => {
    for (const line of String(event.data).split('\n')) {
      if (line.trim() === 'uciok') {
        worker.postMessage(`setoption name Skill Level value ${config.skill}`);
        worker.postMessage(`setoption name UCI_LimitStrength value ${config.elo === null ? 'false' : 'true'}`);
        if (config.elo !== null) worker.postMessage(`setoption name UCI_Elo value ${config.elo}`);
        worker.postMessage('setoption name Hash value 16');
        worker.postMessage('isready');
      } else if (line.trim() === 'readyok' && !initialized) {
        initialized=true; clearTimeout(timer); readyResolve();
      } else if (line.startsWith('bestmove ') && pending) {
        const current=pending; pending=null; clearTimeout(current.timer); const move=line.split(/\s+/)[1];
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) current.reject(new Error('Stockfish не вернул ход.'));
        else current.resolve({ from:move.slice(0,2), to:move.slice(2,4), ...(move[4] ? {promotion:move[4]} : {}) });
      }
    }
  };
  worker.postMessage('uci');
  return {
    async move(fen) {
      await ready;
      if (stopped) throw new Error('Движок остановлен.');
      if (pending) throw new Error('Движок уже думает.');
      if (typeof fen !== 'string' || /[\r\n]/.test(fen)) throw new Error('Некорректная позиция.');
      return new Promise((resolve, reject) => {
        pending={resolve,reject,timer:setTimeout(() => fail(new Error('Stockfish не ответил вовремя.')), 30000)}; worker.postMessage(`position fen ${fen}`); worker.postMessage(`go movetime ${config.ms}`);
      });
    },
    ready,
    destroy() { fail(new Error('Движок остановлен.')); },
  };
}
