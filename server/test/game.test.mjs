import test from 'node:test';
import assert from 'node:assert/strict';
import {GameCore} from '../src/game.mjs';
import {FakeStore} from './fixtures.mjs';
import {distance,validateInput,ROOM_LIMIT} from '../src/rules.mjs';
import {hungerAfter,SHOP_ITEMS,SHOPS} from '../src/survival.mjs';

const id1='11111111-1111-4111-8111-111111111111',id2='22222222-2222-4222-8222-222222222222';
async function fixture(){
 let now=100000;const store=new FakeStore();store.add(id1,'Thorn');store.add(id2,'Fleet','zebra');
 const engine=new GameCore(store,{clock:()=>now,log:{error(){}}});
 const a=[],b=[];const peerA=await engine.attach('a',v=>a.push(v),{id:id1}),peerB=await engine.attach('b',v=>b.push(v),{id:id2});
 await engine.command(peerA,{type:'join'});await engine.command(peerB,{type:'join'});
 return {engine,store,peerA,peerB,a,b,tick(ms=50){now+=ms;engine.tick(ms/1000)},setTime(ms){now=ms},now:()=>now};
}

test('two independent players share one session, snapshots and animation movement',async()=>{
 const f=await fixture();assert.equal(f.peerA.room,f.peerB.room);
 await f.engine.command(f.peerA,{type:'input',x:1,z:0,sprint:true});
 const original=f.peerA.player.x;for(let i=0;i<22;i++)f.tick();
 assert.ok(f.peerA.player.x>original+2);
 assert.equal(f.a.at(-1).type,'snapshot');assert.equal(f.b.at(-1).v,2);assert.ok(f.b.at(-1).players.some(p=>p[0]===id1));
 assert.notEqual(f.peerB.player.x,f.peerA.player.x);
});

test('opening a menu can stop movement immediately instead of waiting for input timeout',async()=>{
 const f=await fixture(),p=f.peerA.player;
 await f.engine.command(f.peerA,{type:'input',x:1,z:0,sprint:true});
 for(let i=0;i<3;i++)f.tick();
 assert.ok(p.vx>0);
 const stopped=p.x;
 await f.engine.command(f.peerA,{type:'stop_input'});
 for(let i=0;i<5;i++)f.tick();
 assert.equal(p.x,stopped);
 assert.equal(p.vx,0);
 assert.equal(p.input.sprint,false);
});

test('forged teleport, damage, money, and diagonal speed are rejected or ignored',async()=>{
 const f=await fixture(),p=f.peerA.player;
 await f.engine.command(f.peerA,{type:'input',x:999999,z:1,position:{x:320,z:320},balance:100000000});
 assert.equal(p.input.x,0);assert.equal(f.store.wallet(id1),60);
 await f.engine.command(f.peerA,{type:'reward',amount:500000});
 await f.engine.command(f.peerA,{type:'attack',target:id2,damage:99999});
 assert.equal(f.peerB.player.hp,145);
 f.tick(60);await f.engine.command(f.peerA,{type:'input',x:1,z:1,sprint:true});
 assert.ok(Math.hypot(p.input.x,p.input.z)<=1.0001);
 for(let i=0;i<40;i++)f.tick();assert.ok(distance(p,{x:-68,z:45})<40);
});

test('resources require proximity, cool down, and reward idempotently',async()=>{
 const f=await fixture();f.peerA.player.x=-77;f.peerA.player.z=60;
 await f.engine.command(f.peerA,{type:'gather',id:'herb-a'});assert.equal(f.store.wallet(id1),74);
 assert.equal(f.store.inventory(id1).find(row=>row.item_code==='herb')?.quantity,1);
 await f.engine.command(f.peerA,{type:'gather',id:'herb-a'});assert.equal(f.store.wallet(id1),74);
 await f.engine.command(f.peerB,{type:'gather',id:'herb-a'});assert.equal(f.store.wallet(id2),60);
 const event=f.store.ledger(id1).at(-1).event_key;
 await f.store.reward(id1,14,'Plants',event);assert.equal(f.store.wallet(id1),74);
});

