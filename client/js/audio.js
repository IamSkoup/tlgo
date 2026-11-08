// Sampled audio director. All bundled sounds are CC0 and listed in AUDIO_CREDITS.md.
const FILES={
 grass:['grass1.ogg','grass2.ogg','grass3.ogg'],sand:['sand1.ogg','sand2.ogg'],
 stone:['stone1.ogg','stone2.ogg'],mud:['mud1.ogg','mud2.ogg'],
 landing:'landing.ogg',punch:['punch1.ogg','punch2.ogg'],bite:'bite.ogg',
 hit:['hit1.ogg','hit2.ogg'],jump:'jump.ogg',dodge:'dodge.ogg',
 collect:'collect.ogg',reward:'reward.ogg',wind:'wind.ogg',savanna:'savanna.ogg',
 water:'water.ogg',thunder:'thunder.ogg',tension:'tension.ogg',chase:'chase.ogg',battle:'battle.ogg'
};
const DEFAULTS={master:.78,footsteps:.75,effects:.8,ambience:.43,music:.57,interface:.58,muted:false,musicDynamic:true,spatial:true};
export class SoundDirector {
 constructor(){
  try{this.settings={...DEFAULTS,...JSON.parse(localStorage.getItem('sf_audio_settings')||'{}')}}
  catch{this.settings={...DEFAULTS}}
  this.buffers=new Map();this.ready=false;this.started=false;this.pending=null;this.musicMode='none';this.currentTrack=null;
  this.lastFootstep=0;this.footIndex=0;this.lastAmbientUpdate=0;this.waterDistance=Infinity;
 }
 updateSetting(key,value){
  if(!(key in DEFAULTS))return;
  this.settings[key]=typeof DEFAULTS[key]==='boolean'?!!value:Math.max(0,Math.min(1,Number(value)||0));
  localStorage.setItem('sf_audio_settings',JSON.stringify(this.settings));this.applySettings();
  if(!this.settings.musicDynamic)this.setMusic('none');
 }
 reset(){for(const [key,v] of Object.entries(DEFAULTS))this.settings[key]=v;localStorage.setItem('sf_audio_settings',JSON.stringify(this.settings));this.applySettings()}
 async start(){
  if(this.started){await this.context?.resume();return this.pending}
  this.started=true;
  try{
   const API=window.AudioContext||window.webkitAudioContext;if(!API)return;
   this.context=new API();this.master=this.context.createGain();this.master.connect(this.context.destination);
   const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-10;compressor.ratio.value=3;
   compressor.attack.value=.003;compressor.release.value=.2;
   this.compressor=compressor;compressor.connect(this.master);
   this.groups={};for(const key of ['footsteps','effects','ambience','music','interface']){
    const node=this.context.createGain();node.connect(compressor);this.groups[key]=node;
   }
   this.applySettings();await this.context.resume();
   const files=[...new Set(Object.values(FILES).flat())];
   this.pending=Promise.all(files.map(async filename=>{
    try{const response=await fetch('audio/'+filename,{cache:'force-cache'});if(!response.ok)throw Error('HTTP '+response.status);
     const bytes=await response.arrayBuffer();this.buffers.set(filename,await this.context.decodeAudioData(bytes));}
    catch(error){console.warn('Audio sample unavailable',filename,error.message)}
   })).then(()=>{this.ready=true;this.loopAmbient('wind',.28);this.loopAmbient('savanna',.16);if(this.musicMode!=='none')this.setMusic(this.musicMode,true)});
   return this.pending;
  }catch(error){console.warn('Audio context unavailable',error.message)}
 }
 applySettings(){
  if(!this.context)return;
  const now=this.context.currentTime;
  this.master.gain.setTargetAtTime(this.settings.muted?0:this.settings.master,now,.04);
  for(const [name,node] of Object.entries(this.groups))node.gain.setTargetAtTime(this.settings[name],now,.04);
 }
 sample(key){const group=FILES[key];if(!group)return null;const filename=Array.isArray(group)?group[(this.footIndex++)%group.length]:group;return this.buffers.get(filename)}
 play(key,group='effects',{volume=.8,rate=1,pan=0}={}){
  if(!this.context||this.context.state!=='running')return null;
  const buffer=this.sample(key);if(!buffer)return null;
  const source=this.context.createBufferSource();source.buffer=buffer;source.playbackRate.value=Math.max(.65,Math.min(1.6,rate));
  const gain=this.context.createGain();gain.gain.value=volume;
  source.connect(gain);
  if(this.settings.spatial&&Math.abs(pan)>.05){const stereo=this.context.createStereoPanner();stereo.pan.value=Math.max(-1,Math.min(1,pan));gain.connect(stereo);stereo.connect(this.groups[group]);}
  else gain.connect(this.groups[group]);
  source.start();return source;
 }
 step(surface,fast=false){
  const now=performance.now(),interval=fast?245:400;
  if(now-this.lastFootstep<interval)return;
  this.lastFootstep=now;this.play(surface,'footsteps',{volume:fast?.65:.48,rate:.92+Math.random()*.2});
 }
 loopAmbient(key,volume){
  const buffer=this.sample(key);if(!buffer||!this.context)return;
  const node=this.context.createBufferSource();node.buffer=buffer;node.loop=true;
  const gain=this.context.createGain();gain.gain.value=volume;
  node.connect(gain);gain.connect(this.groups.ambience);node.start();this[key+'Loop']={node,gain};
 }
 setWaterDistance(distance){
  this.waterDistance=distance;
  if(this.ready&&!this.waterLoop)this.loopAmbient('water',0);
  if(!this.waterLoop||!this.context)return;
  const volume=Math.max(0,Math.min(.55,(34-distance)/34*.45));
  this.waterLoop.gain.gain.setTargetAtTime(volume,this.context.currentTime,.3);
 }
 setMusic(mode,force=false){
  if(!this.settings.musicDynamic)mode='none';
  if(this.musicMode===mode&&!force)return;
  this.musicMode=mode;if(!this.context||!this.ready)return;
  const now=this.context.currentTime,previous=this.currentTrack;
  if(previous){previous.gain.gain.cancelScheduledValues(now);previous.gain.gain.setTargetAtTime(0,now,.27);setTimeout(()=>{try{previous.source.stop()}catch{}},1300)}
  this.currentTrack=null;
  if(mode==='none'||!this.sample(mode))return;
  const source=this.context.createBufferSource();source.buffer=this.sample(mode);source.loop=true;
  const gain=this.context.createGain();gain.gain.value=0;source.connect(gain);gain.connect(this.groups.music);
  source.start();gain.gain.setTargetAtTime(mode==='battle'?.66:.52,now,.55);
  this.currentTrack={source,gain,mode};
 }
 musicStatus(){return this.currentTrack?.mode||'none'}
}
