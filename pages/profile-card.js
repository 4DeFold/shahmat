import {applyProfileTheme,isProfileImage} from './profile-theme.js';
// One lazy card shared by all rows; fetched only when a player is inspected.
export function createProfileCard(root,client,onOpen=()=>{}){
 const doc=root.ownerDocument,win=doc.defaultView,card=doc.createElement('aside');card.className='player-mini-card';card.hidden=true;card.innerHTML='<div class="player-mini-banner"><img alt="" hidden></div><img class="player-mini-avatar" alt=""><strong class="player-mini-name"></strong><p class="player-mini-bio"></p>';doc.body.append(card);
 let trigger=null,seq=0,timer=null,pinned=false;
 function hide(){clearTimeout(timer);card.hidden=true;trigger=null;seq++;pinned=false;}
 function later(){clearTimeout(timer);timer=setTimeout(()=>{if(!pinned&&!card.matches(':hover')&&doc.activeElement!==trigger&&!card.contains(doc.activeElement))hide();},180);}
 async function show(el,pin=false){const name=el.dataset.profileName;if(!name)return;clearTimeout(timer);const changing=trigger&&trigger!==el&&!card.hidden;trigger=el;pinned=pin;let n=++seq;if(changing){card.style.animation='none';void card.offsetWidth;card.style.removeProperty('animation');}card.hidden=false;card.querySelector('.player-mini-name').textContent=name;card.querySelector('.player-mini-bio').textContent='';card.querySelector('.player-mini-bio').hidden=true;card.querySelector('.player-mini-avatar').src='/pieces/cburnett/wN.svg';card.querySelector('.player-mini-banner img').hidden=true;applyProfileTheme(card,'monochrome','light');const r=el.getBoundingClientRect();card.style.left=`${Math.max(8,Math.min(win.innerWidth-300,r.left))}px`;card.style.top=`${Math.max(8,Math.min(win.innerHeight-270,r.bottom+4))}px`;
  try{const {data,error}=await client.rpc('profile_public',{p_name:name});if(seq!==n)return;if(error||!data)throw error||Error();applyProfileTheme(card,data.palette,data.theme);card.querySelector('.player-mini-name').textContent=data.username;const bio=card.querySelector('.player-mini-bio');bio.textContent=data.bio?.trim()||'';bio.hidden=!bio.textContent;const avatar=card.querySelector('.player-mini-avatar'),banner=card.querySelector('.player-mini-banner img');avatar.src=isProfileImage(data.avatar)?data.avatar:'/pieces/cburnett/wN.svg';avatar.classList.toggle('custom',isProfileImage(data.avatar));banner.hidden=!isProfileImage(data.banner);if(!banner.hidden)banner.src=data.banner;}
  catch{if(seq===n){const bio=card.querySelector('.player-mini-bio');bio.textContent='Не удалось загрузить профиль.';bio.hidden=false;}}
 }
 root.addEventListener('pointerover',e=>{const el=e.target.closest('[data-profile-name]');if(el&&!el.contains(e.relatedTarget)&&e.pointerType!=='touch')void show(el);});
 root.addEventListener('pointerout',e=>{const el=e.target.closest('[data-profile-name]');if(el&&!el.contains(e.relatedTarget))later();});
 root.addEventListener('focusin',e=>{const el=e.target.closest('[data-profile-name]');if(el)void show(el);});root.addEventListener('focusout',later);
 root.addEventListener('click',e=>{const el=e.target.closest('[data-profile-name]');if(el){e.preventDefault();const name=el.dataset.profileName;hide();if(name)onOpen(name);}});
 root.addEventListener('keydown',e=>{const el=e.target.closest('[role=button][data-profile-name]');if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();const name=el.dataset.profileName;hide();if(name)onOpen(name);}});
 card.addEventListener('pointerenter',()=>clearTimeout(timer));card.addEventListener('pointerleave',later);
 doc.addEventListener('pointerdown',e=>{if(!card.hidden&&!card.contains(e.target)&&!trigger?.contains(e.target))hide();});doc.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 return {hide,destroy(){hide();card.remove();}};
}
