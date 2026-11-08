import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraRelativeVector,smoothInputVelocity,predictedDisplayTarget,reconcilePredictedPosition,smoothHeading} from '../../client/js/movement.mjs';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('W moves away from the camera and S moves toward it for every yaw',()=>{
 for(const yaw of [0,Math.PI/4,Math.PI/2,2.5,Math.PI]){
  const forward=cameraRelativeVector(yaw,0,1),back=cameraRelativeVector(yaw,0,-1);
  near(forward.x,-Math.sin(yaw));near(forward.z,-Math.cos(yaw));
  near(back.x,-forward.x);near(back.z,-forward.z);
 }
});

test('sideways and diagonal movement retain correct direction and bounded speed',()=>{
 const right=cameraRelativeVector(0,1,0),diagonal=cameraRelativeVector(0,1,1);
 near(right.x,1);near(right.z,0);
 near(Math.hypot(diagonal.x,diagonal.z),1);
 assert.ok(diagonal.x>0&&diagonal.z<0);
});

test('visual prediction reacts immediately but never looks arbitrarily far ahead',()=>{
 const first=smoothInputVelocity({x:0,z:0},{x:0,z:-1},8,1/60);
 assert.ok(first.z<0);
 const fast=predictedDisplayTarget({x:0,z:0},first,100);
 near(fast.z,first.z*.16);
 const stopped=smoothInputVelocity(first,{x:0,z:0},8,1/60);
 assert.ok(Math.abs(stopped.z)<Math.abs(first.z));
});

test('local prediction starts moving before the next network packet and settles when released',()=>{
 let point={x:0,z:0},velocity={x:0,z:0};
 for(let frame=0;frame<6;frame++){
  velocity=smoothInputVelocity(velocity,{x:0,z:-1},8,1/60);
  point=reconcilePredictedPosition(point,{x:0,z:0},velocity,frame/60,1/60);
 }
 assert.ok(point.z<-.1,'movement should respond immediately');
 for(let frame=0;frame<40;frame++){
  velocity=smoothInputVelocity(velocity,{x:0,z:0},8,1/60);
  point=reconcilePredictedPosition(point,{x:0,z:-.45},velocity,frame/60,1/60);
 }
 assert.ok(Math.abs(point.z+.45)<.12,'prediction should return to the server position');
 assert.ok(Math.abs(velocity.z)<.002);
});

test('heading follows the shorter turn instead of snapping across 180 degrees',()=>{
 const from=Math.PI-.04,to=-Math.PI+.04;
 const heading=smoothHeading(from,to,1/60);
 assert.ok(heading>from);
 assert.ok(heading<from+.08);
});
