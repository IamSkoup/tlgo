import { randomUUID, randomBytes } from 'node:crypto';
import { TICK_RATE, SNAPSHOT_RATE, ROOM_LIMIT, PUBLIC_ROOM_ID, MAX_COORD, SPAWN, QUESTS, COOP_OPERATION, CONTACTS, RESOURCES, NPC_DEFS, distance, safe, clamp, cleanText, validateInput } from './rules.mjs';
import {resolveTerrain} from './terrain.mjs';
import {SHOPS,SHOP_ITEMS,hungerAfter,itemEffect} from './survival.mjs';

// All inbound commands are intents. World coordinates, HP, damage and rewards
// are never accepted from the client as authoritative facts.
export class GameCore {
  constructor(store, { clock=()=>Date.now(), log=console }={}) {
    this.store=store;this.clock=clock;this.log=log;this.rooms=new Map();this.peers=new Map();this.tickCount=0;
    this.rooms.set(PUBLIC_ROOM_ID,this.createRoom(PUBLIC_ROOM_ID,'Общая саванна','public',null,null));
  }
  createRoom(id,name,visibility,owner,code) {
    return { id,name,visibility,owner,code,blocked:new Set(),epoch:randomUUID(),weather:0,weatherChangedAt:this.clock(),players:new Map(),parties:new Map(),npcs:new Map(NPC_DEFS.map(n=>[n.id,{...n,home:{x:n.x,z:n.z},maxHp:n.hp,deadUntil:0,spawn:0,aggro:null,damage:new Map(),vx:0,vz:0}])),resources:new Map(RESOURCES.map(n=>[n.id,{...n,readyAt:0}])),chat:[] };
  }
  emit(peer,obj) { try {peer.send(obj)}catch(error){this.log.error('send failed',error.message)} }
  error(peer,message){this.emit(peer,{type:'error',message})}
  async attach(id,send,user){
    if(this.peers.has(id))throw Error('Connection already attached');
    const peer={id,send,user,room:null,player:null,chatAt:0,actions:new Map(),lastInputAt:0,invalid:0,joinedAt:this.clock(),partyInvites:new Map()};
    this.peers.set(id,peer);
    const profile=await this.store.profile(user.id);
    peer.playerProfile=profile;
    this.emit(peer,{type:'hello',profile, species:await this.store.species(),shops:SHOPS,items:SHOP_ITEMS,serverTime:this.clock()});
    if(profile)await this.refresh(peer);
    return peer;
  }
  async refresh(peer){
    peer.playerProfile=await this.store.profile(peer.user.id);
    const [wallet,owned,ledger,quests,friends,clan,inventory]=await Promise.all([
      this.store.wallet(peer.user.id),this.store.owned(peer.user.id),this.store.ledger(peer.user.id),
      this.store.quests(peer.user.id),this.store.friends(peer.user.id),this.store.clan(peer.user.id),this.store.inventory(peer.user.id)
    ]);
    peer.clan=clan;
    this.emit(peer,{type:'account',profile:peer.playerProfile,wallet,owned,ledger,quests,friends,clan,inventory});
  }
  rate(peer,key,ms){const now=this.clock(),last=peer.actions.get(key)||0;if(now-last<ms)return false;peer.actions.set(key,now);return true}
  async command(peer,msg){
    if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string')return;
    if(msg.type==='create_profile') {
      if(peer.playerProfile)return this.error(peer,'Профиль уже создан.');
      if(!this.rate(peer,'create',4000))return;
      const nickname=cleanText(msg.nickname,40),species=cleanText(msg.species,32);
      const color=Number.isSafeInteger(msg.color)?msg.color:0;
      await this.store.createProfile(peer.user.id,nickname,species,color);
      peer.playerProfile=await this.store.profile(peer.user.id);await this.refresh(peer);return;
    }
    if(!peer.playerProfile)return this.error(peer,'Сначала создай персонажа.');
    switch(msg.type){
      case 'join':return this.join(peer,msg);
      case 'leave':return this.leave(peer);
      case 'input':{
        if(!peer.player)return;
        const now=this.clock();if(now-peer.lastInputAt<30)return;
        const input=validateInput(msg);
        if(!input){peer.invalid++;if(peer.invalid>15)this.error(peer,'Подозрительное управление.');return}
        peer.lastInputAt=now;peer.player.input=input;
        // Mobile buttons send a short tap, which must not be lost between ticks.
        if(input.jump&&now>=peer.player.jumpUntil)peer.player.jumpUntil=now+800;
        return;
      }
      case 'stop_input':{
        if(peer.player){peer.player.input={x:0,z:0,sprint:false,jump:false};peer.player.vx=0;peer.player.vz=0;}
        return;
      }
      case 'attack':return this.attack(peer,cleanText(msg.target,48));
      case 'ability':return this.ability(peer);
      case 'gather':return this.gather(peer,cleanText(msg.id,32));
      case 'interact':return this.interact(peer,cleanText(msg.contact,32));
      case 'quest':return this.quest(peer,cleanText(msg.id,32));
      case 'quest_abandon':return this.abandonQuest(peer);
      case 'shop_buy':return this.buyShopItem(peer,cleanText(msg.shop,32),cleanText(msg.item,32));
      case 'item_use':return this.useItem(peer,cleanText(msg.item,32));
      case 'session_invite':return this.sessionInvite(peer,cleanText(msg.userId,64));
      case 'session_kick':return this.sessionKick(peer,cleanText(msg.userId,64));
      case 'session_rename':return this.sessionRename(peer,cleanText(msg.name,45));
      case 'session_rotate_code':return this.sessionRotateCode(peer);
      case 'chat':return this.chat(peer,msg);
      case 'chat_history':return this.chatHistory(peer,msg.scope);
      case 'dm_history':return this.dmHistory(peer,cleanText(msg.userId,64));
      case 'pvp':if(peer.player){peer.player.pvp=msg.enabled===true;this.emit(peer,{type:'notice',message:peer.player.pvp?'PvP разрешён вне безопасных зон.':'PvP отключён.'})}return;
      case 'purchase':{
        if(!this.rate(peer,'purchase',500))return;
        const species=cleanText(msg.species,32);
        await this.store.purchase(peer.user.id,species);await this.refresh(peer);return;
      }
      case 'select':{
        if(peer.player&&!safe(peer.player))return this.error(peer,'Менять животное можно только в безопасном логове.');
        const species=cleanText(msg.species,32);await this.store.select(peer.user.id,species);
        peer.playerProfile=await this.store.profile(peer.user.id);
        if(peer.player) {const spec=(await this.store.species()).find(s=>s.code===species);const owned=(await this.store.owned(peer.user.id)).find(s=>s.species===species);this.resetPlayer(peer.player,spec,owned);}
        await this.refresh(peer);return;
      }
      case 'upgrade':{
        if(!this.rate(peer,'upgrade',500))return;
        const species=cleanText(msg.species,32);
        await this.store.upgrade(peer.user.id,species,cleanText(msg.stat,15));
        if(peer.player?.species===species){const spec=(await this.store.species()).find(s=>s.code===species);const owned=(await this.store.owned(peer.user.id)).find(s=>s.species===species);this.resetPlayer(peer.player,spec,owned);}
        await this.refresh(peer);return;
      }
      case 'recolor':{
        if(!this.rate(peer,'recolor',750))return;
        if(peer.player&&!safe(peer.player))return this.error(peer,'Изменять окрас можно только в безопасном логове.');
        if(!Number.isSafeInteger(msg.color))return this.error(peer,'Выбери допустимый цвет окраса.');
        await this.store.recolor(peer.user.id,msg.color);
        peer.playerProfile=await this.store.profile(peer.user.id);
        if(peer.player)peer.player.color=peer.playerProfile.color;
        await this.refresh(peer);return;
      }
      case 'friend_request':{
        if(!this.rate(peer,'social',900))return;
        const sent=await this.store.friendRequest(peer.user.id,cleanText(msg.nickname,20));await this.refresh(peer);
        for(const online of this.peers.values())if(online.user.id===sent?.recipient){await this.refresh(online);this.emit(online,{type:'notice',message:'Новая заявка в друзья.'})}return;
      }
      case 'friend_accept':{
        const accepted=await this.store.friendAccept(peer.user.id,cleanText(msg.userId,64));await this.refresh(peer);
        for(const online of this.peers.values())if(online.user.id===accepted?.requester){await this.refresh(online);this.emit(online,{type:'notice',message:'Твою заявку в друзья приняли.'})}return;
      }
      case 'friend_follow':{
        const friendId=cleanText(msg.userId,64),friends=await this.store.friends(peer.user.id);
        if(!friends.some(f=>f.status==='accepted'&&f.other?.id===friendId))return this.error(peer,'Этот игрок не в списке твоих друзей.');
        const found=[...this.rooms.values()].find(room=>room.players.has(friendId));
        if(!found)return this.error(peer,'Друг пока не играет на этом сервере.');
        if(found.players.size>=ROOM_LIMIT)return this.error(peer,'Сессия друга заполнена.');
        this.emit(peer,{type:'friend_session',code:found.code||null,friend:friendId});return;
      }
      case 'party_create':return this.partyCreate(peer);
      case 'party_invite':return this.partyInvite(peer,cleanText(msg.nickname,20));
      case 'party_accept':return this.partyAccept(peer,cleanText(msg.partyId,48));
      case 'party_leave':return this.partyLeave(peer);
      case 'party_start':return this.partyStart(peer);
      case 'clan_create':{
        if(!this.rate(peer,'clan',1500))return;
        await this.store.createClan(peer.user.id,cleanText(msg.name,28));await this.refresh(peer);return;
      }
      case 'clan_join':{
        if(!this.rate(peer,'clan',1500))return;
        await this.store.joinClan(peer.user.id,cleanText(msg.name,28));await this.refresh(peer);return;
      }
      case 'clan_leave':{
        await this.store.leaveClan(peer.user.id);await this.refresh(peer);return;
      }
      case 'report':{
        if(!this.rate(peer,'report',10000))return;
        await this.store.report(peer.user.id,cleanText(msg.userId,64),cleanText(msg.body,1000));this.emit(peer,{type:'notice',message:'Жалоба отправлена.'});return;
      }
      default:this.error(peer,'Неизвестное действие.');
    }
  }
  async join(peer,msg){
    let target=PUBLIC_ROOM_ID;
    if(typeof msg.code==='string'&&msg.code.trim()){
      const joinCode=msg.code.trim().toUpperCase();
      let room=[...this.rooms.values()].find(r=>r.code===joinCode);
      if(!room){
        const persisted=await this.store.findSession(joinCode);
        if(persisted){room=this.createRoom(persisted.id,persisted.name,persisted.visibility,persisted.owner_id,persisted.invite_code);this.rooms.set(room.id,room)}
      }
      if(!room)return this.error(peer,'Приватная сессия с таким кодом не найдена.');target=room.id;
    }else if(msg.private===true){
      const code=randomBytes(4).toString('hex').toUpperCase(),id=randomUUID();
      await this.store.createSession({id,name:'Личная саванна',visibility:'private',owner_id:peer.user.id,invite_code:code});
      this.rooms.set(id,this.createRoom(id,'Личная саванна','private',peer.user.id,code));target=id;
    }
    let room=this.rooms.get(target);
    if(room.blocked.has(peer.user.id))return this.error(peer,'Владелец ограничил доступ к этой сессии.');
    if(room.players.size>=ROOM_LIMIT)return this.error(peer,'Сессия заполнена.');
    if(peer.room)this.leave(peer);
    await this.store.joinSession(room.id,peer.user.id);
    const species=(await this.store.species()).find(s=>s.code===peer.playerProfile.selected_species);
    if(!species)throw Error('Selected species not found');
    const [saved,hunger]=await Promise.all([this.store.position(peer.user.id),this.store.hunger(peer.user.id)]);
    const p={id:peer.user.id,nickname:peer.playerProfile.nickname,species:species.code,model:species.model,color:peer.playerProfile.color,
      x:clamp(Number(saved?.x) || SPAWN.x,-MAX_COORD,MAX_COORD),z:clamp(Number(saved?.z)||SPAWN.z,-MAX_COORD,MAX_COORD),
      heading:0,vx:0,vz:0,hp:species.hp,maxHp:species.hp,stamina:species.stamina,maxStamina:species.stamina,
      power:species.power,speed:Number(species.speed),input:{x:0,z:0,sprint:false,jump:false},jumpUntil:0,
      pvp:false,lastAttack:0,abilityUntil:0,abilityCooldown:0,wanted:0,lastCrime:0,wantedDecayAt:0,nextGuardWave:0,deathCount:0,peer,quest:null,questProgress:0,visitIndex:0,deathUntil:0,level:peer.playerProfile.level,hunger};
    const ranks=(await this.store.owned(peer.user.id)).find(o=>o.species===species.code);this.resetPlayer(p,species,ranks);
    const unfinished=(await this.store.quests(peer.user.id)).find(q=>q.state==='active'&&QUESTS[q.quest_id]);
    if(unfinished){p.quest=unfinished.quest_id;p.questProgress=Math.min(QUESTS[p.quest].count,unfinished.progress);p.visitIndex=p.questProgress}
    peer.room=room;peer.player=p;room.players.set(p.id,p);
    this.emit(peer,{type:'joined',room:{id:room.id,name:room.name,code:room.code,visibility:room.visibility,owner:room.owner},you:p.id,resources:[...room.resources.values()],quests:QUESTS,shops:SHOPS,items:SHOP_ITEMS});
    this.store.chatHistory('session_id',room.id).then(rows=>this.emit(peer,{type:'chat_history',channel:'session',rows:rows.map(r=>({author:room.players.get(r.author)?.nickname||'Игрок',body:r.body,time:r.created_at}))})).catch(e=>this.log.error('session history',e.message));
    if(p.quest)this.emit(peer,{type:'quest_state',id:p.quest,progress:p.questProgress,total:QUESTS[p.quest].count});
    this.broadcast(room,{type:'notice',message:`${p.nickname} появился в саванне.`});
    return p;
  }
  leave(peer){
    if(!peer.room)return;
    this.partyLeave(peer,true);
    const room=peer.room,p=peer.player;
    room.players.delete(p.id);peer.room=null;peer.player=null;
    this.store.leaveSession(room.id,p.id).catch(e=>this.log.error('membership leave',e.message));
    this.store.savePosition(p.id,p.x,p.z,p.heading).catch(e=>this.log.error('position save',e.message));
    this.store.saveHunger(p.id,p.hunger).catch(e=>this.log.error('hunger save',e.message));
    this.broadcast(room,{type:'departed',id:p.id});
    if(room.visibility==='private'&&room.players.size===0)this.rooms.delete(room.id);
  }
  detach(peer){this.leave(peer);this.peers.delete(peer.id)}
  resetPlayer(player,spec,ranks={}){player.species=spec.code;player.model=spec.model;player.hp=spec.hp;player.maxHp=spec.hp;player.stamina=spec.stamina+12*(ranks?.endurance_rank||0);player.maxStamina=player.stamina;player.power=spec.power+2*(ranks?.power_rank||0);player.speed=Number(spec.speed)}
  broadcast(room,msg,filter=()=>true){for(const p of room.players.values())if(filter(p))this.emit(p.peer,msg)}
  async reward(p,amount,reason,key,xp=0){
    const result=await this.store.reward(p.id,amount,reason,key,xp);
    if(result.awarded)this.emit(p.peer,{type:'reward',amount,reason,balance:result.balance});
    await this.refresh(p.peer);
  }
  async quest(peer,id){
    const p=peer.player,q=QUESTS[id];if(!p||!q)return this.error(peer,'Зайди в сессию и выбери поручение.');
    const prior=await this.store.quests(p.id);
    if(prior.some(x=>x.quest_id===id&&x.state==='completed'))return this.error(peer,'Это поручение уже пройдено.');
    if(p.quest)return this.error(peer,'Сначала закончи текущее поручение.');
    p.quest=id;p.questProgress=prior.find(x=>x.quest_id===id)?.progress||0;p.visitIndex=p.questProgress;
    await this.store.setQuest(p.id,id,p.questProgress,'active');
    this.emit(peer,{type:'quest_state',id,progress:p.questProgress,total:q.count});
  }
  async abandonQuest(peer){
    const p=peer.player;
    if(!p||!p.quest)return this.error(peer,'У тебя нет активного поручения.');
    const id=p.quest;
    const removed=await this.store.abandonQuest(p.id,id);
    if(!removed?.length)return this.error(peer,'Поручение уже завершено или отменено.');
    p.quest=null;p.questProgress=0;p.visitIndex=0;
    this.emit(peer,{type:'quest_state',id,progress:0,total:QUESTS[id].count,abandoned:true});
    await this.refresh(peer);
  }
  async progressQuest(p,kind){
    if(!p.quest||QUESTS[p.quest].kind!==kind)return;
    const q=QUESTS[p.quest];p.questProgress=Math.min(q.count,p.questProgress+1);
    if(p.questProgress>=q.count){
      const id=p.quest;p.quest=null;
      const result=await this.store.finishQuest(p.id,id);
      if(result.awarded)this.emit(p.peer,{type:'reward',amount:q.reward,reason:'Поручение: '+q.title,balance:result.balance});
      await this.refresh(p.peer);
      this.emit(p.peer,{type:'quest_state',id,progress:q.count,total:q.count,completed:true});
    } else {
      await this.store.setQuest(p.id,p.quest,p.questProgress,'active');
      this.emit(p.peer,{type:'quest_state',id:p.quest,progress:p.questProgress,total:q.count});
    }
  }
  async gather(peer,id){
    const p=peer.player,r=peer.room?.resources.get(id);if(!p||!r)return;
    if(!this.rate(peer,'gather',700)||distance(p,r)>5.5||this.clock()<r.readyAt)return this.error(peer,'Растение далеко или ещё не выросло.');
    r.readyAt=this.clock()+45000;
    this.broadcast(peer.room,{type:'resource',id,readyAt:r.readyAt});
    await this.reward(p,r.type==='relic'?30:14,r.type==='relic'?'Древний след':'Целебные травы',`resource:${peer.room.epoch}:${id}:${r.readyAt}`,15);
    if(r.type==='herb'){await this.store.grantItem(p.id,'herb');await this.refresh(peer);this.emit(peer,{type:'notice',message:'Лечебные травы добавлены в инвентарь.'});}
    if(r.type==='herb')await this.progressQuest(p,'gather');
    if(r.type==='herb')await this.partyProgress(p,'gather',r,`herb:${id}:${r.readyAt}`);
  }
  async interact(peer,id){
    const p=peer.player,shop=SHOPS[id],contact=CONTACTS[id];
    if(shop){
      if(!p||distance(p,shop)>12)return this.error(peer,'Подойди ближе к торговцу.');
      if(!this.rate(peer,'interact',600))return;
      this.emit(peer,{type:'shop_open',shop:id,items:shop.items});return;
    }
    if(!p||!contact)return this.error(peer,'Здесь не с кем разговаривать.');
    if(distance(p,contact)>16)return this.error(peer,'Подойди ближе к собеседнику.');
    if(!this.rate(peer,'interact',600))return;
    const records=contact.quest?await this.store.quests(p.id):[];
    const complete=records.some(q=>q.quest_id===contact.quest&&q.state==='completed');
    let line=contact.lines[Math.floor(this.clock()/8000)%contact.lines.length];
    if(p.wanted>=2&&['kion','simba','nala'].includes(id))line='Здесь тебя ищут. Отойди, успокойся и не создавай новых проблем.';
    this.emit(peer,{type:'dialogue',contact:id,name:contact.name,text:line,quest:p.wanted>=2?null:contact.quest&&!complete?contact.quest:null,completed:complete});
  }
  async buyShopItem(peer,shopId,itemCode){
    const p=peer.player,shop=SHOPS[shopId],item=SHOP_ITEMS[itemCode];
    if(!p||p.hp<=0||!shop||!item||!shop.items.includes(itemCode)||distance(p,shop)>12)return this.error(peer,'Торговец далеко или такого товара здесь нет.');
    if(!this.rate(peer,'shop_buy',350))return;
    await this.store.buyItem(p.id,itemCode,`shop:${randomUUID()}`);
    await this.refresh(peer);
    this.emit(peer,{type:'notice',message:`Куплено: ${item.name}. Открой инвентарь, чтобы использовать.`});
  }
  async useItem(peer,itemCode){
    const p=peer.player,item=SHOP_ITEMS[itemCode];
    if(!p||p.hp<=0||!item)return this.error(peer,'Этот предмет сейчас недоступен.');
    if(!this.rate(peer,'item_use',700))return;
    const effect=itemEffect(item,p.hunger,p.hp,p.maxHp);
    if(effect.hunger<=p.hunger&&effect.hp<=p.hp)return this.error(peer,'Сейчас этот предмет ничего не восстановит.');
    await this.store.consumeItem(p.id,itemCode);
    p.hunger=effect.hunger;p.hp=effect.hp;
    await this.store.saveHunger(p.id,p.hunger);
    await this.refresh(peer);
    this.emit(peer,{type:'survival',hunger:Math.round(p.hunger),hp:Math.round(p.hp)});
    this.emit(peer,{type:'notice',message:`Использовано: ${item.name}.`});
  }
  sessionOwner(peer){return peer.room?.visibility==='private'&&peer.room.owner===peer.user.id}
  async sessionInvite(peer,userId){
    if(!this.sessionOwner(peer))return this.error(peer,'Приглашать в личную сессию может только её владелец.');
    if(!this.rate(peer,'session_invite',700))return;
    const friend=(await this.store.friends(peer.user.id)).find(f=>f.status==='accepted'&&f.other?.id===userId);
    if(!friend)return this.error(peer,'Сначала добавь этого игрока в друзья.');
    const online=[...this.peers.values()].filter(other=>other.user.id===userId);
    if(!online.length)return this.error(peer,'Друг сейчас не в сети. Код можно отправить ему отдельно.');
    for(const target of online)this.emit(target,{type:'session_invitation',from:peer.playerProfile.nickname,fromId:peer.user.id,code:peer.room.code,name:peer.room.name});
    this.emit(peer,{type:'notice',message:'Приглашение отправлено '+friend.other.nickname+'.'});
  }
  sessionKick(peer,userId){
    if(!this.sessionOwner(peer))return this.error(peer,'Исключать игроков может только владелец сессии.');
    if(userId===peer.user.id)return this.error(peer,'Себя исключить нельзя.');
    const room=peer.room,target=room.players.get(userId);
    if(!target)return this.error(peer,'Игрок не находится в этой сессии.');
    room.blocked.add(userId);
    this.leave(target.peer);
    this.emit(target.peer,{type:'session_kicked',message:'Владелец исключил тебя из сессии.'});
    this.emit(peer,{type:'notice',message:'Игрок '+target.nickname+' исключён.'});
  }
  async sessionRename(peer,name){
    if(!this.sessionOwner(peer))return this.error(peer,'Только владелец может менять название сессии.');
    if(name.length<3||name.length>45)return this.error(peer,'Название должно содержать от 3 до 45 символов.');
    await this.store.renameSession(peer.room.id,name);
    peer.room.name=name;
    this.broadcast(peer.room,{type:'session_updated',name,code:peer.room.code});
  }
  async sessionRotateCode(peer){
    if(!this.sessionOwner(peer))return this.error(peer,'Только владелец может менять код сессии.');
    const code=randomBytes(4).toString('hex').toUpperCase();
    await this.store.rotateSessionCode(peer.room.id,code);
    peer.room.code=code;
    this.broadcast(peer.room,{type:'session_updated',name:peer.room.name,code});
    this.emit(peer,{type:'notice',message:'Код изменён. Старый код больше не работает.'});
  }
  partyFor(peer){if(!peer.room)return null;return [...peer.room.parties.values()].find(p=>p.members.has(peer.user.id))||null}
  partyBroadcast(party,msg){for(const id of party.members){const p=party.room.players.get(id);if(p)this.emit(p.peer,msg)}}
  partyState(party){
    const stage=party.operation?.stage;
    const stageInfo=COOP_OPERATION.stages.find(s=>s.key===stage);
    return {type:'party_state',party:{id:party.id,leader:party.leader,
      members:[...party.members].map(id=>party.room.players.get(id)).filter(Boolean).map(p=>({id:p.id,nickname:p.nickname,species:p.species})),
      operation:party.operation?{title:COOP_OPERATION.title,stage,stageName:stageInfo?.name||'Завершено',progress:party.operation.progress,total:stageInfo?.count||2}:null}};
  }
  partyNotify(party){this.partyBroadcast(party,this.partyState(party))}
  partyCreate(peer){
    if(!peer.room||!peer.player)return this.error(peer,'Сначала войди в саванну.');
    if(this.partyFor(peer))return this.error(peer,'Ты уже состоишь в группе.');
    const party={id:randomUUID(),room:peer.room,leader:peer.user.id,members:new Set([peer.user.id]),operation:null};
    peer.room.parties.set(party.id,party);this.partyNotify(party);
  }
  partyInvite(peer,nickname){
    const party=this.partyFor(peer);if(!party)return this.error(peer,'Сначала создай группу.');
    if(party.leader!==peer.user.id)return this.error(peer,'Приглашать может лидер группы.');
    if(!this.rate(peer,'party_invite',1100))return;
    const target=[...party.room.players.values()].find(p=>p.nickname.toLowerCase()===nickname.toLowerCase());
    if(!target||target.id===peer.user.id)return this.error(peer,'Игрок с таким ником сейчас не находится в сессии.');
    if(party.members.size>=4||this.partyFor(target.peer))return this.error(peer,'Группа заполнена или игрок уже в другой группе.');
    target.peer.partyInvites.set(party.id,this.clock()+60000);
    this.emit(target.peer,{type:'party_invitation',partyId:party.id,from:peer.player.nickname});
    this.emit(peer,{type:'notice',message:'Приглашение отправлено.'});
  }
  partyAccept(peer,partyId){
    const deadline=peer.partyInvites.get(partyId);peer.partyInvites.delete(partyId);
    if(!deadline||deadline<this.clock())return this.error(peer,'Приглашение истекло.');
    if(this.partyFor(peer))return this.error(peer,'Ты уже состоишь в группе.');
    const party=peer.room?.parties.get(partyId);
    if(!party||party.members.size>=4)return this.error(peer,'Группа больше недоступна.');
    if(party.operation&&party.operation.stage!=='completed')return this.error(peer,'Операция уже началась.');
    party.members.add(peer.user.id);this.partyNotify(party);
  }
  partyLeave(peer,quiet=false){
    const party=this.partyFor(peer);if(!party)return;
    party.members.delete(peer.user.id);
    if(party.members.size===0){party.room.parties.delete(party.id)}
    else{
      if(party.leader===peer.user.id)party.leader=[...party.members][0];
      if(party.operation&&party.operation.stage!=='completed'&&party.members.size<2){party.operation=null;this.partyBroadcast(party,{type:'notice',message:'Операция остановлена: осталось меньше двух участников.'})}
      this.partyNotify(party);
    }
    if(!quiet)this.emit(peer,{type:'party_state',party:null});
  }
  partyStart(peer){
    const party=this.partyFor(peer);
    if(!party||party.leader!==peer.user.id)return this.error(peer,'Начать операцию может лидер группы.');
    if(party.members.size<2)return this.error(peer,'Для совместного дозора нужны хотя бы два игрока.');
    if(party.operation&&party.operation.stage!=='completed')return this.error(peer,'Операция уже идёт.');
    if([...party.members].some(id=>{const p=party.room.players.get(id);return !p||p.hp<=0||distance(p,peer.player)>50}))return this.error(peer,'Соберите группу рядом с лидером, прежде чем идти в дозор.');
    party.operation={stage:'gather',progress:0,seen:new Set(),startedAt:this.clock()};
    this.partyNotify(party);
    this.partyBroadcast(party,{type:'notice',message:'Совместный дозор начался. Соберите две связки трав вместе.'});
  }
  async partyProgress(player,kind,location,eventKey){
    const party=this.partyFor(player.peer),op=party?.operation;
    if(!op||op.stage!==kind||op.seen.has(eventKey))return;
    const together=[...party.members].filter(id=>{const p=party.room.players.get(id);return p&&p.hp>0&&distance(p,location)<45});
    if(together.length<2)return;
    op.seen.add(eventKey);op.progress++;
    const current=COOP_OPERATION.stages.find(s=>s.key===kind);
    if(op.progress>=current.count){
      const next=COOP_OPERATION.stages[COOP_OPERATION.stages.indexOf(current)+1];
      if(next){op.stage=next.key;op.progress=0;op.seen.clear();this.partyBroadcast(party,{type:'notice',message:'Травы собраны. Теперь остановите двух диких гиен.'})}
      else{
        op.stage='completed';this.partyBroadcast(party,{type:'party_completed',title:COOP_OPERATION.title});
        const day=new Date(this.clock()).toISOString().slice(0,10);
        for(const id of party.members){const member=party.room.players.get(id);if(member)await this.reward(member,COOP_OPERATION.reward,COOP_OPERATION.title,'coop:joint_patrol:'+day,COOP_OPERATION.xp)}
      }
    }
    this.partyNotify(party);
  }
  async attack(peer,target){
    const p=peer.player,room=peer.room;if(!p||p.hp<=0)return;
    const now=this.clock();if(now-p.lastAttack<950||p.stamina<9)return;
    const n=room.npcs.get(target),other=room.players.get(target),victim=n||other;
    if(!victim||victim.hp<=0||(n&&n.deadUntil>now)||distance(p,victim)>5)return;
    if(other&&(safe(p)||safe(other)||!p.pvp||!other.pvp))return this.error(peer,'PvP доступен по согласию вне безопасных зон.');
    if(n&&!n.hostile&&safe(p))return this.error(peer,'Здесь нельзя нападать на мирных животных.');
    p.lastAttack=now;p.stamina-=9;
    const damage=clamp(p.power,4,38)*(other?.55:1);
    victim.hp=Math.max(0,victim.hp-damage);
    this.broadcast(room,{type:'hit',from:p.id,target,damage:Math.round(damage),hp:Math.round(victim.hp)},pl=>distance(pl,p)<170);
    if(n){
      n.aggro=p.id;n.damage.set(p.id,(n.damage.get(p.id)||0)+damage);
      if(!n.hostile){p.wanted=clamp(p.wanted+1,0,5);p.lastCrime=now;p.wantedDecayAt=now+30000;this.emit(peer,{type:'wanted',level:p.wanted,message:'Нападение замечено стражей.'});}
    }
    if(victim.hp<=0){
      if(other)this.killPlayer(other,now);
      else{
        n.deadUntil=now+65000;n.spawn++;n.aggro=null;
        if(!n.hostile) await this.store.adjustReputation(p.id,-5);
        for(const [user,contribution] of n.damage){
          const winner=room.players.get(user);if(winner&&contribution>=12&&distance(winner,n)<70){
            await this.reward(winner,n.hostile?38:15,n.hostile?'Опасный противник':'Охота',`hunt:${room.epoch}:${n.id}:${n.spawn}`,n.hostile?35:12);
            if(n.hostile)await this.progressQuest(winner,'hunt');
          }
        }
        if(n.hostile)await this.partyProgress(p,'hunt',n,`hunt:${n.id}:${n.spawn}`);
        n.damage.clear();
      }
    }
  }
  ability(peer){
    const p=peer.player;if(!p||p.hp<=0)return;
    const now=this.clock();if(now<p.abilityCooldown||p.stamina<30)return this.error(peer,'Способность ещё не готова.');
    p.stamina-=30;p.abilityCooldown=now+16000;p.abilityUntil=now+3500;
    let text='Рывок';
    if(['lion','lion_adult','hyena','wild_dog'].includes(p.species)){
      text='Рык угрозы';
      for(const n of peer.room.npcs.values())if(n.hostile&&distance(n,p)<13)n.stunnedUntil=now+2300;
    }else if(['zebra','gazelle','giraffe','rhino','hippo','elephant'].includes(p.species))text='Второе дыхание';
    else if(p.species==='monkey')text='Ловкий прыжок';
    this.broadcast(peer.room,{type:'ability',id:p.id,name:text},other=>distance(other,p)<100);
  }
  async chat(peer,msg){
    if(!this.rate(peer,'chat',950))return;
    const body=cleanText(msg.body,350);if(!body)return;
    const scope=['local','clan','private'].includes(msg.scope)?msg.scope:'session';
    const p=peer.player,room=peer.room;
    const entry={type:'chat',id:randomUUID(),author:peer.playerProfile.nickname,userId:peer.user.id,body,channel:scope,time:this.clock()};
    if(scope==='private'){
      const otherId=cleanText(msg.to,64),friends=await this.store.friends(peer.user.id);
      const friend=friends.find(f=>f.status==='accepted'&&f.other?.id===otherId);
      if(!friend)return this.error(peer,'Личные сообщения доступны только друзьям.');
      entry.to=otherId;entry.toName=friend.other.nickname;
      this.emit(peer,entry);
      for(const online of this.peers.values())if(online!==peer&&online.user.id===otherId)this.emit(online,entry);
      this.store.saveChat(peer.user.id,null,body,{recipient:otherId}).catch(e=>this.log.error('direct message',e.message));
      return;
    }
    if(scope==='clan'){
      if(!peer.clan)return this.error(peer,'Ты пока не в прайде или стае.');
      entry.clanId=peer.clan.id;
      for(const online of this.peers.values())if(online.clan?.id===peer.clan.id)this.emit(online,entry);
      this.store.saveChat(peer.user.id,null,body,{clan_id:peer.clan.id}).catch(e=>this.log.error('clan message',e.message));
      return;
    }
    if(!p||!room)return this.error(peer,'Сначала войди в сессию.');
    this.broadcast(room,entry,other=>scope!=='local'||distance(other,p)<45);
    if(scope==='session')this.store.saveChat(p.id,room.id,body).catch(e=>this.log.error('chat persistence',e.message));
  }
  async chatHistory(peer,scope){
    if(scope==='session'){
      if(!peer.room)return this.error(peer,'Сначала войди в сессию.');
      const rows=await this.store.chatHistory('session_id',peer.room.id);
      this.emit(peer,{type:'chat_history',channel:'session',rows:rows.map(r=>({author:peer.room.players.get(r.author)?.nickname||'Игрок',body:r.body,time:r.created_at}))});return;
    }
    if(scope!=='clan'||!peer.clan)return this.error(peer,'История сообщества недоступна.');
    const rows=await this.store.chatHistory('clan_id',peer.clan.id);
    this.emit(peer,{type:'chat_history',channel:'clan',rows:rows.map(r=>({author:r.author===peer.user.id?peer.playerProfile.nickname:'Участник прайда',body:r.body,time:r.created_at}))});
  }
  async dmHistory(peer,otherId){
    const friends=await this.store.friends(peer.user.id),friend=friends.find(f=>f.status==='accepted'&&f.other?.id===otherId);
    if(!friend)return this.error(peer,'Личная переписка доступна только друзьям.');
    const rows=await this.store.directHistory(peer.user.id,otherId);
    this.emit(peer,{type:'dm_history',with:otherId,nickname:friend.other.nickname,rows});
  }
  killPlayer(p,now){
    if(p.deathUntil>now)return;
    p.deathUntil=now+5000;p.input={x:0,z:0,sprint:false,jump:false};
    this.emit(p.peer,{type:'dead',seconds:5});
    const death=++p.deathCount;
    this.chargeDeath(p,death).catch(error=>this.log.error('death penalty',error.message));
  }
  async chargeDeath(p,death){
    const result=await this.store.deathPenalty(p.id,`death:${p.peer.room?.epoch||'room'}:${p.id}:${death}`);
    this.emit(p.peer,{type:'death_penalty',amount:result.amount||0,balance:result.balance});
    await this.refresh(p.peer);
  }
  callGuards(room,p,now){
    if(p.wanted<=0||p.hp<=0||safe(p)||now<p.nextGuardWave)return;
    const nearby=[...room.npcs.values()].filter(n=>n.guard&&now>=n.deadUntil&&distance(n,p)<90);
    if(nearby.length>=2)return;
    let called=0;
    for(let i=0;i<3&&nearby.length+called<2;i++){
      const id=`guard-${p.id}-${i}`;
      const old=room.npcs.get(id);
      if(old&&now>=old.deadUntil&&distance(old,p)<90)continue;
      if(old&&now<old.deadUntil)continue;
      const angle=(now/3300+i*2.8)%(Math.PI*2),radius=23+i*5;
      const point=resolveTerrain(p.x+Math.cos(angle)*radius,p.z+Math.sin(angle)*radius,1);
      room.npcs.set(id,{id,name:'Страж дозора',species:'lion',x:point.x,z:point.z,
        home:{x:point.x,z:point.z},hp:220,maxHp:220,hostile:false,guard:true,reinforcement:true,
        wantedId:p.id,spawnedAt:now,deadUntil:0,spawn:0,aggro:p.id,damage:new Map(),vx:0,vz:0});
      called++;
    }
    if(called){p.nextGuardWave=now+11000;this.emit(p.peer,{type:'notice',message:'Стража заметила тебя и вышла на перехват.'});}
  }
  tick(dt=1/TICK_RATE){
    this.tickCount++;
    const now=this.clock();
    for(const room of this.rooms.values()){
      if(now-room.weatherChangedAt>180000){room.weatherChangedAt=now;room.weather=(room.weather+1+Math.floor(Math.random()*3))%8;this.broadcast(room,{type:'weather',index:room.weather})}
      for(const p of room.players.values()){
        if(p.hp<=0){if(now>=p.deathUntil){p.x=SPAWN.x;p.z=SPAWN.z;p.hp=p.maxHp;p.stamina=p.maxStamina;p.wanted=0;p.deathUntil=0;p.input={x:0,z:0,sprint:false,jump:false};this.emit(p.peer,{type:'respawn'});}continue;}
        // A paused tab or opened menu cannot keep an old movement command active.
        if(now-p.peer.lastInputAt>500)p.input={x:0,z:0,sprint:false,jump:false};
        const input=p.input;let speed=p.speed;
        if(now<p.abilityUntil)speed*=1.23;
        if(input.sprint&&p.stamina>1){speed*=1.5;p.stamina=Math.max(0,p.stamina-15*dt)}else p.stamina=Math.min(p.maxStamina,p.stamina+(p.hunger>0?11:3)*dt);
        p.hunger=hungerAfter(p.hunger,dt,input.sprint&&Math.hypot(input.x,input.z)>.1);
        if(!p.hunger&&now>=(p.starveAt||0)){
          p.starveAt=now+5000;p.hp=Math.max(0,p.hp-3);
          if(!p.hp)this.killPlayer(p,now);
        }
        const accel=Math.min(1,dt*(Math.hypot(input.x,input.z)>.04?16:24));p.vx+=(input.x*speed-p.vx)*accel;p.vz+=(input.z*speed-p.vz)*accel;
        const position=resolveTerrain(p.x+p.vx*dt,p.z+p.vz*dt);
        p.x=position.x;p.z=position.z;
        if(Math.hypot(input.x,input.z)>.1)p.heading=Math.atan2(input.x,input.z);
        if(input.jump&&now>=p.jumpUntil)p.jumpUntil=now+800;
        if(p.wanted>0&&now>=p.wantedDecayAt){p.wanted--;p.wantedDecayAt=now+30000;this.emit(p.peer,{type:'wanted',level:p.wanted,message:p.wanted?'Стража постепенно теряет след.':'Розыск снят.'})}
        if(p.quest==='fuli'){
          const stop=QUESTS.fuli.stops[p.visitIndex];
          if(stop&&distance(p,stop)<23){p.visitIndex++;this.progressQuest(p,'visit').catch(e=>this.log.error(e));}
        }
      }
      for(const p of room.players.values())this.callGuards(room,p,now);
      for(const [id,n] of room.npcs){
        if(!n.reinforcement)continue;
        const wanted=room.players.get(n.wantedId);
        if((!wanted||wanted.wanted===0||safe(wanted)||wanted.hp<=0)&&now-n.spawnedAt>4500)room.npcs.delete(id);
      }
      for(const n of room.npcs.values()){
        if(n.deadUntil){if(now<n.deadUntil)continue;n.deadUntil=0;n.x=n.home.x;n.z=n.home.z;n.hp=n.maxHp;n.damage.clear();}
        if(n.guard){
          const closest=[...room.players.values()].filter(p=>p.wanted>0&&!safe(p)&&p.hp>0&&distance(p,n)<(n.reinforcement?180:110)).sort((a,b)=>distance(a,n)-distance(b,n))[0];
          n.aggro=closest?.id||null;
        }else if(n.hostile&&!room.players.get(n.aggro)){
          const closest=[...room.players.values()].filter(p=>p.hp>0&&!safe(p)&&distance(p,n)<21).sort((a,b)=>distance(a,n)-distance(b,n))[0];
          if(closest)n.aggro=closest.id;
        }
        let target=room.players.get(n.aggro);
        if(now<(n.stunnedUntil||0))continue;
        if(target&&target.hp>0&&!safe(target)&&distance(n,target)<(n.guard?180:75)&&(n.hostile||n.guard)){
          const d=distance(n,target)||1,speed=n.guard?8.8:n.id==='hyena-6'?6.4:5.7;
          n.vx=(target.x-n.x)/d*speed;n.vz=(target.z-n.z)/d*speed;
          const position=resolveTerrain(n.x+n.vx*dt,n.z+n.vz*dt,1);
          n.x=position.x;n.z=position.z;
          if(d<3.6&&now-(n.lastAttack||0)>(n.guard?1200:1450)){
            n.lastAttack=now;const power=n.guard?17:n.id==='hyena-6'?19:13;
            target.hp=Math.max(0,target.hp-power);
            this.broadcast(room,{type:'hit',from:n.id,target:target.id,damage:power,hp:target.hp});
            if(!target.hp)this.killPlayer(target,now);
          }
        }else{
          n.aggro=null;const phase=now/5000+n.home.x;
          n.vx=Math.sin(phase)*.9;n.vz=Math.cos(phase)*.9;
          const position=resolveTerrain(clamp(n.x+n.vx*dt,n.home.x-12,n.home.x+12),clamp(n.z+n.vz*dt,n.home.z-12,n.home.z+12),1);
          n.x=position.x;n.z=position.z;
        }
      }
      if(this.tickCount%(TICK_RATE/SNAPSHOT_RATE)===0){
        for(const p of room.players.values()){
          // Packed arrays avoid repeating ~20 JSON keys for every nearby animal, 10 times/sec.
          const players=[...room.players.values()].filter(v=>distance(v,p)<200).map(v=>this.packedPlayer(v));
          const npcs=[...room.npcs.values()].filter(n=>distance(n,p)<175).map(n=>[n.id,n.name,n.species,Math.round(n.x*10)/10,Math.round(n.z*10)/10,n.hp,n.maxHp,now<n.deadUntil]);
          this.emit(p.peer,{type:'snapshot',v:2,time:now,weather:room.weather,players,npcs,hunger:Math.round(p.hunger)});
        }
      }
      if(this.tickCount%(TICK_RATE*20)===0)for(const p of room.players.values())this.store.savePosition(p.id,p.x,p.z,p.heading).catch(e=>this.log.error(e));
      if(this.tickCount%(TICK_RATE*30)===0)for(const p of room.players.values())this.store.saveHunger(p.id,p.hunger).catch(e=>this.log.error(e));
    }
  }
  publicPlayer(p){return {id:p.id,nickname:p.nickname,species:p.species,model:p.model,color:p.color,x:Math.round(p.x*100)/100,z:Math.round(p.z*100)/100,heading:Math.round(p.heading*1000)/1000,hp:Math.round(p.hp),maxHp:p.maxHp,stamina:Math.round(p.stamina),maxStamina:p.maxStamina,pvp:p.pvp,level:p.level,wanted:p.wanted,abilityReady:this.clock()>=p.abilityCooldown,jump:p.jumpUntil>this.clock()};}
  packedPlayer(p){const x=this.publicPlayer(p);return [x.id,x.nickname,x.species,x.model,x.x,x.z,x.heading,x.hp,x.maxHp,x.stamina,x.maxStamina,x.wanted,x.abilityReady,x.jump,x.color]}
  metrics(){return {rooms:this.rooms.size,players:[...this.rooms.values()].reduce((n,r)=>n+r.players.size,0),peers:this.peers.size,tick:this.tickCount};}
}
