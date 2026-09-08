import { useEffect, useMemo, useState } from 'react';
import { defaultSample, samplePatterns } from './examples';
import { findFullCycle } from './domain/cycle';
import { buildFinishedLayout } from './domain/finishedLayout';
import { buildFinishedLayoutV2 } from './domain/finishedLayoutV2';
import type { FinishedLink } from './domain/finishedLayoutV2';
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
  const [view, setView] = useState<'finished-v1' | 'finished-v2' | 'finished-dev' | 'braid'>('finished-v2');
  const [mirrorFace, setMirrorFace] = useState<Face>('front');
  const [finishedAngle, setFinishedAngle] = useState(30);
  const [finishedTip, setFinishedTip] = useState(30);
  const [finishedSurfaceOn, setFinishedSurfaceOn] = useState(true);
  const [previewWidth, setPreviewWidth] = useState(25);
  const [pendingSplitter, setPendingSplitter] = useState<number | null>(null);
  const [hoveredLane, setHoveredLane] = useState<number | null>(null);

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
  const braidSimulation = useMemo(
    () => (parsed.pattern ? simulatePattern(parsed.pattern, 1) : emptySimulation()),
    [parsed.pattern],
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

  const nextRowNumber = useMemo(
    () => (parsed.pattern?.rows.reduce((max, row) => Math.max(max, row.number), 0) ?? 0) + 1,
    [parsed.pattern?.rows],
  );
  const previewSplitteeLanes = pendingSplitter !== null && hoveredLane !== null && hoveredLane !== pendingSplitter
    ? laneRange(pendingSplitter, hoveredLane)
    : [];

  useEffect(() => {
    setPendingSplitter(null);
    setHoveredLane(null);
  }, [source, view]);

  useEffect(() => {
    if (pendingSplitter === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingSplitter(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingSplitter]);

  const handleLaneClick = (lane: number) => {
    if (pendingSplitter === null) {
      setPendingSplitter(lane);
      return;
    }
    if (lane === pendingSplitter) {
      setPendingSplitter(null);
      return;
    }
    const splitteeLanes = laneRange(pendingSplitter, lane);
    const newLine = `${nextRowNumber} ${pendingSplitter}>${splitteeLanes.join(',')}`;
    setSource((current) => appendRowLine(current, newLine));
  };

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
                {/* <button className={view === 'finished-v1' ? 'is-active' : ''} onClick={() => setView('finished-v1')}>Finished v1</button> */}
                <button className={view === 'finished-v2' ? 'is-active' : ''} onClick={() => setView('finished-v2')}>Finished v2</button>
                {/* <button className={view === 'finished-dev' ? 'is-active' : ''} onClick={() => setView('finished-dev')}>Finished (dev)</button> */}
                <button className={view === 'braid' ? 'is-active' : ''} onClick={() => setView('braid')}>Braid</button>
              </div>
              <div className="toggle-group">
                <button className={mirrorFace === 'front' ? 'is-active' : ''} onClick={() => setMirrorFace('front')}>Front</button>
                <button className={mirrorFace === 'back' ? 'is-active' : ''} onClick={() => setMirrorFace('back')}>Back</button>
              </div>
              {(view === 'finished-v2' || view === 'finished-dev') && (
                <div className="toggle-group" aria-label="Finished surface">
                  <button className={finishedSurfaceOn ? 'is-active' : ''} onClick={() => setFinishedSurfaceOn(true)}>Surface</button>
                  <button className={!finishedSurfaceOn ? 'is-active' : ''} onClick={() => setFinishedSurfaceOn(false)}>Flat</button>
                </div>
              )}
            </div>
          </div>

          <div className="canvas-meta">
            <span>{view === 'finished-v1'
              ? `${Math.max(0, (simulation.snapshots[0]?.lanes.length ?? 0) - 1)} gap columns · ${finishedAngle}° slant · ${finishedTip}° tip · ${mirrorFace} face · v1`
              : view === 'finished-v2'
                ? `${Math.max(0, (simulation.snapshots[0]?.lanes.length ?? 0) - 1)} gap columns · ${finishedAngle}° slant · ${finishedTip}° tip · ${mirrorFace} face · v2 · R1+R2+R4`
              : view === 'finished-dev'
                ? `${Math.max(0, (simulation.snapshots[0]?.lanes.length ?? 0) - 1)} gap columns · ${finishedAngle}° slant · ${finishedTip}° tip · ${mirrorFace} face · development`
                : `fixed lanes · ${mirrorFace} display · 1 repeat`}</span>
            <span>{view === 'braid'
              ? `${braidSimulation.totalRows} courses · ${braidSimulation.events.length} splits`
              : `${simulation.totalRows} courses · ${allEvents.length} splits`}</span>
          </div>
          {view === 'braid' && (braidSimulation.snapshots[0]?.lanes.length ?? 0) > 0 && (
            <p className="braid-step-hint" aria-live="polite">
              {pendingSplitter === null
                ? 'Click a lane in the legend below to arm it as the splitter for a new step.'
                : hoveredLane !== null && hoveredLane !== pendingSplitter
                  ? `Row ${nextRowNumber}: ${pendingSplitter}>${previewSplitteeLanes.join(',')} — click lane ${hoveredLane} to add it, or press Esc to cancel.`
                  : `Splitter armed at lane ${pendingSplitter}. Click the last splittee lane to add the step, or press Esc to cancel.`}
            </p>
          )}
          {view === 'finished-v1' ? (
            <FinishedV1Preview simulation={simulation} colors={colorMap} mirrorFace={mirrorFace} theta={finishedAngle} tipAngle={finishedTip} widthScale={previewWidth / 100} />
          ) : view === 'finished-v2' ? (
            <FinishedV2Preview simulation={simulation} colors={colorMap} mirrorFace={mirrorFace} theta={finishedAngle} tipAngle={finishedTip} widthScale={previewWidth / 100} surfaceOn={finishedSurfaceOn} />
          ) : view === 'finished-dev' ? (
            <FinishedBraidPreview simulation={simulation} colors={colorMap} mirrorFace={mirrorFace} theta={finishedAngle} tipAngle={finishedTip} widthScale={previewWidth / 100} surfaceOn={finishedSurfaceOn} />
          ) : (
            <BraidDiagram
              simulation={braidSimulation}
              colors={colorMap}
              mirrorFace={mirrorFace}
              pendingSplitter={pendingSplitter}
              hoveredLane={hoveredLane}
              onLaneClick={handleLaneClick}
              onLaneHover={setHoveredLane}
            />
          )}

          <details className="preview-disclosure">
            <summary>About this view</summary>
            {view === 'finished-v1' ? (
              <p className="finished-caption">Finished v1 shows one sharp splittee-coloured cell per split. Cells with the same lean touch edge to edge; opposite leans can partially overlap or leave open space.</p>
            ) : view === 'finished-v2' ? (
              <p className="finished-caption">Finished v2 places every cell from three rules only — R1 the splitter’s course, R2 the cord’s full-edge join, R4 the half-side role change — in that order of authority, with no column packing. Where the action’s corner contact disagrees with an exact cord or role anchor, the action bends; the placement audit counts what each rule holds. On top of that placement, transition edges extend to their intersection in the neighbouring column and fill the extra triangle with the continuing cord’s colour.</p>
            ) : view === 'finished-dev' ? (
              <p className="finished-caption">Development preview: transition edges extend to their intersection in the neighbouring column, filling the extra triangle with the continuing cord’s colour.</p>
            ) : (
              <p className="finished-caption">The braid view always draws a single repeat, regardless of the preview length control below — switch to a Finished view to see the pattern build across multiple repeats. Each cord keeps its colour along its whole path, and each splitter stays visible behind its splittee at their crossing.</p>
            )}
          </details>
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

type BraidDiagramProps = DiagramProps & {
  pendingSplitter: number | null;
  hoveredLane: number | null;
  onLaneClick: (lane: number) => void;
  onLaneHover: (lane: number | null) => void;
};

function BraidDiagram({ simulation, colors, mirrorFace, pendingSplitter, hoveredLane, onLaneClick, onLaneHover }: BraidDiagramProps) {
  const laneCount = simulation.snapshots[0]?.lanes.length ?? 8;
  const eventCount = simulation.events.length;
  const laneGap = 82;
  const courseGap = 14;
  const width = Math.max(700, 116 + Math.max(0, laneCount - 1) * laneGap);
  const cordIds = simulation.snapshots[0]?.lanes.map((cord) => cord.id) ?? [];
  const finalLanes = simulation.snapshots[simulation.snapshots.length - 1]?.lanes ?? [];
  const xAt = (laneIndex: number) => {
    const displayIndex = mirrorFace === 'front' ? laneIndex : laneCount - laneIndex - 1;
    return 58 + displayIndex * laneGap;
  };
  const yAt = (snapshotIndex: number) => 56 + snapshotIndex * courseGap;
  const labelY = yAt(Math.max(1, eventCount)) + 30;
  const height = Math.max(330, labelY + 34);
  const pointFor = (cordId: string, snapshotIndex: number) => {
    const laneIndex = simulation.snapshots[snapshotIndex]?.lanes.findIndex((cord) => cord.id === cordId) ?? 0;
    return { x: xAt(Math.max(0, laneIndex)), y: yAt(snapshotIndex) };
  };
  const previewRange = pendingSplitter !== null && hoveredLane !== null && hoveredLane !== pendingSplitter
    ? new Set(laneRange(pendingSplitter, hoveredLane))
    : new Set<number>();

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
          <line key={`lane-${laneIndex}`} className="lane-guide" x1={xAt(laneIndex)} y1="42" x2={xAt(laneIndex)} y2={labelY - 18} />
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
              <title>{`e${event.eventIndex} · ${describeEvent(event)} · lane ${event.fromLane} → ${event.toLane}`}</title>
            </g>
          );
        })}
        {finalLanes.length > 0 && (
          <g className="lane-legend">
            <line className="lane-legend-rule" x1={xAt(0) - 26} y1={labelY - 18} x2={xAt(laneCount - 1) + 26} y2={labelY - 18} />
            {finalLanes.map((cord, laneIndex) => {
              const lane = laneIndex + 1;
              const x = xAt(laneIndex);
              const color = colors.get(cord.colorSymbol) ?? '#d3a448';
              const isArmed = pendingSplitter === lane;
              const isPreview = !isArmed && previewRange.has(lane);
              return (
                <g
                  key={`lane-legend-${laneIndex}`}
                  className={`lane-legend-item${isArmed ? ' is-armed' : ''}${isPreview ? ' is-preview' : ''}`}
                  data-lane={lane}
                  data-cord-id={cord.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onLaneClick(lane)}
                  onMouseEnter={() => onLaneHover(lane)}
                  onMouseLeave={() => onLaneHover(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onLaneClick(lane);
                    }
                  }}
                >
                  <rect className="lane-legend-hit" x={x - laneGap / 2 + 4} y={labelY - 16} width={laneGap - 8} height={34} rx={4} />
                  <text className="lane-legend-position" x={x} y={labelY} textAnchor="middle">{lane}</text>
                  <circle className="lane-legend-swatch" cx={x - 18} cy={labelY + 12} r="4.5" fill={color} />
                  <text className="lane-legend-cord" x={x - 10} y={labelY + 16}>{cord.id}</text>
                  <title>{`Position ${lane} · ${cord.id}${isArmed ? ' · armed as splitter' : ''}`}</title>
                </g>
              );
            })}
          </g>
        )}
      </svg>
      {!eventCount && <div className="empty-canvas">Your valid SCOT path will appear here.</div>}
    </div>
  );
}