test('hunger drains with movement, runs down faster while sprinting, and survives joining again',async()=>{
 assert.equal(hungerAfter(100,100,false),93.5);
 assert.ok(hungerAfter(100,100,true)<hungerAfter(100,100,false));
 const f=await fixture();const p=f.peerA.player;
 await f.engine.command(f.peerA,{type:'input',x:1,z:0,sprint:true});
 f.tick(5000);assert.ok(p.hunger<100);
 const saved=p.hunger;await f.engine.command(f.peerA,{type:'leave'});await f.engine.command(f.peerA,{type:'join'});
 assert.ok(Math.abs(f.peerA.player.hunger-saved)<.02);
 f.peerA.player.hunger=0;f.peerA.player.starveAt=0;const hp=f.peerA.player.hp;
 f.tick(1000);assert.ok(f.peerA.player.hp<hp);
});

test('NPC shops require location and valid stock; inventory items are spent once',async()=>{
 const f=await fixture();const p=f.peerA.player;
 assert.ok(SHOPS['shop-camp'].items.includes('berries'));
 assert.equal(SHOP_ITEMS.berries.hunger,22);
 p.x=10;p.z=10;
 await f.engine.command(f.peerA,{type:'shop_buy',shop:'shop-camp',item:'berries'});
 assert.equal(f.store.wallet(id1),60);
 p.x=-61;p.z=50;
 await f.engine.command(f.peerA,{type:'interact',contact:'shop-camp'});
 assert.ok(f.a.some(m=>m.type==='shop_open'&&m.shop==='shop-camp'));
 await f.engine.command(f.peerA,{type:'shop_buy',shop:'shop-camp',item:'herb'});
 assert.equal(f.store.wallet(id1),60);
 await f.engine.command(f.peerA,{type:'shop_buy',shop:'shop-camp',item:'berries'});
 assert.equal(f.store.wallet(id1),48);
 assert.equal(f.store.inventory(id1)[0].quantity,1);
 p.hunger=40;await f.engine.command(f.peerA,{type:'item_use',item:'berries'});
 assert.equal(p.hunger,62);
 assert.deepEqual(f.store.inventory(id1),[]);
 const hunger=p.hunger;
 f.setTime(f.now()+800);
 await assert.rejects(()=>f.engine.command(f.peerA,{type:'item_use',item:'berries'}),/закончился/);
 assert.equal(p.hunger,hunger);
 await f.engine.command(f.peerA,{type:'leave'});await f.engine.command(f.peerA,{type:'join'});
 assert.equal(f.peerA.player.hunger,62);
});

test('private session owner can invite friends, change name and code, and exclude players',async()=>{
 const f=await fixture();await f.engine.command(f.peerA,{type:'friend_request',nickname:'Fleet'});
 await f.engine.command(f.peerB,{type:'friend_accept',userId:id1});
 await f.engine.command(f.peerA,{type:'join',private:true});
 const oldCode=f.peerA.room.code;
 await f.engine.command(f.peerB,{type:'session_rename',name:'Чужая сессия'});
 assert.notEqual(f.peerA.room.name,'Чужая сессия');
 await f.engine.command(f.peerA,{type:'session_invite',userId:id2});
 assert.ok(f.b.some(m=>m.type==='session_invitation'&&m.code===oldCode));
 await f.engine.command(f.peerB,{type:'join',code:oldCode});
 await f.engine.command(f.peerA,{type:'session_rename',name:'Наш лес'});
 assert.equal(f.peerA.room.name,'Наш лес');
 await f.engine.command(f.peerA,{type:'session_rotate_code'});
 assert.notEqual(f.peerA.room.code,oldCode);
 assert.ok(f.b.some(m=>m.type==='session_updated'&&m.name==='Наш лес'));
 await f.engine.command(f.peerA,{type:'session_kick',userId:id2});
 assert.equal(f.peerB.room,null);
 assert.ok(f.b.some(m=>m.type==='session_kicked'));
 await f.engine.command(f.peerB,{type:'join',code:f.peerA.room.code});
 assert.equal(f.peerB.room,null);
});

