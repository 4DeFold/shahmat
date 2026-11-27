import {controls} from './play-lobby.js';

const modes={bullet:'Пуля',blitz:'Блиц',rapid:'Рапид',classical:'Классика'};
export function startDirectChallenges(client, win, {openGame}) {
 const doc=win.document, panel=doc.createElement('section');
 panel.className='direct-challenge';panel.hidden=true;panel.setAttribute('aria-live','polite');panel.setAttribute('aria-label','Вызов на партию');doc.body.append(panel);
 let stopped=false, pending=false, current=null, key='', selectedMode=null, acting=false, joining=null;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const errorText=err=>/player_busy/.test(err?.message||'')?'Игрок уже в партии.':/challenge_busy/.test(err?.message||'')?'Уже есть активный вызов.':/not_related/.test(err?.message||'')?'Вызов доступен друзьям и соклановцам.':'Не удалось выполнить действие. Попробуй ещё раз.';
 const showError=text=>{let status=panel.querySelector('.direct-status');if(!status){status=el('p','','direct-status');panel.append(status)}status.textContent=text;};
 async function action(type,args={}){
  if(acting)return false;acting=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const {error}=await client.rpc('direct_challenge_action',{p_action:type,p_id:args.id||current?.id||null,p_name:args.name||null,p_mode:args.mode||null,p_control:args.control||null});if(error)throw error;key='';await poll(true);return true;}
  catch(err){panel.hidden=false;showError(errorText(err));return false;}
  finally{acting=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 const button=(label,fn,primary=false)=>{const b=el('button',label,primary?'direct-primary':'');b.type='button';b.addEventListener('click',fn);return b;};
 function render(c){
  panel.replaceChildren();if(!c){panel.hidden=true;selectedMode=null;return;}panel.hidden=false;
  if(c.state==='cancelled'){panel.append(el('strong','Вызов отменён'),button('Закрыть',()=>{panel.hidden=true;key='dismissed:'+c.id}));return;}
  panel.append(el('strong',c.outgoing?`Вызов: ${c.name}`:`Вызов от ${c.name}`));
  const actions=el('div','','direct-actions');
  if(c.state==='pending'){
   panel.append(el('p',c.outgoing?'Ожидание ответа':'Товарищеская партия'));
   if(!c.outgoing)actions.append(button('Принять',()=>void action('accept'),true));
   actions.append(button(c.outgoing?'Отменить':'Отклонить',()=>void action('cancel')));
  } else if(c.state==='accepted'){
   if(c.outgoing){
    panel.append(el('p',selectedMode?'Контроль времени':'Выбери режим'));
    const choices=el('div','','direct-choices');
    if(!selectedMode)for(const [mode,label] of Object.entries(modes))choices.append(button(label,()=>{selectedMode=mode;render(c)},true));
    else {for(const control of controls[selectedMode])choices.append(button(control,()=>void action('propose',{mode:selectedMode,control}),true));actions.append(button('Назад',()=>{selectedMode=null;render(c)}));}
    panel.append(choices);
   }else panel.append(el('p','Соперник выбирает настройки'));
   actions.append(button('Отменить',()=>void action('cancel')));
  } else if(c.state==='proposed'){
   panel.append(el('p',`${modes[c.mode]||c.mode} · ${c.control.includes('+')?c.control:c.control+'+0'}`));
   if(!c.outgoing)actions.append(button('Подтвердить',()=>void action('confirm'),true));else panel.append(el('p','Ожидание подтверждения'));
   actions.append(button('Отменить',()=>void action('cancel')));
  }
  panel.append(actions);
 }
 async function poll(force=false){
  if(stopped||pending&&!force)return;pending=true;
  try{const {data,error}=await client.rpc('direct_challenge_snapshot');if(error)throw error;if(stopped)return;
   current=data;
   if(data?.state==='started'&&data.game_id){panel.hidden=true;if(joining!==data.id){joining=data.id;try{await openGame(data.game_id);if(!stopped){const result=await client.rpc('direct_challenge_action',{p_action:'seen',p_id:data.id});if(result.error)throw result.error;current=null;key='';}}catch{joining=null;panel.hidden=false;panel.replaceChildren(el('strong','Партия готова'),button('Открыть',()=>{joining=null;void poll()},true));}}return;}
   const next=JSON.stringify(data);if(key==='dismissed:'+data?.id&&data?.state==='cancelled')return;if(next!==key){key=next;render(data)}
  }catch{/* Preserve current state during a transient disconnect. */}finally{pending=false;}
 }
 void poll();const timer=win.setInterval(()=>void poll(),3000);const visible=()=>{if(!doc.hidden)void poll()};doc.addEventListener('visibilitychange',visible);win.addEventListener('online',visible);
 return {send(name){return action('send',{name});},destroy(){stopped=true;win.clearInterval(timer);doc.removeEventListener('visibilitychange',visible);win.removeEventListener('online',visible);panel.remove();}};
}
