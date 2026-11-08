import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=path=>readFile(resolve(root,path),'utf8');

test('browser entry includes existing local scripts, styles and navigable legacy game',async()=>{
  const html=await read('client/index.html');
  const assets=[...html.matchAll(/(?:src|href)="([\w./-]+\.(?:js|css|html))"/g)].map(match=>match[1]);
  assert.ok(assets.length>=6);
  for(const asset of assets){
    const filename=resolve(root,'client',asset);
    assert.ok(filename.startsWith(resolve(root,'client')+'/'),'no path traversal');
    assert.ok((await stat(filename)).size>0,`missing or empty ${asset}`);
  }
  assert.match(html,/id="authForm"/);
  assert.match(html,/id="chatChannel"/);
  assert.match(html,/id="mobilePad"/);
  assert.match(html,/id="dialogueBox"/);
});

test('every directly referenced browser element exists on the page or in a panel template',async()=>{
  const html=await read('client/index.html'),client=await read('client/js/online.js');
  const allIds=new Set([...html.matchAll(/\bid="([\w-]+)"/g),...client.matchAll(/\bid="([\w-]+)"/g)].map(m=>m[1]));
  const references=new Set([...client.matchAll(/\$\(['"]([\w-]+)['"]\)/g)].map(m=>m[1]));
  for(const id of references)assert.ok(allIds.has(id),`client accesses missing element: ${id}`);
  assert.ok(references.size>=90,'test should keep inspecting the full client');
});

test('all 26 referenced soundtrack and foley clips are bundled as valid Ogg files',async()=>{
  const audio=await read('client/js/audio.js'),samples=new Set([...audio.matchAll(/\b[\w-]+\.ogg\b/g)].map(m=>m[0]));
  assert.equal(samples.size,26);
  for(const name of samples){
    const buffer=await readFile(resolve(root,'client/audio',name));
    assert.ok(buffer.length>=100,`${name} has no audio data`);
    assert.equal(buffer.toString('ascii',0,4),'OggS',`${name} is not an Ogg clip`);
  }
  assert.ok((await read('docs/AUDIO_CREDITS.md')).includes('CC0'));
});

test('no privileged Supabase key is bundled into browser assets',async()=>{
  for(const file of ['client/config.js','client/js/online.js','client/js/audio.js','client/index.html']){
    const source=await read(file);
    assert.doesNotMatch(source,/sb_secret_[a-zA-Z0-9]{12,}/);
    assert.doesNotMatch(source,/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  }
});

test('touch controls are present and the landscape layout does not depend on narrow width',async()=>{
  const html=await read('client/index.html');
  const css=await read('client/touch.css');
  const logic=await read('client/js/online.js');
  assert.match(html,/href="touch\.css"/);
  assert.match(html,/id="touchStick"/);
  assert.match(html,/id="touchStickKnob"/);
  assert.match(css,/@media \(pointer:coarse\)/);
  assert.match(css,/@media \(pointer:coarse\) and \(orientation:landscape\)/);
  assert.match(css,/body:has\(#hud:not\(\.hidden\)\) #topbar\{display:none\}/);
  assert.match(logic,/this\.touchLookPointer=e\.pointerId/);
  assert.match(logic,/touchMove\.x/);
  assert.match(logic,/touchMove\.y=-dy\*scale\/radius/);
  assert.match(logic,/holdMobileButton\('mobileJump','Space'/);
  assert.match(logic,/jumpQueued=true;sendCurrentInput\(true\)/);
  assert.match(logic,/sprintButton\.onclick/);
  assert.match(css,/#chatBox\.chat-collapsed\{width:91px\}/);
  assert.match(css,/#mobilePad #mobileJump\{position:fixed/);
  assert.match(css,/\.vignette\{opacity:\.12\}/);
});

test('desktop capture and camera-relative movement are connected without changing mobile controls',async()=>{
  const logic=await read('client/js/online.js');
  const motion=await read('client/js/movement.mjs');
  const css=await read('client/style.css');
  assert.match(logic,/cameraRelativeVector\(scene\.yaw,lr,ud\)/);
  assert.match(logic,/this\.canvas\.requestPointerLock\(\)/);
  assert.match(logic,/document\.addEventListener\('pointerlockchange'/);
  assert.match(logic,/document\.exitPointerLock\(\)/);
  assert.match(logic,/predictedDisplayTarget\(t,this\.localVelocity/);
  assert.match(motion,/export function cameraRelativeVector/);
  assert.match(css,/\.vignette\{background:linear-gradient\(0deg,rgba\(16,12,10,\.18\),transparent 32%\)\}/);
});

test('world features and death screen are present without a raised pipe or jump sound',async()=>{
 const html=await read('client/index.html');
 const logic=await read('client/js/online.js');
 const world=await read('client/js/world.js');
 const core=await read('client/js/core.js');
 const css=await read('client/style.css');
 assert.match(html,/id="deathScreen"/);
 assert.match(html,/id="talkPrompt"/);
 assert.match(logic,/this\.attachLabel\(entry,true\)/);
 assert.match(logic,/this\.camera\.position\.copy\(desired\)/);
 assert.match(logic,/showDeathScreen\(m\.seconds\)/);
 assert.match(logic,/now-\(this\.lastAttackAt\|\|-Infinity\)<950/);
 assert.doesNotMatch(logic,/sound\.play\('jump'/);
 assert.match(world,/waterAt\(x,z\)/);
 assert.match(world,/const river=|this\.river=strip\(0,6\.3/);
 assert.doesNotMatch(world,/new T\.TubeGeometry\(/);
 assert.match(core,/swimming\?Math\.sin\(t\*7/);
 assert.match(css,/\.death-screen\{/);
});