test('quest is rewarded once, not each time it is repeated',async()=>{
 const f=await fixture();f.peerA.player.x=-77;f.peerA.player.z=60;
 await f.engine.command(f.peerA,{type:'quest',id:'rafiki'});
 for(const [id,x,z] of [['herb-a',-77,60],['herb-b',-23,62],['herb-c',9,101]]){
  f.peerA.player.x=x;f.peerA.player.z=z;f.tick(1000);await f.engine.command(f.peerA,{type:'gather',id});
 }
 assert.equal(f.store.wallet(id1),60+14*3+75);
 await f.engine.command(f.peerA,{type:'quest',id:'rafiki'});
 assert.equal(f.store.wallet(id1),60+14*3+75);
 assert.ok(f.a.some(v=>v.type==='quest_state'&&v.completed));
});

test('active quest progress survives a session leave and rejoin',async()=>{
 const f=await fixture();f.peerA.player.x=-77;f.peerA.player.z=60;
 await f.engine.command(f.peerA,{type:'quest',id:'rafiki'});
 await f.engine.command(f.peerA,{type:'gather',id:'herb-a'});
 assert.equal(f.peerA.player.questProgress,1);
 await f.engine.command(f.peerA,{type:'leave'});
 await f.engine.command(f.peerA,{type:'join'});
 assert.equal(f.peerA.player.quest,'rafiki');assert.equal(f.peerA.player.questProgress,1);
 assert.ok(f.a.some(m=>m.type==='quest_state'&&m.progress===1));
});

test('an active quest can be abandoned without reward, then accepted from the beginning',async()=>{
 const f=await fixture();f.peerA.player.x=-77;f.peerA.player.z=60;
 await f.engine.command(f.peerA,{type:'quest',id:'rafiki'});
 await f.engine.command(f.peerA,{type:'gather',id:'herb-a'});
 assert.equal(f.peerA.player.questProgress,1);
 const balance=f.store.wallet(id1);
 await f.engine.command(f.peerA,{type:'quest_abandon'});
 assert.equal(f.peerA.player.quest,null);
 assert.equal(f.peerA.player.questProgress,0);
 assert.equal(f.store.wallet(id1),balance);
 assert.deepEqual(f.store.quests(id1),[]);
 assert.ok(f.a.some(m=>m.type==='quest_state'&&m.id==='rafiki'&&m.abandoned));
 await f.engine.command(f.peerA,{type:'leave'});
 await f.engine.command(f.peerA,{type:'join'});
 assert.equal(f.peerA.player.quest,null);
 await f.engine.command(f.peerA,{type:'quest',id:'rafiki'});
 assert.equal(f.peerA.player.questProgress,0);
 await f.engine.command(f.peerA,{type:'quest_abandon'});
 await f.engine.command(f.peerA,{type:'quest_abandon'});
 assert.ok(f.a.some(m=>m.type==='error'&&m.message.includes('нет активного')));
 assert.equal(f.store.wallet(id1),balance);
});

test('server checks distance and safe zones for combat, hunt payout, respawns',async()=>{
 const f=await fixture(),enemy=f.peerA.room.npcs.get('hyena-1');
 await f.engine.command(f.peerA,{type:'attack',target:enemy.id});assert.equal(enemy.hp,enemy.maxHp);
 f.peerA.player.x=enemy.x;f.peerA.player.z=enemy.z-2;
 await f.engine.command(f.peerA,{type:'attack',target:enemy.id});assert.ok(enemy.hp<enemy.maxHp);
 for(let i=0;i<14&&enemy.hp>0;i++){f.tick(1000);await f.engine.command(f.peerA,{type:'attack',target:enemy.id})}
 assert.equal(enemy.hp,0);assert.ok(f.store.wallet(id1)>60);const reward=f.store.wallet(id1);
 await f.engine.command(f.peerA,{type:'attack',target:enemy.id});assert.equal(f.store.wallet(id1),reward);
 f.peerA.player.hp=f.peerA.player.maxHp;f.tick(1000);
 f.peerB.player.x=f.peerA.player.x+1;f.peerB.player.z=f.peerA.player.z;
 await f.engine.command(f.peerA,{type:'pvp',enabled:true});await f.engine.command(f.peerB,{type:'pvp',enabled:true});
 await f.engine.command(f.peerA,{type:'attack',target:id2});assert.ok(f.peerB.player.hp<145);
 f.peerA.player.x=-67;f.peerA.player.z=43;f.peerB.player.x=-67;f.peerB.player.z=44;
 f.tick(800);const hp=f.peerB.player.hp;await f.engine.command(f.peerA,{type:'attack',target:id2});assert.equal(f.peerB.player.hp,hp);
});

