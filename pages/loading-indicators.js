import {createSearchLoader} from './search-loader.js';

// Reuse the matchmaking renderer for every data-loading state. Observe state,
// not text: status messages are routinely replaced during requests.
export function installLoadingIndicators(doc, { embeddedFrame=false } = {}) {
  const win=doc.defaultView, loaders=new Map();
  let enabled=!embeddedFrame || win.parent===win, destroyed=false;
  function sync() {
    if(destroyed)return;
    for(const [el,loader] of loaders) if(!el.isConnected){loader.destroy();loaders.delete(el);}
    for(const el of doc.querySelectorAll('.particle-loading[data-loading]')) {
      let loader=loaders.get(el);
      if(!loader){loader=createSearchLoader(el,win);loaders.set(el,loader);}
      const kind=el.dataset.loading, parent=el.parentElement;
      const state=kind==='page' || (kind==='profile' && !parent.hidden)
        || (kind==='rating' && parent.querySelector('.rating-status:not([hidden])') && el.closest('.rating-board')?.getAttribute('aria-busy')==='true')
        || (kind==='status' && parent.querySelector('p.is-loading'));
      // Ignore our own hidden attribute; a hidden ancestor must stop its animation.
      loader.setVisible(!!state && enabled && !doc.hidden && !parent.closest('[hidden]'));
    }
  }
  const observer=new win.MutationObserver(sync);
  observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','aria-busy']});
  const visibility=()=>sync();
  const message=e=>{if(e.origin!==win.location.origin||e.source!==win.parent)return;
    if(['shahmat-watch-hidden','shahmat-archive-hidden'].includes(e.data?.type)){enabled=false;sync();}
    if(['shahmat-watch-shown','shahmat-archive-shown'].includes(e.data?.type)){enabled=true;sync();}
  };
  doc.addEventListener('visibilitychange',visibility);win.addEventListener('message',message);sync();
  return {destroy(){destroyed=true;observer.disconnect();doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('message',message);for(const loader of loaders.values())loader.destroy();loaders.clear();}};
}
