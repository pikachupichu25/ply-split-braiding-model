import { useEffect, useMemo, useState } from 'react';
import { defaultSample, samplePatterns } from './examples';
import { findFullCycle } from './domain/cycle';
import { buildFinishedLayout } from './domain/finishedLayout';
import { buildFinishedSurfaces } from './domain/finishedSurface';
import { parsePattern } from './domain/parser';
import { simulatePattern } from './domain/simulate';
import type { Face, Simulation, SplitEvent } from './domain/types';

const palette = ['#d76b52', '#77b6c9', '#d3a448', '#6f8f65', '#a47aa3', '#dd8f45'];
const savedPatternKey = 'scot-braid-studio-pattern';

export default function App() {
  const [source, setSource] = useState(() => localStorage.getItem(savedPatternKey) ?? defaultSample.source);
  const [previewRepeats, setPreviewRepeats] = useState(4);
  const [lengthMode, setLengthMode] = useState<'cycle' | 'manual'>('cycle');
  const [view, setView] = useState<'finished-v1' | 'finished-dev' | 'braid'>('finished-v1');
  const [mirrorFace, setMirrorFace] = useState<Face>('front');
  const [finishedAngle, setFinishedAngle] = useState(30);
  const [finishedTip, setFinishedTip] = useState(30);
  const [previewWidth, setPreviewWidth] = useState(25);

  const parsed = useMemo(() => parsePattern(source), [source]);
  const fullCycle = useMemo(
    () => (parsed.pattern ? findFullCycle(parsed.pattern) : undefined),
    [parsed.pattern],
  );
  const hasOpenRepeat = parsed.pattern?.repeats.some((repeat) => repeat.count === undefined) ?? false;
  const repeats = lengthMode === 'cycle' && fullCycle ? fullCycle.repeats : previewRepeats;
  const simulation = useMemo(
    () => (parsed.pattern ? simulatePattern(parsed.pattern, repeats) : emptySimulation()),
    [parsed.pattern, repeats],
  );
  const diagnostics = [...parsed.diagnostics, ...simulation.diagnostics];
  const allEvents = simulation.events;

  useEffect(() => {
    localStorage.setItem(savedPatternKey, source);
  }, [source]);

  const activeSample = samplePatterns.find((sample) => sample.source === source);
  const loadSample = (id: string) => {
    const sample = samplePatterns.find((item) => item.id === id);
    if (!sample) return;
    setSource(sample.source);
  };

  const colorMap = useMemo(
    () => buildColorMap(parsed.pattern?.colors ?? [], parsed.pattern?.colorAssignments ?? {}),
    [parsed.pattern?.colors, parsed.pattern?.colorAssignments],
  );
  const status = diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? 'Needs attention'
    : allEvents.length > 0
      ? 'Structurally sound'
      : 'Awaiting rows';

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="masthead-mark" aria-hidden="true">↝</div>
        <div>
          <p className="eyebrow">Ply-split drafting table</p>
          <h1>SCOT Braid Studio</h1>
        </div>
        <div className={`status-pill ${diagnostics.length ? 'status-pill--warning' : ''}`}>
          <span className="status-dot" />
          {status}
        </div>
      </header>

      <section className="workspace" aria-label="SCOT pattern workspace">
        <aside className="editor-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">01 · notation</p>
              <h2>Written pattern</h2>
            </div>
            <label className="sample-picker">
              <span>Sample</span>
              <select
                value={activeSample?.id ?? ''}
                onChange={(event) => loadSample(event.target.value)}
              >
                {!activeSample && <option value="">Edited draft</option>}
                {samplePatterns.map((sample) => (
                  <option key={sample.id} value={sample.id}>{sample.name}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="sample-summary">{activeSample?.summary ?? 'Edited draft — pick a sample to start again.'}</p>

          <label className="editor-label" htmlFor="pattern-source">SCOT source</label>
          <textarea
            id="pattern-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            aria-describedby="notation-help"
          />
          <p id="notation-help" className="editor-help">Use fixed front-oriented lane numbers. Optionally define colours with <code>palette: A=#d76b52, B=lightblue</code>; any omitted symbol keeps its current default colour. A turn reverses the visible lane labels, while each cord retains its own hidden identity.</p>

          <section className="palette-panel" aria-labelledby="palette-title">
            <div className="section-kicker"><span>Colour key</span><span>{parsed.pattern?.colors.length ?? 0} cords</span></div>
            <h3 id="palette-title">Starting sequence</h3>
            <div className="color-key">
              {Array.from(colorMap.entries()).map(([symbol, color]) => (
                <div key={symbol} className="color-chip">
                  <span className="color-swatch" style={{ backgroundColor: color }} />
                  <span>{symbol}</span>
                </div>
              ))}
              {!colorMap.size && <span className="quiet">Add a valid <code>color:</code> line to build the palette.</span>}
            </div>
          </section>

          <section className="diagnostics" aria-live="polite">
            <div className="section-kicker"><span>Reading desk</span><span>{diagnostics.length ? `${diagnostics.length} note${diagnostics.length === 1 ? '' : 's'}` : 'clear'}</span></div>
            {diagnostics.length ? (
              <ul>
                {diagnostics.map((diagnostic, index) => (
                  <li key={`${diagnostic.line}-${index}`}>
                    <b>Ln {diagnostic.line}</b> {diagnostic.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet">The current preview resolves {allEvents.length} individual splits across {simulation.totalRows} rows.</p>
            )}
          </section>
        </aside>

        <section className="canvas-panel">
          <div className="panel-heading canvas-heading">
            <div>
              <p className="eyebrow">02 · structure</p>
              <h2>Course trace</h2>
            </div>
            <div className="toolbar" aria-label="Visualization controls">
              <div className="toggle-group">
                <button className={view === 'finished-v1' ? 'is-active' : ''} onClick={() => setView('finished-v1')}>Finished v1</button>
                <button className={view === 'finished-dev' ? 'is-active' : ''} onClick={() => setView('finished-dev')}>Finished (dev)</button>
                <button className={view === 'braid' ? 'is-active' : ''} onClick={() => setView('braid')}>Braid</button>
              </div>
              <div className="toggle-group">
                <button className={mirrorFace === 'front' ? 'is-active' : ''} onClick={() => setMirrorFace('front')}>Front</button>
                <button className={mirrorFace === 'back' ? 'is-active' : ''} onClick={() => setMirrorFace('back')}>Back</button>
              </div>
            </div>
          </div>

          <div className="canvas-meta">
            <span>{view === 'finished-v1'
              ? `${Math.max(0, (simulation.snapshots[0]?.lanes.length ?? 0) - 1)} gap columns · ${finishedAngle}° slant · ${finishedTip}° tip · ${mirrorFace} face · v1`
              : view === 'finished-dev'
                ? `${Math.max(0, (simulation.snapshots[0]?.lanes.length ?? 0) - 1)} gap columns · ${finishedAngle}° slant · ${finishedTip}° tip · ${mirrorFace} face · development`
                : `fixed lanes · ${mirrorFace} display`}</span>
            <span>{`${simulation.totalRows} courses · ${allEvents.length} splits`}</span>
          </div>
          {view === 'finished-v1' ? (
            <FinishedV1Preview simulation={simulation} colors={colorMap} mirrorFace={mirrorFace} theta={finishedAngle} tipAngle={finishedTip} widthScale={previewWidth / 100} />
          ) : view === 'finished-dev' ? (
            <FinishedBraidPreview simulation={simulation} colors={colorMap} mirrorFace={mirrorFace} theta={finishedAngle} tipAngle={finishedTip} widthScale={previewWidth / 100} />
          ) : (
            <BraidDiagram simulation={simulation} colors={colorMap} mirrorFace={mirrorFace} />
          )}

          {view === 'finished-v1' ? (
            <p className="finished-caption">Finished v1 is the clean sharp-parallelogram surface: one splittee-coloured cell per split, with no transition triangles, dotted edges, or overlap additions.</p>
          ) : view === 'finished-dev' ? (
            <p className="finished-caption">Development preview: transition edges extend to their intersection in the neighbouring column, filling the extra triangle with the continuing cord’s colour.</p>
          ) : (
            <p className="finished-caption">Every split in the preview length is drawn at once. Each cord keeps its colour along its whole path, and each splitter stays visible behind its splittee at their crossing.</p>
          )}
        </section>
      </section>

      <footer className="control-deck">
        <div className="preview-controls">
          <div>
            <p className="eyebrow">Preview length</p>
            <div className="toggle-group toggle-group--inverse">
              <button className={lengthMode === 'cycle' ? 'is-active' : ''} onClick={() => setLengthMode('cycle')}>Full cycle</button>
              <button className={lengthMode === 'manual' ? 'is-active' : ''} onClick={() => setLengthMode('manual')}>Manual</button>
            </div>
            <label className="repeat-control">
              <input aria-label="Preview repeats" type="range" min="1" max="16" value={previewRepeats} disabled={!hasOpenRepeat || (lengthMode === 'cycle' && Boolean(fullCycle))} onChange={(event) => setPreviewRepeats(Number(event.target.value))} />
              <span>{describeLength(lengthMode, repeats, fullCycle, parsed.pattern?.repeats.length ?? 0, hasOpenRepeat, simulation.totalRows)}</span>
            </label>
          </div>
          {view !== 'braid' && <>
            <div>
              <p className="eyebrow">Cord slant</p>
              <label className="angle-control">
                <input aria-label="Cord slant in degrees" type="range" min="10" max="60" value={finishedAngle} onChange={(event) => setFinishedAngle(Number(event.target.value))} />
                <span>{finishedAngle}°</span>
              </label>
            </div>
            <div>
              <p className="eyebrow">Cord tip</p>
              <label className="angle-control">
                <input aria-label="Cell tip angle in degrees" type="range" min="10" max="90" value={finishedTip} onChange={(event) => setFinishedTip(Number(event.target.value))} />
                <span>{finishedTip}°</span>
              </label>
            </div>
            <div>
              <p className="eyebrow">Preview width</p>
              <label className="angle-control">
                <input aria-label="Finished preview width" type="range" min="15" max="150" step="5" value={previewWidth} onChange={(event) => setPreviewWidth(Number(event.target.value))} />
                <span>{previewWidth}%</span>
              </label>
            </div>
          </>}
        </div>
        <p className="method-note">Every numbered operation is resolved against the cord currently occupying that lane. The display preserves the cord’s colour and continuous path.</p>
        <button className="export-button" onClick={() => downloadPattern(source)}>Download .scot <span aria-hidden="true">↓</span></button>
      </footer>
    </main>
  );
}

type DiagramProps = {
  simulation: Simulation;
  colors: Map<string, string>;
  mirrorFace: Face;
};

function BraidDiagram({ simulation, colors, mirrorFace }: DiagramProps) {
  const laneCount = simulation.snapshots[0]?.lanes.length ?? 8;
  const eventCount = simulation.events.length;
  const laneGap = 82;
  const courseGap = 14;
  const width = Math.max(700, 116 + Math.max(0, laneCount - 1) * laneGap);
  const height = Math.max(330, 104 + Math.max(1, eventCount) * courseGap);
  const cordIds = simulation.snapshots[0]?.lanes.map((cord) => cord.id) ?? [];
  const xAt = (laneIndex: number) => {
    const displayIndex = mirrorFace === 'front' ? laneIndex : laneCount - laneIndex - 1;
    return 58 + displayIndex * laneGap;
  };
  const yAt = (snapshotIndex: number) => 56 + snapshotIndex * courseGap;
  const pointFor = (cordId: string, snapshotIndex: number) => {
    const laneIndex = simulation.snapshots[snapshotIndex]?.lanes.findIndex((cord) => cord.id === cordId) ?? 0;
    return { x: xAt(Math.max(0, laneIndex)), y: yAt(snapshotIndex) };
  };

  return (
    <div className="diagram-frame diagram-frame--braid">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="diagram-title diagram-description">
        <title id="diagram-title">SCOT braid course trace</title>
        <desc id="diagram-description">A lane diagram of cords moving through the whole SCOT splitting sequence. In the braid view, each splitter remains visible behind its splittee at their crossing.</desc>
        <defs>
          <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="2" floodColor="#17293d" floodOpacity="0.24" />
          </filter>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        {Array.from({ length: laneCount }, (_, laneIndex) => (
          <line key={`lane-${laneIndex}`} className="lane-guide" x1={xAt(laneIndex)} y1="42" x2={xAt(laneIndex)} y2={height - 24} />
        ))}
        {cordIds.map((cordId) => (
          <CordTrack
            key={`splitter-${cordId}`}
            cordId={cordId}
            snapshots={simulation.snapshots}
            events={simulation.events}
            colors={colors}
            pointFor={pointFor}
            layer="splitter"
          />
        ))}
        {cordIds.map((cordId) => (
          <CordTrack
            key={`surface-${cordId}`}
            cordId={cordId}
            snapshots={simulation.snapshots}
            events={simulation.events}
            colors={colors}
            pointFor={pointFor}
            layer="surface"
          />
        ))}
        {simulation.events.map((event, eventIndex) => {
          const before = pointFor(event.splitterId, eventIndex);
          const after = pointFor(event.splitterId, eventIndex + 1);
          const x = (before.x + after.x) / 2;
          const y = (before.y + after.y) / 2;
          return (
            <g key={`event-${event.eventIndex}`} className="split-marker">
              <circle cx={x} cy={y} r="8" />
              <path d={`M ${x - 5} ${y - 2} Q ${x} ${y - 7} ${x + 5} ${y - 2}`} />
              <path d={`M ${x - 5} ${y + 2} Q ${x} ${y + 7} ${x + 5} ${y + 2}`} />
              <title>{describeEvent(event)}</title>
            </g>
          );
        })}
      </svg>
      {!eventCount && <div className="empty-canvas">Your valid SCOT path will appear here.</div>}
    </div>
  );
}

type FinishedProps = Pick<DiagramProps, 'simulation' | 'colors' | 'mirrorFace'> & {
  theta?: number;
  tipAngle?: number;
  widthScale?: number;
};

function FinishedV1Preview({ simulation, colors, mirrorFace, theta = 30, tipAngle = 30, widthScale = 1 }: FinishedProps) {
  const layout = useMemo(() => buildFinishedLayout(simulation, { theta, tipAngle }), [simulation, theta, tipAngle]);
  const startCords = new Map((simulation.snapshots[0]?.lanes ?? []).map((cord) => [cord.id, cord]));
  const colorFor = (cordId: string) => colors.get(startCords.get(cordId)?.colorSymbol ?? '') ?? '#d3a448';
  const faceTransform = mirrorFace === 'back' ? `translate(${layout.width} 0) scale(-1 1)` : undefined;

  return (
    <div className="finished-preview finished-preview--v1">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width * widthScale} height={layout.height * widthScale} role="img" aria-labelledby="finished-v1-title finished-v1-description">
        <title id="finished-v1-title">Finished SCOT parallelogram chart, version one</title>
        <desc id="finished-v1-description">One sharp splittee-coloured parallelogram for every split event. This stable version has no added overlap or transition geometry.</desc>
        <g transform={faceTransform}>
          {layout.cells.map((cell) => {
            const modelDirection = cell.event.toLane > cell.event.fromLane ? 'right' : 'left';
            const displayDirection = mirrorFace === 'front' ? modelDirection : modelDirection === 'right' ? 'left' : 'right';
            return (
              <polygon
                key={cell.event.eventIndex}
                className="finished-split-cell"
                points={cell.points.map((point) => `${point.x},${point.y}`).join(' ')}
                fill={colorFor(cell.event.splitteeId)}
                data-event-index={cell.event.eventIndex}
                data-column={cell.column}
                data-direction={displayDirection}
              >
                <title>{`${describeEvent(cell.event)} · column ${cell.column} · ${displayDirection}-leaning`}</title>
              </polygon>
            );
          })}
        </g>
      </svg>
      {!simulation.events.length && <div className="empty-canvas">Your finished parallelogram preview will appear here.</div>}
    </div>
  );
}

function FinishedBraidPreview({ simulation, colors, mirrorFace, theta = 30, tipAngle = 30, widthScale = 1 }: FinishedProps) {
  const layout = useMemo(
    () => buildFinishedLayout(simulation, { theta, tipAngle }),
    [simulation, theta, tipAngle],
  );
  const surfaces = useMemo(() => buildFinishedSurfaces(layout.cells), [layout]);
  const startCords = new Map(
    (simulation.snapshots[0]?.lanes ?? []).map((cord) => [cord.id, cord]),
  );
  const colorFor = (cordId: string) => {
    const symbol = startCords.get(cordId)?.colorSymbol ?? '';
    return colors.get(symbol) ?? '#d3a448';
  };
  const faceTransform = mirrorFace === 'back'
    ? `translate(${layout.width} 0) scale(-1 1)`
    : undefined;

  return (
    <div className="finished-preview">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width * widthScale}
        height={layout.height * widthScale}
        role="img"
        aria-labelledby="finished-title finished-description"
      >
        <title id="finished-title">Finished SCOT craft surface</title>
        <desc id="finished-description">One cord-coloured surface cell for every split. At changes in either direction between splitter and splittee, diagonal edges extend to their intersection in the neighbouring column. The extra triangle takes the colour of the ribbon extending across the seam; original split cells keep their shapes.</desc>
        <g transform={faceTransform}>
          {surfaces.map(({ cell, path, emergence, departure }) => {
            const transitions = [emergence, departure].filter(t => t !== undefined);
            const modelDirection = cell.event.toLane > cell.event.fromLane ? 'right' : 'left';
            const displayDirection = mirrorFace === 'front'
              ? modelDirection
              : modelDirection === 'right' ? 'left' : 'right';
            return (
              <g key={cell.event.eventIndex}>
                <path
                  className={`finished-split-cell${emergence ? ' is-splitter-to-splittee' : ''}${departure ? ' is-splittee-to-splitter' : ''}`}
                  d={path}
                  fill={colorFor(cell.event.splitteeId)}
                  data-event-index={cell.event.eventIndex}
                  data-column={cell.column}
                  data-direction={displayDirection}
                  data-role-transition={transitions.map(t => t.kind).join(' ') || undefined}
                  data-emerges-from-event={emergence?.hostEventIndex}
                  data-departs-from-event={departure?.hostEventIndex}
                >
                  <title>{`${describeEvent(cell.event)} · column ${cell.column} · ${displayDirection}-leaning`}</title>
                </path>
              </g>
            );
          })}
          <g className="finished-transition-layer" aria-hidden="true">
            {surfaces.flatMap(({ cell, emergence, departure }) =>
              [emergence, departure].filter(transition => transition !== undefined).map(transition => (
                <g key={`${cell.event.eventIndex}-${transition.kind}`} className="finished-transition" data-event-index={cell.event.eventIndex} data-transition-kind={transition.kind} data-transition-cord={transition.cordId} data-host-cord={transition.hostCordId} data-fill-cord={transition.fillCordId}>
                  <path d={transition.triangle} fill={colorFor(transition.fillCordId)} />
                  <path className="finished-transition-seam" d={transition.solidEdges} />
                  <path className="finished-transition-seam" d={transition.seam} />
                </g>
              )),
            )}
          </g>
        </g>
      </svg>
      {!simulation.events.length && <div className="empty-canvas">Your finished craft preview will appear here.</div>}
    </div>
  );
}

function CordTrack({ cordId, snapshots, events, colors, pointFor, layer }: {
  cordId: string;
  snapshots: Simulation['snapshots'];
  events: Simulation['events'];
  colors: Map<string, string>;
  pointFor: (cordId: string, snapshotIndex: number) => { x: number; y: number };
  layer: 'splitter' | 'surface';
}) {
  const cord = snapshots[0]?.lanes.find((item) => item.id === cordId);
  if (!cord) return null;
  const color = colors.get(cord.colorSymbol) ?? '#d3a448';
  return (
    <g className={`cord-track cord-track--${layer}`} filter="url(#soft-shadow)">
      {snapshots.slice(1).map((_, eventIndex) => {
        const isSplitter = events[eventIndex]?.splitterId === cordId;
        if ((layer === 'splitter') !== isSplitter) return null;
        const start = pointFor(cordId, eventIndex);
        const end = pointFor(cordId, eventIndex + 1);
        const midY = (start.y + end.y) / 2;
        const d = `M ${start.x} ${start.y} Q ${start.x} ${midY} ${end.x} ${end.y}`;
        return (
          <g key={`${cordId}-${eventIndex}`}>
            <path className="cord-outline" d={d} />
            <path className="cord-fill" d={d} stroke={color} />
          </g>
        );
      })}
      {layer === 'surface' && <circle className="cord-start" cx={pointFor(cordId, 0).x} cy={pointFor(cordId, 0).y} r="5" fill={color} />}
    </g>
  );
}

function buildColorMap(symbols: string[], assignments: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  symbols.forEach((symbol) => {
    if (!map.has(symbol)) map.set(symbol, assignments[symbol] ?? palette[map.size % palette.length]);
  });
  return map;
}

function describeLength(
  mode: 'cycle' | 'manual',
  repeats: number,
  fullCycle: { repeats: number; rows: number } | undefined,
  repeatSections: number,
  hasOpenRepeat: boolean,
  totalRows: number,
): string {
  if (repeatSections > 0 && !hasOpenRepeat) {
    return `${repeatSections} fixed section${repeatSections === 1 ? '' : 's'} · ${totalRows} rows`;
  }
  if (mode === 'manual') return `${repeats} repeats`;
  if (fullCycle) return `${fullCycle.repeats} repeats · ${fullCycle.rows} rows to close`;
  return `${repeats} repeats · no closure found`;
}

function describeEvent(event: SplitEvent): string {
  return `${event.splitterId} splits ${event.splitteeId} · row ${event.sourceRow}, ${event.splitIndex} of ${event.splitCount}`;
}

function downloadPattern(source: string) {
  const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'scot-pattern.scot';
  anchor.click();
  URL.revokeObjectURL(url);
}

function emptySimulation(): Simulation {
  return { events: [], snapshots: [], diagnostics: [], totalRows: 0 };
}
