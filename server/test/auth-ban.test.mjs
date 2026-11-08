import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../src/persistence.mjs';

function verificationFixture(sanctions){
  let filter='';
  const store=Object.create(SupabaseStore.prototype);
  store.api={
    auth:{getUser:async()=>({data:{user:{id:'player-id'}},error:null})},
    from(table){
      assert.equal(table,'sanctions');
      return {select(){return this},eq(){return this},or(expression){filter=expression;return this},async limit(){return {data:sanctions.filter(row=>!row.expires_at||Date.parse(row.expires_at)>Date.now()).slice(0,1),error:null}}};
    }
  };
  return {store,getFilter:()=>filter};
}

test('auth checks active sanctions even if old expired sanctions exist',async()=>{
  const expired={expires_at:new Date(Date.now()-86400000).toISOString()};
  const active={expires_at:new Date(Date.now()+86400000).toISOString()};
  const fixture=verificationFixture([expired,active]);
  await assert.rejects(fixture.store.verify('valid-jwt'),/модерацией/);
  assert.match(fixture.getFilter(),/expires_at\.is\.null,expires_at\.gt\./);
});

test('auth accepts an account with only expired bans',async()=>{
  const fixture=verificationFixture([{expires_at:new Date(Date.now()-86400000).toISOString()}]);
  assert.deepEqual(await fixture.store.verify('valid-jwt'),{id:'player-id'});
});
