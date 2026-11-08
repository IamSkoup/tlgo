/* Savanna Freedom. Original procedural art and game code. No runtime network. */
'use strict';
window.SF = {};
(() => {
const S=SF,T=THREE;
S.clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); S.lerp=(a,b,t)=>a+(b-a)*t;
S.angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
S.dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);S.rng=(seed)=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
S.random=S.rng(149); S.$=id=>document.getElementById(id);
S.HEROES=[{id:'kion',name:'Кайон',species:'lion',role:'Лидер Хранителей',ability:'Рык Предков',hp:150,speed:8,sprint:15,power:29,color:0xe0a438,home:{x:-42,z:24}},
{id:'fuli',name:'Фули',species:'cheetah',role:'Самая быстрая',ability:'Huwezi!',hp:110,speed:12,sprint:23,power:20,color:0xe5ba57,home:{x:42,z:38}},
{id:'jasiri',name:'Джазири',species:'hyena',role:'Голос Сопротивления',ability:'Инстинкт Чужеземья',hp:130,speed:9,sprint:17,power:24,color:0x9d91ac,home:{x:140,z:-130}}];
S.LOCATIONS=[{name:'Логово Хранителей',x:-45,z:0,r:28},{name:'Скала Прайда',x:-105,z:-98,r:44},{name:'Водопой',x:76,z:26,r:36},{name:'Дерево Рафики',x:-104,z:92,r:30},{name:'Роща Мизиму',x:-190,z:5,r:45},{name:'Река Круг Жизни',x:30,z:155,r:40},{name:'Лес акаций',x:-180,z:135,r:50},{name:'Каменные холмы',x:-145,z:-220,r:60},{name:'Чужеземье',x:160,z:-145,r:95},{name:'Клан Джазири',x:146,z:-105,r:30},{name:'Логово Джанджи',x:260,z:-145,r:38},{name:'Вулкан Шрама',x:262,z:-280,r:68},{name:'Пещера шёпота',x:-228,z:-112,r:25},{name:'Тайный проход',x:194,z:-206,r:25},{name:'Тихие заводи',x:168,z:160,r:35}];
S.WEATHERS=['Ясно','Облачно','Пасмурно','Лёгкий дождь','Ливень','Гроза','Ветер','Пыльная буря','Утренний туман'];
S.FACTIONS=['Королевство Симбы','Львиная охрана','Хранители','Клан Джазири','Банда Джанджи','Жители саванны'];
S.height=(x,z)=>{
 const hill=(cx,cz,r,h)=>h*Math.exp(-((x-cx)**2+(z-cz)**2)/(r*r));
 return 1.7*Math.sin(x*.018)*Math.cos(z*.021)+1.3*Math.sin(z*.035+x*.009)+hill(-105,-98,42,16)+hill(-145,-220,60,18)+hill(262,-305,46,26)+hill(-260,210,85,18)-hill(76,26,32,3)-hill(165,162,29,2.5);
};
S.meshMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.94});
// Merge small procedural forms into a single coloured draw call per animated part.
S.pack=(parts,material=S.meshMaterial)=>{
 const pos=[],norm=[],col=[];
 for(const p of parts){let g=p.g.index?p.g.toNonIndexed():p.g.clone(); const m=new T.Matrix4().compose(new T.Vector3(...(p.p||[0,0,0])),new T.Quaternion().setFromEuler(new T.Euler(...(p.r||[0,0,0]))),new T.Vector3(...(p.s||[1,1,1])));g.applyMatrix4(m);const c=new T.Color(p.c??0xffffff);let a=g.attributes.position.array,n=g.attributes.normal.array;for(let i=0;i<a.length;i+=3){pos.push(a[i],a[i+1],a[i+2]);norm.push(n[i],n[i+1],n[i+2]);col.push(c.r,c.g,c.b)}g.dispose()}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.computeBoundingSphere();const m=new T.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;return m;
};
const sphere=new T.SphereGeometry(1,10,8),ico=new T.IcosahedronGeometry(1,0),box=new T.BoxGeometry(1,1,1),cone=new T.ConeGeometry(1,1,7),cylinder=new T.CylinderGeometry(1,1,1,7);
S.geo={sphere,ico,box,cone,cylinder};
S.part=(g,c,p,s,r)=>({g,c,p,s,r});
S.animal=(species,id='',color)=>{
 const root=new T.Group(),parts=[],legs=[],head=new T.Group();root.add(head);
 let fur=color??({lion:0xd5a453,cheetah:0xdab559,hyena:0x928499,zebra:0xe4dfce,antelope:0xb88a57,gazelle:0xcaa96e,elephant:0x858c89,giraffe:0xd8ba76,hippo:0x9a91a1,croc:0x688764,warthog:0x998476,monkey:0xb7a18a,badger:0x55575e,bird:0xe8e3cc}[species]||0xd4b689);
 const feline=['lion','cheetah','hyena'].includes(species),big=['hippo','elephant'].includes(species),bird=species==='bird',gir=species==='giraffe';
 const slim=species==='cheetah'||species==='gazelle',len=big?1.9:species==='croc'?2.2:1.25,width=big?1.05:slim?.47:.65,legH=gir?2.4:big?1.5:slim?1.35:species==='croc'?.45:1.05;
 const base=legH+.55;
 const add=(g,c,p,s,r)=>parts.push(S.part(g,c,p,s,r));
 add(sphere,fur,[0,base,0],[width,big?.95:.62,len]);add(sphere,fur,[0,base+.08,.65],[width*.98,.7,.8]);add(sphere,0xf0d5a2,[0,base-.3,.15],[width*.82,.29,len*.8]);
 if(species==='hyena'){add(sphere,fur,[0,base+.26,.65],[.69,.77,.66]);for(let i=0;i<7;i++)add(cone,0x3e3546,[0,base+.73,-.9+i*.24],[.18,.55,.22],[-.35,0,0]);}
 if(gir)add(cylinder,fur,[0,base+1.1,.8],[.35,2.5,.35],[-.18,0,0]);
 if(species==='badger')add(sphere,0xd1d1c0,[0,base+.49,0],[width*.85,.2,len]);
 let hy=base+(gir?2.4:species==='hyena'?.35:.15),hz=len*.77;
 const hp=[];const h=(g,c,p,s,r)=>hp.push(S.part(g,c,p,s,r));
 const muzzle=species==='croc'?1.4:species==='hyena'?.72:big?.7:.47;
 h(sphere,fur,[0,0,0],[big?.94:.58,big?.85:.62,big?.85:.65]);
 h(sphere,species==='hyena'?0x615569:big?fur:0xf2d6a3,[0,-.20,.45],[big?.8:.43,big?.42:.3,muzzle]);
 h(sphere,0x302c2a,[0,-.06,.48+muzzle*.83],[big?.3:.22,.13,.14]);
 h(sphere,0x5e493c,[0,-.39,.66],[.24,.025,.2]);
 for(const side of [-1,1]){
  h(sphere,species==='hyena'?0x4b4055:fur,[side*.45,.43,-.03],[species==='hyena'?.31:.27,.34,.14],[0,0,-side*.38]);
  h(sphere,0xc68d84,[side*.45,.44,.085],[.15,.21,.035],[0,0,-side*.38]);
  h(sphere,0xf3eccd,[side*.34,.13,.49],[.18,.2,.09],[0,side*.45,0]);
  h(sphere,id==='fuli'?0x5c8954:id==='jasiri'?0x658baa:0x99672f,[side*.35,.13,.565],[.1,.14,.048]);
  h(sphere,0x101f1a,[side*.35,.13,.603],[.048,.105,.024]);
  h(sphere,0xffffff,[side*.33,.19,.625],[.028,.033,.014]);
  h(sphere,0x473a30,[side*.34,.34,.48],[.20,.04,.05],[0,0,side*-.18]);
  if(species==='cheetah')h(sphere,0x40352c,[side*.32,-.09,.60],[.045,.24,.04],[0,0,side*.22]);
  if(species==='elephant')h(sphere,fur,[side*1.05,.15,-.15],[.67,.86,.2]);
  if(['antelope','gazelle','giraffe'].includes(species))h(cone,0x493d31,[side*.23,.95,-.12],[.09,species==='giraffe'?.5:1.1,.09],[0,0,-side*.15]);
  if(species==='warthog')h(cone,0xf7e6c2,[side*.45,-.12,.83],[.12,.55,.12],[.5,0,side*.3]);
 }
 if(id==='kion')for(let i=0;i<5;i++)h(cone,0xa73d28,[(i-2)*.16,.65+Math.sin(i)*.06,-.08],[.24,.65,.33],[.4,0,(i-2)*-.12]);
 if(['simba','guard'].includes(id)){for(let i=0;i<12;i++){let a=i*Math.PI/6;h(sphere,0x6b3d2a,[Math.cos(a)*.63,Math.sin(a)*.62,-.18],[.37,.4,.34])}}
 if(species==='elephant'){const curve=new T.CatmullRomCurve3([new T.Vector3(0,-.1,.8),new T.Vector3(0,-.8,1.15),new T.Vector3(0,-1.4,1.3),new T.Vector3(0,-1.6,1.7)]);h(new T.TubeGeometry(curve,9,.2,7,false),fur,[0,0,0],[1,1,1]);}
 head.add(S.pack(hp));head.position.set(0,hy,hz);
 // Individually placed spots and stripes make coats distinct without external textures.
 if(['cheetah','hyena','giraffe','zebra'].includes(species)){
  const r=S.rng(id==='fuli'?24:species.length*37);
  for(let i=0;i<(species==='zebra'?26:42);i++){
   let z=(r()-.5)*len*1.7,a=r()*Math.PI*2;let rad=Math.sqrt(Math.max(.1,1-z*z/(len*len)));
   add(sphere,species==='hyena'?0x4d4158:species==='giraffe'?0x8c5f32:0x40382e,[Math.cos(a)*width*rad,base+Math.sin(a)*.61*rad,z],species==='zebra'?[.035,.65*rad,.07]:[.075,.08,.1]);
  }
 }
 if(id==='kion'||id==='fuli'){add(sphere,0xab492c,[-width-.015,base+.1,.57],[.025,.21,.18]);add(sphere,0xe3ac45,[-width-.04,base+.13,.57],[.025,.1,.1]);}
 if(species==='croc')for(let i=0;i<10;i++)add(cone,0x465b43,[0,base+.55,-1.7+i*.34],[.22,.3,.3]);
 root.add(S.pack(parts));
 for(let i=0;i<4;i++){
  const leg=new T.Group();leg.position.set((i%2?1:-1)*width*.75,legH+.1,i<2?len*.63:-len*.64);
  const lp=[S.part(sphere,fur,[0,-legH*.35,0],[big?.32:slim?.14:.21,legH*.55,big?.37:.22]),S.part(sphere,feline?0xe7bf82:fur,[0,-legH+.06,.13],[big?.37:.23,.19,big?.43:.33])];
  leg.add(S.pack(lp));root.add(leg);legs.push(leg);
 }
 const tail=new T.Group();tail.position.set(0,base+.15,-len*.75);
 const curve=new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(.15,.15,-.6),new T.Vector3(.4,.4,-1.2),new T.Vector3(.3,.7,-1.5)]);
 tail.add(S.pack([S.part(new T.TubeGeometry(curve,8,species==='cheetah'?.09:.075,5,false),fur,[0,0,0],[1,1,1]),S.part(sphere,species==='lion'?0x9b492b:0x403c3b,[.3,.7,-1.5],[.16,.2,.18])]));root.add(tail);
 if(bird){root.scale.setScalar(.48);head.position.y+=.3;const wings=S.pack([S.part(sphere,fur,[-1,base+.2,0],[1.3,.13,.7]),S.part(sphere,fur,[1,base+.2,0],[1.3,.13,.7]),S.part(cone,0xe2a14d,[0,hy,hz+.8],[.16,.8,.13],[Math.PI/2,0,0])]);root.add(wings);root.userData.wings=wings;}
 else if(species==='monkey'||species==='badger')root.scale.setScalar(.7);
 else if(big)root.scale.setScalar(species==='elephant'?1.6:1.25);
 else if(gir)root.scale.setScalar(1.15);
 root.userData={...root.userData,legs,tail,head,baseHead:hy,species};return root;
};
S.animateAnimal=(e,t,dt)=>{const m=e.model,d=m.userData;const v=Math.hypot(e.vx||0,e.vz||0);const gait=v>.3?Math.sin(t*(v>12?13:8)+e.seed):0;for(let i=0;i<4;i++)d.legs[i].rotation.x=gait*(i===0||i===3?1:-1)*(v>12?.75:.48);if(e.attackAnim>0)d.legs[0].rotation.x=-1.4;d.tail.rotation.y=Math.sin(t*2+e.seed)*.22;d.head.rotation.x=e.state==='EAT'?.4:e.state==='SLEEP'?.2:Math.sin(t*1.7+e.seed)*.035;m.rotation.z=e.hp<=0?Math.PI/2:e.dodge>0?Math.sin(e.dodge*15)*.22:0;if(d.wings)d.wings.rotation.z=Math.sin(t*8)*.22;};
S.human=()=>{const p=[],a=(g,c,pos,sc,rot)=>p.push(S.part(g,c,pos,sc,rot));a(box,0xb1aa89,[0,1.25,0],[.9,1,.44]);a(sphere,0xcba487,[0,2,0],[.32,.42,.32]);a(sphere,0x675244,[0,2.25,-.07],[.28,.22,.29]);for(const q of [-1,1]){a(cylinder,0x505d69,[q*.23,.45,0],[.17,.9,.17]);a(sphere,0x493c32,[q*.23,.08,.15],[.22,.14,.36]);a(cylinder,0xcba487,[q*.63,1.2,0],[.14,.9,.14],[0,0,q*.22]);a(sphere,0x252620,[q*.13,2.05,.29],[.04,.04,.025])}a(sphere,0xb78b72,[0,1.98,.34],[.1,.09,.13]);return S.pack(p);};
S.vehicleModel=()=>{const g=new T.Group(),p=[],a=(geo,c,pos,sc,r)=>p.push(S.part(geo,c,pos,sc,r));const red=0x864d3b,edge=0xaa7155;
 a(box,red,[0,1.2,0],[2.7,.6,5.4]);a(box,0x383b35,[0,.85,0],[2.4,.35,5]);a(box,red,[0,1.7,1.7],[2.65,.75,1.8]);a(box,edge,[0,2.95,.25],[2.8,.16,2.1]);
 for(const side of [-1,1]){a(box,red,[side*1.27,2.25,.25],[.13,1.35,2]);a(box,0xb88c64,[side*1.22,2.5,1.17],[.12,1,.12]);a(box,red,[side*1.25,1.65,-1.8],[.16,.8,2]);a(box,0x48463e,[side*.62,1.8,.2],[.75,.6,.7]);a(box,0xe5d29a,[side*.9,1.7,2.64],[.5,.28,.07]);a(box,0xd34525,[side*1.1,1.4,-2.73],[.2,.24,.08]);}a(box,red,[0,1.65,-2.72],[2.65,.7,.12]);a(box,0x9b9c87,[0,.95,2.83],[3,.23,.2]);a(box,0x2e342f,[0,1.55,2.64],[1.2,.26,.1]);g.add(S.pack(p));
 const wheels=[];for(let i=0;i<4;i++){const w=S.pack([S.part(new T.CylinderGeometry(.66,.66,.48,14),0x272a26,[0,0,0],[1,1,1],[0,0,Math.PI/2]),S.part(new T.CylinderGeometry(.3,.3,.5,10),0x9a9886,[0,0,0],[1,1,1],[0,0,Math.PI/2])]);w.position.set(i%2?1.4:-1.4,.7,i<2?1.75:-1.75);g.add(w);wheels.push(w)}
 const driver=S.human();driver.scale.setScalar(.8);driver.position.set(-.55,1.25,.2);g.add(driver);g.userData={wheels,driver};return g;};
