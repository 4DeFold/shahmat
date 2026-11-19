// Trusted game arbiter. Only authenticated users can request operations; the
// service role stays inside this function and is never returned to the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { Chess } from 'npm:chess.js@1.4.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const squarePattern = /^[a-h][1-8]$/;
const modes = new Set(['blitz', 'rapid', 'classical']);

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Метод не поддерживается.' }, 405);
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'Сервис недоступен.' }, 503);
  if (!token) return reply({ error: 'Необходимо войти.' }, 401);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return reply({ error: 'Необходимо войти.' }, 401);
  const user = auth.user.id;
  let body: any;
  try { body = await request.json(); } catch { return reply({ error: 'Неверный запрос.' }, 400); }
  if (!body || typeof body !== 'object' || typeof body.action !== 'string') return reply({ error: 'Неверный запрос.' }, 400);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data;
  };
  try {
    // Existing clients also report activity while they poll or play.
    await rpc('online_heartbeat', { p_user:user });
    if (body.action === 'heartbeat') return reply({ ok:true });
    // Opening a fresh screen also clears a potentially abandoned queue entry.
    if (body.action === 'current' || body.action === 'cancel') {
      const result = await rpc('online_cancel', { p_user: user });
      return reply({ game: result?.game_id ? await rpc('online_match_snapshot', { p_user: user, p_game: result.game_id }) : null });
    }
    if (body.action === 'search') {
      if (!modes.has(body.mode)) return reply({ error: 'Выберите режим.' }, 400);
      const result = await rpc('online_find', { p_user: user, p_mode: body.mode });
      return reply(result.state === 'matched' ? { state: 'matched', game: await rpc('online_match_snapshot', { p_user: user, p_game: result.game_id }) } : { state: 'searching' });
    }
    if (!idPattern.test(body.gameId || '')) return reply({ error: 'Неверная партия.' }, 400);
    const snapshot = await rpc('online_match_snapshot', { p_user: user, p_game: body.gameId });
    if (!snapshot) return reply({ error: 'Партия не найдена.' }, 404);
    if (body.action === 'snapshot') return reply({ game: snapshot });
    if (body.action === 'opponent') {
      const opponent = snapshot.white_id === user ? snapshot.black_id : snapshot.white_id;
      const { data:profile, error } = await db.from('profiles').select('username,bio').eq('id', opponent).maybeSingle();
      if (error) throw error;
      return reply({ username:profile?.username || null, bio:profile?.bio || '' });
    }
    if (['resign','offline_win','offline_draw'].includes(body.action)) {
      return reply({ game: await rpc('online_finish', { p_user:user, p_game:body.gameId, p_action:body.action }) });
    }
    if (body.action !== 'move' || !squarePattern.test(body.from || '') || !squarePattern.test(body.to || '') || !Number.isSafeInteger(body.version) || (body.promotion != null && !['q','r','b','n'].includes(body.promotion))) return reply({ error: 'Неверный ход.' }, 400);
    if (snapshot.status !== 'active' || snapshot.version !== body.version) return reply({ game: snapshot });
    if ((snapshot.turn === 'w' ? snapshot.white_id : snapshot.black_id) !== user) return reply({ error: 'Сейчас ход соперника.' }, 409);
    const chess = new Chess();
    for (const san of snapshot.moves) chess.move(san);
    let move;
    try { move = chess.move({ from: body.from, to: body.to, ...(body.promotion ? { promotion: body.promotion } : {}) }); }
    catch { return reply({ error: 'Недопустимый ход.' }, 400); }
    const result = chess.isCheckmate() ? (chess.turn() === 'w' ? 'black_win' : 'white_win') : chess.isDraw() ? 'draw' : null;
    const reason = chess.isCheckmate() ? 'checkmate' : chess.isStalemate() ? 'stalemate' : chess.isThreefoldRepetition() ? 'repetition' : chess.isInsufficientMaterial() ? 'material' : chess.isDraw() ? 'draw' : null;
    const game = await rpc('online_commit', { p_user: user, p_game: body.gameId, p_version: body.version, p_san: move.san, p_fen: chess.fen(), p_next_turn: chess.turn(), p_result: result, p_reason: reason });
    return reply({ game: game ? await rpc('online_match_snapshot', { p_user:user, p_game:body.gameId }) : null });
  } catch {
    return reply({ error: 'Не удалось выполнить запрос. Попробуйте ещё раз.' }, 503);
  }
});
