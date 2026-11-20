import { createGameSound } from './game-sound.js';

// One delegate per document covers dynamic controls without per-element listeners.
// Board moves and history navigation have their own stronger, piece-specific sounds.
export function installInteractionSounds(document, win=document.defaultView) {
  const sound=createGameSound(win);let lastControl=null,lastAt=0;
  function click(event) {
    if(event.button!==0 || event.defaultPrevented || document.hidden) return;
    const target=event.target.closest?.('button, a[href], label, select, input:not([type=hidden]), textarea, [role=button], [role=tab]');
    if(!target || target.matches(':disabled, [aria-disabled=true]') || target.closest('[inert], [hidden], .board, [data-history-index], .history-controls'))return;
    const label=target.closest('label'), control=label||target;
    const now=Date.now();if(control===lastControl && now-lastAt<100)return;
    lastControl=control;lastAt=now;
    sound.effect(target.matches('input,select')||label||target.matches('[role=tab]')?'select':'click');
  }
  document.addEventListener('click',click,true);
  return ()=>{document.removeEventListener('click',click,true);sound.destroy();};
}
