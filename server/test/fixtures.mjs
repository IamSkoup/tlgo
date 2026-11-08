export class FakeStore {
  constructor(){this.players=new Map();this.wallets=new Map();this.ownedMap=new Map();this.positions=new Map();this.questMap=new Map();this.ledgers=new Map();this.friendsMap=[];this.sessions=new Map();this.clanMap=new Map();this.chatRows=[];this.speciesList=[
    {code:'lion',title:'Лев',model:'lion',starter:true,price:0,hp:130,stamina:110,speed:8.2,power:20},
    {code:'zebra',title:'Зебра',model:'zebra',starter:true,price:0,hp:145,stamina:135,speed:10.8,power:14},
    {code:'cheetah',title:'Гепард',model:'cheetah',starter:false,price:320,hp:90,stamina:95,speed:16.5,power:16}
  ]}
  add(id,nickname,species='lion'){const profile={id,nickname,selected_species:species,color:12945995,level:1,xp:0,reputation:0};this.players.set(id,profile);this.wallets.set(id,60);this.ownedMap.set(id,[{species,power_rank:0,endurance_rank:0}]);this.questMap.set(id,[]);this.ledgers.set(id,new Map());return profile}
  verify(token){if(!this.players.has(token))throw Error('Недействительная сессия.');return {id:token}}
  profile(id){return this.players.get(id)||null}
  species(){return this.speciesList}
  wallet(id){return this.wallets.get(id)}
  owned(id){return this.ownedMap.get(id)}
  ledger(id){return [...this.ledgers.get(id)?.values()||[]]}
  quests(id){return this.questMap.get(id)}
  position(id){return this.positions.get(id)||null}
  async savePosition(id,x,z,heading){this.positions.set(id,{x,z,heading})}
  async createProfile(id,nickname,species){if(this.players.has(id))throw Error('Already created');if([...this.players.values()].some(p=>p.nickname.toLowerCase()===nickname.toLowerCase()))throw Error('Nickname used');if(!this.speciesList.some(s=>s.code===species&&s.starter))throw Error('Not starter');this.add(id,nickname,species)}
  async reward(id,delta,reason,key,xp=0){const ledger=this.ledgers.get(id);if(ledger.has(key))return {balance:this.wallets.get(id),awarded:false};const next=this.wallets.get(id)+delta;if(next<0)throw Error('Insufficient balance');this.wallets.set(id,next);ledger.set(key,{delta,reason,event_key:key});this.players.get(id).xp+=xp;return {balance:next,awarded:true}}
  async deathPenalty(id,eventKey){
    const ledger=this.ledgers.get(id),balance=this.wallets.get(id);
    if(ledger.has(eventKey))return {amount:0,balance,charged:false};
    const amount=Math.round(balance*.035);
    if(!amount)return {amount:0,balance,charged:false};
    const next=balance-amount;
    this.wallets.set(id,next);
    ledger.set(eventKey,{delta:-amount,reason:'Потеря Claws при гибели',event_key:eventKey});
    return {amount,balance:next,charged:true};
  }
  async finishQuest(id,quest){const values={rafiki:[75,65,3],fuli:[95,80,2],kion:[130,110,2]},entry=this.questMap.get(id).find(q=>q.quest_id===quest&&q.state==='active');if(!entry)throw Error('No active quest');const [reward,xp,count]=values[quest];const result=await this.reward(id,reward,'Quest '+quest,'quest:'+quest,xp);await this.setQuest(id,quest,count,'completed');return result}
  async purchase(id,species){const s=this.speciesList.find(x=>x.code===species&&!x.starter);if(!s)throw Error('Cannot purchase');if(this.ownedMap.get(id).some(x=>x.species===species))throw Error('Already owned');await this.reward(id,-s.price,'Animal','species:'+species);this.ownedMap.get(id).push({species,power_rank:0,endurance_rank:0});}
  async recolor(id,color){if(![14001235,12945995,12034442,9929066,9867403,14999502,6969670,14200949].includes(color))throw Error('Invalid pigment');const profile=this.players.get(id);if(profile.color===color)throw Error('Already selected');const balance=await this.reward(id,-65,'New coat','coat:'+color+':'+this.ledgers.get(id).size);profile.color=color;return balance.balance}
  select(id,species){if(!this.ownedMap.get(id).some(x=>x.species===species))throw Error('Not owned');this.players.get(id).selected_species=species}
  upgrade(){throw Error('Not implemented in fixture')}
  friends(id){return this.friendsMap.filter(f=>f.requester===id||f.recipient===id).map(f=>({...f,other:this.players.get(f.requester===id?f.recipient:f.requester)}))}
  clan(){return null}
  async setQuest(id,quest_id,progress,state){const arr=this.questMap.get(id);const ix=arr.findIndex(q=>q.quest_id===quest_id);const value={quest_id,progress,state};if(ix<0)arr.push(value);else arr[ix]=value}
  async abandonQuest(id,quest_id){const arr=this.questMap.get(id);const index=arr.findIndex(q=>q.quest_id===quest_id&&q.state==='active');if(index<0)return [];return arr.splice(index,1)}
  findSession(code){return [...this.sessions.values()].find(r=>r.invite_code===code)}
  createSession(r){this.sessions.set(r.id,r)}
  joinSession(){return null}
  async leaveSession(){return null}
  async saveChat(author,session_id,body,{clan_id=null,recipient=null}={}){this.chatRows.push({author,session_id,body,clan_id,recipient,created_at:new Date().toISOString()});return null}
  async chatHistory(field,id){return this.chatRows.filter(row=>row[field]===id).slice(-45)}
  async directHistory(first,second){return this.chatRows.filter(r=>(r.author===first&&r.recipient===second)||(r.author===second&&r.recipient===first)).slice(-45)}
  adjustReputation(id,delta){this.players.get(id).reputation+=delta}
  friendRequest(requester,nickname){const player=[...this.players.values()].find(p=>p.nickname.toLowerCase()===nickname.toLowerCase());if(!player)throw Error('Not found');const row={requester,recipient:player.id,status:'pending'};this.friendsMap.push(row);return {recipient:player.id}}
  friendAccept(recipient,requester){const row=this.friendsMap.find(f=>f.requester===requester&&f.recipient===recipient);if(!row)throw Error('Not found');row.status='accepted';return row}
  report(){return null}
  createClan(){return null}
  joinClan(){return null}
  leaveClan(){return null}
}