type FinishedProps = Pick<DiagramProps, 'simulation' | 'colors' | 'mirrorFace'> & {
  theta?: number;
  tipAngle?: number;
  widthScale?: number;
  surfaceOn?: boolean;
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
        <desc id="finished-v1-description">One sharp splittee-coloured parallelogram for every split event. In each column, consecutive cells with the same lean touch edge to edge, and opposite leans can partially overlap or leave open space.</desc>
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
                <title>{`e${cell.event.eventIndex} · ${describeEvent(cell.event)} · column ${cell.column} · ${displayDirection}-leaning`}</title>
              </polygon>
            );
          })}
        </g>
      </svg>
      {!simulation.events.length && <div className="empty-canvas">Your finished parallelogram preview will appear here.</div>}
    </div>
  );
}

function FinishedV2Preview({ simulation, colors, mirrorFace, theta = 30, tipAngle = 30, widthScale = 1, surfaceOn = true }: FinishedProps) {
  const layout = useMemo(
    () => buildFinishedLayoutV2(simulation, { theta, tipAngle }),
    [simulation, theta, tipAngle],
  );
  const surfaces = useMemo(
    () => buildFinishedSurfaces(layout.cells, { enabled: surfaceOn }),
    [layout, surfaceOn],
  );
  const startCords = new Map((simulation.snapshots[0]?.lanes ?? []).map((cord) => [cord.id, cord]));
  const colorFor = (cordId: string) => colors.get(startCords.get(cordId)?.colorSymbol ?? '') ?? '#d3a448';
  const faceTransform = mirrorFace === 'back' ? `translate(${layout.width} 0) scale(-1 1)` : undefined;
  const tally = summarizeRules(layout.links);

  return (
    <>
      <div className="finished-preview finished-preview--v2">
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width * widthScale} height={layout.height * widthScale} role="img" aria-labelledby="finished-v2-title finished-v2-description">
          <title id="finished-v2-title">Finished SCOT parallelogram chart, version two</title>
          <desc id="finished-v2-description">One splittee-coloured parallelogram per split event, placed by the splitter’s course, the cord’s full-edge join and the half-side role change, in that order of authority. No column packing is applied, so cells in a gap column sit wherever their own runs leave them. Where a cord changes role across a shared boundary, the two diagonals extend to their intersection in the neighbouring column and the extra triangle is filled with the colour of the ribbon crossing the seam; the placed cells keep their shapes.</desc>
          <g transform={faceTransform}>
            {surfaces.map(({ cell, path, emergence, departure }) => {
              const transitions = [emergence, departure].filter(transition => transition !== undefined);
              const modelDirection = cell.event.toLane > cell.event.fromLane ? 'right' : 'left';
              const displayDirection = mirrorFace === 'front' ? modelDirection : modelDirection === 'right' ? 'left' : 'right';
              return (
                <path
                  key={cell.event.eventIndex}
                  className={`finished-split-cell${emergence ? ' is-splitter-to-splittee' : ''}${departure ? ' is-splittee-to-splitter' : ''}`}
                  d={path}
                  fill={colorFor(cell.event.splitteeId)}
                  data-event-index={cell.event.eventIndex}
                  data-column={cell.column}
                  data-direction={displayDirection}
                  data-role-transition={transitions.map(transition => transition.kind).join(' ') || undefined}
                  data-emerges-from-event={emergence?.hostEventIndex}
                  data-departs-from-event={departure?.hostEventIndex}
                >
                  <title>{`e${cell.event.eventIndex} · ${describeEvent(cell.event)} · column ${cell.column} · ${displayDirection}-leaning`}</title>
                </path>
              );
            })}
            {/* Section 7.5.2: every placed cell is drawn before any triangle,
                so a later cell in the neighbouring column cannot erase one. */}
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
        {!simulation.events.length && <div className="empty-canvas">Your finished v2 preview will appear here.</div>}
      </div>
      <details className="preview-disclosure preview-disclosure--audit">
        <summary>Placement audit</summary>
        <ul className="rule-tally" aria-label="Placement rules held by this layout">
          {tally.map((rule) => (
            <li key={rule.label} data-complete={rule.held === rule.total}>
              <b>{rule.label}</b>
              <span>{rule.held}/{rule.total}</span>
              <span className="quiet">{rule.note}</span>
            </li>
          ))}
          <li><b>runs</b><span>{layout.runs}</span><span className="quiet">bodies no rule ties together</span></li>
        </ul>
      </details>
    </>
  );
}

