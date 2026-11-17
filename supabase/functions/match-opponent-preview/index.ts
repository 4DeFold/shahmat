// Disclose only the opponent's nickname and bio to a participant of that game.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply({ error:'Method not allowed' }, 405);
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !url || !key) return reply({ error:'Unauthorized' }, 401);
  const db = createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } });
  const { data:auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) return reply({ error:'Unauthorized' }, 401);
  let gameId;
  try { gameId = (await request.json()).gameId; } catch { return reply({ error:'Invalid request' }, 400); }
  if (typeof gameId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId)) return reply({ error:'Invalid game' }, 400);
  try {
    const { data:game, error:gameError } = await db.rpc('online_snapshot', { p_user:auth.user.id, p_game:gameId });
    if (gameError || !game || ![game.white_id, game.black_id].includes(auth.user.id)) return reply({ error:'Game not found' }, 404);
    const opponent = game.white_id === auth.user.id ? game.black_id : game.white_id;
    const { data:profile, error:profileError } = await db.from('profiles').select('username,bio').eq('id', opponent).maybeSingle();
    if (profileError) throw profileError;
    return reply({ username:profile?.username || null, bio:profile?.bio || '' });
  } catch { return reply({ error:'Unavailable' }, 503); }
});
