/* Savanna Freedom Online — browser client. All multiplayer state is verified by server. */
import {SoundDirector} from './audio.js';
import {cameraRelativeVector,smoothInputVelocity,reconcilePredictedPosition,smoothHeading} from './movement.mjs';
import {describeQuest,questDistance,questBearing} from './quest.mjs';
const $=id=>document.getElementById(id);
const S=window.SF,T=window.THREE,CFG=window.SF_CONFIG||{};
const sound=new SoundDirector();
const DEFAULT_PREFS={quality:'medium',renderScale:1,shadows:true,fpsLimit:0,cameraDistance:14,sensitivity:1,invertY:false,showFps:false,reducedEffects:false,pvp:false};
let storedPrefs={};try{storedPrefs=JSON.parse(localStorage.getItem('sf_game_settings')||'{}')}catch{}
const prefs={...DEFAULT_PREFS,...storedPrefs};
const savePrefs=()=>localStorage.setItem('sf_game_settings',JSON.stringify(prefs));
const data={session:null,profile:null,species:[],owned:[],wallet:0,ledger:[],quests:[],friends:[],inventory:[],items:{},shops:{},hunger:100,selectedShop:null,sessionInvites:[],roomMembers:[],clan:null,party:null,partyInvites:[],activePanel:null,selectedFriend:null,directRows:[],directLoadedFor:null,room:null,me:null,playerObjects:new Map(),npcObjects:new Map(),resources:new Map(),serverQuest:null,questAim:null,ws:null,connecting:false,retry:0,desiredRoom:null,onboardIndex:0,view:'menu',quality:prefs.quality,pvp:prefs.pvp,wanted:0,roomWeather:0,abilityReady:true};
addEventListener('pointerdown',()=>sound.start(),{once:true});
const STARTERS=['lion','hyena','zebra','gazelle','warthog','monkey'];
const COATS=[['Песочный','#d5a453'],['Медный','#c58a4b'],['Сухая трава','#b7a18a'],['Тёмная охра','#97816a'],['Пепельный','#96908b'],['Светлый','#e4dfce'],['Угольный','#6a5946'],['Золотистый','#d8b075']];
const TIPS=[
  'Здесь всё начинается с твоих лап. Двигайся клавишами WASD, беги с Shift, а пробелом перепрыгивай препятствия. На ПК щёлкни по земле, чтобы закрепить курсор и управлять камерой мышью. Esc — освободить мышь. На телефоне есть кнопки на экране.',
  'Заглядывай за холмы и к водопою. Растения и древние следы можно собирать клавишей E. За это дают настоящие Claws на сервере.',
  'Опасные гиены охраняют свои тропы. Подойди и атакуй левой кнопкой мыши. Вблизи Скалы Прайда и лагеря новичков драться с игроками нельзя.',
  'В меню открой поручения от Кайона, Фули и Рафики. Если встретишь их лично, нажми R и поговори. Claws можно потратить на животных и развитие. Друзей приглашай через личную сессию.'
];
const NPCS=[['kion','Кайон','lion',-45,0],['fuli','Фули','cheetah',-17,26],['jasiri','Джазири','hyena',146,-105],['simba','Симба','lion',-105,-88],['nala','Нала','lion',-92,-85],['kiara','Киара','lion',-91,-66],['bunga','Банга','badger',-40,15],['beshte','Бешти','hippo',70,47],['ono','Оно','bird',-40,-7],['anga','Анга','bird',-155,-150],['rafiki','Рафики','monkey',-102,91],['makini','Макини','monkey',-93,98],['zazu','Зазу','bird',-109,-78],['timon','Тимон','monkey',24,64],['pumbaa','Пумба','warthog',26,70],['janja','Джанджа','hyena',254,-144],['cheezi','Чизи','hyena',262,-157],['chungu','Чунгу','hyena',267,-148],['shop-camp','Ньота · Припасы','gazelle',-61,50],['shop-water','Бахати · Водопой','monkey',82,41],['shop-tree','Макини · Травница','monkey',-82,105]];
const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fmt=n=>Number(n||0).toLocaleString('ru-RU');
const notify=(message,seconds=4)=>{const node=document.createElement('div');node.className='toast';node.textContent=message;$('toastHolder').prepend(node);setTimeout(()=>node.remove(),seconds*1000)};
function connection(state,message){$('connectionDot').parentElement.className='connection '+state;$('connectionText').textContent=message}
function show(id){
 if(id!=='hud'&&data.view==='hud'){
  if(data.room&&data.ws?.readyState===WebSocket.OPEN)data.ws.send(JSON.stringify({type:'stop_input'}));
  keys.clear();mobile.clear();resetTouchMove();jumpQueued=false;
  $('mobileSprint').classList.remove('is-active');$('mobileSprint').setAttribute('aria-pressed','false');
 }
 for(const k of ['menu','authScreen','resetScreen','creator','panel','hud'])$(k).classList.toggle('hidden',k!==id);
 data.view=id;if(id!=='hud'&&document.pointerLockElement)document.exitPointerLock();
}
function setPanel(title,kicker,html){$('panelTitle').textContent=title;$('panelKicker').textContent=kicker;$('panelContent').innerHTML=html;show('panel')}
function resumeView(){show(data.room?'hud':'menu');if(data.room)document.body.classList.add('ingame');else document.body.classList.remove('ingame');}
const rgbToInt=hex=>Number.parseInt(hex.replace('#',''),16);
const speciesByCode=code=>data.species.find(s=>s.code===code);

// Hosted Supabase Auth uses its documented GoTrue endpoints. No service-role
// key, arbitrary SQL calls, or authority-bearing user metadata in the browser.
class Auth {
 static configured(){return /^https:\/\/[\w-]+\.supabase\.co$/.test(CFG.supabaseUrl||'')&&String(CFG.supabasePublishableKey||'').length>15}
 static endpoint(path){return CFG.supabaseUrl+'/auth/v1/'+path}
 static async call(path,method='POST',body,token){
  const response=await fetch(this.endpoint(path),{method,headers:{apikey:CFG.supabasePublishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const value=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(value.msg||value.error_description||value.message||value.error||'Ошибка авторизации');
  return value;
 }
 static save(session){data.session=session;try{localStorage.setItem('sf_auth_session',JSON.stringify(session))}catch{} }
 static async restore(){
  const raw=localStorage.getItem('sf_auth_session');if(!raw)return false;
  try{
   const value=JSON.parse(raw);
   if(!value.refresh_token)return false;
   if(Date.now()/1000>Number(value.expires_at||0)-90){const fresh=await this.call('token?grant_type=refresh_token','POST',{refresh_token:value.refresh_token});this.save({...fresh,expires_at:Math.floor(Date.now()/1000)+fresh.expires_in});}
   else this.save(value);
   return true;
  }catch{localStorage.removeItem('sf_auth_session');return false}
 }
 static async token(){
  if(!data.session)throw Error('Войди в аккаунт.');
  if(Date.now()/1000>Number(data.session.expires_at||0)-60){const v=await this.call('token?grant_type=refresh_token','POST',{refresh_token:data.session.refresh_token});this.save({...v,expires_at:Math.floor(Date.now()/1000)+v.expires_in});}
  return data.session.access_token;
 }
 static async submit(email,password,mode){
  const redirect=encodeURIComponent(location.origin+location.pathname);
  if(mode==='recovery'){await this.call('recover?redirect_to='+redirect,'POST',{email});notify('Если почта привязана к аккаунту, ссылка для восстановления придёт туда.',8);return}
  if(mode==='signup'){
   const value=await this.call('signup?redirect_to='+redirect,'POST',{email,password});
   if(!value.access_token){notify('Проверь почту и подтверди адрес, затем войди.',8);return}
   this.save({...value,expires_at:Math.floor(Date.now()/1000)+value.expires_in});connect();return;
  }
  const v=await this.call('token?grant_type=password','POST',{email,password});
  this.save({...v,expires_at:Math.floor(Date.now()/1000)+v.expires_in});connect();
 }
 static async logout(){
  try{if(data.session)await this.call('logout','POST',null,data.session.access_token)}catch{}
  data.session=null;localStorage.removeItem('sf_auth_session');data.desiredRoom=null;
  data.ws?.close();data.ws=null;data.room=null;data.profile=null;data.me=null;data.party=null;data.partyInvites=[];data.sessionInvites=[];data.inventory=[];data.selectedFriend=null;data.directRows=[];scene.clearDynamic();
  show('authScreen');connection('offline','Не в сети');$('signoutButton').classList.add('hidden');
 }
}

let authMode='login';
for(const btn of document.querySelectorAll('[data-auth]'))btn.addEventListener('click',()=>{
 authMode=btn.dataset.auth;document.querySelectorAll('[data-auth]').forEach(b=>b.classList.toggle('selected',b===btn));
 $('passwordLabel').classList.toggle('hidden',authMode==='recovery');$('authPassword').required=authMode!=='recovery';$('authPassword').autocomplete=authMode==='signup'?'new-password':'current-password';
 $('authSubmit').textContent={login:'Войти',signup:'Создать аккаунт',recovery:'Отправить ссылку'}[authMode];$('authError').textContent='';
});
$('authForm').addEventListener('submit',async event=>{
 event.preventDefault();$('authError').textContent='';$('authSubmit').disabled=true;
 try{if(!Auth.configured())throw Error('Supabase пока не подключён. Укажи URL и publishable key в config.js.');await Auth.submit($('authEmail').value.trim(),$('authPassword').value,authMode)}
 catch(e){$('authError').textContent=e.message}finally{$('authSubmit').disabled=false}
});
$('resetForm').addEventListener('submit',async event=>{
 event.preventDefault();$('resetError').textContent='';$('resetSubmit').disabled=true;
 try{await Auth.call('user','PUT',{password:$('resetPassword').value},await Auth.token());notify('Пароль обновлён. Добро пожаловать обратно.',6);connect()}
 catch(e){$('resetError').textContent=e.message}finally{$('resetSubmit').disabled=false}
});
$('signoutButton').addEventListener('click',()=>Auth.logout());
$('menuSignout').addEventListener('click',()=>Auth.logout());
let deferredInstall=null;
const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function updateInstallButton(){const button=$('installApp');button.classList.toggle('hidden',installed());button.textContent=deferredInstall?'Установить приложение':'Как установить приложение';}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;updateInstallButton()});
addEventListener('appinstalled',()=>{deferredInstall=null;updateInstallButton();notify('Приложение установлено.')});
$('installApp').onclick=async()=>{
 if(deferredInstall){const prompt=deferredInstall;deferredInstall=null;await prompt.prompt();await prompt.userChoice;updateInstallButton();return;}
 notify(/iphone|ipad|ipod/i.test(navigator.userAgent)?'На iPhone: «Поделиться» → «На экран Домой».':'В Chrome или Edge открой меню браузера и выбери «Установить приложение» или «Добавить на главный экран».',9);
};
updateInstallButton();
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('PWA:',error.message)));

