import { IMG_W, IMG_H, BASES_NATIVE } from './field.js';

export const FIELDING_NUMBERS = {P:1,C:2,'1B':3,'2B':4,'3B':5,SS:6,LF:7,CF:8,RF:9};
export const MARKER_SIZES = {ball:40,runner:64,baseRunner:64,hit:40};
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

// Match gameplay's field-relative sizing, independent of page layout.
export function tokenMetrics(width,height) {
  const scale = Math.min(width/IMG_W,height/IMG_H);
  const chip = clamp(Math.round(Math.min(width,height)*0.052),26,44);
  const ball = clamp(Math.round(MARKER_SIZES.ball*scale),8,26);
  return {
    width,height,chip, defender:Math.round(chip*0.9), defenderFont:clamp(Math.round(chip*0.4),11,16),
    runner:clamp(Math.round(MARKER_SIZES.runner*scale),25,62),
    runnerFont:clamp(Math.round(13*scale*1.05),11,18),
    ball, ballStitches:ball>=16,
  };
}

// Display-only spacing as a runner approaches an occupied bag. Baseball coordinates,
// routes, and scoring remain unchanged; both playback views use the same offset.
export function positionRunnerChip(point, positions, metrics) {
  if (!point || !metrics.width || !metrics.height) return point;
  const sx=metrics.width/IMG_W, sy=metrics.height/IMG_H;
  const clearance=(metrics.defender+metrics.runner)/2+5;
  const bases=Object.entries(BASES_NATIVE).map(([name,base])=>({name,base,distance:Math.hypot(point.x-base.x,point.y-base.y)}));
  const nearest=bases.sort((a,b)=>a.distance-b.distance)[0];
  if(nearest.distance>=180)return point;
  const defenders=Object.keys(FIELDING_NUMBERS).map(id=>positions[id]).filter(Boolean);
  const clear=p=>defenders.every(d=>Math.hypot((p.x-d.x)*sx,(p.y-d.y)*sy)>=clearance);
  if(clear(nearest.base))return point;
  const direction={home:[0,1],first:[1,.65],second:[0,-1],third:[-1,.65]}[nearest.name];
  const length=Math.hypot(...direction);
  let display=nearest.base;
  for(let pixels=4;pixels<=clearance*3;pixels+=4){
    display={x:nearest.base.x+direction[0]/length*pixels/sx,y:nearest.base.y+direction[1]/length*pixels/sy};
    if(clear(display))break;
  }
  const blend=1-nearest.distance/180;
  return {x:point.x+(display.x-nearest.base.x)*blend,y:point.y+(display.y-nearest.base.y)*blend};
}

export function createOffenseNumbers() {
  const pool=Array.from({length:90},(_,i)=>i+10);
  return Object.fromEntries(['batter','first','second','third'].map(id=>[
    id,pool.splice(Math.floor(Math.random()*pool.length),1)[0],
  ]));
}

// Park the ball at the lower-left edge of each chip, clear of its relay badge.
export function positionThrownBall(frame, metrics) {
  const {ball,ballThrow}=frame;
  if(!ballThrow||!metrics.width||!metrics.height)return ball;
  const clearance=(metrics.defender+metrics.ball)/2+9;
  const offset=clearance*Math.SQRT1_2;
  return {x:ball.x-offset*IMG_W/metrics.width,y:ball.y+offset*IMG_H/metrics.height};
}

export function createSequenceBadge(label) {
  const badge=document.createElement('span');
  badge.className='seq-badge';
  badge.setAttribute('aria-hidden','true');
  badge.textContent=String(label);
  return badge;
}

export function renderRelayCue(tokens, frame, showOrder=false) {
  for(const [id,{el}] of tokens){
    if(!el)continue;
    el.classList.toggle('relay-highlight',!!frame?.relayHighlights.has(id));
    if(!showOrder)continue;
    const label=frame?.relayOrder[id]?.join(', ');
    const badge=el.querySelector('.relay-badge');
    if(!label)badge?.remove();
    else if(badge){
      if(badge.textContent!==label)badge.textContent=label;
    }else{
      const next=createSequenceBadge(label);
      next.classList.add('relay-badge');
      el.appendChild(next);
    }
  }
}
