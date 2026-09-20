import { writeFileSync } from 'node:fs';
import { parsePattern } from '../../src/domain/parser.ts';
import { simulatePattern } from '../../src/domain/simulate.ts';
import { wayuuFajon20Pattern } from '../../src/examples/wayuuFajon20.ts';
const sim=simulatePattern(parsePattern(wayuuFajon20Pattern).pattern,3), es=sim.events, cords=sim.snapshots[0].lanes, n=cords.length;
const points=es.map(e=>({x:(e.fromLane+e.toLane)/2-1,y:0,fixed:false,neighbors:[]}));
const visits=new Map(cords.map(c=>[c.id,[]]));
es.forEach(e=>{visits.get(e.splitterId).push(e.eventIndex);visits.get(e.splitteeId).push(e.eventIndex)});
const sides=[es.filter(e=>Math.min(e.fromLane,e.toLane)===1),es.filter(e=>Math.min(e.fromLane,e.toLane)===n-1)];
const h=(Math.max(...sides.map(s=>s.length))+1)*2*1.35;
es.forEach(e=>points[e.eventIndex].y=(e.eventIndex+.5)/es.length*h);
sides.forEach((side,j)=>side.forEach((e,i)=>Object.assign(points[e.eventIndex],{x:j*(n-1),y:(i+1)/(side.length+1)*h,fixed:true})));
const chains=[];cords.forEach((c,i)=>{const start=points.length;points.push({x:i,y:0,fixed:true,neighbors:[]});const end=points.length;points.push({x:sim.snapshots.at(-1).lanes.findIndex(t=>t.id===c.id),y:h,fixed:true,neighbors:[]});const chain=[start,...visits.get(c.id),end];for(let k=1;k<chain.length;k++){points[chain[k]].neighbors.push(chain[k-1]);points[chain[k-1]].neighbors.push(chain[k]);}chains.push({cord:c,chain})});
for(let it=0;it<5000;it++){let delta=0;for(const p of points){if(p.fixed)continue;const q=p.neighbors.map(i=>points[i]),x=q.reduce((s,p)=>s+p.x,0)/q.length,y=q.reduce((s,p)=>s+p.y,0)/q.length;delta=Math.max(delta,Math.abs(p.x-x),Math.abs(p.y-y));p.x=x;p.y=y}if(delta<1e-6)break}
const colors={A:'#655069',B:'#d9f2e8',C:'#1da9d2'};const path=ids=>ids.map((i,j)=>`${j?'L':'M'}${points[i].x},${points[i].y}`).join(' ');
const d=1.55;let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n+3} ${h+4}" width="480" height="${480*(h+4)/(n+3)}"><rect x="-2" y="-2" width="${n+3}" height="${h+4}" fill="#f5f0e5"/><g fill="none" stroke-linecap="round" stroke-linejoin="round">`;
for(const c of chains)svg+=`<path d="${path(c.chain)}" stroke="${colors[c.cord.colorSymbol]}" stroke-width="${d}"/>`;
for(const e of es){const c=chains.find(c=>c.cord.id===e.splitteeId),k=c.chain.indexOf(e.eventIndex),p=points[e.eventIndex];const near=i=>{const q=points[i],len=Math.hypot(q.x-p.x,q.y-p.y),t=Math.min(.48,d*.7/len);return{x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t}};const a=near(c.chain[k-1]),b=near(c.chain[k+1]);svg+=`<path d="M${a.x},${a.y}L${p.x},${p.y}L${b.x},${b.y}" stroke="#302c34" stroke-width="${d*1.05}"/><path d="M${a.x},${a.y}L${p.x},${p.y}L${b.x},${b.y}" stroke="${colors[c.cord.colorSymbol]}" stroke-width="${d}"/>`}
svg+='</g></svg>';writeFileSync(new URL('experiment.svg',import.meta.url),svg);
console.log({nodes:points.length,h});
