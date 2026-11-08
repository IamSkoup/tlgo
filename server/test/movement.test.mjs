import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraRelativeVector,smoothInputVelocity,predictedDisplayTarget} from '../../client/js/movement.mjs';

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
 near(fast.z,first.z*.2);
 const stopped=smoothInputVelocity(first,{x:0,z:0},8,1/60);
 assert.ok(Math.abs(stopped.z)<Math.abs(first.z));
});