function send(obj){if(data.ws?.readyState===WebSocket.OPEN){data.ws.send(JSON.stringify(obj));return true}notify('Связь с сервером отсутствует.');return false}
async function connect(){
 if(!data.session||data.connecting)return;
 data.connecting=true;connection('','Подключаемся…');
 try{
  const token=await Auth.token();const ws=new WebSocket(CFG.gameWebSocketUrl);data.ws=ws;
  ws.onopen=()=>{data.retry=0;data.connecting=false;connection('online','Авторизация…');ws.send(JSON.stringify({type:'auth',token}));};
  ws.onmessage=event=>{let msg;try{msg=JSON.parse(event.data)}catch{return}handleMessage(msg)};
  ws.onclose=event=>{
   if(data.ws!==ws)return;data.connecting=false;connection('offline','Сервер недоступен');
   if(data.session){const wait=Math.min(15000,1200*2**Math.min(data.retry++,4));notify('Соединение потеряно. Повторяем через '+Math.round(wait/1000)+' с.',2);setTimeout(()=>connect(),wait)}
  };
  ws.onerror=()=>{data.connecting=false};
 }catch(e){data.connecting=false;connection('offline','Ошибка авторизации');notify(e.message)}
}
function handleMessage(m){
 switch(m.type){
  case 'hello':data.species=m.species||[];data.profile=m.profile;data.shops=m.shops||{};data.items=m.items||{};
   connection('online','На связи');$('signoutButton').classList.remove('hidden');
   if(!data.profile){createStarterCards();show('creator')}else {show('menu');if(data.desiredRoom)send(data.desiredRoom);updateMenu();}break;
  case 'account':data.profile=m.profile;data.wallet=Number(m.wallet||0);data.owned=m.owned||[];data.ledger=m.ledger||[];data.quests=m.quests||[];data.friends=m.friends||[];data.inventory=m.inventory||[];data.clan=m.clan||null;updateMenu();if(data.view==='creator'&&data.profile)show('menu');else if(data.view==='panel'&&['animals','appearance','history','friends','clan','quests','inventory','shop','session'].includes(data.activePanel))openPanel(data.activePanel);break;
  case 'joined':hideDeathScreen();data.room=m.room;data.me=m.you;data.party=null;data.partyInvites=[];data.roomMembers=[];data.serverQuest=null;data.desiredRoom=m.room.code?{type:'join',code:m.room.code}:{type:'join'};data.resources=new Map(m.resources.map(r=>[r.id,r]));data.serverQuests=m.quests;data.shops=m.shops||{};data.items=m.items||{};scene.syncResources();scene.resetCamera();show('hud');updateObjective();document.body.classList.add('ingame');$('chatChannel').value='session';$('chatHistory').replaceChildren();if(matchMedia('(pointer: coarse)').matches){$('chatBox').classList.add('chat-collapsed');$('chatToggle').textContent='Чат'}if(data.pvp)send({type:'pvp',enabled:true});notify('Сессия: '+m.room.name+(m.room.code?' · Код '+m.room.code:''),6);
   if(!localStorage.getItem('sf_onboard_'+data.me))showOnboard();break;
  case 'snapshot':scene.handleSnapshot(m);break;
  case 'survival':data.hunger=m.hunger;updateHunger();break;
  case 'shop_open':data.selectedShop=m.shop;openPanel('shop');break;
  case 'session_invitation':data.sessionInvites=data.sessionInvites.filter(i=>i.code!==m.code);data.sessionInvites.push(m);notify(m.from+' зовёт в личную сессию. Приглашение в разделе «Личная сессия».',9);break;
  case 'session_members':data.roomMembers=m.members||[];if(data.view==='panel'&&data.activePanel==='session')openPanel('session');break;
  case 'session_updated':if(data.room){data.room.name=m.name;data.room.code=m.code;data.desiredRoom={type:'join',code:m.code};if(data.view==='panel'&&data.activePanel==='session')openPanel('session');}break;
  case 'session_kicked':data.room=null;data.desiredRoom=null;scene.clearDynamic();document.body.classList.remove('ingame');show('menu');notify(m.message,8);break;
  case 'hit':scene.hit(m);break;
  case 'resource':{const r=data.resources.get(m.id);if(r){r.readyAt=m.readyAt;const me=data.playerObjects.get(data.me);if(me&&S.dist(r,me)<9)sound.play('collect','effects',{volume:.48})}break}
  case 'quest_state':data.serverQuest=m.completed||m.abandoned?null:m;updateObjective();if(m.completed)notify('Поручение выполнено! Награда зачислена.',7);if(m.abandoned)notify('Поручение отменено. Можно взять другое.',5);break;
  case 'chat':if(m.channel==='private')receiveDirect(m);else if((m.channel||'session')===$('chatChannel').value)appendChat(m);break;
  case 'chat_history':if(m.channel===$('chatChannel').value){$('chatHistory').replaceChildren();for(const row of m.rows||[])appendChat(row)}break;
  case 'dm_history':if(data.selectedFriend?.id===m.with){data.directRows=m.rows||[];data.directLoadedFor=m.with;renderDirectHistory()}break;
  case 'reward':notify('+'+m.amount+' Claws · '+m.reason,5);sound.play('reward','interface',{volume:.5});data.wallet=m.balance;updateMenu();break;
  case 'ability':if(m.id===data.me){sound.play('dodge','effects',{volume:.7});notify(m.name)}break;
  case 'wanted':data.wanted=m.level;updateWanted();notify(m.message);break;
  case 'friend_session':data.desiredRoom=m.code?{type:'join',code:m.code}:{type:'join'};send(data.desiredRoom);notify('Входим в сессию друга…');break;
  case 'weather':data.roomWeather=m.index;scene.game.weather.index=m.index;break;
  case 'dialogue':showDialogue(m);break;
  case 'party_invitation':data.partyInvites.push({partyId:m.partyId,from:m.from});notify(m.from+' приглашает тебя в группу. Прими приглашение в разделе «Совместный дозор».',8);if(data.view==='panel'&&data.activePanel==='party')openPanel('party');break;
  case 'party_state':data.party=m.party;updateObjective();if(data.view==='panel'&&data.activePanel==='party')openPanel('party');break;
  case 'party_completed':sound.play('reward','interface',{volume:.9});notify('Группа завершила операцию «'+m.title+'»!',7);break;
  case 'departed':scene.removePlayer(m.id);break;
  case 'dead':showDeathScreen(m.seconds);break;
  case 'death_penalty':data.wallet=m.balance;updateMenu();$('deathLoss').textContent=m.amount?'Потеряно '+fmt(m.amount)+' Claws · 3,5% от баланса':'Claws не потеряны';break;
  case 'respawn':hideDeathScreen();scene.cameraFocus=null;notify('Ты вернулся у лагеря.');break;
  case 'notice':notify(m.message);break;
  case 'error':notify(m.message,6);break;
 }
}
function updateMenu(){
 $('balanceTop').textContent=fmt(data.wallet)+' Claws';$('menuNickname').textContent=data.profile?`${data.profile.nickname} · Уровень ${data.profile.level} · ${speciesByCode(data.profile.selected_species)?.title||''}`:'Твой зверь ждёт тебя';
}
function updateHunger(){
 const hunger=Math.max(0,Math.min(100,Number(data.hunger)||0));
 $('hungerText').textContent=Math.round(hunger)+'%';
 $('hungerBar').style.width=hunger+'%';
 $('hungerBar').parentElement.classList.toggle('is-starving',hunger<20);
}
function updateWanted(){const badge=$('wantedBadge');badge.classList.toggle('hidden',data.wanted===0);badge.textContent='Розыск · '+['','I','II','III','IV','V'][data.wanted||0];}
let dialogueTimer=null;
let deathTimer=null;
function showDeathScreen(seconds=5){
 if(deathTimer)clearInterval(deathTimer);
 const screen=$('deathScreen'),end=Date.now()+seconds*1000;
 $('deathLoss').textContent='Осталось дождаться возрождения…';
 screen.classList.remove('hidden');
 if(document.pointerLockElement)document.exitPointerLock();
 const update=()=>$('deathCount').textContent='Возрождение через '+Math.max(1,Math.ceil((end-Date.now())/1000))+' сек.';
 update();deathTimer=setInterval(update,200);
}
function hideDeathScreen(){if(deathTimer)clearInterval(deathTimer);deathTimer=null;$('deathScreen').classList.add('hidden')}
function closeDialogue(){clearInterval(dialogueTimer);dialogueTimer=null;$('dialogueBox').classList.add('hidden')}
function showDialogue(m){
 if(document.pointerLockElement)document.exitPointerLock();
 clearInterval(dialogueTimer);$('dialogueName').textContent=m.name||'Собеседник';$('dialogueText').textContent='';$('dialogueBox').classList.remove('hidden');
 const button=$('dialogueQuest'),cancel=$('dialogueAbandon');
 const active=data.serverQuest&&!data.serverQuest.completed&&!data.serverQuest.abandoned;
 button.classList.toggle('hidden',!m.quest||!!active);button.onclick=()=>{if(m.quest)send({type:'quest',id:m.quest});closeDialogue()};
 cancel.classList.toggle('hidden',!active||active.id!==m.contact);cancel.onclick=()=>{if(confirm('Отказаться от текущего поручения? Прогресс будет потерян.')){send({type:'quest_abandon'});closeDialogue()}};
 const message=String(m.text||'').slice(0,500);let index=0;
 dialogueTimer=setInterval(()=>{index=Math.min(message.length,index+2);$('dialogueText').textContent=message.slice(0,index);if(index===message.length){clearInterval(dialogueTimer);dialogueTimer=null}},28);
}
$('dialogueClose').onclick=closeDialogue;
function createStarterCards(){
 $('starterGrid').replaceChildren();const rows=data.species.filter(s=>STARTERS.includes(s.code));
 for(const s of rows){const card=document.createElement('button');card.className='animal-card'+(s.code==='lion'?' selected':'');card.dataset.species=s.code;card.innerHTML=`<small>${escapeHtml(s.role)}</small><h3>${escapeHtml(s.title)}</h3><small>Здоровье ${s.hp} · Скорость ${s.speed}</small><p>${escapeHtml(s.description)}</p>`;
 card.addEventListener('click',()=>{document.querySelectorAll('#starterGrid .animal-card').forEach(e=>e.classList.toggle('selected',e===card))});$('starterGrid').append(card);
 }
}
$('createPlayer').addEventListener('click',()=>{
 const nickname=$('createNickname').value.trim(),species=document.querySelector('#starterGrid .selected')?.dataset.species;
 if(!/^[a-zA-Zа-яА-ЯёЁ0-9_]{3,20}$/.test(nickname))return notify('Ник должен быть от 3 до 20 символов: буквы, цифры и _.');
 if(!species)return notify('Выбери животное.');send({type:'create_profile',nickname,species,color:rgbToInt($('createColor').value)});
});

