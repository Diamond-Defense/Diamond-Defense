const svgNamespace = 'http://www.w3.org/2000/svg';
const identity = point => point;

export function paintHitVisuals(svg, frame, type, project = identity) {
  let trail = svg.querySelector('.board-hit-path');
  let shadow = svg.querySelector('.board-ball-shadow');
  if (!frame?.hitTrail?.length) {
    trail?.remove();
  } else {
    if (!trail) {
      trail = document.createElementNS(svgNamespace, 'g');
      trail.setAttribute('class', 'board-hit-path');
      svg.append(trail);
    }
    for (let index = 1; index < frame.hitTrail.length; index++) {
      let segment = trail.children[index - 1];
      if (!segment) {
        segment = document.createElementNS(svgNamespace, 'path');
        trail.append(segment);
      }
      const from = project(frame.hitTrail[index - 1]);
      const to = project(frame.hitTrail[index]);
      segment.setAttribute('d', `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
      segment.setAttribute('opacity', String(index * .085));
      segment.setAttribute('visibility', type === 'ground_ball' && index % 2 === 0 ? 'hidden' : 'visible');
    }
    trail.style.strokeWidth = String(project({x:type === 'line_drive' ? 5 : 8,y:0}).x - project({x:0,y:0}).x);
  }

  if (!frame?.ballShadow) {
    shadow?.remove();
    return;
  }
  if (!shadow) {
    shadow = document.createElementNS(svgNamespace, 'ellipse');
    shadow.setAttribute('class', 'board-ball-shadow');
    svg.prepend(shadow);
  }
  const center = project(frame.ballShadow);
  const origin = project({x:0,y:0});
  const radius = project({x:24,y:10});
  for (const [name,value] of Object.entries({cx:center.x,cy:center.y,rx:radius.x-origin.x,ry:radius.y-origin.y})) {
    shadow.setAttribute(name,String(value));
  }
}
