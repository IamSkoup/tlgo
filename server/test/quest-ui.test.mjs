import test from 'node:test';
import assert from 'node:assert/strict';
import {describeQuest,questDistance} from '../../client/js/quest.mjs';
import {QUESTS} from '../src/rules.mjs';

test('Fuli quest tells the player the exact next location and its distance',()=>{
 const me={x:0,z:0};
 const first=describeQuest({id:'fuli',progress:0},QUESTS,new Map(),new Map(),me);
 assert.match(first.step,/водопоя/);
 assert.deepEqual([first.target.x,first.target.z],[76,26]);
 assert.equal(questDistance(first.target,{x:76,z:26}),0);
 const next=describeQuest({id:'fuli',progress:1},QUESTS,new Map(),new Map(),me);
 assert.match(next.step,/Скалы Прайда/);
 assert.deepEqual([next.target.x,next.target.z],[-105,-98]);
 assert.notEqual(first.target.key,next.target.key);
});

test('herb target follows nearest ready plant, and completed or abandoned quests disappear',()=>{
 const future=Date.now()+60_000;
 const resources=new Map([['a',{id:'a',type:'herb',x:1,z:1,readyAt:future}],['b',{id:'b',type:'herb',x:20,z:20,readyAt:0}]]);
 const result=describeQuest({id:'rafiki',progress:1},QUESTS,resources,new Map(),{x:0,z:0});
 assert.equal(result.target.key,'herb-b');assert.equal(result.progress,1);
 assert.equal(describeQuest({id:'rafiki',completed:true},QUESTS,resources,new Map(),null),null);
 assert.equal(describeQuest({id:'rafiki',abandoned:true},QUESTS,resources,new Map(),null),null);
});

test('hyena quest marker favors a living enemy',()=>{
 const enemies=new Map([['hyena-1',{id:'hyena-1',hp:0,x:0,z:0,model:{visible:false}}],['hyena-2',{id:'hyena-2',hp:150,x:50,z:10,model:{visible:true}}]]);
 const result=describeQuest({id:'kion',progress:0},QUESTS,new Map(),enemies,{x:0,z:0});
 assert.equal(result.target.key,'hyena-hyena-2');
 assert.match(result.step,/гиен/);
});