for(const btn of document.querySelectorAll('[data-panel]'))btn.addEventListener('click',()=>openPanel(btn.dataset.panel));
$('closePanel').addEventListener('click',resumeView);
$('logo').addEventListener('click',()=>{if(data.room){send({type:'leave'});data.room=null;data.party=null;scene.clearDynamic();}show('menu')});
$('accountButton').addEventListener('click',()=>openPanel('history'));
$('hudMenu').addEventListener('click',()=>{if(data.room){show('menu');$('playPublic').textContent='Вернуться в саванну'}});
$('hudBag').addEventListener('click',()=>openPanel('inventory'));
$('playPublic').addEventListener('click',()=>{
 if(data.room){resumeView();return}data.desiredRoom={type:'join'};send(data.desiredRoom);
});
$('playPrivate').addEventListener('click',()=>{data.desiredRoom={type:'join',private:true};send(data.desiredRoom)});
$('joinByCode').addEventListener('click',()=>{const code=$('inviteCode').value.trim();if(!code)return notify('Введи код.');data.desiredRoom={type:'join',code};send(data.desiredRoom)});
function openPanel(kind){
 if(!data.profile){notify('Сначала создай персонажа.');return}
 data.activePanel=kind;
 const owned=new Set(data.owned.map(p=>p.species));
 if(kind==='inventory'){
  const bag=data.inventory.filter(row=>row.quantity>0);
  setPanel('Рюкзак','ЕДА / ТРАВЫ / ЗАПАСЫ',`<div class="inventory-summary"><div><span class="badge">ГОЛОД</span><h3>${Math.round(data.hunger)}%</h3><p>Еда утоляет голод. Во время бега он растёт быстрее. При полном истощении ты постепенно теряешь здоровье.</p></div><div><span class="badge">ПРИПАСЫ</span><h3>${bag.reduce((sum,row)=>sum+row.quantity,0)} шт.</h3><p>Собирай лечебные травы или покупай припасы у торговцев, отмеченных на карте.</p></div></div><div class="panel-grid">${bag.map(row=>{const item=data.items[row.item_code];return item?`<div class="item-card supply-card"><span class="badge">${item.category==='medicine'?'ЛЕКАРСТВО':'ЕДА'}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><p>${item.heal?'Лечит '+item.heal+' здоровья':'Сытость +'+item.hunger+'%'}</p><strong>В рюкзаке ${row.quantity}</strong><button class="primary" data-use-item="${item.code}">Использовать</button></div>`:''}).join('')||'<p class="muted">В рюкзаке пока пусто. Найди торговца или собери целебные травы.</p>'}</div><div class="setting-actions"><button id="bagMap" class="secondary">Торговцы на карте</button></div>`);
  for(const button of $('panelContent').querySelectorAll('[data-use-item]'))button.onclick=()=>send({type:'item_use',item:button.dataset.useItem});
  $('bagMap').onclick=()=>openPanel('map');
 }else if(kind==='shop'){
  const shop=data.shops[data.selectedShop];
  if(!shop)return openPanel('map');
  setPanel(shop.name,'ТОРГОВЕЦ / ПРИПАСЫ',`<p class="muted">${escapeHtml(shop.description)} Покупки списываются с твоего счёта на сервере. В кошельке ${fmt(data.wallet)} Claws.</p><div class="panel-grid">${shop.items.map(code=>{const item=data.items[code];if(!item)return '';return `<div class="item-card supply-card"><span class="badge">${item.category==='medicine'?'ЛЕЧЕНИЕ':'ЕДА'}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><p>${item.heal?'Здоровье +'+item.heal:'Голод +'+item.hunger+'%'}</p><strong>${item.price} Claws</strong><button class="primary" data-buy-item="${item.code}" ${data.wallet<item.price?'disabled':''}>Купить за ${item.price}</button></div>`}).join('')}</div><div class="setting-actions"><button class="secondary" id="openBagFromShop">Открыть рюкзак</button><button class="ghost" id="leaveShop">Вернуться</button></div>`);
  for(const button of $('panelContent').querySelectorAll('[data-buy-item]'))button.onclick=()=>send({type:'shop_buy',shop:data.selectedShop,item:button.dataset.buyItem});
  $('openBagFromShop').onclick=()=>openPanel('inventory');$('leaveShop').onclick=resumeView;
 }else if(kind==='session'){
  const room=data.room,owner=room?.visibility==='private'&&room.owner===data.me;
  const friends=data.friends.filter(f=>f.status==='accepted'&&f.other);
  const members=data.roomMembers.filter(p=>p.id!==data.me);
  const invites=data.sessionInvites;
  setPanel('Личная сессия','КОД / ДРУЗЬЯ / УПРАВЛЕНИЕ',`${invites.length?`<div class="item-card session-invites"><span class="badge">ПРИГЛАШЕНИЯ</span>${invites.map(i=>`<div class="panel-row"><div><strong>${escapeHtml(i.from)}</strong><small> зовёт в «${escapeHtml(i.name)}»</small></div><button class="primary" data-join-invite="${escapeHtml(i.code)}">Принять</button><button class="ghost" data-decline-invite="${escapeHtml(i.code)}">Скрыть</button></div>`).join('')}</div>`:''}${!room?'<div class="item-card"><h3>Ты ещё не в сессии</h3><p>Создай личную сессию в главном меню, затем пригласи друзей.</p></div>':room.visibility!=='private'?'<div class="item-card"><h3>Сейчас общая саванна</h3><p>Управление участниками доступно в собственной личной сессии. Вернись в меню и создай её.</p></div>':`<div class="item-card session-code"><span class="badge">${owner?'ТВОЯ ЛИЧНАЯ СЕССИЯ':'ЛИЧНАЯ СЕССИЯ ДРУГА'}</span><h3>${escapeHtml(room.name)}</h3><p>Поделись кодом, чтобы друзья смогли присоединиться.</p><div class="session-code-row"><code>${escapeHtml(room.code||'')}</code><button class="primary" id="copySessionCode">Скопировать код</button></div>${owner?'<button class="ghost" id="rotateSessionCode">Сменить код</button>':''}</div>${owner?`<div class="item-card"><h3>Управление</h3><p>Измени название и пригласи друзей, которые сейчас в сети.</p><div class="form-line"><input id="sessionName" value="${escapeHtml(room.name)}" maxlength="45" aria-label="Название личной сессии"><button id="renameSession" class="secondary">Сохранить</button></div></div>`:''}<h3 class="panel-section-title">Друзья</h3><div class="panel-list">${friends.map(f=>`<div class="panel-row"><strong>${escapeHtml(f.other.nickname)}</strong>${owner?`<button class="secondary" data-invite-friend="${escapeHtml(f.other.id)}">Пригласить</button>`:''}</div>`).join('')||'<p class="muted">Список друзей пока пуст. Найди игрока по нику и отправь заявку.</p>'}</div><button id="sessionFriends" class="secondary">Добавить друзей</button><h3 class="panel-section-title">Участники сессии</h3><div class="panel-list">${members.map(p=>`<div class="panel-row"><strong>${escapeHtml(p.nickname)}</strong>${owner?`<button class="ghost" data-kick-player="${escapeHtml(p.id)}">Исключить</button>`:''}</div>`).join('')||'<p class="muted">Других участников пока нет.</p>'}</div>`}`);
  for(const button of $('panelContent').querySelectorAll('[data-join-invite]'))button.onclick=()=>{const code=button.dataset.joinInvite;data.sessionInvites=data.sessionInvites.filter(i=>i.code!==code);data.desiredRoom={type:'join',code};send(data.desiredRoom)};
  for(const button of $('panelContent').querySelectorAll('[data-decline-invite]'))button.onclick=()=>{data.sessionInvites=data.sessionInvites.filter(i=>i.code!==button.dataset.declineInvite);openPanel('session')};
  if($('copySessionCode'))$('copySessionCode').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);notify('Код скопирован.')}catch{notify('Скопируй код вручную: '+room.code,8)}};
  if($('rotateSessionCode'))$('rotateSessionCode').onclick=()=>{if(confirm('Старый код перестанет работать. Сменить?'))send({type:'session_rotate_code'})};
  if($('renameSession'))$('renameSession').onclick=()=>send({type:'session_rename',name:$('sessionName').value.trim()});
  if($('sessionFriends'))$('sessionFriends').onclick=()=>openPanel('friends');
  for(const b of $('panelContent').querySelectorAll('[data-invite-friend]'))b.onclick=()=>send({type:'session_invite',userId:b.dataset.inviteFriend});
  for(const b of $('panelContent').querySelectorAll('[data-kick-player]'))b.onclick=()=>{if(confirm('Исключить игрока из личной сессии?'))send({type:'session_kick',userId:b.dataset.kickPlayer})};
 }else if(kind==='animals'){
  const html=`<p class="muted">Сначала выбери подходящий стиль. Сила не покупается за реальные деньги — только за заработанные Claws. Менять вид в саванне можно в безопасном лагере.</p><div class="panel-grid">${data.species.map(s=>{
   const mine=data.owned.find(o=>o.species===s.code),selected=data.profile.selected_species===s.code,price=s.starter?120:s.price;
   const btn=selected?'<button class="secondary" disabled>Сейчас играешь</button>':mine?`<button class="secondary" data-select="${s.code}">Выбрать</button>`:`<button class="primary" data-buy="${s.code}" ${data.wallet<price?'disabled':''}>Открыть · ${fmt(price)} Claws</button>`;
   return `<div class="item-card"><span class="badge">${escapeHtml(s.role)}</span><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.description)}</p><p>Здоровье ${s.hp} · Скорость ${s.speed} · Сила ${s.power}</p><strong>${mine?'В коллекции':s.starter?'Бесплатный выбор при регистрации':'Цена '+fmt(price)}</strong><div>${btn}</div>${mine?`<div><button class="ghost" data-upgrade="power" data-species="${s.code}" ${mine.power_rank>=5?'disabled':''}>Сила ${mine.power_rank}/5 · ${45*(mine.power_rank+1)}</button><button class="ghost" data-upgrade="endurance" data-species="${s.code}" ${mine.endurance_rank>=5?'disabled':''}>Выносливость ${mine.endurance_rank}/5 · ${45*(mine.endurance_rank+1)}</button></div>`:''}</div>`}).join('')}</div>`;
  setPanel('Мои животные','КОЛЛЕКЦИЯ / МАГАЗИН',html);
  for(const b of $('panelContent').querySelectorAll('[data-buy]'))b.onclick=()=>{if(confirm('Открыть '+speciesByCode(b.dataset.buy)?.title+' за Claws?'))send({type:'purchase',species:b.dataset.buy})};
  for(const b of $('panelContent').querySelectorAll('[data-select]'))b.onclick=()=>send({type:'select',species:b.dataset.select});
  for(const b of $('panelContent').querySelectorAll('[data-upgrade]'))b.onclick=()=>send({type:'upgrade',species:b.dataset.species,stat:b.dataset.upgrade});
 }else if(kind==='quests'){
  const q=data.serverQuests||{rafiki:{title:'Травы для Рафики',description:'Найди три лечебных растения.',reward:75},fuli:{title:'Следопыт Фули',description:'Пробеги от водопоя до Скалы Прайда.',reward:95},kion:{title:'Патруль Кайона',description:'Прогони двух опасных гиен.',reward:130}};
  const active=data.serverQuest&&!data.serverQuest.completed&&!data.serverQuest.abandoned?data.serverQuest:null;
  const guidance=describeQuest(active,q,data.resources,data.npcObjects,data.playerObjects.get(data.me));
  setPanel('Поручения','КОНТАКТЫ / НАГРАДЫ',`${active?`<div class="item-card quest-current"><span class="badge">СЕЙЧАС ВЫПОЛНЯЕТСЯ</span><h3>${escapeHtml(guidance?.title||'Поручение')}</h3><p>${escapeHtml(guidance?.step||'Исследуй саванну.')}</p><strong>${active.progress} из ${active.total}</strong><div class="quest-panel-actions"><button class="secondary" id="currentQuestMap">Показать на карте</button><button class="ghost" id="currentQuestAbandon">Отказаться от поручения</button></div></div>`:'<p class="muted">Выбери поручение. Выполнять одновременно можно только одно. За пройденное повторно награду не выдают.</p>'}<div class="panel-grid">${Object.entries(q).map(([id,item])=>{const done=data.quests.find(x=>x.quest_id===id&&x.state==='completed'),selected=active?.id===id;return `<div class="item-card"><span class="badge">${escapeHtml(item.contact||'Земли прайда')}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><strong>+${item.reward} Claws</strong><div><button class="primary" data-quest="${id}" ${done||!!active?'disabled':''}>${done?'Завершено':selected?'Выполняется':active?'Сначала откажись от текущего':'Взять поручение'}</button></div></div>`}).join('')}</div>`);
  for(const b of $('panelContent').querySelectorAll('[data-quest]'))b.onclick=()=>{if(!data.room)return notify('Сначала войди в сессию.');send({type:'quest',id:b.dataset.quest});resumeView()};
  if($('currentQuestMap'))$('currentQuestMap').onclick=()=>openPanel('map');
  if($('currentQuestAbandon'))$('currentQuestAbandon').onclick=()=>requestAbandonQuest();
 }else if(kind==='appearance'){
  const current=data.profile.color;
  setPanel('Окрас животного','ВНЕШНОСТЬ / КОСМЕТИКА',`<p class="muted">Окрас меняет только внешний вид и не даёт дополнительной силы. Выбери природный оттенок. Первоначальный цвет при регистрации бесплатный; последующие изменения стоят 65 Claws. Внутри сессии окрас меняется только в безопасной зоне.</p><div class="panel-grid coat-grid">${COATS.map(([name,hex])=>{const color=rgbToInt(hex),selected=color===current;return `<div class="item-card coat-card"><span class="coat-swatch" style="background:${hex}"></span><h3>${name}</h3><p>${selected?'Твой нынешний окрас':'Новый облик для твоего животного'}</p><button class="${selected?'secondary':'primary'}" data-coat="${color}" ${selected||data.wallet<65?'disabled':''}>${selected?'Выбран':'Изменить · 65 Claws'}</button></div>`}).join('')}</div>`);
  for(const button of $('panelContent').querySelectorAll('[data-coat]'))button.onclick=()=>{if(confirm('Изменить окрас за 65 Claws?'))send({type:'recolor',color:Number(button.dataset.coat)})};
 }else if(kind==='party'){
  if(!data.room){setPanel('Совместный дозор','КОМАНДА / ОБЩИЕ ПОРУЧЕНИЯ','<p class="muted">Сначала войди в публичную или личную сессию. Группа собирается из игроков, которые находятся в одной саванне.</p>');return}
  if(!data.party){
   setPanel('Совместный дозор','КОМАНДА / ОБЩИЕ ПОРУЧЕНИЯ',`<div class="item-card"><span class="badge">2–4 ИГРОКА</span><h3>Защита троп</h3><p>Соберитесь вместе, найдите две связки трав и остановите двух опасных гиен. Награду получают участники, которые действительно находятся рядом во время действий.</p><strong>+220 Claws каждому · не чаще раза в день</strong><div><button id="createParty" class="primary">Собрать группу</button></div></div><h3 class="panel-section-title">Приглашения</h3><div class="panel-list">${data.partyInvites.map(i=>`<div class="panel-row"><strong>${escapeHtml(i.from)} зовёт в группу</strong><button data-accept-party="${escapeHtml(i.partyId)}" class="secondary">Принять</button></div>`).join('')||'<p class="muted">Пока никто не приглашал.</p>'}</div>`);
   $('createParty').onclick=()=>send({type:'party_create'});
   for(const button of $('panelContent').querySelectorAll('[data-accept-party]'))button.onclick=()=>{send({type:'party_accept',partyId:button.dataset.acceptParty});data.partyInvites=data.partyInvites.filter(i=>i.partyId!==button.dataset.acceptParty)};
  }else{
   const party=data.party,leader=party.leader===data.me,op=party.operation;
   setPanel('Совместный дозор','КОМАНДА / ОБЩИЕ ПОРУЧЕНИЯ',`<div class="item-card"><span class="badge">${party.members.length} ИЗ 4</span><h3>${op?'Операция — '+escapeHtml(op.stageName):'Группа собирается'}</h3><p>${op?op.stage==='completed'?'Дозор завершён. Награда за этот день начисляется только однажды.':'Прогресс этапа '+fmt(op.progress)+' из '+fmt(op.total):'Позови друга из текущей сессии. Затем соберитесь рядом и начинайте.'}</p>${op?`<div class="bar gold"><span style="width:${Math.round(100*op.progress/Math.max(1,op.total))}%"></span></div>`:''}<div class="panel-list">${party.members.map(p=>`<div class="panel-row"><div><strong>${escapeHtml(p.nickname)}</strong><br><small>${p.id===party.leader?'Лидер группы':'Участник'}</small></div><span>${escapeHtml(speciesByCode(p.species)?.title||p.species)}</span></div>`).join('')}</div>${leader&&(!op||op.stage==='completed')?'<button id="startParty" class="primary">Начать совместный дозор</button>':''}<button id="leaveParty" class="ghost">Покинуть группу</button></div>${leader&&party.members.length<4?'<div class="item-card"><h3>Позвать игрока</h3><p>Игрок должен находиться в этой сессии.</p><div class="form-line"><input id="partyNickname" maxlength="20" placeholder="Ник в саванне"><button id="partyInvite" class="secondary">Пригласить</button></div></div>':''}`);
   if($('startParty'))$('startParty').onclick=()=>send({type:'party_start'});
   $('leaveParty').onclick=()=>send({type:'party_leave'});
   if($('partyInvite'))$('partyInvite').onclick=()=>send({type:'party_invite',nickname:$('partyNickname').value.trim()});
  }
 }else if(kind==='friends'){
  setPanel('Свои рядом','ДРУЗЬЯ / ПРИГЛАШЕНИЯ',`<p class="muted">Найди игрока по точному нику и отправь заявку. Друзьям можно писать личные сообщения и заходить в их сессии.</p><div class="form-line"><input id="friendNick" placeholder="Ник игрока"><button class="primary" id="sendFriend">Добавить</button></div><div class="panel-list">${data.friends.map(f=>`<div class="panel-row"><div><strong>${escapeHtml(f.other?.nickname||'Игрок')}</strong><br><small>${escapeHtml(f.status==='pending'?'Заявка ожидает ответа':f.status==='accepted'?'В друзьях':f.status)}</small></div><div>${f.status==='accepted'?`<button class="secondary" data-message="${f.other.id}">Сообщение</button><button class="secondary" data-follow="${f.other.id}">Присоединиться</button>`:''}${f.recipient===data.profile.id&&f.status==='pending'?`<button class="secondary" data-accept="${f.requester}">Принять</button>`:''}</div></div>`).join('')||'<p class="muted">Пока никого. Возможно, именно ты первым обнаружишь хорошую компанию.</p>'}</div>`);
  $('sendFriend').onclick=()=>send({type:'friend_request',nickname:$('friendNick').value.trim()});
  for(const b of $('panelContent').querySelectorAll('[data-accept]'))b.onclick=()=>send({type:'friend_accept',userId:b.dataset.accept});
  for(const b of $('panelContent').querySelectorAll('[data-follow]'))b.onclick=()=>send({type:'friend_follow',userId:b.dataset.follow});
  for(const b of $('panelContent').querySelectorAll('[data-message]'))b.onclick=()=>{const f=data.friends.find(f=>f.other?.id===b.dataset.message);if(!f)return;data.selectedFriend={id:f.other.id,nickname:f.other.nickname};data.directRows=[];data.directLoadedFor=null;openPanel('direct')};
 }else if(kind==='direct'){
  if(!data.selectedFriend)return openPanel('friends');
  setPanel(data.selectedFriend.nickname,'ЛИЧНЫЕ СООБЩЕНИЯ',`<p class="muted">Переписка видна только вам двоим. Сообщения сохраняются на сервере.</p><div class="dm-thread" id="dmHistory" aria-live="polite"><p class="muted">Загружаем переписку…</p></div><form id="dmForm" class="dm-form"><input id="dmText" maxlength="350" autocomplete="off" placeholder="Написать другу…" required><button class="primary" type="submit">Отправить</button></form>`);
  $('dmForm').onsubmit=e=>{e.preventDefault();const field=$('dmText');if(!field.value.trim())return;send({type:'chat',scope:'private',to:data.selectedFriend.id,body:field.value.trim()});field.value=''};
  if(data.directLoadedFor===data.selectedFriend.id)renderDirectHistory();else send({type:'dm_history',userId:data.selectedFriend.id});
 }else if(kind==='clan'){
  if(data.clan){
   setPanel('Твой прайд','СОЮЗНИКИ / СТАЯ',`<div class="item-card"><span class="badge">${escapeHtml(data.clan.role)}</span><h3>${escapeHtml(data.clan.name)}</h3><p>Общий знак — ${escapeHtml(data.clan.emblem)}. Можно собираться вместе в личной сессии.</p><button id="leaveClan" class="secondary">Выйти из сообщества</button></div>`);
   $('leaveClan').onclick=()=>{if(confirm('Покинуть сообщество?'))send({type:'clan_leave'})};
  }else{
   setPanel('Найди своих','ПРАЙД / СТАЯ',`<div class="panel-grid"><div class="item-card"><span class="badge">НОВОЕ СООБЩЕСТВО</span><h3>Собрать свой прайд</h3><p>Выбери имя, создай свой круг доверия. Стоимость — 180 Claws.</p><input id="clanName" maxlength="28" placeholder="Название прайда"><button id="createClan" class="primary">Создать · 180 Claws</button></div><div class="item-card"><span class="badge">ПРИСОЕДИНИТЬСЯ</span><h3>Войти в стаю</h3><p>Узнай точное название сообщества и вступи. В открытых прайдах приглашения пока не требуются.</p><input id="clanJoinName" maxlength="28" placeholder="Название сообщества"><button id="joinClan" class="secondary">Присоединиться</button></div></div>`);
   $('createClan').onclick=()=>send({type:'clan_create',name:$('clanName').value.trim()});
   $('joinClan').onclick=()=>send({type:'clan_join',name:$('clanJoinName').value.trim()});
  }
 }else if(kind==='history'){
  setPanel('Твой след','ПРОФИЛЬ / CLAWS',`<div class="panel-grid"><div class="item-card"><span class="badge">УРОВЕНЬ ${data.profile.level}</span><h3>${escapeHtml(data.profile.nickname)}</h3><p>${escapeHtml(speciesByCode(data.profile.selected_species)?.title||'')} · Опыт ${fmt(data.profile.xp)} · Репутация ${data.profile.reputation}</p></div><div class="item-card"><span class="badge">КОШЕЛЁК</span><h3>${fmt(data.wallet)} Claws</h3><p>Заработаны внутри саванны. Реальных денег здесь нет.</p></div></div><h3 class="panel-section-title">Последние операции</h3><div class="panel-list">${data.ledger.map(l=>`<div class="panel-row"><div>${escapeHtml(l.reason)}<br><small>${new Date(l.created_at).toLocaleString('ru-RU')}</small></div><strong class="${l.delta>0?'tag':''}">${l.delta>0?'+':''}${fmt(l.delta)} Claws</strong></div>`).join('')||'<p class="muted">Здесь появятся первые операции.</p>'}</div>`);
 }else if(kind==='map'){
  const goal=data.questAim;
  setPanel('Карта саванны','ЗЕМЛИ / 15 ЛОКАЦИЙ',`<p class="muted">${goal?`Твоя текущая цель — ${escapeHtml(goal.label)}. Золотая метка показывает, куда идти. `:''}Оранжевые квадраты — магазины с персонажами, зелёные точки — лечебные травы, красные — опасные гиены. Нажми на карту, чтобы поставить ориентир.</p><canvas id="mapCanvas" class="map-canvas" width="700" height="700"></canvas><div class="shop-map-legend">${Object.values(data.shops).map(shop=>`<span>Лавка · ${escapeHtml(shop.name)} (${Math.round(shop.x)}, ${Math.round(shop.z)})</span>`).join('')}</div>`);
  const c=$('mapCanvas'),ctx=c.getContext('2d');drawMap(ctx,700,true);c.onclick=e=>{const r=c.getBoundingClientRect();scene.waypoint={x:(e.clientX-r.left)/r.width*700-350,z:(e.clientY-r.top)/r.height*700-350};notify('Ориентир установлен.');drawMap(ctx,700,true)};
 }else if(kind==='players'){
  const players=[...data.playerObjects.values()].filter(p=>p.id!==data.me);
  setPanel('Игроки рядом','СОСЕДИ / ПРАВИЛА / ЖАЛОБЫ',`<p class="muted">Здесь отображаются игроки из твоей сессии поблизости. Если кто-то мешает другим, отправь жалобу с конкретным описанием — она сохранится для модерации.</p><div class="panel-list">${players.map(p=>`<div class="panel-row"><div><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(speciesByCode(p.species)?.title||p.species)}</small></div><button class="secondary" data-report="${p.id}">Пожаловаться</button></div>`).join('')||'<p class="muted">Поблизости других игроков сейчас нет.</p>'}</div><div class="report-grid hidden" id="reportFields"><h3>Сообщить о нарушении</h3><strong id="reportedName"></strong><textarea id="reportReason" minlength="10" maxlength="1000" placeholder="Что случилось? Напиши хотя бы десять символов."></textarea><button id="reportSubmit" class="primary">Отправить жалобу</button></div>`);
  for(const b of $('panelContent').querySelectorAll('[data-report]'))b.onclick=()=>{const target=data.playerObjects.get(b.dataset.report);$('reportFields').classList.remove('hidden');$('reportedName').textContent=target?.name||'Игрок';$('reportSubmit').onclick=()=>{const body=$('reportReason').value.trim();if(body.length<10)return notify('Опиши нарушение подробнее.');send({type:'report',userId:b.dataset.report,body});$('reportFields').classList.add('hidden');notify('Жалоба отправлена на проверку.')}};
 }else if(kind==='settings'){
  const soundSliders=[['master','Общая громкость','Громкость всей игры.'],['music','Музыка','Напряжённые погони, сражения и сюжетные эпизоды.'],['footsteps','Шаги и бег','Отдельная громкость травы, песка, камня и грязи.'],['effects','Действия и удары','Прыжки, попадания, рывки, вода и предметы.'],['ambience','Окружение','Ветер, птицы, насекомые и водоёмы.'],['interface','Интерфейс','Получение наград и другие сигналы.']];
  const range=(key,title,help,value,min,max,step,kind)=>`<label class="setting-row"><span><strong>${title}</strong><small>${help}</small></span><span class="setting-control"><input data-${kind}-range="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output data-value="${kind}-${key}">${kind==='audio'?Math.round(value*100)+'%':value}</output></span></label>`;
  const check=(key,title,help,checked,kind)=>`<label class="setting-row"><span><strong>${title}</strong><small>${help}</small></span><input data-${kind}-check="${key}" type="checkbox" ${checked?'checked':''}></label>`;
  setPanel('Настройки','ЗВУК / ГРАФИКА / КАМЕРА / УПРАВЛЕНИЕ',`<div class="setting-group"><h3>Звук и музыка</h3>${soundSliders.map(([k,n,d])=>range(k,n,d,sound.settings[k],0,1,.01,'audio')).join('')}${check('muted','Полностью без звука','Быстрое отключение всех аудиодорожек.',sound.settings.muted,'audio')}${check('musicDynamic','Динамическая музыка','Тревожная музыка при розыске, быстрые ритмы в опасности и во время поручений.',sound.settings.musicDynamic,'audio')}${check('spatial','Направление звука','Удары и события справа и слева слышны с соответствующей стороны.',sound.settings.spatial,'audio')}<button id="previewAudio" class="secondary">Прослушать звук</button></div>
  <div class="setting-group"><h3>Графика и производительность</h3><label class="setting-row"><span><strong>Качество изображения</strong><small>Пресеты для слабых и мощных устройств.</small></span><select id="qualitySelect"><option value="low">Низкое</option><option value="medium">Среднее</option><option value="high">Высокое</option></select></label>${range('renderScale','Масштаб рендеринга','Понижай при тормозах. Интерфейс останется чётким.',prefs.renderScale,.5,1.25,.05,'pref')}${check('shadows','Динамические тени','Отключение заметно ускоряет игру на телефонах.',prefs.shadows,'pref')}${check('reducedEffects','Упростить окружение','Меньше декоративной растительности, меньше нагрузки на видеокарту.',prefs.reducedEffects,'pref')}<label class="setting-row"><span><strong>Ограничение кадров</strong><small>30 кадров экономят заряд и уменьшают нагрев.</small></span><select id="fpsLimit"><option value="0">Без ограничения</option><option value="30">30 кадров/с</option><option value="45">45 кадров/с</option><option value="60">60 кадров/с</option></select></label>${check('showFps','Показывать FPS','Счётчик кадров в правой части экрана.',prefs.showFps,'pref')}</div>
  <div class="setting-group"><h3>Камера и управление</h3>${range('cameraDistance','Отдаление камеры','Расстояние от камеры до животного.',prefs.cameraDistance,7,23,1,'pref')}${range('sensitivity','Чувствительность мыши','Скорость поворота камеры при закреплённом курсоре или зажатой правой кнопке.',prefs.sensitivity,.3,2.5,.1,'pref')}${check('invertY','Инвертировать вертикальную камеру','Меняет направление движения камеры по вертикали.',prefs.invertY,'pref')}${check('pvp','Разрешить PvP','Другие игроки могут сражаться с тобой вне безопасных зон.',data.pvp,'game')}<p class="muted">WASD — движение, Shift — бег, пробел — прыжок, E — собрать, F — способность, R — поговорить с персонажем, левая кнопка мыши — атака, M — карта, Enter — чат, Esc — меню. Щёлкни по земле, чтобы закрепить курсор и поворачивать камеру мышью. Esc освобождает курсор. На телефоне используются экранные кнопки.</p></div><div class="setting-actions"><button id="resetSettings" class="ghost">Сбросить настройки</button><small>Изменения применяются сразу и сохраняются только на этом устройстве.</small></div>`);
  $('qualitySelect').value=prefs.quality;$('qualitySelect').onchange=e=>{prefs.quality=e.target.value;data.quality=prefs.quality;savePrefs();scene.quality()};
  $('fpsLimit').value=String(prefs.fpsLimit);$('fpsLimit').onchange=e=>{prefs.fpsLimit=Number(e.target.value);savePrefs()};
  for(const input of $('panelContent').querySelectorAll('[data-audio-range]'))input.oninput=e=>{const key=e.target.dataset.audioRange;const value=Number(e.target.value);sound.updateSetting(key,value);const out=$('panelContent').querySelector(`[data-value="audio-${key}"]`);if(out)out.textContent=Math.round(value*100)+'%'};
  for(const input of $('panelContent').querySelectorAll('[data-audio-check]'))input.onchange=e=>sound.updateSetting(e.target.dataset.audioCheck,e.target.checked);
  for(const input of $('panelContent').querySelectorAll('[data-pref-range]'))input.oninput=e=>{const key=e.target.dataset.prefRange;prefs[key]=Number(e.target.value);savePrefs();const out=$('panelContent').querySelector(`[data-value="pref-${key}"]`);if(out)out.textContent=prefs[key];if(key==='renderScale')scene.quality()};
  for(const input of $('panelContent').querySelectorAll('[data-pref-check]'))input.onchange=e=>{prefs[e.target.dataset.prefCheck]=e.target.checked;savePrefs();scene.quality()};
  $('panelContent').querySelector('[data-game-check="pvp"]').onchange=e=>{data.pvp=e.target.checked;prefs.pvp=data.pvp;savePrefs();if(data.room)send({type:'pvp',enabled:data.pvp})};
  $('previewAudio').onclick=async()=>{await sound.start();sound.play('grass','footsteps');setTimeout(()=>sound.play('bite','effects'),300);setTimeout(()=>sound.play('reward','interface'),650)};
  $('resetSettings').onclick=()=>{Object.assign(prefs,DEFAULT_PREFS);data.quality=prefs.quality;data.pvp=false;savePrefs();sound.reset();scene.quality();if(data.room)send({type:'pvp',enabled:false});openPanel('settings');notify('Настройки восстановлены.')};
 }
}
function updateObjective(){
 const q=data.serverQuest,box=$('hudObjective');
 const guide=describeQuest(q,data.serverQuests,data.resources,data.npcObjects,data.playerObjects.get(data.me));
 data.questAim=guide?.target||null;
 box.classList.toggle('has-quest',!!guide);
 const party=data.party?.operation;
 if(guide){
  const percent=Math.round(100*guide.progress/Math.max(1,guide.total));
  box.innerHTML=`<div class="quest-tracker-label">ТЕКУЩЕЕ ПОРУЧЕНИЕ</div><div class="quest-tracker-title">${escapeHtml(guide.title)}</div><div class="quest-tracker-step">${escapeHtml(guide.step)}</div><div class="quest-tracker-progress"><span style="width:${percent}%"></span></div><div class="quest-tracker-meta"><span>${guide.progress} из ${guide.total}${guide.target?' · <span class="quest-direction" id="questHeading">↑</span> <b id="questDistance">Ищем направление…</b>':''}</span><span>+${fmt(guide.reward)} Claws</span></div>${party&&party.stage!=='completed'?`<small class="quest-tracker-party">Команда — ${escapeHtml(party.stageName)} · ${party.progress}/${party.total}</small>`:''}<div class="quest-tracker-actions"><button type="button" data-quest-action="map">Карта</button><button type="button" data-quest-action="abandon">Отказаться</button></div>`;
  refreshObjectiveDistance();
 }else{
  box.innerHTML=`<div class="quest-tracker-label">СВОБОДЕН ОТ ПОРУЧЕНИЙ</div><div class="quest-tracker-empty">Поговори с Фули, Кайоном или Рафики, чтобы получить задание.</div><div class="quest-tracker-actions"><button type="button" data-quest-action="browse">Выбрать поручение</button></div>`;
 }
}
function refreshObjectiveDistance(){
 const node=$('questDistance'),pos=data.playerObjects.get(data.me),distance=questDistance(data.questAim,pos);
 const threshold=data.serverQuest?.id==='fuli'?23:data.serverQuest?.id==='rafiki'?5.5:5;
 if(node)node.textContent=distance==null?'Цель на карте':distance<threshold?'Ты у цели':`До цели ${distance} м`;
 const arrow=$('questHeading'),bearing=questBearing(data.questAim,pos,scene?.yaw);
 if(arrow&&bearing!=null)arrow.style.transform=`rotate(${bearing}rad)`;
}
function requestAbandonQuest(){
 if(!data.serverQuest||data.serverQuest.completed)return;
 if(confirm('Отказаться от «'+(data.serverQuests?.[data.serverQuest.id]?.title||'поручения')+'»? Весь прогресс этого поручения пропадёт.'))send({type:'quest_abandon'});
}
$('hudObjective').addEventListener('click',event=>{
 const action=event.target.closest('[data-quest-action]')?.dataset.questAction;
 if(action==='map')openPanel('map');
 if(action==='browse')openPanel('quests');
 if(action==='abandon')requestAbandonQuest();
});
function appendChat(m){const box=$('chatHistory'),row=document.createElement('div'),author=document.createElement('b');row.className='chat-line';author.textContent=m.author+': ';row.append(author,document.createTextNode(m.body));box.append(row);while(box.children.length>45)box.firstChild.remove();box.scrollTop=box.scrollHeight}
function renderDirectHistory(){
 const box=$('dmHistory');if(!box)return;box.replaceChildren();
 if(!data.directRows.length){const p=document.createElement('p');p.className='muted';p.textContent='Пока ни одного сообщения. Начни разговор.';box.append(p)}
 for(const message of data.directRows){const row=document.createElement('div'),title=document.createElement('small'),body=document.createElement('span');row.className='dm-message'+(message.author===data.profile?.id?' mine':'');title.textContent=message.author===data.profile?.id?'Ты':data.selectedFriend?.nickname||'Друг';body.textContent=message.body;row.append(title,body);box.append(row)}
 box.scrollTop=box.scrollHeight;
}
function receiveDirect(message){
 const other=message.userId===data.profile?.id?message.to:message.userId;
 if(data.selectedFriend?.id===other){data.directRows.push({author:message.userId,recipient:message.to,body:message.body,created_at:new Date().toISOString()});if(data.directRows.length>50)data.directRows.shift();if(data.activePanel==='direct'&&data.view==='panel')renderDirectHistory();else if(message.userId!==data.profile?.id)notify('Личное сообщение от '+message.author,5)}
 else if(message.userId!==data.profile?.id)notify('Личное сообщение от '+message.author+'. Открой друзей.',6);
}
$('chatForm').onsubmit=e=>{e.preventDefault();const field=$('chatInput');if(field.value.trim())send({type:'chat',scope:$('chatChannel').value,body:field.value.trim()});field.value='';field.blur()};
$('chatInput').addEventListener('focus',()=>{keys.clear();mobile.clear();resetTouchMove();if(data.room&&data.ws?.readyState===WebSocket.OPEN)data.ws.send(JSON.stringify({type:'stop_input'}))});
$('chatChannel').onchange=e=>{const channel=e.target.value;$('chatHistory').replaceChildren();$('chatInput').placeholder=channel==='local'?'Написать тем, кто рядом…':channel==='clan'?'Написать своему прайду…':'Написать в общий чат…';if(channel==='session'||channel==='clan')send({type:'chat_history',scope:channel})};
$('chatToggle').onclick=()=>{$('chatBox').classList.toggle('chat-collapsed');$('chatToggle').textContent=$('chatBox').classList.contains('chat-collapsed')?(matchMedia('(pointer: coarse)').matches?'Чат':'Развернуть'):'Свернуть'};
function showOnboard(){data.onboardIndex=0;updateOnboard();$('onboarding').classList.remove('hidden')}
function updateOnboard(){$('onboardText').textContent=TIPS[data.onboardIndex];$('nextOnboard').textContent=data.onboardIndex===TIPS.length-1?'В путь':'Дальше'}
function finishOnboard(){$('onboarding').classList.add('hidden');if(data.me)localStorage.setItem('sf_onboard_'+data.me,'1')}
$('skipOnboard').onclick=finishOnboard;$('nextOnboard').onclick=()=>{if(++data.onboardIndex>=TIPS.length)finishOnboard();else updateOnboard()};