test('private sessions need code and remain isolated from public players',async()=>{
 const f=await fixture();await f.engine.command(f.peerA,{type:'join',private:true});
 const code=f.peerA.room.code;assert.match(code,/^[A-F0-9]{8}$/);
 const c=[];const id3='33333333-3333-4333-8333-333333333333';f.store.add(id3,'Luna');const newcomer=await f.engine.attach('c',v=>c.push(v),{id:id3});
 await f.engine.command(newcomer,{type:'join',code:'wrong'});assert.equal(newcomer.room,null);
 await f.engine.command(newcomer,{type:'join',code});assert.equal(newcomer.room,f.peerA.room);assert.notEqual(newcomer.room,f.peerB.room);
});

test('room is limited; invalid inputs never create infinite coordinates',async()=>{
 assert.equal(validateInput({x:Infinity,z:0}),null);assert.equal(validateInput({x:'bad',z:0}),null);
 assert.ok(ROOM_LIMIT>=12&&ROOM_LIMIT<=24);
 const f=await fixture();await f.engine.command(f.peerA,{type:'input',x:10,z:0});
 for(let i=0;i<4000;i++)f.engine.tick();
 assert.ok(Math.abs(f.peerA.player.x)<=340);
});

test('idle input expires, so a player cannot run forever with the menu open',async()=>{
 const f=await fixture(),p=f.peerA.player;
 await f.engine.command(f.peerA,{type:'input',x:1,z:0,sprint:true});
 for(let i=0;i<18;i++)f.tick(50);
 const atNineHundredMs=p.x;
 for(let i=0;i<18;i++)f.tick(50);
 assert.equal(p.input.x,0);assert.ok(p.x-atNineHundredMs<1);
});

test('friends join the same room only after an accepted invitation',async()=>{
 const f=await fixture();
 await f.engine.command(f.peerA,{type:'friend_follow',userId:id2});
 assert.ok(f.a.at(-1).message?.includes('не в списке'));
 await f.engine.command(f.peerA,{type:'friend_request',nickname:'Fleet'});
 await f.engine.command(f.peerB,{type:'friend_accept',userId:id1});
 await f.engine.command(f.peerB,{type:'join',private:true});
 await f.engine.command(f.peerA,{type:'friend_follow',userId:id2});
 assert.equal(f.a.at(-1).type,'friend_session');assert.equal(f.a.at(-1).code,f.peerB.room.code);
});

test('unprovoked attack produces server-side wanted status and fades over time',async()=>{
 const f=await fixture(),p=f.peerA.player,n=f.peerA.room.npcs.get('gazelle-1');
 p.x=n.x-3;p.z=n.z;await f.engine.command(f.peerA,{type:'attack',target:n.id});
 assert.equal(p.wanted,1);assert.ok(f.a.some(e=>e.type==='wanted'&&e.level===1));
 for(let i=0;i<35;i++)f.tick(1000);
 assert.equal(p.wanted,0);
});

