// Presence is ephemeral. Hashing the account ID groups multiple tabs without
// broadcasting a profile identifier; disconnects remove stale viewers.
export function startSpectatorPresence(client,gameId,{viewer=false,onCount=()=>{}}={}) {
 if(!gameId||typeof client.channel!=='function')return ()=>{};
 let channel,stopped=false;
 (async()=>{
  try {
   let key=crypto.randomUUID();
   if(viewer){const {data}=await client.auth.getUser();if(!data?.user?.id||stopped)return;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`shahmat-viewer:${gameId}:${data.user.id}`));key=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
   if(stopped)return;
   channel=client.channel(`spectators-v1:${gameId}`,{config:{presence:{key,enabled:true}}});
   channel.on('presence',{event:'sync'},()=>{if(stopped)return;const count=Object.values(channel.presenceState()).filter(entries=>entries.some(value=>value?.viewer===true)).length;onCount(count);});
   channel.subscribe(async status=>{if(stopped)return;if(status==='SUBSCRIBED'&&viewer)await channel.track({viewer:true});else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))onCount(null);});
  } catch {if(!stopped)onCount(null);}
 })();
 return ()=>{stopped=true;onCount(null);if(channel)void client.removeChannel(channel);};
}
