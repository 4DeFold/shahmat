const DEFAULT_AVATAR='/pieces/cburnett/wN.svg';
const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1});

// Crop avatars centrally; preserve the banner's aspect ratio while fitting its
// width and a generous height bound. Never send the original full-size file.
export async function prepareProfileImage(file,kind,doc=document) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Выбери изображение PNG, JPEG или WebP.');
  if (file.size>10_000_000) throw new Error('Файл слишком большой: максимум 10 МБ.');
  const url=URL.createObjectURL(file), img=new Image();
  try {
    img.src=url; try { await img.decode(); } catch { throw new Error('Не удалось прочитать изображение.'); }
    const w=img.naturalWidth,h=img.naturalHeight;
    if (!w || !h || w*h>40_000_000) throw new Error('Изображение слишком большое.');
    const canvas=doc.createElement('canvas'), ctx=canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось обработать изображение.');
    if(kind==='avatar') { const side=Math.min(w,h); canvas.width=100; canvas.height=100; ctx.drawImage(img,(w-side)/2,(h-side)/2,side,side,0,0,100,100); }
    else { const scale=Math.min(1,600/w,1200/h); canvas.width=Math.max(1,Math.round(w*scale)); canvas.height=Math.max(1,Math.round(h*scale)); ctx.drawImage(img,0,0,canvas.width,canvas.height); }
    const result=canvas.toDataURL('image/png');
    if(result.length>(kind==='avatar'?160022:2666690)) throw new Error('Изображение слишком большое после обработки.');
    return result;
  } finally { URL.revokeObjectURL(url); }
}

