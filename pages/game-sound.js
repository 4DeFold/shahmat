// Short, damped CC0 recordings of ceramic impacts (see sounds/chess/NOTICE.txt).
const profiles={
  p:{file:'light',rate:1.04,volume:.57}, n:{file:'medium',rate:1.07,volume:.58},
  b:{file:'medium',rate:1,volume:.59}, r:{file:'heavy',rate:1.08,volume:.58},
  q:{file:'heavy',rate:.96,volume:.61}, k:{file:'heavy',rate:.92,volume:.62},
};
const sources={light:'/sounds/chess/ceramic-light.wav',medium:'/sounds/chess/ceramic-medium.wav',heavy:'/sounds/chess/ceramic-heavy.wav'};
export function createGameSound(win) {
  const cache={},playing=new Set();let destroyed=false;
  function prime() {
    if(destroyed||typeof win.Audio!=='function')return;
    for(const [name,src] of Object.entries(sources))if(!cache[name]) {
      try {const audio=new win.Audio(src);audio.preload='auto';cache[name]=audio;audio.load();} catch {/* Audio is optional. */}
    }
  }
  function play(move={}) {
    if(destroyed)return;prime();
    const profile=profiles[move?.piece]||profiles.p, base=cache[profile.file];
    if(!base)return;
    try {
      const audio=base.cloneNode(true);audio.preservesPitch=false;audio.playbackRate=profile.rate;
      // A single, slightly stronger impact keeps captures distinct without an echo.
      audio.volume=Math.min(1,profile.volume*(move?.captured?1.16:1));
      playing.add(audio);audio.addEventListener('ended',()=>playing.delete(audio),{once:true});
      const promise=audio.play();if(promise?.catch)promise.catch(()=>playing.delete(audio));
    } catch {/* Browser autoplay policy or audio support. */}
  }
  return {prime,play,destroy(){destroyed=true;for(const audio of playing)audio.pause();playing.clear();for(const audio of Object.values(cache))audio.pause();}};
}
