import {createClient} from '@supabase/supabase-js';

function unwrap({data,error}){if(error)throw Error(error.message);return data;}

export class SupabaseStore {
  constructor(url,key){
    if(!url||!key||!/^https:\/\//.test(url))throw Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    this.api=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{'x-application-name':'savanna-freedom-server'}}});
    this.speciesCache=null;
  }
  async verify(token){
    const {data,error}=await this.api.auth.getUser(token);
    if(error||!data.user)throw Error('Недействительная сессия. Войди заново.');
    // A user may have several past sanctions. Never let an expired first row
    // hide a later, currently active ban.
    const {data:sanctions,error:se}=await this.api.from('sanctions').select('expires_at').eq('user_id',data.user.id).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).limit(1);
    if(se)throw Error(se.message);
    if(sanctions?.length)throw Error('Доступ ограничен модерацией.');
    return {id:data.user.id};
  }
  async species(){
    if(!this.speciesCache)this.speciesCache=unwrap(await this.api.from('species_catalog').select('*').order('price'));
    return this.speciesCache;
  }
  async profile(id){return unwrap(await this.api.from('profiles').select('*').eq('id',id).maybeSingle());}
  async createProfile(id,nickname,species,color){return unwrap(await this.api.rpc('sf_create_profile',{p_user:id,p_nickname:nickname,p_species:species,p_color:color}));}
  async wallet(id){return unwrap(await this.api.from('wallets').select('balance').eq('user_id',id).single()).balance;}
  async owned(id){return unwrap(await this.api.from('player_species').select('*').eq('user_id',id));}
  async ledger(id){return unwrap(await this.api.from('ledger').select('delta,reason,created_at,event_key').eq('user_id',id).order('created_at',{ascending:false}).limit(25));}
  async quests(id){return unwrap(await this.api.from('quest_progress').select('*').eq('user_id',id));}
  async position(id){return unwrap(await this.api.from('player_positions').select('x,z,heading').eq('user_id',id).maybeSingle());}
  async savePosition(id,x,z,heading){
    return unwrap(await this.api.from('player_positions').upsert({user_id:id,x:Math.round(x*100)/100,z:Math.round(z*100)/100,heading:Math.round(heading*1000)/1000,saved_at:new Date().toISOString()}));
  }
  async purchase(id,species){return unwrap(await this.api.rpc('sf_buy_species',{p_user:id,p_species:species}));}
  async select(id,species){return unwrap(await this.api.rpc('sf_select_species',{p_user:id,p_species:species}));}
  async upgrade(id,species,stat){return unwrap(await this.api.rpc('sf_upgrade',{p_user:id,p_species:species,p_stat:stat}));}
  async recolor(id,color){return unwrap(await this.api.rpc('sf_buy_coat',{p_user:id,p_color:color}));}
  async reward(id,amount,reason,eventKey,xp=0){
    return unwrap(await this.api.rpc('sf_grant_activity',{p_user:id,p_amount:amount,p_reason:reason,p_event_key:eventKey,p_xp:xp}));
  }
  async finishQuest(id,quest){return unwrap(await this.api.rpc('sf_finish_quest',{p_user:id,p_quest:quest}));}
  async adjustReputation(id,delta){
    const profile=await this.profile(id);
    if(profile)unwrap(await this.api.from('profiles').update({reputation:Math.max(-1000,Math.min(1000,profile.reputation+delta))}).eq('id',id));
  }
  async setQuest(user_id,quest_id,progress,state){
    return unwrap(await this.api.from('quest_progress').upsert({user_id,quest_id,progress,state,completed_at:state==='completed'?new Date().toISOString():null}));
  }
  async saveChat(author,session_id,body,{clan_id=null,recipient=null}={}){
    return unwrap(await this.api.from('chat_messages').insert({author,session_id,clan_id,recipient,body}));
  }
  async chatHistory(field,id,limit=45){
    if(!['session_id','clan_id'].includes(field))throw Error('Invalid history scope');
    const records=unwrap(await this.api.from('chat_messages').select('author,body,created_at').eq(field,id).order('created_at',{ascending:false}).limit(limit));
    return records.reverse();
  }
  async directHistory(first,second){
    const rows=unwrap(await this.api.from('chat_messages').select('author,recipient,body,created_at').or(`and(author.eq.${first},recipient.eq.${second}),and(author.eq.${second},recipient.eq.${first})`).order('created_at',{ascending:false}).limit(45));
    return rows.reverse();
  }
  async createSession(record){return unwrap(await this.api.from('game_sessions').insert(record));}
  async findSession(code){return unwrap(await this.api.from('game_sessions').select('*').eq('invite_code',code).maybeSingle());}
  async joinSession(session_id,user_id){return unwrap(await this.api.from('session_members').upsert({session_id,user_id}));}
  async leaveSession(session_id,user_id){return unwrap(await this.api.from('session_members').delete().eq('session_id',session_id).eq('user_id',user_id));}
  async friends(id){
    const rows=unwrap(await this.api.from('friendships').select('requester,recipient,status').or(`requester.eq.${id},recipient.eq.${id}`));
    if(!rows.length)return [];
    const ids=[...new Set(rows.map(r=>r.requester===id?r.recipient:r.requester))];
    const profiles=unwrap(await this.api.from('profiles').select('id,nickname,selected_species').in('id',ids));
    return rows.map(r=>({...r,other:profiles.find(p=>p.id===(r.requester===id?r.recipient:r.requester))}));
  }
  async friendRequest(requester,nickname){
    if(!/^[a-zA-Zа-яА-ЯёЁ0-9_]{3,20}$/.test(nickname))throw Error('Неверное имя игрока.');
    const recipient=unwrap(await this.api.from('profiles').select('id').ilike('nickname',nickname).maybeSingle());
    if(!recipient||recipient.id===requester)throw Error('Игрок не найден или это твой профиль.');
    return unwrap(await this.api.from('friendships').insert({requester,recipient:recipient.id,status:'pending'}).select('recipient').single());
  }
  async friendAccept(recipient,requester){
    return unwrap(await this.api.from('friendships').update({status:'accepted'}).eq('recipient',recipient).eq('requester',requester).eq('status','pending').select().single());
  }
  async clan(id){
    const member=unwrap(await this.api.from('clan_members').select('clan_id,role').eq('user_id',id).maybeSingle());
    if(!member)return null;
    const clan=unwrap(await this.api.from('clans').select('*').eq('id',member.clan_id).single());
    return {...clan,role:member.role};
  }
  async createClan(id,name){return unwrap(await this.api.rpc('sf_create_clan',{p_user:id,p_name:name}));}
  async joinClan(id,name){return unwrap(await this.api.rpc('sf_join_clan',{p_user:id,p_name:name}));}
  async leaveClan(id){return unwrap(await this.api.rpc('sf_leave_clan',{p_user:id}));}
  async report(reporter,reported,body){
    if(body.length<10||reported===reporter)throw Error('Укажи другого игрока и причину от 10 символов.');
    return unwrap(await this.api.from('reports').insert({reporter,reported,body}));
  }
}
