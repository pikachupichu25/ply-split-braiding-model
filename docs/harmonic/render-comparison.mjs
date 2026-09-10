// Reproducible comparison. No reference pixels or event positions enter layout.
import {writeFileSync} from 'node:fs';
import {parsePattern} from '../../src/domain/parser.ts';
import {simulatePattern} from '../../src/domain/simulate.ts';
import {wayuuFajon20Pattern} from '../../src/examples/wayuuFajon20.ts';
import {buildCordNetwork, renderCordNetworkSvg} from '../../src/domain/cordNetwork.ts';
const sim=simulatePattern(parsePattern(wayuuFajon20Pattern).pattern,3);
const colors={A:'#655069',B:'#d9f2e8',C:'#1da9d2'};
const configs=[{name:'Continuous cords',diameter:1.35},{name:'Network surface',diameter:1.35,surface:true}];
const results=configs.map(config=>{const layout=buildCordNetwork(sim,config);const svg=renderCordNetworkSvg(layout,{colors,surface:config.surface});writeFileSync(new URL(`network-${config.name.toLowerCase().replaceAll(" ","-")}.svg`,import.meta.url),svg);return{...config,layout,svg}});
writeFileSync(new URL('comparison.html',import.meta.url),`<!doctype html><meta charset="utf-8"><title>Cord network — photo comparison</title><style>body{margin:0;padding:28px;background:#eee9df;color:#342d34;font:15px Georgia}h1{font-size:26px;margin:0 0 8px}p{max-width:1000px;line-height:1.5}.grid{display:grid;grid-template-columns:380px repeat(2,280px);gap:24px}figure{margin:0}figcaption{font:13px monospace;padding:16px 0}.crop{height:940px;overflow:hidden;background:#f7f3eb}.photo{height:940px;width:100%;object-fit:cover;object-position:57% 30%}.generated{padding:0 3px}.generated svg{margin-top:-85px}</style><h1>Eyes / continuous cord network</h1><p>Three written blocks. The centre and edge eyes emerge from the split events. This comparison palette approximates the photo; geometry uses no image coordinates. Upper and lower frontiers are cropped. Experimental harmonic geometry, with local splittee visibility; physical thickness and tension are not solved.</p><div class="grid"><figure><figcaption>Reference · supplied photograph</figcaption><div class="crop"><img class="photo" src="../../public/expected-layouts/eyes.webp"></div></figure>${results.map(r=>`<figure><figcaption>${r.name} · diameter ${r.diameter}</figcaption><div class="crop generated">${r.svg}</div></figure>`).join('')}</div>`);
writeFileSync(new URL('comparison-metrics.json',import.meta.url),JSON.stringify(results.map(({name,diameter,layout})=>({name,diameter,events:layout.junctions.length,quality:layout.quality})),null,2));
console.log(results.map(r=>({name:r.name,...r.layout.quality})));
