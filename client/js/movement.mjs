// Camera-relative movement and short visual prediction. The server remains
// authoritative for actual coordinates, terrain and interactions.
export function cameraRelativeVector(yaw,right,forward){
 const x=right*Math.cos(yaw)-forward*Math.sin(yaw);
 const z=-right*Math.sin(yaw)-forward*Math.cos(yaw);
 const length=Math.hypot(x,z);
 return length>1?{x:x/length,z:z/length}:{x,z};
}

export function smoothInputVelocity(previous,input,speed,dt){
 const acceleration=Math.min(1,Math.max(0,dt)*9);
 return {
  x:previous.x+(input.x*speed-previous.x)*acceleration,
  z:previous.z+(input.z*speed-previous.z)*acceleration
 };
}

export function predictedDisplayTarget(authoritative,velocity,timeSincePacket){
 const lead=.06+Math.min(.14,Math.max(0,timeSincePacket));
 return {x:authoritative.x+velocity.x*lead,z:authoritative.z+velocity.z*lead};
}
