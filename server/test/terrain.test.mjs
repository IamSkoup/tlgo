import test from 'node:test';
import assert from 'node:assert/strict';
import {TERRAIN_COLLIDERS,resolveTerrain} from '../src/terrain.mjs';
import {GameCore} from '../src/game.mjs';
import {FakeStore} from './fixtures.mjs';

test('authoritative terrain mirrors fixed-seed trees, rocks and landmark barriers',()=>{
  assert.equal(TERRAIN_COLLIDERS.length,361);
  const first=TERRAIN_COLLIDERS[0];
  assert.ok(Math.abs(first.x+316.1686661071)<.00001);
  assert.ok(Math.abs(first.z-278.6911111371)<.00001);
  const resolved=resolveTerrain(first.x,first.z);
  assert.ok(Math.hypot(resolved.x-first.x,resolved.z-first.z)>=first.r+.7999);
  assert.deepEqual(resolveTerrain(-68,45),{x:-68,z:45});
  assert.ok(resolveTerrain(2000,-2000).x<=340);
});

test('game simulation blocks movement through a rock even with forged continuous input',async()=>{
  let time=100000;
  const store=new FakeStore(),id='33333333-3333-4333-8333-333333333333';
  store.add(id,'Stonepaw');
  const game=new GameCore(store,{clock:()=>time,log:{error(){}}});
  const peer=await game.attach('stone',()=>{},{id});
  await game.command(peer,{type:'join'});
  const collider=TERRAIN_COLLIDERS.find(c=>c.r>=8&&c.x===-112&&c.z===-106);
  const p=peer.player;p.x=collider.x-collider.r-1.6;p.z=collider.z;
  for(let i=0;i<90;i++){
    time+=50;
    await game.command(peer,{type:'input',x:1,z:0,sprint:true});
    game.tick();
    assert.ok(Math.hypot(p.x-collider.x,p.z-collider.z)>=collider.r+.79);
  }
  assert.ok(p.x<collider.x);
});
