// Camera-relative movement and short visual prediction. The server remains
// authoritative for actual coordinates, terrain and interactions.
export function cameraRelativeVector(yaw,right,forward){
 const x=right*Math.cos(yaw)-forward*Math.sin(yaw);
 const z=-right*Math.sin(yaw)-forward*Math.cos(yaw);
 const length=Math.hypot(x,z);
 return length>1?{x:x/length,z:z/length}:{x,z};
}

export function smoothInputVelocity(previous,input,speed,dt){
 const active=Math.hypot(input.x,input.z)>.04;
 const acceleration=Math.min(1,Math.max(0,dt)*(active?16:24));
 return {
  x:previous.x+(input.x*speed-previous.x)*acceleration,
  z:previous.z+(input.z*speed-previous.z)*acceleration
 };
}

export function predictedDisplayTarget(authoritative,velocity,timeSincePacket){
 const lead=.04+Math.min(.12,Math.max(0,timeSincePacket));
 return {x:authoritative.x+velocity.x*lead,z:authoritative.z+velocity.z*lead};
}

export function reconcilePredictedPosition(current,authoritative,velocity,packetAge,dt){
 const target=predictedDisplayTarget(authoritative,velocity,packetAge);
 if(Math.hypot(target.x-current.x,target.z-current.z)>12)return target;
 const integrated={x:current.x+velocity.x*dt,z:current.z+velocity.z*dt};
 const correction=1-Math.exp(-Math.max(0,dt)*8);
 return {x:integrated.x+(target.x-integrated.x)*correction,z:integrated.z+(target.z-integrated.z)*correction};
}

export function smoothHeading(current,target,dt){
 const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));
 return current+delta*(1-Math.exp(-Math.max(0,dt)*17));
}