test('wanted players outside safe territory trigger a real pursuing guard patrol',async()=>{
 const f=await fixture(),p=f.peerA.player,n=f.peerA.room.npcs.get('gazelle-1');
 p.x=n.x-2;p.z=n.z;
 await f.engine.command(f.peerA,{type:'attack',target:n.id});
 assert.equal(p.wanted,1);
 f.tick(50);
 const guards=[...f.peerA.room.npcs.values()].filter(n=>n.reinforcement&&n.wantedId===p.id);
 assert.ok(guards.length>0,'wanted player should get backup guards');
 const guard=guards[0],initial=distance(guard,p);
 for(let i=0;i<20;i++)f.tick(50);
 assert.ok(distance(guard,p)<initial,'the reinforcement must actually pursue');
 for(let i=0;i<100;i++)f.tick(50);
 assert.ok(p.hp<p.maxHp,'a patrol must be able to catch and hurt an idle fugitive');
 assert.ok(f.a.some(m=>m.type==='notice'&&m.message.includes('Стража')));
 p.wanted=0;for(let i=0;i<100;i++)f.tick(50);
 assert.ok(!f.peerA.room.npcs.has(guard.id),'backup despawns after the search ends');
});

test('death charges a single 3.5% ledger penalty and zero balance costs nothing',async()=>{
 const f=await fixture(),p=f.peerA.player;
 p.hp=0;f.engine.killPlayer(p,f.now());
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await f.store.wallet(p.id),58);
 assert.equal(f.store.ledger(p.id).filter(row=>row.reason.includes('гибели')).length,1);
 f.engine.killPlayer(p,f.now());
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await f.store.wallet(p.id),58);
 f.tick(5100);assert.equal(p.hp,p.maxHp);
 await f.store.reward(p.id,-58,'Spent claws','test:spend');
 p.hp=0;f.engine.killPlayer(p,f.now());
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await f.store.wallet(p.id),0);
 assert.ok(f.a.some(m=>m.type==='death_penalty'&&m.amount===0));
});

test('death cost scales with wealth instead of a fixed charge',async()=>{
 const f=await fixture(),p=f.peerA.player;
 await f.store.reward(p.id,9940,'Starter wealth','test:wealth');
 p.hp=0;f.engine.killPlayer(p,f.now());
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await f.store.wallet(p.id),9650);
 assert.ok(f.a.some(m=>m.type==='death_penalty'&&m.amount===350));
});

test('NPC dialogue is proximity checked and can offer a real quest',async()=>{
 const f=await fixture(),p=f.peerA.player;
 await f.engine.command(f.peerA,{type:'interact',contact:'rafiki'});
 assert.equal(f.a.at(-1).type,'error');
 p.x=-102;p.z=91;f.tick(700);
 await f.engine.command(f.peerA,{type:'interact',contact:'rafiki'});
 assert.equal(f.a.at(-1).type,'dialogue');
 assert.equal(f.a.at(-1).quest,'rafiki');
 await f.engine.command(f.peerA,{type:'quest',id:'rafiki'});
 assert.equal(p.quest,'rafiki');
});

test('two players complete a real cooperative operation and each gets an idempotent reward',async()=>{
 const f=await fixture(),a=f.peerA.player,b=f.peerB.player;
 await f.engine.command(f.peerA,{type:'party_create'});
 await f.engine.command(f.peerA,{type:'party_invite',nickname:'Fleet'});
 const invitation=f.b.find(m=>m.type==='party_invitation');assert.ok(invitation);
 await f.engine.command(f.peerB,{type:'party_accept',partyId:invitation.partyId});
 await f.engine.command(f.peerA,{type:'party_start'});
 const party=f.engine.partyFor(f.peerA);assert.equal(party.members.size,2);
 for(const [id,x,z] of [['herb-a',-77,60],['herb-b',-23,62]]){
  a.x=b.x=x;a.z=b.z=z;f.tick(900);
  await f.engine.command(f.peerA,{type:'gather',id});
 }
 assert.equal(party.operation.stage,'hunt');
 for(const target of ['hyena-1','hyena-2']){
  const n=f.peerA.room.npcs.get(target);a.x=b.x=n.x;a.z=b.z=n.z-2;a.hp=a.maxHp;
  for(let attempt=0;attempt<14&&n.hp>0;attempt++){
   f.tick(1000);await f.engine.command(f.peerA,{type:'attack',target});
  }
  assert.equal(n.hp,0);
 }
 assert.equal(party.operation.stage,'completed');
 assert.equal(f.store.wallet(id2),60+220);
 const eventKey=f.store.ledger(id2).at(-1).event_key;
 assert.match(eventKey,/coop:joint_patrol/);
 const snapshot=f.store.wallet(id2);
 await f.store.reward(id2,220,'Same operation',eventKey,180);
 assert.equal(f.store.wallet(id2),snapshot);
});