S.Input=class{
 constructor(game){this.g=game;this.keys=new Set();this.pressed=new Set();this.mouseRight=false;this.yaw=.15;this.pitch=.3;this.lastMove=0;
 addEventListener('keydown',e=>{if(['Space','AltLeft','AltRight','Tab','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;if(!this.keys.has(e.code))this.pressed.add(e.code);this.keys.add(e.code);if(e.code.startsWith('Alt'))game.ui?.wheel(true)});
 addEventListener('keyup',e=>{this.keys.delete(e.code);if(e.code.startsWith('Alt'))game.ui?.wheel(false)});
 addEventListener('blur',()=>{this.keys.clear();this.pressed.clear();game.ui?.wheel(false);if(game.started)game.ui?.pause(true)});
 addEventListener('mousemove',e=>{if(document.pointerLockElement||this.drag){this.yaw-=e.movementX*.0025*game.settings.sensitivity;this.pitch=S.clamp(this.pitch+e.movementY*.002*.8*game.settings.sensitivity,-.13,1.05);this.lastMove=game.time;}});
 const canvas=S.$('world');canvas.addEventListener('mousedown',e=>{if(!game.canControl())return;if(e.button===0){this.pressed.add('Attack');this.drag=true;this.lock()}if(e.button===2){this.mouseRight=true;this.drag=true;}});
 addEventListener('mouseup',()=>{this.drag=false;this.mouseRight=false});canvas.addEventListener('contextmenu',e=>e.preventDefault());
 document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){this.keys.clear();this.mouseRight=false}});
 }
 lock(){try{const p=S.$('world').requestPointerLock?.();p?.catch(()=>{this.g.ui.toast('Захват мыши недоступен: удерживай кнопку мыши для камеры.')})}catch{this.g.ui.toast('Камера: удерживай кнопку мыши и двигай мышь.')}}
 take(k){const v=this.pressed.has(k);this.pressed.delete(k);return v}down(k){return this.keys.has(k)}clear(){this.pressed.clear()}
};
S.Audio=class{
 constructor(){this.ctx=null;this.cool=0}
 start(){if(!this.ctx){const A=window.AudioContext||window.webkitAudioContext;if(!A)return;this.ctx=new A();this.master=this.ctx.createGain();this.master.gain.value=.25;this.master.connect(this.ctx.destination);this.engine=this.ctx.createOscillator();this.engine.type='sawtooth';this.engineGain=this.ctx.createGain();this.engineGain.gain.value=0;this.engine.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();const b=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate);let data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.2;this.noise=this.ctx.createBufferSource();this.noise.buffer=b;this.noise.loop=true;this.rain=this.ctx.createGain();this.rain.gain.value=0;this.noise.connect(this.rain);this.rain.connect(this.master);this.noise.start()}this.ctx.resume().catch(()=>{})}
 tone(f=440,d=.16,vol=.15,type='sine',end=f){if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime;o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+d);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(this.master);o.start();o.stop(t+d+.02)}
 roar(){this.tone(100,1.2,.7,'sawtooth',28);this.tone(65,1.5,.45,'triangle',23)}
 update(game,dt){if(!this.ctx)return;this.master.gain.value=game.settings.volume;this.engineGain.gain.value=game.car.active?.045:0;this.engine.frequency.value=45+Math.abs(game.car.speed)*5;this.rain.gain.value=[3,4,5].includes(game.weather.index)?(game.weather.index===3?.18:.5):.025;this.cool-=dt;if(this.cool<0&&!game.paused){this.cool=3+Math.random()*6;const night=game.weather.hour<6||game.weather.hour>19;this.tone(night?2600:1600,.12,.035,'sine',night?2800:2400)}}
};
})();
