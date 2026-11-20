// CC0 chess-piece recordings; sources and processing are documented in NOTICE.txt.
const sources={move:'/sounds/chess/move.mp3',capture:'/sounds/chess/capture.wav'};
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
    const base=cache[move?.captured?'capture':'move'];
    if(!base)return;
    try {
      const audio=base.cloneNode(true);audio.volume=move?.captured ? .75 : .65;
      playing.add(audio);audio.addEventListener('ended',()=>playing.delete(audio),{once:true});
      const promise=audio.play();if(promise?.catch)promise.catch(()=>playing.delete(audio));
    } catch {/* Browser autoplay policy or audio support. */}
  }
  return {prime,play,destroy(){destroyed=true;for(const audio of playing)audio.pause();playing.clear();for(const audio of Object.values(cache))audio.pause();}};
}
