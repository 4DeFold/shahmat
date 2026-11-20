// Real CC0 recordings: a chess piece on alabaster and a piece placed on wood.
// Per-piece playback rates and a two-hit capture add variety without synthesis.
const profiles={
  p:{file:'wood',rate:1.08,volume:.62}, n:{file:'stone',rate:1.09,volume:.67},
  b:{file:'stone',rate:1.02,volume:.68}, r:{file:'stone',rate:.96,volume:.72},
  q:{file:'stone',rate:.88,volume:.76}, k:{file:'stone',rate:.91,volume:.76},
};
const sources={wood:'/sounds/chess/elboss-piece-placement.mp3',stone:'/sounds/chess/mh2o-alabaster.wav'};
export function createGameSound(win) {
  const cache={},playing=new Set(),timers=new Set();let destroyed=false;
  function prime() {
    if(destroyed||typeof win.Audio!=='function')return;
    for(const [name,src] of Object.entries(sources))if(!cache[name]) {
      try {const audio=new win.Audio(src);audio.preload='auto';cache[name]=audio;audio.load();} catch {/* Audio is optional. */}
    }
  }
  function hit(piece,volume=1) {
    const profile=profiles[piece]||profiles.p, base=cache[profile.file];
    if(!base||destroyed)return;
    try {
      const audio=base.cloneNode(true);audio.playbackRate=profile.rate;audio.volume=Math.min(1,profile.volume*volume);
      playing.add(audio);audio.addEventListener('ended',()=>playing.delete(audio),{once:true});
      const promise=audio.play();if(promise?.catch)promise.catch(()=>playing.delete(audio));
    } catch {/* Browser autoplay policy or audio support. */}
  }
  function play(move={}) {
    if(destroyed)return;prime();
    if(move?.captured){
      hit(move.captured,.65);
      const timer=win.setTimeout(()=>{timers.delete(timer);hit(move.piece);},45);timers.add(timer);
    } else hit(move?.piece);
  }
  return {prime,play,destroy(){destroyed=true;for(const timer of timers)win.clearTimeout(timer);timers.clear();for(const audio of playing)audio.pause();playing.clear();for(const audio of Object.values(cache))audio.pause();}};
}
