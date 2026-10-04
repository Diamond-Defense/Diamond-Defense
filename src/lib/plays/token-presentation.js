import { IMG_W, IMG_H } from './field.js';

export const FIELDING_NUMBERS = {P:1,C:2,'1B':3,'2B':4,'3B':5,SS:6,LF:7,CF:8,RF:9};
export const MARKER_SIZES = {ball:40,runner:64,baseRunner:64,hit:40};
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

// Match gameplay's field-relative sizing, independent of page layout.
export function tokenMetrics(width,height) {
  const scale = Math.min(width/IMG_W,height/IMG_H);
  const chip = clamp(Math.round(Math.min(width,height)*0.052),26,44);
  return {
    chip, defender:Math.round(chip*0.9), defenderFont:clamp(Math.round(chip*0.4),11,16),
    runner:clamp(Math.round(MARKER_SIZES.runner*scale),25,62),
    runnerFont:clamp(Math.round(13*scale*1.05),11,18),
    ball:clamp(Math.round(MARKER_SIZES.ball*scale),8,26),
    ballOutline:clamp(Math.round(2*scale),1,3), ballShadow:clamp(Math.round(3*scale),1,4),
  };
}

export function createOffenseNumbers() {
  const pool=Array.from({length:90},(_,i)=>i+10);
  return Object.fromEntries(['batter','first','second','third'].map(id=>[
    id,pool.splice(Math.floor(Math.random()*pool.length),1)[0],
  ]));
}