/** Count what each rule actually holds, so the view can state it rather than claim it. */
function summarizeRules(links: FinishedLink[]) {
  const group = (label: string, note: string, match: (link: FinishedLink) => boolean) => {
    const selected = links.filter(match);
    return {
      label,
      note,
      total: selected.length,
      held: selected.filter((link) => link.status !== 'conflicted').length,
    };
  };
  return [
    group('R1 course', 'splitter corner to corner', (link) => link.rule === 'R1'),
    group('R2 cord join', 'full shared edge', (link) => link.rule === 'R2'),
    group('R4 return', 'half a side down its host', (link) => link.kind === 'return'),
    group('R4 departure', 'half a side down its own cell', (link) => link.kind === 'departure'),
  ];
}

function FinishedBraidPreview({ simulation, colors, mirrorFace, theta = 30, tipAngle = 30, widthScale = 1, surfaceOn = true }: FinishedProps) {
  const layout = useMemo(
    () => buildFinishedLayout(simulation, { theta, tipAngle }),
    [simulation, theta, tipAngle],
  );
  const surfaces = useMemo(
    () => buildFinishedSurfaces(layout.cells, { enabled: surfaceOn }),
    [layout, surfaceOn],
  );
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
                  <title>{`e${cell.event.eventIndex} · ${describeEvent(cell.event)} · column ${cell.column} · ${displayDirection}-leaning`}</title>
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
  const startLane = (snapshots[0]?.lanes.findIndex((item) => item.id === cordId) ?? 0) + 1;
  return (
    <g className={`cord-track cord-track--${layer}`} filter="url(#soft-shadow)">
      {snapshots.slice(1).map((_, eventIndex) => {
        const event = events[eventIndex];
        const isSplitter = event?.splitterId === cordId;
        if ((layer === 'splitter') !== isSplitter) return null;
        const start = pointFor(cordId, eventIndex);
        const end = pointFor(cordId, eventIndex + 1);
        const midY = (start.y + end.y) / 2;
        const d = `M ${start.x} ${start.y} Q ${start.x} ${midY} ${end.x} ${end.y}`;
        return (
          <g key={`${cordId}-${eventIndex}`} data-cord-id={cordId} data-event-index={event?.eventIndex}>
            <path className="cord-outline" d={d} />
            <path className="cord-fill" d={d} stroke={color} />
            <title>{describeCordSegment(cordId, cord.colorSymbol, event)}</title>
          </g>
        );
      })}
      {layer === 'surface' && (
        <g>
          <circle className="cord-start" cx={pointFor(cordId, 0).x} cy={pointFor(cordId, 0).y} r="5" fill={color} />
          <title>{`${cordId} (${cord.colorSymbol}) · starts at lane ${startLane}`}</title>
        </g>
      )}
    </g>
  );
}