export function createProfileView(root,client,{onSaved=()=>{},onLoaded=()=>{}}={}) {
  const $=id=>root.querySelector(`#${id}`), controls=['profile-save','profile-discard','profile-edit-button'];
  let user=null, userId=null, media={avatar:null,banner:null}, draft=null, busy=false, destroyed=false, epoch=0, imageJobs=0, pendingSave=null; const imageSequence={avatar:0,banner:0};
  const say=text=>{ $('profile-edit-status').textContent=text||''; };
  function paint(current) {
    const avatar=$('profile-avatar-image'), banner=$('profile-banner-image');
    avatar.src=current.avatar||DEFAULT_AVATAR; avatar.classList.toggle('profile-custom-avatar',!!current.avatar);
    if(current.banner) { banner.src=current.banner; banner.hidden=false; } else { banner.hidden=true; banner.removeAttribute('src'); }
  }
  function setEditing(value) {
    root.classList.toggle('is-editing',value);
    for(const id of ['profile-edit-name','profile-edit-bio','profile-edit-actions']) $(id).hidden=!value;
    for(const el of root.querySelectorAll('.profile-upload-overlay')) el.hidden=!value;
    for(const id of ['profile-display-name','profile-display-bio','profile-edit-button']) $(id).hidden=value;
    for(const id of ['profile-avatar-file','profile-banner-file']) $(id).disabled=!value;
  }
  function display(p) { $('profile-display-name').textContent=p?.username||'—'; $('profile-display-bio').textContent=p?.bio?.trim()||'Био пока нет.'; }
  function setBusy(value) { busy=value; for(const id of controls) $(id).disabled=value; }
  const edit=()=>{ if(!user||busy)return; draft={...media}; $('profile-edit-name').value=user.username||''; $('profile-edit-bio').value=user.bio||''; setEditing(true); say(''); $('profile-edit-name').focus(); };
  const discard=()=>{ if(busy)return; epoch++; imageJobs=0; draft=null; paint(media); setEditing(false); say(''); };
  async function imageChange(event) {
    const file=event.currentTarget.files?.[0], kind=event.currentTarget.id==='profile-avatar-file'?'avatar':'banner'; event.currentTarget.value='';
    if(!file||!draft)return;
    const request=epoch, imageRequest=++imageSequence[kind]; imageJobs++; setBusy(true); say('Обрабатываем изображение…');
    try { const image=await prepareProfileImage(file,kind,root.ownerDocument); if(!destroyed&&request===epoch&&draft&&imageRequest===imageSequence[kind]){draft[kind]=image;paint(draft);say('');} }
    catch(error) { if(request===epoch) say(error.message||'Не удалось прочитать изображение.'); }
    finally { if(request===epoch) { imageJobs--; if(imageJobs===0) setBusy(false); } }
  }
  async function save() {
    if(busy||!draft||!user)return;
    const username=$('profile-edit-name').value.trim(),bio=$('profile-edit-bio').value.trim();
    if(!/^[A-Za-z0-9_]{3,24}$/.test(username)) { say('Ник: от 3 до 24 латинских букв, цифр или подчёркиваний.'); return; }
    if(bio.length>280) { say('Био: максимум 280 символов.'); return; }
    const request=epoch; setBusy(true); say('Сохраняем…');
    try {
      const {error}=await client.rpc('profile_save',{p_username:username,p_bio:bio,p_avatar:draft.avatar,p_banner:draft.banner});
      if(error)throw error;
      if(destroyed||request!==epoch)return;
      user={...user,username,bio}; media={...draft}; draft=null; display(user); paint(media); setEditing(false); say('Профиль сохранён.'); onSaved(user,media);
    } catch(error) { if(!destroyed&&request===epoch) say(/username_change_cooldown/.test(error?.message||'')?'Ник можно менять только раз в 7 дней.':error?.code==='23505'?'Этот ник уже занят.':'Не удалось сохранить профиль. Попробуй ещё раз.'); }
    finally { if(request===epoch&&!destroyed)setBusy(false); }
  }
  $('profile-edit-button').addEventListener('click',edit); $('profile-discard').addEventListener('click',discard); $('profile-save').addEventListener('click',()=>{ if(!pendingSave) { pendingSave=save().finally(()=>{pendingSave=null;}); } });
  $('profile-avatar-file').addEventListener('change',imageChange); $('profile-banner-file').addEventListener('change',imageChange); setEditing(false);
  const view = {
    async show(profile,id) {
      if(!profile||!id||destroyed)return; userId=id; $('profile-retry').hidden=true; const request=++epoch; user=profile; media={avatar:null,banner:null}; draft=null; imageJobs=0; setBusy(true); setEditing(false); display(profile); paint(media); say('');
      $('profile-yar').textContent='—'; $('profile-games').textContent='—';
      try {
        if(pendingSave) await pendingSave;
        if(destroyed||request!==epoch)return;
        const [fresh,m,rank,stats]=await Promise.all([client.from('profiles').select('username,bio,palette').eq('id',id).maybeSingle(),client.from('profile_media').select('avatar,banner').eq('user_id',id).maybeSingle(),client.rpc('rank_my_position',{p_mode:'overall'}),client.rpc('profile_my_stats')]);
        if(destroyed||request!==epoch)return;
        if(m.error || fresh.error || !fresh.data) throw m.error || fresh.error || new Error('profile missing');
        user=fresh.data; display(user); onLoaded(user); media={avatar:m.data?.avatar||null,banner:m.data?.banner||null}; paint(media);
        if(!rank.error&&rank.data?.[0]?.yar!=null) $('profile-yar').textContent=number.format(rank.data[0].yar);
        if(!stats.error&&stats.data?.[0]?.games!=null) $('profile-games').textContent=number.format(stats.data[0].games);
        setBusy(false);
      } catch { if(!destroyed&&request===epoch) { say('Не удалось загрузить данные профиля.'); $('profile-retry').hidden=false; } }
    },
    hide() { if(draft&&!busy) discard(); },
    destroy() { destroyed=true; epoch++; },
  };
  $('profile-retry').addEventListener('click',()=>{ if(user) void view.show(user, userId); });
  return view;
}
