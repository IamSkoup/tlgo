// Mirrors the fixed-seed collision layout in client/js/world.js. The server
// decides whether a character can occupy a position; a hacked client cannot
// simply ignore an acacia, rock, cave wall or the volcano.
const AREAS=[
  [-45,0,28],[-105,-98,44],[76,26,36],[-104,92,30],[-190,5,45],
  [30,155,40],[-180,135,50],[-145,-220,60],[160,-145,95],
  [146,-105,30],[260,-145,38],[262,-280,68],[-228,-112,25],
  [194,-206,25],[168,160,35]
];

function rng(seed){
  return()=>{
    seed|=0;seed=seed+0x6D2B79F5|0;
    let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

export const TERRAIN_COLLIDERS=(()=>{
  const result=[];const add=(x,z,r)=>result.push({x,z,r});
  const random=rng(531);
  let count=0;
  for(let i=0;i<230;i++){
    const x=(random()-.5)*670,z=(random()-.5)*670;
    if(x>100&&z<-80)continue;
    if(AREAS.some(([ax,az,r],index)=>Math.hypot(x-ax,z-az)<(index===2?35:15)))continue;
    const scale=.7+random()*.7;
    random(); // Visible instance rotation consumes the same PRNG sample.
    add(x,z,.6*scale);
    if(++count>=170)break;
  }
  for(let i=0;i<160;i++){
    const x=(random()-.5)*700,z=(random()-.5)*700,size=.7+random()*2;
    if(!AREAS.some(([ax,az])=>Math.hypot(x-ax,z-az)<12)){
      random(); // Visible rock height scale.
      add(x,z,size*.75);
    }
    random();random();random(); // Visible rock Euler rotation.
  }
  add(-112,-106,9);add(-102,-103,8);add(-109,96,3.8);
  for(const [x,z] of [AREAS[0],AREAS[10],AREAS[12],AREAS[13]]){
    add(x-6,z-5,3);add(x+6,z-5,3);
  }
  for(let i=0;i<6;i++)add(-190+Math.cos(i*Math.PI/3)*20,Math.sin(i*Math.PI/3)*20,1);
  add(265,-312,24);add(-228,-105,2.2);add(-190,-12,2.2);
  return Object.freeze(result);
})();

const grid=new Map(),CELL=16;
for(const c of TERRAIN_COLLIDERS){
  const minX=Math.floor((c.x-c.r-2)/CELL),maxX=Math.floor((c.x+c.r+2)/CELL);
  const minZ=Math.floor((c.z-c.r-2)/CELL),maxZ=Math.floor((c.z+c.r+2)/CELL);
  for(let i=minX;i<=maxX;i++)for(let k=minZ;k<=maxZ;k++){
    const key=i+','+k;
    if(!grid.has(key))grid.set(key,[]);
    grid.get(key).push(c);
  }
}

export function resolveTerrain(x,z,radius=.8){
  let px=Math.max(-340,Math.min(340,x)),pz=Math.max(-340,Math.min(340,z));
  for(let pass=0;pass<3;pass++){
    const candidates=grid.get(Math.floor(px/CELL)+','+Math.floor(pz/CELL))||[];
    let collided=false;
    for(const c of candidates){
      const dx=px-c.x,dz=pz-c.z,dist=Math.hypot(dx,dz),minimum=c.r+radius;
      if(dist>=minimum)continue;
      const inv=dist>.0001?1/dist:0;
      px=c.x+(inv?dx*inv:1)*minimum;
      pz=c.z+(inv?dz*inv:0)*minimum;
      collided=true;
    }
    px=Math.max(-340,Math.min(340,px));pz=Math.max(-340,Math.min(340,pz));
    if(!collided)break;
  }
  return {x:px,z:pz};
}