/** Every lane from `from` to `to` inclusive of both ends, walked one step at a time. */
function laneRange(from: number, to: number): number[] {
  const direction = to > from ? 1 : -1;
  const lanes: number[] = [];
  for (let current = from + direction; current !== to + direction; current += direction) {
    lanes.push(current);
  }
  return lanes;
}

function appendRowLine(source: string, line: string): string {
  const lines = source.split(/\r?\n/);
  let lastRowIndex = -1;
  lines.forEach((rawLine, index) => {
    if (/^\s*\d+\s+\d+\s*>/.test(rawLine)) lastRowIndex = index;
  });
  if (lastRowIndex === -1) {
    const trimmed = source.replace(/\s+$/, '');
    return trimmed ? `${trimmed}\n${line}` : line;
  }
  lines.splice(lastRowIndex + 1, 0, line);
  return lines.join('\n');
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

function describeCordSegment(cordId: string, colorSymbol: string, event: SplitEvent | undefined): string {
  const cordLabel = `${cordId} (${colorSymbol})`;
  if (!event) return cordLabel;
  const role = event.splitterId === cordId
    ? 'splitter'
    : event.splitteeId === cordId ? 'splittee' : 'passes through';
  return `e${event.eventIndex} · ${describeEvent(event)} · ${cordLabel} · ${role}`;
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
