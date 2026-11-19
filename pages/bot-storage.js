// Unrated, user-owned snapshots. Writes are serialized and coalesced per game;
// pending snapshots remain account-scoped in localStorage for offline retry.
export function createBotStorage({ client, userId, storage, onStatus = () => {} }) {
  const key=`shahmat.bot-games.v1.${userId}`;
  let data={ current:null, pending:[] }, writing=false, disposed=false, retry=null;
  try { const saved=JSON.parse(storage.getItem(key) || 'null'); if (saved && Array.isArray(saved.pending)) data=saved; } catch { /* Storage may be blocked. */ }
  let localAvailable=true;
  function saveLocal() { try { storage.setItem(key, JSON.stringify(data)); localAvailable=true; } catch { localAvailable=false; onStatus('Не удалось сохранить копию на устройстве.'); } }
  async function flush() {
    if (disposed || writing || !data.pending.length) return;
    writing=true;
    try {
      while (!disposed && data.pending.length) {
        const snapshot=data.pending[0];
        const { error } = snapshot._op==='delete' ? await client.from('bot_games').delete().eq('user_id',userId).eq('id',snapshot.id) : snapshot._op==='win' ? await client.from('bot_progress').upsert({user_id:userId,level:snapshot.level},{onConflict:'user_id,level'}) : await client.from('bot_games').upsert(snapshot, { onConflict:'id' });
        if (error) throw error;
        if (data.pending[0] === snapshot) data.pending.shift();
        saveLocal();
      }
      if (!disposed) onStatus('Партия сохранена.');
    } catch {
      if (!disposed) { onStatus(localAvailable ? 'Нет связи: партия сохранена на устройстве, повторяем отправку.' : 'Не удалось сохранить партию. Проверь соединение и доступ к хранилищу.'); retry=setTimeout(() => { retry=null; void flush(); },5000); }
    } finally { writing=false; }
  }
  function put(snapshot) {
    const row={...snapshot,user_id:userId,moves:[...snapshot.moves]};
    data.current=row; const index=data.pending.findIndex(item => item.id===row.id && !(writing && item===data.pending[0]));
    if (index>=0) data.pending[index]=row; else data.pending.push(row);
    saveLocal(); onStatus('Сохраняем партию…'); void flush();
  }
  function remove(id) {
    if(data.current?.id===id)data.current=null;
    data.pending=data.pending.filter((item,i)=>item.id!==id||(writing&&i===0));
    data.pending.push({_op:'delete',id});saveLocal();void flush();
  }
  function markWin(level) {
    data.wins=[...new Set([...(data.wins||[]),level])];
    if(!data.pending.some(item=>item._op==='win'&&item.level===level))data.pending.push({_op:'win',level});saveLocal();void flush();
  }
  async function completed() {
    const wins=new Set(data.wins||[]);void flush();
    try {let timer;const {data:rows,error}=await Promise.race([client.from('bot_progress').select('level').eq('user_id',userId),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),3000);})]).finally(()=>clearTimeout(timer));if(!error&&Array.isArray(rows))for(const row of rows)if(row.level>=1&&row.level<=6)wins.add(row.level);}catch{/* Offline completion is retained locally. */}
    data.wins=[...wins];saveLocal();return data.wins;
  }
  async function restore() {
    if (data.current?.status==='active') { void flush(); return data.current; }
    void flush();
    try {
      // Do not block the Play button indefinitely if the network stalls.
      let timeout;
      const query=client.from('bot_games').select('*').eq('user_id',userId).eq('status','active').order('updated_at',{ascending:false}).limit(1);
      const { data:rows, error } = await Promise.race([query, new Promise((_,reject) => { timeout=setTimeout(() => reject(new Error('timeout')),8000); })]).finally(() => clearTimeout(timeout));
      if (error) throw error;
      if (disposed) return null;
      // Locally completed games must never be resurrected by an old server copy.
      const row=rows?.[0];
      return row && !data.pending.some(item=>item._op==='delete'&&item.id===row.id) && !(data.current?.id===row.id && data.current.status!=='active') ? row : null;
    } catch { if (!disposed) onStatus('Не удалось загрузить сохранённую партию.'); return null; }
  }
  return { put, remove, markWin, completed, restore, flush, destroy() { disposed=true; if (retry!==null) clearTimeout(retry); } };
}
