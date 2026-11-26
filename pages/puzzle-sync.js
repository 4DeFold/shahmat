import {blankProgress, loadProgress, recordResult} from './puzzle-model.js';

const copy = value => JSON.parse(JSON.stringify(value));
export function validProgress(value) {
  if (!value || value.version !== 1 || !Number.isFinite(value.rating) || !Array.isArray(value.history)) return null;
  return loadProgress({getItem:()=>JSON.stringify(value)}, 'progress');
}
// Combine distinct attempts after a revision conflict. Recompute in chronological
// order so both devices converge even when they solved different puzzles offline.
export function mergeProgress(remote, local, preferLocalCurrent = true) {
  const a=validProgress(remote) || blankProgress(), b=validProgress(local) || blankProgress();
  const entries=new Map();
  for (const row of [...a.history,...b.history]) {
    const old=entries.get(row.id);
    if (!old || row.at < old.at) entries.set(row.id,row);
  }
  const ordered=[...entries.values()].sort((x,y)=>x.at-y.at || x.id.localeCompare(y.id));
  const same=ordered.length===a.history.length && ordered.every(row=>a.history.some(item=>item.id===row.id && item.at===row.at && item.success===row.success));
  let merged;
  if (same) merged=copy(a);
  else {
    merged=blankProgress();
    for (const row of ordered) recordResult(merged,{id:row.id,rating:Number(row.rating)||1500,themes:row.themes},row.success,row.at);
  }
  merged.current=(preferLocalCurrent ? b.current || a.current : a.current || b.current) || null;
  return merged;
}

// One serialized operation at a time, revision-only polls, full reads on change.
// Pending work is kept in the account-specific local cache until acknowledged.
export function createPuzzleSync({client,userId,storage,key,getProgress,applyProgress,canApply=()=>true,onStatus=()=>{},interval=1000,instanceId=''}) {
  const metaKey=key+'.sync'+(instanceId ? '.'+instanceId : ''); let meta;
  try { meta=JSON.parse(storage.getItem(metaKey)) || {}; } catch { meta={}; }
  let dirty=Boolean(meta.pending), initialized=Boolean(meta.initialized), first=true, revision=0, running=false, stopped=false, generation=0, timer;
  const persistMeta=()=>{try{storage.setItem(metaKey,JSON.stringify({pending:dirty,initialized,...(dirty?{pendingProgress:getProgress()}: {})}))}catch{}};
  const remember=progress=>{try{storage.setItem(key,JSON.stringify(progress))}catch{}};
  // The shared cache may have been refreshed by another tab. Restore this
  // tab's own pending snapshot before attempting an optimistic write.
  if(dirty && validProgress(meta.pendingProgress)){const pending=validProgress(meta.pendingProgress);remember(pending);applyProgress(copy(pending));}
  const read=async full=>{
    const q=client.from('puzzle_progress').select(full?'revision,progress':'revision').eq('user_id',userId).maybeSingle().abortSignal(AbortSignal.timeout(4000));
    const {data,error}=await q;if(error)throw error;return data;
  };
  const write=async progress=>{
    const {data,error}=await client.rpc('save_puzzle_progress',{p_expected_revision:revision,p_progress:progress}).abortSignal(AbortSignal.timeout(4000));
    if(error)throw error;if(!data || typeof data.accepted!=='boolean' || !Number.isSafeInteger(Number(data.revision)))throw Error('Invalid save response');return data;
  };
  const apply=value=>{remember(value);applyProgress(copy(value));};
  async function tick() {
    if (running||stopped) return;
    running=true;
    try {
      const row=await read(first); if(stopped)return;
      const serverRevision=Number(row?.revision||0);
      if(first || serverRevision!==revision){
        const full=first?row:await read(true);if(stopped)return;
        const remote=validProgress(full?.progress), local=copy(getProgress());
        if(!canApply())return;
        revision=Number(full?.revision||0);
        if(remote){
          if(dirty || (!initialized && local.history.length)) {
            const merged=mergeProgress(remote,local,dirty);apply(merged);
            dirty=JSON.stringify(merged)!==JSON.stringify(remote);
          } else apply(remote);
        } else if(local.current || local.history.length) dirty=true;
        initialized=true;first=false;persistMeta();
      }
      if(dirty){
        const snapshot=copy(getProgress()), epoch=generation, reply=await write(snapshot);if(stopped)return;
        revision=Number(reply.revision);
        if(reply.accepted){
          if(epoch===generation){dirty=false;remember(snapshot)}
        } else {
          const remote=validProgress(reply.progress);
          if(remote && canApply()){const merged=mergeProgress(remote,getProgress(),true);apply(merged);}
          // Even if interaction is in progress, retry with the latest remote
          // revision only after a full re-read; never overwrite unseen changes.
          else if(remote){revision=-1;}
          dirty=true;
        }
        initialized=true;persistMeta();
      }
      onStatus('');
    } catch { if(!stopped)onStatus('Не удалось сохранить или обновить прогресс. Повторяем…'); }
    finally {running=false;}
  }
  return {
    start(){if(!timer)timer=setInterval(tick,interval);return tick();},
    changed(){generation++;dirty=true;persistMeta();if(initialized)void tick();},
    refresh(){return tick();},
    stop(){stopped=true;clearInterval(timer);},
  };
}
