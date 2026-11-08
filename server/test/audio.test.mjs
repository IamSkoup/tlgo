import test from 'node:test';
import assert from 'node:assert/strict';
import {SoundDirector} from '../../client/js/audio.js';

test('separate audio settings persist, clamp, mute and reset',()=>{
 const memory=new Map();
 globalThis.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
 const director=new SoundDirector();
 director.updateSetting('footsteps',.13);
 director.updateSetting('music',12);
 director.updateSetting('muted',true);
 assert.equal(director.settings.footsteps,.13);
 assert.equal(director.settings.music,1);
 assert.equal(director.settings.muted,true);
 assert.equal(new SoundDirector().settings.footsteps,.13);
 director.setMusic('chase');director.updateSetting('musicDynamic',false);
 assert.equal(director.musicMode,'none');
 director.reset();
 assert.equal(director.settings.muted,false);
 assert.equal(director.settings.musicDynamic,true);
 assert.equal(director.settings.footsteps,.75);
 delete globalThis.localStorage;
});
