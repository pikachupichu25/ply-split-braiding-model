import { useEffect, useMemo, useState } from 'react';
import { renderCordNetworkSvg } from './domain/cordNetwork';
import type { CordNetworkLayout } from './domain/cordNetwork';
import type { SamplePatternImage } from './examples';
import type { Face, Simulation } from './domain/types';
import './cordNetworkPreview.css';

const photoColors = { A: '#655069', B: '#d9f2e8', C: '#1da9d2' };

export default function CordNetworkPreview({ simulation, colors, mirrorFace, referenceName, referenceImage }: {
  simulation: Simulation;
  colors: Map<string, string>;
  mirrorFace: Face;
  referenceName: string;
  /** Photo of the real braid for the active sample, when it has one. */
  referenceImage?: SamplePatternImage;
}) {
  const [elongation, setElongation] = useState(1.35);
  const [diameter, setDiameter] = useState(1.35);
  const [mode, setMode] = useState<'surface' | 'cords' | 'structure'>('surface');
  const [compare, setCompare] = useState(Boolean(referenceImage));
  const [photoPalette, setPhotoPalette] = useState(false);
  const [shaded, setShaded] = useState(true);
  const [showIds, setShowIds] = useState(false);
  const [layout, setLayout] = useState<CordNetworkLayout>();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number>();
  useEffect(() => { setCompare(Boolean(referenceImage)); }, [referenceImage]);

  useEffect(() => {
    setLayout(undefined); setError(''); setSelected(undefined);
    const worker = new Worker(new URL('./domain/cordNetwork.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ layout?: CordNetworkLayout; error?: string }>) => {
      setLayout(event.data.layout); setError(event.data.error ?? '');
    };
    worker.onerror = () => setError('The cord network worker could not finish. Reload the page to try again.');
    worker.postMessage({ simulation, options: { elongation, diameter } });
    return () => worker.terminate();
  }, [simulation, elongation, diameter]);

  const svg = useMemo(() => layout ? renderCordNetworkSvg(layout, {
    colors: { ...Object.fromEntries(colors), ...(photoPalette ? photoColors : {}) }, face: mirrorFace,
    shaded, showEventIds: showIds, centerlines: mode === 'structure', surface: mode !== 'cords',
  }) : '', [layout, colors, mirrorFace, photoPalette, mode, shaded, showIds]);
  const selectedJunction = layout?.junctions.find(j => j.event.eventIndex === selected);
  const inspect = (target: EventTarget | null) => {
    const value = target instanceof Element ? target.closest('[data-event-index]')?.getAttribute('data-event-index') : null;
    if (value !== null) setSelected(Number(value));
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a'); a.href = url; a.download = 'cord-network.svg'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="network-preview" aria-label="Cord network preview">
    <div className="network-intro">
      <div><span className="network-badge">Experimental model</span><h3>Follow the cords</h3></div>
      <p>Every split stays connected to both cords. The surface follows their packed network.</p>
    </div>
    <div className="network-controls">
      <div className="toggle-group" aria-label="Cord network rendering">
        {(['surface', 'cords', 'structure'] as const).map(value => <button key={value} aria-pressed={mode === value} className={mode === value ? 'is-active' : ''} onClick={() => setMode(value)}>{value}</button>)}
      </div>
      <label><input type="checkbox" checked={shaded} onChange={e => setShaded(e.target.checked)} />Shading</label>
      <label><input type="checkbox" checked={showIds} onChange={e => setShowIds(e.target.checked)} />Split IDs</label>
      {referenceImage && <label><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} />Compare {referenceName} photo</label>}
      <label><input type="checkbox" checked={photoPalette} onChange={e => setPhotoPalette(e.target.checked)} />Photo colours (A–C)</label>
    </div>
    <div className="network-sliders">
      <label>Length / width <input aria-label="Network elongation" type="range" min="0.6" max="2.4" step="0.05" value={elongation} onChange={e => setElongation(Number(e.target.value))} /><output>{elongation.toFixed(2)}</output></label>
      <label>Cord thickness <input aria-label="Network cord thickness" type="range" min="0.6" max="1.9" step="0.05" value={diameter} onChange={e => setDiameter(Number(e.target.value))} /><output>{diameter.toFixed(2)}</output></label>
    </div>
    <div className={`network-comparison${referenceImage && compare ? ' has-reference' : ''}`}>
      <figure className="network-generated">
        <figcaption><span>Generated · {mirrorFace}</span><span>{simulation.events.length} splits</span></figcaption>
        <div className="network-scroll" aria-busy={!layout && !error}>
          {layout ? <div className="network-drawing" onClick={e => inspect(e.target)} dangerouslySetInnerHTML={{ __html: svg }} />
            : <p className="network-loading" role="status">{error || 'Fitting the cord network…'}</p>}
        </div>
      </figure>
      {referenceImage && compare && <figure className="network-reference">
        <figcaption><span>Reference · real {referenceName}</span><a href={referenceImage.src} target="_blank" rel="noreferrer">Full photo ↗</a></figcaption>
        <div className="network-reference-crop"><img src={referenceImage.src} alt={referenceImage.alt} /></div>
      </figure>}
    </div>
    <div className="network-inspector" aria-live="polite">
      {selectedJunction ? <><b>Split {selectedJunction.event.eventIndex}</b><span>{selectedJunction.event.splitterId} through {selectedJunction.event.splitteeId} · row {selectedJunction.event.rowInstance} · source {selectedJunction.event.sourceRow}</span><button onClick={() => setSelected(undefined)} aria-label="Clear selected split">×</button></>
        : <span>Click a split or enter its ID to inspect the cords.</span>}
      <input aria-label="Inspect split by ID" type="number" min="0" max={simulation.events.at(-1)?.eventIndex ?? 0} placeholder="Split ID" value={selected ?? ''} onChange={e => setSelected(e.target.value === '' ? undefined : Number(e.target.value))} />
    </div>
    {layout && <>
      {layout.diagnostics.length > 0 && <ul className="network-diagnostics">{layout.diagnostics.map(d => <li key={d}>{d}</li>)}</ul>}
      <div className="network-footer"><span>{layout.quality.converged ? 'Network solved' : 'Solve incomplete'} · {layout.quality.crossingConflicts.length} sampled crossing conflicts · {layout.quality.portConflicts.length} port conflicts</span><button onClick={download} disabled={!layout.cords.length}>Download SVG ↓</button></div>
    </>}
    <p className="network-note">Surface mode fills the regions around each split; Cords shows the underlying paths.{referenceImage ? ` The ${referenceName} centres and edges are still being calibrated against the photo.` : ''} Material tension and ply-level depth are approximations.{photoPalette ? ' Photo colours affect this preview only.' : ''}</p>
  </section>;
}
