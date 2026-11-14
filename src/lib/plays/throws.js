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

// Short legs take a visible offset beside the chip rims. Ball playback still uses
// the original straight route and timing from the animation engine.
export function throwArrowGeometry(arrow, point = p => p, scale = 1) {
  const from = point(arrow.from);
  const to = point(arrow.to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length || arrow.progress <= 0) return { shaft: '', head: '' };

  const forward = { x: dx / length, y: dy / length };
  const normal = { x: -forward.y, y: forward.x };
  const short = length < 34 * scale || arrow.untrimmed;
  const bow = short ? 31 * scale : 0;
  const start = { x: from.x + normal.x * bow, y: from.y + normal.y * bow };
  const travel = (short ? length : length - 9 * scale) * arrow.progress;
  const tip = { x: start.x + forward.x * travel, y: start.y + forward.y * travel };
  const depth = Math.min(10 * scale, travel);
  const halfWidth = depth * .55;
  const base = { x: tip.x - forward.x * depth, y: tip.y - forward.y * depth };
  const shaft = `M ${start.x} ${start.y} L ${tip.x} ${tip.y}`;
  const head = `M ${tip.x} ${tip.y} L ${base.x + normal.x * halfWidth} ${base.y + normal.y * halfWidth} L ${base.x - normal.x * halfWidth} ${base.y - normal.y * halfWidth} Z`;
  return { shaft, head };
}

// Renderer-only adapter; timing and positions come from the shared engine.
export function paintThrowFrame(svg, arrows, point = p => p) {
  const ns = 'http://www.w3.org/2000/svg';
  let group = svg.querySelector('[data-shared-throws]');
  if (!group) {
    group = document.createElementNS(ns, 'g');
    group.dataset.sharedThrows = '1';
    svg.appendChild(group);
  }
  const classes = ['seq-route-underlay', 'seq-route-active', 'seq-route-head'];
  for (const [index, arrow] of arrows.entries()) {
    const { shaft, head } = throwArrowGeometry(arrow, point);
    for (const [layer, className] of classes.entries()) {
      let path = group.children[index * classes.length + layer];
      if (!path) {
        path = document.createElementNS(ns, 'path');
        path.setAttribute('class', className);
        group.appendChild(path);
      }
      path.setAttribute('d', layer === 2 ? head : shaft);
    }
  }
  while (group.children.length > arrows.length * classes.length) group.lastChild.remove();
}