test('party invitation expires and a one-person party cannot start',async()=>{
 const f=await fixture();await f.engine.command(f.peerA,{type:'party_create'});
 await f.engine.command(f.peerA,{type:'party_start'});
 assert.match(f.a.at(-1).message,/хотя бы два/);
 await f.engine.command(f.peerA,{type:'party_invite',nickname:'Fleet'});
 const invite=f.b.find(m=>m.type==='party_invitation');f.tick(61000);
 await f.engine.command(f.peerB,{type:'party_accept',partyId:invite.partyId});
 assert.equal(f.b.at(-1).type,'error');
 assert.equal(f.engine.partyFor(f.peerB),null);
});

test('a natural cosmetic coat is purchased once, stored, and cannot change in unsafe terrain',async()=>{
 const f=await fixture(),p=f.peerA.player;
 p.x=-77;p.z=60;await f.engine.command(f.peerA,{type:'gather',id:'herb-a'});
 assert.equal(f.store.wallet(id1),74);
 await f.engine.command(f.peerA,{type:'recolor',color:14001235});
 assert.equal(f.store.wallet(id1),9);assert.equal(f.store.profile(id1).color,14001235);
 assert.equal(p.color,14001235);
 f.tick(1000);await assert.rejects(f.engine.command(f.peerA,{type:'recolor',color:14001235}),/Already selected/);
 assert.equal(f.store.wallet(id1),9);
 p.x=260;p.z=-145;f.tick(1000);
 await f.engine.command(f.peerA,{type:'recolor',color:12034442});
 assert.equal(f.store.profile(id1).color,14001235);
});

test('private messages need accepted friendship and have a persistent history',async()=>{
 const f=await fixture();
 await f.engine.command(f.peerA,{type:'chat',scope:'private',to:id2,body:'Uninvited message'});
 assert.equal(f.a.at(-1).type,'error');
 assert.equal(f.store.chatRows.length,0);
 await f.engine.command(f.peerA,{type:'friend_request',nickname:'Fleet'});
 await f.engine.command(f.peerB,{type:'friend_accept',userId:id1});
 f.tick(1050);
 await f.engine.command(f.peerA,{type:'chat',scope:'private',to:id2,body:'Meet me near the waterhole'});
 assert.equal(f.b.at(-1).channel,'private');
 await f.engine.command(f.peerB,{type:'dm_history',userId:id1});
 const history=f.b.at(-1);
 assert.equal(history.type,'dm_history');
 assert.equal(history.rows.length,1);
 assert.equal(history.rows[0].body,'Meet me near the waterhole');
});

test('clan chat is isolated and channel history is scoped to membership',async()=>{
 const f=await fixture(),clan={id:'clan-1',name:'Dustwalkers'};
 f.peerA.clan=clan;f.peerB.clan=clan;
 await f.engine.command(f.peerA,{type:'chat',scope:'clan',body:'Rally by the cliff'});
 assert.ok(f.b.some(m=>m.channel==='clan'&&m.body==='Rally by the cliff'));
 await f.engine.command(f.peerB,{type:'chat_history',scope:'clan'});
 assert.equal(f.b.at(-1).rows[0].body,'Rally by the cliff');
 f.peerB.clan=null;
 await f.engine.command(f.peerB,{type:'chat_history',scope:'clan'});
 assert.equal(f.b.at(-1).type,'error');
});
