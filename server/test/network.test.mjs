import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {createGameTransport} from '../src/transport.mjs';
import {FakeStore} from './fixtures.mjs';

function client(url,token){
  const ws=new WebSocket(url,{origin:'http://localhost:8080'}),messages=[],waiters=[];
  ws.on('message',bytes=>{
    const msg=JSON.parse(bytes.toString());messages.push(msg);
    for(const waiter of [...waiters])if(waiter.predicate(msg)){clearTimeout(waiter.timer);waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(msg)}
  });
  return {
    ws,messages,
    send:value=>ws.send(JSON.stringify(value)),
    wait(predicate,timeout=3000){
      const found=messages.find(predicate);if(found)return Promise.resolve(found);
      return new Promise((resolve,reject)=>{
        const waiter={predicate,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);reject(Error('Timed out waiting for WebSocket message'))},timeout)};
        waiters.push(waiter);
      });
    },
    async auth(){await once(ws,'open');ws.send(JSON.stringify({type:'auth',token}));await this.wait(m=>m.type==='hello');await this.wait(m=>m.type==='account')}
  };
}

test('real WebSocket transport connects two peers, synchronises snapshots and refuses forged rewards',async()=>{
  const store=new FakeStore(),id1=randomUUID(),id2=randomUUID();
  store.add(id1,'Amber');store.add(id2,'Fenn','zebra');
  const app=createGameTransport({store,log:{error(){}}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const url=`ws://127.0.0.1:${app.server.address().port}/game`;
  const a=client(url,id1),b=client(url,id2);
  try{
    await Promise.all([a.auth(),b.auth()]);
    a.send({type:'join'});b.send({type:'join'});
    await Promise.all([a.wait(m=>m.type==='joined'),b.wait(m=>m.type==='joined')]);
    const snapshot=await b.wait(m=>m.type==='snapshot'&&m.players.some(p=>p[0]===id1));
    assert.ok(snapshot.players.some(p=>p[0]===id2));
    a.send({type:'reward',amount:1000000});
    const rejected=await a.wait(m=>m.type==='error'&&/Неизвестное/.test(m.message));
    assert.ok(rejected);assert.equal(store.wallet(id1),60);
    a.send({type:'chat',body:'Мы рядом'});
    const received=await b.wait(m=>m.type==='chat'&&m.body==='Мы рядом');
    assert.equal(received.author,'Amber');
    const health=await fetch(`http://127.0.0.1:${app.server.address().port}/health`).then(r=>r.json());
    assert.equal(health.players,2);assert.equal(health.status,'ok');
  }finally{a.ws.terminate();b.ws.terminate();await app.close()}
});

test('WebSocket server rejects an unapproved browser origin and invalid auth',async()=>{
  const store=new FakeStore(),app=createGameTransport({store,log:{error(){}}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const url=`ws://127.0.0.1:${app.server.address().port}/game`;
  let bad;
  try{
    bad=new WebSocket(url,{origin:'https://malicious.example'});
    const rejected=await new Promise(resolve=>{bad.once('unexpected-response',(_,response)=>resolve(response.statusCode));bad.once('error',()=>resolve(403))});
    assert.equal(rejected,403);
    const invalid=client(url,'nonexistent-token');
    await once(invalid.ws,'open');invalid.send({type:'auth',token:'nonexistent-token'});
    assert.match((await invalid.wait(m=>m.type==='error')).message,/Недействительная/);
    invalid.ws.terminate();
  }finally{bad?.terminate();await app.close()}
});