// Full original landscape and recognizable landmarks, shaded for warmer sunset.
class Scene {
 constructor(){
  this.canvas=$('world');this.scene=new T.Scene();this.scene.background=new T.Color(0x8d6451);this.scene.fog=new T.Fog(0x937b66,75,335);
  this.camera=new T.PerspectiveCamera(58,innerWidth/innerHeight,.15,760);this.renderer=new T.WebGLRenderer({canvas:this.canvas,antialias:true,powerPreference:'high-performance'});
  this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.9;
  this.ambient=new T.HemisphereLight(0xffd6aa,0x54432d,1.4);this.scene.add(this.ambient);
  this.colors={twilight:new T.Color(0x97705c),day:new T.Color(0xc8a988),night:new T.Color(0x1f2b35),wet:new T.Color(0x5c6268),dust:new T.Color(0x9c7450)};this.skyColor=new T.Color();
  this.sun=new T.DirectionalLight(0xffa763,2.2);this.sun.position.set(-160,58,70);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-115,right:115,top:115,bottom:-115,near:1,far:480});this.scene.add(this.sun,this.sun.target);
  this.game={scene:this.scene,time:0,weather:{index:0},started:false};this.world=new S.World(this.game);
  this.world.sun.position.set(-325,28,180);this.world.moon.visible=false;this.world.stars.material.opacity=.15;
  const dropPositions=new Float32Array(480*3);for(let i=0;i<dropPositions.length;i+=3){dropPositions[i]=(Math.random()-.5)*82;dropPositions[i+1]=Math.random()*50;dropPositions[i+2]=(Math.random()-.5)*82}
  this.rain=new T.Points(new T.BufferGeometry(),new T.PointsMaterial({color:0xc2b5a6,size:.24,transparent:true,opacity:.59,depthWrite:false}));this.rain.geometry.setAttribute('position',new T.BufferAttribute(dropPositions,3));this.rain.visible=false;this.scene.add(this.rain);
  this.camera.position.set(-10,58,145);this.camera.lookAt(-45,7,0);this.waypoint=null;
  this.namedNPCs=[];for(const [index,[id,name,species,x,z]] of NPCS.entries()){
   const entry=this.addAnimal('npc-'+id,name,species,x,z,true);
   entry.homeX=x;entry.homeZ=z;entry.patrolSeed=index*1.83;this.attachLabel(entry,true);
   this.namedNPCs.push(entry);
  }
  this.createShopStalls();
  this.resourceObjects=new Map();
  this.last=performance.now();this.yaw=2.5;this.pitch=.28;this.time=0;this.selfTarget=null;this.lastAudioUpdate=0;this.thunderAt=0;this.fpsFrames=0;this.fpsLast=performance.now();this.lastRendered=0;this.quality();this.animate=this.animate.bind(this);requestAnimationFrame(this.animate);
  addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight)});
  this.canvas.addEventListener('contextmenu',e=>e.preventDefault());this.canvas.addEventListener('pointerdown',e=>{
   if(!data.room||data.view!=='hud')return;
   if(e.pointerType==='touch'||e.pointerType==='pen'){
    if(this.touchLookPointer!=null)return;
    e.preventDefault();this.touchLookPointer=e.pointerId;this.touchLookX=e.clientX;this.touchLookY=e.clientY;this.canvas.setPointerCapture(e.pointerId);
   }else if(e.button===2)this.dragging=true;
   else if(e.button===0){
    if(document.pointerLockElement===this.canvas)this.attack();
    else if(this.canvas.requestPointerLock)Promise.resolve(this.canvas.requestPointerLock()).catch(()=>{});
    else this.attack();
   }
  });
  this.canvas.addEventListener('pointermove',e=>{
   if(e.pointerId!==this.touchLookPointer||!data.room||data.view!=='hud')return;
   const dx=e.clientX-this.touchLookX,dy=e.clientY-this.touchLookY;
   this.touchLookX=e.clientX;this.touchLookY=e.clientY;
   this.yaw-=dx*.004*prefs.sensitivity;
   this.pitch=S.clamp(this.pitch+dy*.003*prefs.sensitivity*(prefs.invertY?-1:1),-.15,.8);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(event,e=>{if(e.pointerId===this.touchLookPointer)this.touchLookPointer=null});
  addEventListener('pointerup',()=>this.dragging=false);addEventListener('pointermove',e=>{if((this.dragging||document.pointerLockElement===this.canvas)&&data.room&&data.view==='hud'&&e.pointerType==='mouse'){
   const dx=S.clamp(e.movementX,-95,95),dy=S.clamp(e.movementY,-80,80);
   this.yaw-=dx*.0035*prefs.sensitivity;
   this.pitch=S.clamp(this.pitch+dy*.002*prefs.sensitivity*(prefs.invertY?-1:1),-.15,.8);
  }});
  document.addEventListener('pointerlockchange',()=>{
   const released=this.pointerWasLocked&&document.pointerLockElement!==this.canvas;
   this.pointerWasLocked=document.pointerLockElement===this.canvas;
   if(released&&data.room&&data.view==='hud'&&$('dialogueBox').classList.contains('hidden')&&$('deathScreen').classList.contains('hidden')&&document.activeElement!==$('chatInput'))show('menu');
  });
 }
 quality(){const low=data.quality==='low';const ratio=low?.72:data.quality==='high'?Math.min(devicePixelRatio,1.8):Math.min(devicePixelRatio,1.2);this.renderer.setPixelRatio(Math.max(.45,Math.min(2.2,ratio*prefs.renderScale)));this.renderer.shadowMap.enabled=!low&&prefs.shadows;this.sun.castShadow=!low&&prefs.shadows;this.world.grass.visible=!low&&!prefs.reducedEffects;this.renderer.setSize(innerWidth,innerHeight);$('fpsIndicator').classList.toggle('hidden',!prefs.showFps)}
 createShopStalls(){
  const wood=new T.MeshStandardMaterial({color:0x6e4831,roughness:1}),cloth=new T.MeshStandardMaterial({color:0xb57b45,roughness:1,side:T.DoubleSide}),goods=new T.MeshStandardMaterial({color:0x96a465,roughness:1});
  for(const npc of this.namedNPCs.filter(n=>n.id.startsWith('npc-shop-'))){
   const group=new T.Group(),add=(geometry,material,x,y,z)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh)};
   for(const x of [-1.45,1.45])for(const z of [-.9,.9])add(new T.CylinderGeometry(.10,.13,3.5,5),wood,x,1.75,z);
   add(new T.ConeGeometry(2.4,1,4),cloth,0,3.85,0);
   add(new T.BoxGeometry(2.8,.22,1.4),wood,0,1.25,.65);
   for(let i=0;i<5;i++)add(new T.IcosahedronGeometry(.27,0),goods,-1+i*.46,1.55,.68);
   group.position.set(npc.homeX+4,S.height(npc.homeX+4,npc.homeZ),npc.homeZ);
   this.scene.add(group);
  }
 }
 addAnimal(id,name,species,x,z,named=false,color=null){
  const model=S.animal(species,id.startsWith('guard-')?'guard':id.replace('npc-',''),color??undefined);this.scene.add(model);
  const e={id,name,species,color,model,x,z,y:S.height(x,z),heading:0,hp:100,vx:0,vz:0,seed:Math.random()*6,dodge:0,attackAnim:0,state:'IDLE',named,target:{x,z},lastNet:0};
  if(named)model.scale.multiplyScalar(.95);if(named&&['ono','anga','zazu'].includes(id.slice(4)))e.y+=4;
  if(!named)this.attachLabel(e);
  return e;
 }
 attachLabel(e,named=false){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d');ctx.font='bold 23px Manrope,Arial';ctx.textAlign='center';ctx.fillStyle=named?'#23190ece':'#2b190fcf';ctx.fillRect(0,6,256,48);ctx.fillStyle=named?'#ffd78c':'#ffdb9b';ctx.fillText(e.name.slice(0,19),128,36);const texture=new T.CanvasTexture(canvas);const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(named?4.7:6.4,named?1.18:1.6,1);sprite.position.set(0,named?5.4:4.5,0);e.model.add(sprite);e.label=sprite}
 removePlayer(id){const e=data.playerObjects.get(id);if(e){this.scene.remove(e.model);data.playerObjects.delete(id)}}
 clearDynamic(){for(const e of [...data.playerObjects.values(),...data.npcObjects.values()])this.scene.remove(e.model);for(const mesh of this.resourceObjects.values())this.scene.remove(mesh);this.resourceObjects.clear();data.playerObjects.clear();data.npcObjects.clear();this.selfTarget=null}
 syncResources(){
  for(const [id,mesh] of this.resourceObjects)if(!data.resources.has(id)){this.scene.remove(mesh);this.resourceObjects.delete(id)}
  for(const r of data.resources.values()){
   if(this.resourceObjects.has(r.id))continue;
   const group=new T.Group();group.position.set(r.x,S.height(r.x,r.z)+.15,r.z);
   if(r.type==='herb'){
    const green=new T.MeshStandardMaterial({color:0x697852,roughness:.9,side:T.DoubleSide});
    const stem=new T.Mesh(new T.CylinderGeometry(.05,.085,1.2,5),new T.MeshStandardMaterial({color:0x857348,roughness:1}));stem.position.y=.66;group.add(stem);
    for(let i=0;i<5;i++){const angle=i*Math.PI*2/5,leaf=new T.Mesh(new T.ConeGeometry(.38,1.1,5),green);leaf.position.set(Math.cos(angle)*.32,.53+Math.sin(i*2)*.12,Math.sin(angle)*.32);leaf.rotation.z=Math.cos(angle)*.72;leaf.rotation.x=Math.sin(angle)*.72;group.add(leaf)}
   }else{
    const rock=new T.Mesh(new T.DodecahedronGeometry(.65),new T.MeshStandardMaterial({color:0x9f7952,roughness:.72,metalness:.12}));rock.position.y=.52;rock.rotation.set(.3,.7,.2);group.add(rock);
   }
   const mote=new T.Mesh(new T.IcosahedronGeometry(.19),new T.MeshBasicMaterial({color:0xe3b36c}));mote.position.y=1.65;group.add(mote);
   group.userData.marker=mote;this.scene.add(group);this.resourceObjects.set(r.id,group);
  }
 }
 resetCamera(){this.camera.position.set(-65,15,70);this.yaw=2.5;this.pitch=.26;this.localVelocity={x:0,z:0};this.cameraFocus=null}
 handleSnapshot(m){
  data.roomWeather=Number(m.weather??data.roomWeather);this.game.weather.index=data.roomWeather;
  if(Number.isFinite(m.hunger)){data.hunger=m.hunger;updateHunger();}
  const displayHour=(18+this.time/75)%24;
  $('weather').textContent=(displayHour<5||displayHour>=21?'Ночь':displayHour<10?'Утро':displayHour<17?'День':'Закат')+' · '+(S.WEATHERS[data.roomWeather]||'Ясно');
  const current=new Set();for(const item of m.players){const p=Array.isArray(item)?{id:item[0],nickname:item[1],species:item[2],model:item[3],x:item[4],z:item[5],heading:item[6],hp:item[7],maxHp:item[8],stamina:item[9],maxStamina:item[10],wanted:item[11],abilityReady:item[12],jump:item[13],color:item[14]}:item;current.add(p.id);let e=data.playerObjects.get(p.id);
   if(!e||e.species!==p.model||e.color!==(p.color??null)){if(e)this.scene.remove(e.model);e=this.addAnimal(p.id,p.nickname,p.model,p.x,p.z,false,p.color??null);data.playerObjects.set(p.id,e)}
   e.target={x:p.x,z:p.z,heading:p.heading,hp:p.hp,jump:p.jump};e.hp=p.hp;e.lastNet=performance.now();if(p.id===data.me){this.selfTarget=e.target;data.wanted=p.wanted||0;data.abilityReady=!!p.abilityReady;$('abilityButton').disabled=!data.abilityReady;updateWanted();$('hudName').textContent=p.nickname+' · '+(speciesByCode(p.species)?.title||p.species);$('healthText').textContent=p.hp+' / '+p.maxHp;$('healthBar').style.width=p.hp/p.maxHp*100+'%';$('staminaText').textContent=p.stamina+' / '+p.maxStamina;$('staminaBar').style.width=p.stamina/p.maxStamina*100+'%';$('region').textContent=this.world.region(p);}}
  for(const id of data.playerObjects.keys())if(!current.has(id))this.removePlayer(id);
  for(const item of m.npcs){const n=Array.isArray(item)?{id:item[0],name:item[1],species:item[2],x:item[3],z:item[4],hp:item[5],maxHp:item[6],dead:item[7]}:item;let e=data.npcObjects.get(n.id);if(!e){e=this.addAnimal(n.id,n.name,n.species,n.x,n.z);data.npcObjects.set(n.id,e)}e.target={x:n.x,z:n.z};e.hp=n.hp;e.model.visible=!n.dead}
  $('playersCount').textContent=m.players.length+' игрок(ов) поблизости';
 }
 hit(m){const e=data.playerObjects.get(m.target)||data.npcObjects.get(m.target);if(e)e.attackAnim=.32;const me=data.playerObjects.get(data.me);if(me&&(m.target===data.me||m.from===data.me||e&&Math.hypot(me.x-e.x,me.z-e.z)<30)){const pan=e&&e!==me?S.clamp((e.x-me.x)/20,-.85,.85):0;sound.play(m.target===data.me?'hit':'punch','effects',{volume:m.target===data.me?.95:.66,pan})}}
 attack(){
  const now=performance.now();if(now-(this.lastAttackAt||-Infinity)<950)return;
  const me=data.playerObjects.get(data.me);if(!me)return;
  const possible=[...data.npcObjects.values(),...data.playerObjects.values()].filter(e=>e.id!==data.me&&e.hp>0&&Math.hypot(e.x-me.x,e.z-me.z)<5).sort((a,b)=>S.dist(a,me)-S.dist(b,me))[0];
  if(possible&&send({type:'attack',target:possible.id})){
   this.lastAttackAt=now;
   sound.play('bite','effects',{volume:.68,rate:.95+Math.random()*.1});
  }
 }
 ability(){if(!data.abilityReady)return notify('Способность восстанавливается.');send({type:'ability'})}
 talk(){const me=data.playerObjects.get(data.me);if(!me)return;const nearest=this.namedNPCs.filter(n=>Math.hypot(me.x-n.x,me.z-n.z)<11).sort((a,b)=>S.dist(me,a)-S.dist(me,b))[0];if(!nearest)return notify('Сейчас рядом нет собеседника.');send({type:'interact',contact:nearest.id.slice(4)})}
 gather(){const me=data.playerObjects.get(data.me);if(!me)return;const r=[...data.resources.values()].filter(r=>Date.now()>=r.readyAt).sort((a,b)=>S.dist(a,me)-S.dist(b,me))[0];if(r&&S.dist(r,me)<5.5)send({type:'gather',id:r.id});else notify('Рядом нет готовых растений. Поищи янтарные метки.')}
 animate(now){
  if(prefs.fpsLimit&&now-this.lastRendered<1000/prefs.fpsLimit){requestAnimationFrame(this.animate);return}this.lastRendered=now;
  const dt=Math.min(.05,(now-this.last)/1000);this.last=now;this.time+=dt;this.game.time=this.time;
  this.fpsFrames++;if(now-this.fpsLast>=900){$('fpsIndicator').textContent=Math.round(this.fpsFrames*1000/(now-this.fpsLast))+' FPS';this.fpsFrames=0;this.fpsLast=now}
  this.world.update(dt);this.world.clouds.position.x=Math.sin(this.time*.06)*12;
  const me=data.playerObjects.get(data.me),inGame=!!(data.room&&data.view==='hud');
  const hour=(18+this.time/75)%24,solar=Math.max(0,Math.sin((hour-6)/24*Math.PI*2));
  const weather=data.roomWeather,wet=[3,4,5].includes(weather),dust=weather===7;
  const sunAngle=(hour-6)/24*Math.PI*2,dusk=Math.max(0,1-Math.abs(Math.sin(sunAngle))*4);
  const sky=this.skyColor.copy(this.colors.night).lerp(this.colors.twilight,solar>.1?1:dusk*.8+.12).lerp(this.colors.day,solar*.6);
  if(wet)sky.lerp(this.colors.wet,.5);if(dust)sky.lerp(this.colors.dust,.45);
  this.scene.background.copy(sky);this.scene.fog.color.copy(sky);
  this.scene.fog.near=dust?35:weather===8?24:90;this.scene.fog.far=dust?155:weather===8?170:335;
  this.sun.intensity=.2+solar*2.6;this.ambient.intensity=.45+solar*1.25;
  this.world.sun.position.set(Math.cos(sunAngle)*310,Math.max(-40,Math.sin(sunAngle)*250),170);
  this.world.sun.visible=hour>5&&hour<20;this.world.moon.visible=hour<=5||hour>=20;this.world.moon.position.set(-this.world.sun.position.x,-this.world.sun.position.y,170);
  this.world.stars.material.opacity=Math.max(.02,(1-solar)*.72);
  this.rain.visible=wet&&me&&inGame&&data.quality!=='low'&&!prefs.reducedEffects;
  if(this.rain.visible){this.rain.position.set(me.x,me.y,me.z);const drops=this.rain.geometry.attributes.position;for(let i=0;i<drops.count;i++){const y=drops.getY(i)-dt*(weather===3?21:37);drops.setY(i,y<0?50:y)}drops.needsUpdate=true}
  for(const e of this.namedNPCs){
   const oldX=e.x,oldZ=e.z,phase=this.time*.52+e.patrolSeed;
   e.x=e.homeX+(Math.sin(phase)-Math.sin(e.patrolSeed))*1.5;
   e.z=e.homeZ+(Math.cos(phase*.83)-Math.cos(e.patrolSeed*.83))*1.5;
   e.vx=(e.x-oldX)/Math.max(dt,.01);e.vz=(e.z-oldZ)/Math.max(dt,.01);
   if(Math.hypot(e.vx,e.vz)>.08)e.heading=Math.atan2(e.vx,e.vz);
   e.y=S.height(e.x,e.z)+(['ono','anga','zazu'].includes(e.id.slice(4))?4:0);
   S.animateAnimal(e,this.time,dt);e.model.position.set(e.x,e.y,e.z);e.model.rotation.y=e.heading;
  }
  for(const [id,mesh] of this.resourceObjects){const r=data.resources.get(id);mesh.visible=!!r&&Date.now()>=r.readyAt;if(mesh.visible){mesh.userData.marker.position.y=1.65+Math.sin(this.time*2+mesh.position.x)*.16;mesh.userData.marker.rotation.y+=dt*1.2}}
  for(const [id,e] of [...data.playerObjects,...data.npcObjects]){
   const t=e.target||{x:e.x,z:e.z};const oldX=e.x,oldZ=e.z;
   if(id===data.me&&inGame){
    const input=currentInputState(),walkSpeed=Number(speciesByCode(data.profile?.selected_species)?.speed)||8;
    this.localVelocity=smoothInputVelocity(this.localVelocity||{x:0,z:0},input,walkSpeed*(input.sprint?1.5:1),dt);
    const visual=reconcilePredictedPosition(e,t,this.localVelocity,(now-e.lastNet)/1000,dt);
    e.x=visual.x;e.z=visual.z;
    const desiredHeading=Math.hypot(input.x,input.z)>.08?Math.atan2(input.x,input.z):t.heading??e.heading;
    e.heading=smoothHeading(e.heading,desiredHeading,dt);
   }else{const k=1-Math.exp(-dt*10);e.x=S.lerp(e.x,t.x,k);e.z=S.lerp(e.z,t.z,k)}
   if(id!==data.me||!inGame)e.heading=smoothHeading(e.heading,t.heading??(Math.atan2(e.x-oldX,e.z-oldZ)||e.heading),dt);
   e.vx=(e.x-oldX)/Math.max(dt,.01);e.vz=(e.z-oldZ)/Math.max(dt,.01);
   const water=this.world.waterAt(e.x,e.z);
   e.swimming=!!water&&t.jump!==true;
   e.y=e.swimming?water.y-.44+Math.sin(this.time*3+e.seed)*.11:S.height(e.x,e.z)+(t.jump?.85:0);
   e.model.position.set(e.x,e.y,e.z);e.model.rotation.y=e.heading;
   e.attackAnim=Math.max(0,e.attackAnim-dt);S.animateAnimal(e,this.time,dt);
  }
  if(me&&inGame){
   const look=new T.Vector3(me.x,me.y+2.1,me.z),dist=prefs.cameraDistance;
   if(!this.cameraFocus)this.cameraFocus=look.clone();
   this.cameraFocus.lerp(look,1-Math.exp(-dt*19));
   const focus=this.cameraFocus;
   const desired=new T.Vector3(focus.x+Math.sin(this.yaw)*dist*Math.cos(this.pitch),focus.y+2.9+Math.sin(this.pitch)*dist,focus.z+Math.cos(this.yaw)*dist*Math.cos(this.pitch));
   desired.y=Math.max(desired.y,S.height(desired.x,desired.z)+2);
   this.camera.position.copy(desired);this.camera.lookAt(focus);
   const near=[...data.resources.values()].filter(r=>Date.now()>=r.readyAt).sort((a,b)=>S.dist(a,me)-S.dist(b,me))[0];
   const contact=this.namedNPCs.filter(n=>Math.hypot(me.x-n.x,me.z-n.z)<11).sort((a,b)=>S.dist(me,a)-S.dist(me,b))[0];
   $('talkButton').classList.toggle('hidden',!contact);
   $('talkPrompt').classList.toggle('hidden',!contact);
   if(contact)$('talkPrompt').textContent=contact.id.startsWith('npc-shop-')?(matchMedia('(pointer: coarse)').matches?'Нажми «Диалог»':'R')+' — открыть магазин '+contact.name:(matchMedia('(pointer: coarse)').matches?'Нажми «Диалог»':'R — поговорить')+' с '+contact.name;
   $('actionHint').textContent=near&&S.dist(near,me)<6?'E — собрать '+(near.type==='herb'?'травы':'древний след'):contact?'R — поговорить с '+contact.name:'WASD — движение · Shift — бег · E — собирать';
   const speed=Math.hypot(me.vx,me.vz);
   if(speed>1.5&&me.target?.jump!==true&&!me.swimming){const pond=this.world.waters.some(w=>Math.hypot(me.x-w.x,me.z-w.z)<w.r+6);const surface=pond||[3,4,5].includes(data.roomWeather)?'mud':Math.hypot(me.x-260,me.z+260)<90?'stone':me.x>90&&me.z< -65?'sand':'grass';sound.step(surface,speed>8)}
   if(now-this.lastAudioUpdate>650){this.lastAudioUpdate=now;const waterDistance=Math.min(...this.world.waters.map(w=>Math.max(0,Math.hypot(me.x-w.x,me.z-w.z)-w.r)));sound.setWaterDistance(waterDistance);
    const foes=[...data.npcObjects.values()].some(n=>n.hp>0&&n.id.startsWith('hyena-')&&Math.hypot(me.x-n.x,me.z-n.z)<24);
    const action=data.serverQuest&&!data.serverQuest.completed;
    const mode=data.wanted>=2?'chase':data.wanted>0?'tension':data.party?.operation?.stage==='hunt'&&foes?'battle':action&&data.serverQuest.id==='kion'&&foes?'battle':action&&data.serverQuest.id==='fuli'&&speed>7?'chase':foes?'tension':'none';sound.setMusic(mode);
    if(data.roomWeather===5&&now>this.thunderAt){this.thunderAt=now+26000+Math.random()*16000;sound.play('thunder','ambience',{volume:.62})}
   }
   if(this.time-(this.questGuideAt||0)>.8){this.questGuideAt=this.time;if(data.serverQuest){const guide=describeQuest(data.serverQuest,data.serverQuests,data.resources,data.npcObjects,me);if(guide?.target?.key!==data.questAim?.key)updateObjective();else if(guide?.target)data.questAim=guide.target}}
   if(this.time-this.mapLast>0.2||!this.mapLast){this.mapLast=this.time;refreshObjectiveDistance();drawMap($('minimap').getContext('2d'),180,false)}
  }else{
   if(sound.musicMode!=='none')sound.setMusic('none');sound.setWaterDistance(Infinity);
   const t=this.time*.032;const target=new T.Vector3(-40+Math.sin(t)*40,14+Math.sin(t*.7)*3,20);
   this.camera.position.lerp(new T.Vector3(-10+Math.sin(t)*90,48+Math.sin(t*.5)*9,150+Math.cos(t)*55),dt*.15);
   this.camera.lookAt(target);
  }
  this.renderer.render(this.scene,this.camera);requestAnimationFrame(this.animate);
 }
}
let scene;
function drawMap(ctx,size,large){
 ctx.clearRect(0,0,size,size);ctx.fillStyle='#392d21';ctx.fillRect(0,0,size,size);
 const scale=size/700,x=v=>(v+350)*scale,z=v=>(v+350)*scale;
 ctx.strokeStyle='#755637';ctx.lineWidth=large?6:2;for(const path of [[-105,-98,-45,0],[-45,0,76,26],[-45,0,-104,92],[76,26,140,-130],[140,-130,262,-280],[-104,92,30,155]]){ctx.beginPath();ctx.moveTo(x(path[0]),z(path[1]));ctx.lineTo(x(path[2]),z(path[3]));ctx.stroke()}
 for(const l of S.LOCATIONS){ctx.beginPath();ctx.fillStyle='#a97748';ctx.arc(x(l.x),z(l.z),large?5:2,0,Math.PI*2);ctx.fill();if(large){ctx.fillStyle='#e7c69c';ctx.font='11px Manrope,Arial';ctx.fillText(l.name,x(l.x)+9,z(l.z)+4)}}
 for(const shop of Object.values(data.shops)){const px=x(shop.x),py=z(shop.z);ctx.fillStyle='#f7a549';ctx.fillRect(px-(large?7:3),py-(large?7:3),large?14:6,large?14:6);ctx.strokeStyle='#ffe4be';ctx.strokeRect(px-(large?7:3),py-(large?7:3),large?14:6,large?14:6);if(large){ctx.fillStyle='#ffe0a6';ctx.font='bold 12px Manrope,Arial';ctx.fillText(shop.name,px+13,py-9)}}
 for(const r of data.resources.values()){if(r.type!=='herb')continue;ctx.beginPath();ctx.fillStyle=Date.now()>=Number(r.readyAt||0)?'#8dbf7c':'#5e7059';ctx.arc(x(r.x),z(r.z),large?5:2.3,0,Math.PI*2);ctx.fill()}
 for(const enemy of data.npcObjects.values()){if(!enemy.id.startsWith('hyena-')||enemy.hp<=0||!enemy.model.visible)continue;ctx.beginPath();ctx.fillStyle='#d36d52';ctx.arc(x(enemy.x),z(enemy.z),large?5:2.3,0,Math.PI*2);ctx.fill()}
 const me=data.playerObjects.get(data.me);if(me){ctx.beginPath();ctx.fillStyle='#f7c783';ctx.arc(x(me.x),z(me.z),large?8:4,0,Math.PI*2);ctx.fill()}
 for(const [id,p] of data.playerObjects)if(id!==data.me){ctx.fillStyle='#d6e2e0';ctx.fillRect(x(p.x)-2,z(p.z)-2,4,4)}
 if(data.questAim){const aim=data.questAim;ctx.save();if(me){ctx.beginPath();ctx.setLineDash(large?[8,7]:[3,3]);ctx.strokeStyle='#e9bd75bb';ctx.lineWidth=large?2:1;ctx.moveTo(x(me.x),z(me.z));ctx.lineTo(x(aim.x),z(aim.z));ctx.stroke()}ctx.setLineDash([]);ctx.beginPath();ctx.strokeStyle='#ffe4a9';ctx.lineWidth=large?4:2;ctx.arc(x(aim.x),z(aim.z),large?12:6,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#f5ab45';ctx.beginPath();ctx.arc(x(aim.x),z(aim.z),large?6:3,0,Math.PI*2);ctx.fill();if(large){ctx.fillStyle='#ffe4b5';ctx.font='bold 14px Manrope,Arial';ctx.fillText(aim.label,x(aim.x)+16,z(aim.z)-14)}ctx.restore()}
 if(scene.waypoint){ctx.strokeStyle='#ffba66';ctx.lineWidth=2;ctx.strokeRect(x(scene.waypoint.x)-5,z(scene.waypoint.z)-5,10,10)}
}

const keys=new Set(),mobile=new Set(),touchMove={x:0,y:0};
let jumpQueued=false;
const touchStick=$('touchStick'),touchKnob=$('touchStickKnob');
let touchMovePointer=null;
function resetTouchMove(){touchMovePointer=null;touchMove.x=0;touchMove.y=0;touchKnob.style.transform='translate(0px,0px)'}
function updateTouchMove(e){
 const box=touchStick.getBoundingClientRect(),radius=Math.min(box.width,box.height)*.32;
 const dx=e.clientX-box.left-box.width/2,dy=e.clientY-box.top-box.height/2;
 const distance=Math.hypot(dx,dy),scale=distance>radius?radius/distance:1;
 const magnitude=Math.min(1,distance/radius),deadzone=.11;
 const strength=magnitude<=deadzone?0:Math.pow((magnitude-deadzone)/(1-deadzone),1.08);
 touchMove.x=distance?dx/distance*strength:0;touchMove.y=distance?-dy/distance*strength:0;
 touchKnob.style.transform=`translate(${Math.round(dx*scale)}px,${Math.round(dy*scale)}px)`;
 sendCurrentInput();
}
touchStick.addEventListener('pointerdown',e=>{
 if(touchMovePointer!==null)return;
 e.preventDefault();touchMovePointer=e.pointerId;touchStick.setPointerCapture(e.pointerId);updateTouchMove(e);
});
touchStick.addEventListener('pointermove',e=>{if(e.pointerId===touchMovePointer){e.preventDefault();updateTouchMove(e)}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])touchStick.addEventListener(event,e=>{if(e.pointerId===touchMovePointer){resetTouchMove();sendCurrentInput()}});
addEventListener('keydown',e=>{
 if(e.target.closest('input,select,textarea'))return;
 if(!$('dialogueBox').classList.contains('hidden')){if(e.code==='Escape')closeDialogue();return}
 if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();const first=!keys.has(e.code);keys.add(e.code);
 if(e.code==='Escape'){if(data.view==='panel')resumeView();else if(data.room)show(data.view==='hud'?'menu':'hud')}
 if(e.code==='KeyM'&&data.room)openPanel('map');
 if(e.code==='Enter'&&data.room&&data.view==='hud'){if(document.pointerLockElement)document.exitPointerLock();$('chatInput').focus()}
 if(e.code==='KeyE'&&data.room)scene.gather();
 if(e.code==='KeyF'&&data.room&&first)scene.ability();
 if(e.code==='KeyR'&&data.room&&first)scene.talk();
 if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space'].includes(e.code))sendCurrentInput();
});
addEventListener('keyup',e=>{keys.delete(e.code);sendCurrentInput()});addEventListener('blur',()=>{keys.clear();mobile.clear();resetTouchMove();jumpQueued=false;$('mobileSprint').classList.remove('is-active');$('mobileSprint').setAttribute('aria-pressed','false');if(data.room&&data.ws?.readyState===WebSocket.OPEN)data.ws.send(JSON.stringify({type:'stop_input'}))});
for(const b of document.querySelectorAll('[data-move]')){
 const code={up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD'}[b.dataset.move];
 b.addEventListener('pointerdown',e=>{e.preventDefault();mobile.add(code);b.setPointerCapture(e.pointerId);sendCurrentInput()});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>{mobile.delete(code);sendCurrentInput()});
}
function holdMobileButton(id,code,onPress){
 const button=$(id);let activePointer=null;
 button.addEventListener('pointerdown',e=>{
  if(activePointer!==null)return;
  e.preventDefault();activePointer=e.pointerId;mobile.add(code);button.setPointerCapture(e.pointerId);if(onPress)onPress();else sendCurrentInput();
 });
 for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{
  if(e.pointerId===activePointer){activePointer=null;mobile.delete(code);sendCurrentInput()}
 });
}
const sprintButton=$('mobileSprint');
sprintButton.setAttribute('aria-pressed','false');
sprintButton.onclick=()=>{
 const active=!mobile.has('ShiftLeft');
 if(active)mobile.add('ShiftLeft');else mobile.delete('ShiftLeft');
 sprintButton.classList.toggle('is-active',active);
 sprintButton.setAttribute('aria-pressed',String(active));
 sendCurrentInput();
};
holdMobileButton('mobileJump','Space',()=>{jumpQueued=true;sendCurrentInput(true)});
$('mobileJump').onclick=e=>{if(e.detail===0){jumpQueued=true;sendCurrentInput(true)}};
$('attackButton').onclick=()=>scene.attack();$('gatherButton').onclick=()=>scene.gather();
$('abilityButton').onclick=()=>scene.ability();
$('talkButton').onclick=()=>scene.talk();
if(matchMedia('(pointer: coarse)').matches){
 $('hudMenu').textContent='Меню';
 $('abilityButton').textContent='Умение';
 $('gatherButton').textContent='Собрать';
 $('talkButton').textContent='Диалог';
}
function currentInputState(){
 const k=code=>keys.has(code)||mobile.has(code),lr=Number(k('KeyD'))-Number(k('KeyA'))+touchMove.x,ud=Number(k('KeyW'))-Number(k('KeyS'))+touchMove.y;
 return {...cameraRelativeVector(scene.yaw,lr,ud),sprint:k('ShiftLeft')||k('ShiftRight'),jump:k('Space')};
}
function sendCurrentInput(forceJump=false){
 if(!data.room||data.view!=='hud'||!data.ws||data.ws.readyState!==WebSocket.OPEN)return;
 const now=performance.now();if(!forceJump&&now-(sendCurrentInput.lastAt||0)<33)return;
 sendCurrentInput.lastAt=now;
 const input=currentInputState();
 send({type:'input',...input,jump:forceJump||jumpQueued||input.jump});
 if(!forceJump)jumpQueued=false;
}
setInterval(()=>sendCurrentInput(),45);

async function bootstrap(){
 $('loadProgress').style.width='20%';$('loadLabel').textContent='Восстанавливаем земли прайда…';
 try{scene=new Scene();$('loadProgress').style.width='75%';}catch(error){$('loadLabel').textContent='Ошибка WebGL: '+error.message;return}
 $('loadProgress').style.width='100%';
 setTimeout(()=>{$('loading').style.opacity='0';setTimeout(()=>$('loading').remove(),620);$('topbar').classList.remove('hidden');if(!Auth.configured()){show('authScreen');$('authError').textContent='Для настоящего онлайна настройте client/config.js и отдельный игровой сервер.';connection('offline','Ожидает настройку');return}
 const hash=new URLSearchParams(location.hash.replace(/^#/,''));
 if(hash.has('error')||hash.has('error_description')){
  show('authScreen');$('authError').textContent=hash.get('error_description')||'Не удалось подтвердить ссылку. Попробуй снова.';history.replaceState(null,'',location.pathname+location.search);return;
 }
 if(hash.has('access_token')&&hash.has('refresh_token')){
  Auth.save({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in')||3600),expires_at:Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600)});
  history.replaceState(null,'',location.pathname+location.search);
  if(hash.get('type')==='recovery'){show('resetScreen');return}
  connect();return;
 }
 Auth.restore().then(ok=>{if(ok)connect();else show('authScreen')}).catch(()=>show('authScreen'));
 },400);
}
bootstrap();
