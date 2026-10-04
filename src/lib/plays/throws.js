// Shared strategy-arrow geometry, used by legacy throw playback and Coach Board.
export function throwRoute(fromPt, toPt, chipRadius, visualOffset = {x:0,y:0}) {
  const rawA={x:fromPt.x+visualOffset.x,y:fromPt.y+visualOffset.y};
  const rawB={x:toPt.x+visualOffset.x,y:toPt.y+visualOffset.y};
  const dx=rawB.x-rawA.x,dy=rawB.y-rawA.y;
  const length=Math.hypot(dx,dy)||1, ux=dx/length,uy=dy/length;
  const start=chipRadius+5,end=chipRadius+10;
  return length>start+end+12
    ? {from:{x:rawA.x+ux*start,y:rawA.y+uy*start},to:{x:rawB.x-ux*end,y:rawB.y-uy*end}}
    : {from:rawA,to:rawB};
}

// Renderer-only adapter; timing and geometry always come from the shared engine.
export function paintThrowFrame(svg,arrows,point=p=>p) {
  const ns='http://www.w3.org/2000/svg';
  let group=svg.querySelector('[data-shared-throws]');
  if(!group){
    group=document.createElementNS(ns,'g');group.dataset.sharedThrows='1';svg.appendChild(group);
  }
  const markerId=svg.dataset.sharedMarker || `shared-arrow-${Math.random().toString(36).slice(2)}`;
  if(!svg.dataset.sharedMarker){
    svg.dataset.sharedMarker=markerId;
    const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker'),path=document.createElementNS(ns,'path');
    for(const [key,value] of Object.entries({id:markerId,markerUnits:'strokeWidth',markerWidth:'4.5',markerHeight:'4.5',refX:'4.2',refY:'2.25',orient:'auto'}))marker.setAttribute(key,value);
    path.setAttribute('d','M0,0 L0,4.5 L4.5,2.25 z');path.setAttribute('fill','var(--accent-primary)');marker.appendChild(path);defs.appendChild(marker);svg.appendChild(defs);
  }
  for(let i=0;i<arrows.length;i++) {
    const arrow=arrows[i],from=point(arrow.from),to=point(arrow.to);
    const d=`M ${from.x} ${from.y} L ${from.x+(to.x-from.x)*arrow.progress} ${from.y+(to.y-from.y)*arrow.progress}`;
    for(let layer=0;layer<2;layer++) {
      let path=group.children[i*2+layer];
      if(!path){path=document.createElementNS(ns,'path');group.appendChild(path);path.setAttribute('class',layer?'seq-route-active':'seq-route-underlay');path.setAttribute('stroke-width',layer?'3':'5');if(layer)path.setAttribute('marker-end',`url(#${markerId})`);}
      path.setAttribute('d',d);
    }
  }
  while(group.children.length>arrows.length*2)group.lastChild.remove();
}
