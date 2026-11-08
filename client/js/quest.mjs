// Quest directions are client-side hints. Progress, rewards and completion
// always come from the game server.
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

export function describeQuest(state, definitions, resources, npcs, position) {
 if(!state||state.completed||state.abandoned)return null;
 const quest=definitions?.[state.id];
 if(!quest)return null;
 const progress=Math.max(0,Math.min(quest.count,Number(state.progress)||0));
 const result={id:state.id,title:quest.title,progress,total:quest.count,reward:quest.reward,step:quest.description,target:null};
 if(quest.kind==='visit'){
  const next=quest.stops?.[progress];
  if(next){
   const name=progress===0?'Водопой':'Скала Прайда';
   result.step=`Доберись до ${progress===0?'водопоя':'Скалы Прайда'} — нужно подойти на 23 м.`;
   result.target={x:next.x,z:next.z,label:name,key:`visit-${progress}`};
  }
 }else if(quest.kind==='gather'){
  result.step=`Собери лечебные травы. Растения отмечены на карте зелёным.`;
  const herbs=[...resources.values()].filter(r=>r.type==='herb');
  const ready=herbs.filter(r=>Number(r.readyAt||0)<=Date.now());
  const pool=ready.length?ready:herbs;
  pool.sort((a,b)=>position?distance(a,position)-distance(b,position):a.id.localeCompare(b.id));
  if(pool[0])result.target={x:pool[0].x,z:pool[0].z,label:'Лечебные травы',key:`herb-${pool[0].id}`};
 }else if(quest.kind==='hunt'){
  result.step='Найди и победи агрессивных гиен. Они отмечены на карте красным.';
  const living=[...npcs.values()].filter(n=>n.id.startsWith('hyena-')&&n.hp>0&&n.model.visible);
  living.sort((a,b)=>position?distance(a,position)-distance(b,position):a.id.localeCompare(b.id));
  const enemy=living[0];
  result.target=enemy?{x:enemy.x,z:enemy.z,label:'Опасная гиена',key:`hyena-${enemy.id}`}: {x:125,z:-102,label:'Тропы гиен',key:'hyena-area'};
 }
 return result;
}

export function questDistance(target,position){return target&&position?Math.round(distance(target,position)):null}

// Positive radians mean the goal is to the right of the current camera view.
export function questBearing(target,position,yaw){
 if(!target||!position||!Number.isFinite(yaw))return null;
 const dx=target.x-position.x,dz=target.z-position.z;
 if(Math.hypot(dx,dz)<.1)return 0;
 const forward=dx*-Math.sin(yaw)+dz*-Math.cos(yaw);
 const right=dx*Math.cos(yaw)+dz*-Math.sin(yaw);
 return Math.atan2(right,forward);
}
