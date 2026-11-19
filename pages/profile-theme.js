// Local, scoped variables: viewing somebody never changes the viewer's settings.
const palettes={
 monochrome:['#fff','#000','#fff','#999','#f5f5f5'], gray:['#f8f9fa','#212529','#e9ecef','#6c757d','#dee2e6'], forest:['#f8f6f0','#26362e','#eeeed2','#769656','#eeeed2'], atelier:['#f6f1e7','#26343b','#e9dcc7','#6f858a','#e9dcc7'], wood:['#ede0d4','#7f5539','#e6ccb2','#b08968','#ddb892'], earth:['#dad7cd','#344e41','#a3b18a','#588157','#a3b18a'], ocean:['#eff6e0','#01161e','#aec3b0','#598392','#aec3b0'], amber:['#ffe6a7','#432818','#bb9457','#99582a','#bb9457'], lavender:['#f2e9e4','#22223b','#c9ada7','#9a8c98','#c9ada7'], sand:['#c2c5aa','#333d29','#a68a64','#936639','#a68a64']
};
const raisedDark={monochrome:'#000',gray:'#495057',forest:'#3d5a40',atelier:'#314f58',wood:'#9c6644',earth:'#3a5a40',ocean:'#124559',amber:'#6f1d1b',lavender:'#4a4e69',sand:'#582f0e'};
export const paletteNames={monochrome:'Монохром',gray:'Графит',forest:'Лес',atelier:'Шахматный кабинет',wood:'Тёплое дерево',earth:'Сосновый бор',ocean:'Морская глубина',amber:'Янтарь',lavender:'Лаванда',sand:'Песчаный'};
export function applyProfileTheme(el,palette,theme){
 const name=palettes[palette]?palette:'monochrome', [light,dark,raised,line,boardLight]=palettes[name], isDark=theme==='dark';
 const bg=isDark?dark:light, fg=isDark?light:dark, surface=isDark?raisedDark[name]:light, rail=isDark?raisedDark[name]:raised;
 for(const [key,value] of Object.entries({'--page-background':bg,'--foreground':fg,'--surface':surface,'--surface-raised':rail,'--line':line,'--board-light':boardLight,'--board-dark':line,'--ink':fg,'--accent':fg,'--accent-ink':bg})) el.style.setProperty(key,value);
 el.style.color=fg; el.style.backgroundColor=bg; el.dataset.profilePalette=name; el.dataset.profileTheme=isDark?'dark':'light';
}
export function clearProfileTheme(el){for(const key of ['--page-background','--foreground','--surface','--surface-raised','--line','--board-light','--board-dark','--ink','--accent','--accent-ink']) el.style.removeProperty(key);el.style.removeProperty('color');el.style.removeProperty('background-color');delete el.dataset.profilePalette;delete el.dataset.profileTheme;}
export function profileAvatarColor(palette){return (palettes[palette]||palettes.monochrome)[3];}
export const isProfileImage=value=>typeof value==='string' && /^data:image\/(?:png|jpeg);base64,/.test(value);
