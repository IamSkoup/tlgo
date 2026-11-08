import http from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import {randomUUID} from 'node:crypto';
import {GameCore} from './game.mjs';

// Dependency-injected transport is shared by production and actual-socket tests.
export function createGameTransport({store,origins=['http://localhost:8080'],tickerMs=50,log=console}={}){
  if(!store)throw Error('Game storage is required');
  const game=new GameCore(store,{log});
  const allowed=new Set(origins.map(o=>o.trim()).filter(Boolean));
  let verified=0,rejected=0,oversized=0;
  const server=http.createServer((req,res)=>{
    if(req.url==='/health'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({status:'ok',...game.metrics()}));return;
    }
    if(req.url==='/metrics'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({...game.metrics(),verified,rejected,oversized}));return;
    }
    res.writeHead(404);res.end('Not found');
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    const origin=req.headers.origin;
    if(req.url!=='/game'||!origin||!allowed.has(origin)){
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();rejected++;return;
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',ws=>{
    ws.isAlive=true;
    ws.on('pong',()=>{ws.isAlive=true});
    const id=randomUUID();let peer=null,authenticating=false,rateWindow=Date.now(),messagesInWindow=0;
    const send=obj=>{
      if(ws.readyState!==WebSocket.OPEN)return;
      if(ws.bufferedAmount>1_500_000){oversized++;ws.close(1013,'Network too slow');return}
      ws.send(JSON.stringify(obj));
    };
    const timer=setTimeout(()=>{if(!peer)ws.close(1008,'Authentication required')},10000);
    let queue=Promise.resolve();
    async function handle(bytes){
      let msg;try{msg=JSON.parse(bytes.toString())}catch{return send({type:'error',message:'Некорректное сообщение.'})}
      if(!msg||typeof msg!=='object')return;
      const now=Date.now();if(now-rateWindow>1000){rateWindow=now;messagesInWindow=0}
      if(++messagesInWindow>120){ws.close(1008,'Too many messages');return}
      if(!peer){
        if(msg.type!=='auth'||authenticating)return;
        authenticating=true;
        try{
          const user=await store.verify(typeof msg.token==='string'?msg.token:'');
          for(const other of game.peers.values())if(other.user.id===user.id){
            game.detach(other);
            wss.clients.forEach(client=>{if(client.peerId===other.id)client.close(1000,'Reconnected')});
          }
          peer=await game.attach(id,send,user);ws.peerId=id;verified++;clearTimeout(timer);
        }catch(e){game.peers.delete(id);rejected++;send({type:'error',message:e.message});ws.close(1008,'Authentication failed')}
        finally{authenticating=false}
        return;
      }
      await game.command(peer,msg);
    }
    ws.on('message',bytes=>{queue=queue.then(()=>handle(bytes)).catch(e=>{log.error('socket command',e.message);send({type:'error',message:e.message?.slice(0,180)||'Ошибка сервера.'})})});
    ws.on('close',()=>{clearTimeout(timer);if(peer)game.detach(peer)});
    ws.on('error',e=>log.error('socket',e.message));
  });
  const ticker=setInterval(()=>game.tick(),tickerMs);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(ws.isAlive===false){ws.terminate();continue}ws.isAlive=false;ws.ping()}},30000);
  async function close(){clearInterval(ticker);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve))}
  return {server,wss,game,close};
}
