import { useEffect, useMemo, useState } from 'react';
import { renderCordNetworkSvg } from './domain/cordNetwork';
import type { CordNetworkLayout } from './domain/cordNetwork';
import type { CordNetworkModel, CordNetworkRequest, CordNetworkResponse } from './domain/cordNetwork.worker';
import type { SamplePatternImage } from './examples';
import type { Face, Simulation } from './domain/types';
import './cordNetworkPreview.css';

const photoColors = { A: '#655069', B: '#d9f2e8', C: '#1da9d2' };
const modelLabels: Record<CordNetworkModel, string> = { spring: 'springs', harmonic: 'harmonic' };
const modelNotes: Record<CordNetworkModel, string> = {
  spring: 'Springs: every cord segment is a spring at its pitch length, port springs set the crossing angle, and the drawing is a minimum of that energy. Width, selvedge turns, and eye placement emerge; nothing is anchored to a frame.',
  harmonic: 'Harmonic: junctions are averaged into a fixed strip frame, then spaced. Width is set by the cord count.',
};

export default function CordNetworkPreview({ simulation, colors, mirrorFace, referenceName, referenceImage }: {
  simulation: Simulation;
  colors: Map<string, string>;
  mirrorFace: Face;
  referenceName: string;
  /** Photo of the real braid for the active sample, when it has one. */
  referenceImage?: SamplePatternImage;
}) {
  const [model, setModel] = useState<CordNetworkModel>('spring');
  const [elongation, setElongation] = useState(1.35);
  const [diameter, setDiameter] = useState(1.35);
  const [mode, setMode] = useState<'surface' | 'cords' | 'structure'>('surface');
  const [compare, setCompare] = useState(Boolean(referenceImage));
  const [photoPalette, setPhotoPalette] = useState(false);
  const [showIds, setShowIds] = useState(false);
  const [layout, setLayout] = useState<CordNetworkLayout>();
  const [progress, setProgress] = useState(1);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number>();
  useEffect(() => { setCompare(Boolean(referenceImage)); }, [referenceImage]);

  useEffect(() => {
    setLayout(undefined); setError(''); setSelected(undefined); setProgress(0);
    const worker = new Worker(new URL('./domain/cordNetwork.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<CordNetworkResponse>) => {
      const { layout: next, progress: value, done, error: message } = event.data;
      if (next) setLayout(next);
      setError(message ?? '');
      setProgress(done ? 1 : value);
    };
    worker.onerror = () => setError('The cord network worker could not finish. Reload the page to try again.');
    // The spring geometry is packed at one cord diameter, so the thickness slider only scales its rendering.
    const request: CordNetworkRequest = { simulation, model, options: model === 'spring' ? { elongation, diameter: diameter / 1.35 } : { elongation, diameter } };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [simulation, elongation, diameter, model]);

  const svg = useMemo(() => layout ? renderCordNetworkSvg(layout, {
    colors: { ...Object.fromEntries(colors), ...(photoPalette ? photoColors : {}) }, face: mirrorFace,
    showEventIds: showIds, centerlines: mode === 'structure', surface: mode !== 'cords',
  }) : '', [layout, colors, mirrorFace, photoPalette, mode, showIds]);
  const selectedJunction = layout?.junctions.find(j => j.event.eventIndex === selected);
  const inspect = (target: EventTarget | null) => {
    const value = target instanceof Element ? target.closest('[data-event-index]')?.getAttribute('data-event-index') : null;
    if (value !== null) setSelected(Number(value));
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a'); a.href = url; a.download = `cord-network-${model}.svg`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const fitting = progress < 1 && !error;
  const status = fitting ? `Fitting ${Math.round(progress * 100)}%` : layout?.quality.converged ? 'Network solved' : 'Solve incomplete';

  return <section className="network-preview" aria-label="Cord network preview">
    <div className="network-intro">
      <div><span className="network-badge">Experimental model</span><h3>Follow the cords</h3></div>
      <p>Every split stays connected to both cords. The surface follows their packed network.</p>
    </div>
    <div className="network-controls">
      <div className="toggle-group" aria-label="Cord network model">
        {(['spring', 'harmonic'] as const).map(value => <button key={value} aria-pressed={model === value} className={model === value ? 'is-active' : ''} onClick={() => setModel(value)}>{modelLabels[value]}</button>)}
      </div>
      <div className="toggle-group" aria-label="Cord network rendering">
        {(['surface', 'cords', 'structure'] as const).map(value => <button key={value} aria-pressed={mode === value} className={mode === value ? 'is-active' : ''} onClick={() => setMode(value)}>{value}</button>)}
      </div>
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
        <figcaption><span>Generated · {mirrorFace} · {modelLabels[model]}{fitting && layout ? ` · fitting ${Math.round(progress * 100)}%` : ''}</span><span>{simulation.events.length} splits</span></figcaption>
        <div className="network-scroll" aria-busy={fitting}>
          {layout ? <div className="network-drawing" onClick={e => inspect(e.target)} dangerouslySetInnerHTML={{ __html: svg }} />
            : <p className="network-loading" role="status">{error || (progress > 0 ? `Fitting the cord network… ${Math.round(progress * 100)}%` : 'Fitting the cord network…')}</p>}
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
      {layout.diagnostics.length > 0 && !fitting && <ul className="network-diagnostics">{layout.diagnostics.map(d => <li key={d}>{d}</li>)}</ul>}
      <div className="network-footer"><span>{status}{fitting ? ' · the topology audit runs once the solve settles' : ` · ${layout.quality.crossingConflicts.length} sampled crossing conflicts · ${layout.quality.portConflicts.length} port conflicts`}</span><button onClick={download} disabled={!layout.cords.length || fitting}>Download SVG ↓</button></div>
    </>}
    <p className="network-note">{modelNotes[model]} Surface mode fills the regions around each split; Cords shows the underlying paths.{referenceImage ? ` The ${referenceName} centres and edges are still being calibrated against the photo.` : ''} Material tension and ply-level depth are approximations.{photoPalette ? ' Photo colours affect this preview only.' : ''}</p>
  </section>;
}
