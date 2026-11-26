export function createSocialView(root, client, {onOpenProfile=()=>{}}={}) {
 const doc=root.ownerDocument, win=doc.defaultView, $=selector=>root.querySelector(selector);
 const status=$('.social-status'), dialog=$('#social-dialog'), content=$('#social-dialog-content');
 let data=null, detail=null, page='clans', visible=false, destroyed=false, sequence=0, detailSequence=0, lifecycle=0;
 let timer=null, searchTimer=null, acting=false, lastPlayerQuery='', lastClanQuery='', friendsLoaded=false, clansLoaded=false;
 const say=text=>{status.textContent=text;$('#social-dialog-status').textContent=text;};
 const node=(tag,cls,text)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;};
 function button(text,action,extra={}){const el=node('button','social-action',text);el.type='button';el.dataset.action=action;Object.assign(el.dataset,extra);return el;}
 function profile(name){const b=button(name,'profile',{name});b.className='social-name';return b;}
 function group(title,empty){const section=node('section','social-group');section.append(node('h3','social-group-title',title));const list=node('div','social-list');section.append(list);if(empty)list.append(node('p','social-empty',empty));return {section,list};}
 function row(name,meta,actions=[]){const el=node('div','social-row'),main=node('div','social-row-main');main.append(profile(name));if(meta)main.append(node('span','social-meta',meta));el.append(main);if(actions.length){const buttons=node('div','social-actions');buttons.append(...actions);el.append(buttons)}return el;}
 const actionsFor=p=>p.state==='none'?[button('Добавить','friend_request',{name:p.username})]:p.state==='incoming'?[button('Принять','friend_accept',{name:p.username}),button('Отклонить','friend_remove',{name:p.username})]:p.state==='outgoing'?[button('Отменить','friend_remove',{name:p.username})]:[button('Удалить','friend_remove',{name:p.username,confirm:'Удалить из друзей?'})];
 function renderFriends(){
  const target=$('#social-friend-list'),results=$('#social-results');target.replaceChildren();results.replaceChildren();if(!friendsLoaded)return;
  const q=$('#social-player-search').value.trim();results.hidden=q.length<2||q!==lastPlayerQuery;
  if(!results.hidden){const g=group('Результаты',data.players.length?'':'Игроки не найдены.');for(const p of data.players)g.list.append(row(p.username,({friend:'В друзьях',incoming:'Входящая заявка',outgoing:'Заявка отправлена'})[p.state],actionsFor(p)));results.append(g.section)}
  for(const [state,title,empty] of [['incoming','Входящие заявки',''],['outgoing','Отправленные заявки',''],['friend','Мои друзья','Пока нет друзей.']]){const people=data.friends.filter(p=>p.state===state);if(state!=='friend'&&!people.length)continue;const g=group(title,people.length?'':empty);for(const p of people)g.list.append(row(p.username,null,actionsFor(p)));target.append(g.section)}
 }
 function renderClans(){
  const target=$('#social-clan-list');target.replaceChildren();if(!clansLoaded)return;
  const query=$('#social-clan-search').value.trim();if(query!==lastClanQuery)return;
  const g=group('Рейтинг кланов',data.clans.length?'':'Кланы не найдены.');
  data.clans.forEach((c,i)=>{const el=node('div','social-row');el.append(node('span','social-rank',query?'·':String(i+1)));const main=node('div','social-row-main'),name=button(c.name,'detail',{clan:c.id});name.className='social-name';main.append(name,node('span','social-meta',`${c.members} участн. · ${c.open?'Открытый':'По заявке'}${c.id===data.my_clan?' · Твой клан':''}`));el.append(main,node('span','social-score',c.rating==null?'—':`${c.rating} ЯР`));g.list.append(el)});
  target.append(g.section);
 }
 function render(){renderFriends();renderClans();const inClans=page==='clans';$('#social-create').hidden=!inClans||!clansLoaded||!!data.my_clan;$('#social-my-clan').hidden=!inClans||!data?.my_clan;}
 function setPage(value){page=value;const friends=page==='friends';$('.social-friends').hidden=!friends;$('.social-clans').hidden=friends;const h=$('#page-social-title');h.replaceChildren(doc.createTextNode(friends?'Друзья':'Кланы'),node('span','','.'));render();}
 function message(error){const s=error?.message||'';if(error?.code==='23505')return 'Это название уже занято.';if(/already_in_clan/.test(s))return 'Игрок уже состоит в клане.';if(/clan_full/.test(s))return 'В клане уже 100 участников.';if(/owner_cannot_leave/.test(s))return 'Перед выходом передай руководство или распусти клан.';if(/player_not_found|request_not_found|not_member|clan_not_found/.test(s))return 'Данные изменились. Обнови страницу и попробуй ещё раз.';if(/not_owner|unauthorized/.test(s))return 'Недостаточно прав для этого действия.';if(/request_limit/.test(s))return 'Слишком много исходящих заявок.';if(/friend_exists/.test(s))return 'Заявка уже существует.';if(/invalid_clan/.test(s))return 'Проверь название и описание клана.';return 'Не удалось выполнить действие. Проверь соединение и попробуй ещё раз.';}
 async function refresh({quiet=false}={}){
  const at=++sequence, section=page, input=section==='friends'?$('#social-player-search'):$('#social-clan-search'), query=input.value.trim();if(!quiet)say('Загрузка…');
  try{const rpc=section==='friends'?'social_friends_snapshot':'social_clans_snapshot';const {data:result,error}=await client.rpc(rpc,{p_search:query});if(error)throw error;
   if(!visible||destroyed||at!==sequence||section!==page||query!==input.value.trim())return false;
   data={...data,...result};if(section==='friends'){friendsLoaded=true;lastPlayerQuery=query}else{clansLoaded=true;lastClanQuery=query}render();say('');return true;
  }catch(err){if(visible&&!destroyed&&at===sequence)say(message(err));return false;}
 }
 async function openDetail(id){
  const at=++detailSequence, life=lifecycle;detail=null;$('#social-dialog-title').textContent='Клан';content.replaceChildren();say('Загрузка…');if(!dialog.open)dialog.showModal();
  try{const {data:result,error}=await client.rpc('social_clan_detail',{p_clan:id});if(error||!result)throw error||Error('clan_not_found');if(!visible||destroyed||life!==lifecycle||at!==detailSequence||!dialog.open)return;detail=result;renderDetail();say('');}
  catch(err){if(visible&&life===lifecycle&&at===detailSequence&&dialog.open)say(message(err));}
 }
 function renderDetail(){if(!detail)return;const c=detail;$('#social-dialog-title').textContent=c.name;content.replaceChildren();if(c.description)content.append(node('p','',c.description));content.append(node('p','social-note',`${c.open?'Открытый клан':'По заявке'} · Глава: ${c.owner}`));const controls=node('div','social-dialog-actions');
  if(c.is_owner)controls.append(button('Настройки','edit'),button('Распустить клан','clan_delete',{clan:c.id,confirm:'Распустить клан? Это действие нельзя отменить.'}));
  else if(c.is_member)controls.append(button('Покинуть клан','clan_leave',{clan:c.id,confirm:'Покинуть клан?'}));
  else if(!data?.my_clan)controls.append(c.requested?button('Отменить заявку','clan_cancel',{clan:c.id}):button(c.open?'Вступить':'Отправить заявку','clan_join',{clan:c.id}));
  content.append(controls);
  if(c.is_owner&&c.requests.length){const g=group('Заявки');for(const p of c.requests)g.list.append(row(p.username,null,[button('Принять','clan_accept',{name:p.username,clan:c.id}),button('Отклонить','clan_reject',{name:p.username,clan:c.id})]));content.append(g.section)}
  const g=group(`Участники · ${c.members.length}`);for(const p of c.members){const actions=c.is_owner&&!p.owner?[button('Передать главу','clan_transfer',{name:p.username,clan:c.id,confirm:`Передать руководство игроку ${p.username}?`}),button('Исключить','clan_kick',{name:p.username,clan:c.id,confirm:`Исключить ${p.username} из клана?`})]:[];g.list.append(row(p.username,`${p.owner?'Глава · ':''}${p.rating==null?'Без общего рейтинга':`${p.rating} ЯР`}`,actions))}content.append(g.section);
 }
 function field(form,labelText,tag,name,value,attrs={}){const label=node('label','',labelText),input=node(tag);input.name=name;Object.assign(input,attrs);input.value=value;label.append(input);form.append(label);return input;}
 function showEditor(existing=null){$('#social-dialog-title').textContent=existing?'Настройки клана':'Новый клан';content.replaceChildren();say('');const form=node('form','social-form');form.id='social-clan-form';field(form,'Название','input','name',existing?.name||'',{required:true,minLength:3,maxLength:40});field(form,'Описание','textarea','description',existing?.description||'',{maxLength:300});const label=node('label','','Вступление'),select=node('select');select.name='open';for(const [v,t] of [['true','Открытый'],['false','По заявке']]){const option=node('option','',t);option.value=v;select.append(option)}select.value=String(existing?.open??true);label.append(select);form.append(label);const submit=node('button','social-primary',existing?'Сохранить':'Создать');submit.type='submit';form.append(submit);content.append(form);if(!dialog.open)dialog.showModal();}
 function setBusy(busy){root.setAttribute('aria-busy',String(busy));for(const el of root.querySelectorAll('[data-action]:not([data-action=profile]):not([data-action=detail]):not([data-action=edit]),#social-create,#social-my-clan,#social-clan-form button[type=submit]'))el.disabled=busy;}
 async function action(type,opts={}){
  if(acting)return;if(opts.confirm&&!win.confirm(opts.confirm))return;acting=true;const life=lifecycle;setBusy(true);say('Сохраняем…');
  try{const {error}=await client.rpc('social_action',{p_action:type,p_name:opts.name||null,p_clan:opts.clan||null,p_description:opts.description??null,p_open:opts.open??null});if(error)throw error;
   if(!visible||destroyed||life!==lifecycle)return;const previous=detail?.id;const refreshed=await refresh({quiet:true});if(!visible||life!==lifecycle)return;
   if(!refreshed){say('Сохранено. Не удалось обновить список.');return;}
   if(type==='clan_create'){if(data?.my_clan)await openDetail(data.my_clan);else dialog.close()}
   else if(type==='clan_delete'){detail=null;dialog.close()}
   else if(previous&&dialog.open&&!type.startsWith('friend_'))await openDetail(previous);
   if(visible&&life===lifecycle)say('');
  }catch(err){if(visible&&!destroyed&&life===lifecycle)say(message(err));}
  finally{acting=false;setBusy(false);if(visible&&life!==lifecycle)void refresh({quiet:true});}
 }
 root.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;const a=btn.dataset.action;if(!a)return;if(a==='profile'){if(dialog.open)dialog.close();onOpenProfile(btn.dataset.name);return}if(a==='detail'){if(!acting)void openDetail(btn.dataset.clan);return}if(a==='edit'){if(!acting)showEditor(detail);return}void action(a,btn.dataset);});
 function scheduleSearch(){clearTimeout(searchTimer);sequence++;render();if(acting)return;if(page==='friends'&&friendsLoaded&&$('#social-player-search').value.trim().length<2){say('');return;}searchTimer=setTimeout(()=>void refresh({quiet:true}),200);}
 $('#social-search').addEventListener('submit',e=>{e.preventDefault();clearTimeout(searchTimer);if(!acting)void refresh();});
 $('#social-player-search').addEventListener('input',scheduleSearch);$('#social-clan-search').addEventListener('input',scheduleSearch);
 $('#social-create').addEventListener('click',()=>{if(!acting)showEditor()});$('#social-my-clan').addEventListener('click',()=>{if(!acting&&data?.my_clan)void openDetail(data.my_clan)});$('#social-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{detailSequence++;detail=null;$('#social-dialog-status').textContent=''});
 content.addEventListener('submit',e=>{if(e.target.id!=='social-clan-form')return;e.preventDefault();const f=new win.FormData(e.target);void action(detail?'clan_edit':'clan_create',{clan:detail?.id,name:String(f.get('name')).trim(),description:String(f.get('description')).trim(),open:f.get('open')==='true'});});
 return {show(name){visible=true;setPage(name==='friends'?'friends':'clans');void refresh({quiet:page==='friends'?friendsLoaded:clansLoaded});if(!timer)timer=win.setInterval(()=>{if(visible&&!dialog.open&&!acting&&doc.activeElement!==$('#social-player-search')&&doc.activeElement!==$('#social-clan-search'))void refresh({quiet:true})},30000)},hide(){visible=false;lifecycle++;sequence++;detailSequence++;if(timer)win.clearInterval(timer);timer=null;clearTimeout(searchTimer);if(dialog.open)dialog.close()},destroy(){this.hide();destroyed=true}};
}
