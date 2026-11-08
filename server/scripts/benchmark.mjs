import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {GameCore} from '../src/game.mjs';
import {FakeStore} from '../test/fixtures.mjs';

let now=Date.now();
let sentBytes=0,sentFrames=0;
const store=new FakeStore(),game=new GameCore(store,{clock:()=>now,log:{error(){}}});
for(let i=0;i<18;i++){
 const id=randomUUID();store.add(id,'Player'+i,i%3===0?'zebra':'lion');
 const peer=await game.attach('p'+i,packet=>{const message=JSON.stringify(packet);sentBytes+=Buffer.byteLength(message);sentFrames++},{id});
 await game.command(peer,{type:'join'});
 const angle=i*2*Math.PI/18;peer.player.x=-68+Math.sin(angle)*i*.7;peer.player.z=45+Math.cos(angle)*i*.7;
 await game.command(peer,{type:'input',x:i%2?1:-1,z:0,sprint:true});
}
sentBytes=0;sentFrames=0;
const times=[];
for(let i=0;i<200;i++){
 now+=50;
 const started=performance.now();game.tick();times.push(performance.now()-started);
 if(i%6===0)for(const p of game.peers.values())await game.command(p,{type:'input',x:p.player.x%2>1?1:-1,z:0,sprint:true});
}
const sorted=[...times].sort((a,b)=>a-b);
console.log(JSON.stringify({concurrentPlayers:game.metrics().players,samples:times.length,simulatedSeconds:10,serverTickMs:{median:+sorted[100].toFixed(3),p95:+sorted[190].toFixed(3),worst:+sorted.at(-1).toFixed(3)},outgoing:{frames:sentFrames,totalMiB:+(sentBytes/1048576).toFixed(3),MiBPerMinute:+(sentBytes/1048576*6).toFixed(3),KiBPerSecond:+(sentBytes/1024/10).toFixed(1)},heapUsedMiB:+(process.memoryUsage().heapUsed/1048576).toFixed(1)},null,2));
