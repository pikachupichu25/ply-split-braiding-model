import { useEffect, useMemo, useState } from 'react';
import { chevronPattern } from './examples/chevron';
import { parsePattern } from './domain/parser';
import { simulatePattern } from './domain/simulate';
import type { Cord, Face, Simulation, SplitEvent } from './domain/types';

const palette = ['#d76b52', '#77b6c9', '#d3a448', '#6f8f65', '#a47aa3', '#dd8f45'];
const savedPatternKey = 'scot-braid-studio-pattern';

export default function App() {
  const [source, setSource] = useState(() => localStorage.getItem(savedPatternKey) ?? chevronPattern);
  const [previewRepeats, setPreviewRepeats] = useState(4);
  const [selectedEvent, setSelectedEvent] = useState(0);
  const [view, setView] = useState<'result' | 'braid' | 'construction'>('result');
  const [mirrorFace, setMirrorFace] = useState<Face>('front');

  const parsed = useMemo(() => parsePattern(source), [source]);
  const simulation = useMemo(
    () => (parsed.pattern ? simulatePattern(parsed.pattern, previewRepeats) : emptySimulation()),
    [parsed.pattern, previewRepeats],
  );
  const diagnostics = [...parsed.diagnostics, ...simulation.diagnostics];
  const allEvents = simulation.events;
  const activeEventIndex = Math.max(0, Math.min(selectedEvent, Math.max(0, allEvents.length - 1)));
  const activeEvent = allEvents[activeEventIndex];

  useEffect(() => {
    localStorage.setItem(savedPatternKey, source);
  }, [source]);

  useEffect(() => {
    setSelectedEvent((current) => Math.min(current, Math.max(0, allEvents.length - 1)));
  }, [allEvents.length]);

  const colorMap = useMemo(() => buildColorMap(parsed.pattern?.colors ?? []), [parsed.pattern?.colors]);
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
            <button className="text-button" onClick={() => setSource(chevronPattern)}>Reset sample</button>
          </div>

          <label className="editor-label" htmlFor="pattern-source">SCOT source</label>
          <textarea
            id="pattern-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            aria-describedby="notation-help"
          />
          <p id="notation-help" className="editor-help">Use fixed front-oriented lane numbers. A turn reverses the visible lane labels, while each cord retains its own hidden identity.</p>

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
                <button className={view === 'result' ? 'is-active' : ''} onClick={() => setView('result')}>Finished</button>
                <button className={view === 'braid' ? 'is-active' : ''} onClick={() => setView('braid')}>Braid</button>
                <button className={view === 'construction' ? 'is-active' : ''} onClick={() => setView('construction')}>Draft</button>
              </div>
              <div className="toggle-group">
                <button className={mirrorFace === 'front' ? 'is-active' : ''} onClick={() => setMirrorFace('front')}>Front</button>
                <button className={mirrorFace === 'back' ? 'is-active' : ''} onClick={() => setMirrorFace('back')}>Back</button>
              </div>
            </div>
          </div>

          <div className="canvas-meta">
            <span>{view === 'result' ? `flat surface chart · ${mirrorFace} face` : `fixed lanes · ${mirrorFace} display`}</span>
            <span>{view === 'result' ? `${simulation.totalRows} courses · ${allEvents.length} splits` : activeEvent ? `working ${activeEvent.face} · row ${activeEvent.sourceRow}` : 'no active split'}</span>
          </div>
          {view === 'result' ? (
            <FinishedBraidPreview simulation={simulation} colors={colorMap} mirrorFace={mirrorFace} />
          ) : (
            <BraidDiagram
              simulation={simulation}
              colors={colorMap}
              selectedEvent={activeEventIndex}
              onSelectEvent={setSelectedEvent}
              view={view}
              mirrorFace={mirrorFace}
            />
          )}

          {view === 'result' ? (
            <p className="finished-caption">Rows worked into the same course of fabric share one band, so every cord runs obliquely and no lane sits out a row. A splitter is hidden for as long as it runs inside the cords it splits, showing only where it leaves the face and where it comes back out. Switch to Braid or Draft to inspect the construction.</p>
          ) : (
            <div className="stepper">
              <div className="step-copy">
                <p className="eyebrow">Active split</p>
                <strong>{activeEvent ? describeEvent(activeEvent) : 'Enter a valid row to begin'}</strong>
                <span>{activeEvent ? `Event ${activeEvent.eventIndex + 1} of ${allEvents.length}` : '—'}</span>
              </div>
              <div className="step-actions">
                <button aria-label="Previous split" disabled={activeEventIndex === 0 || !allEvents.length} onClick={() => setSelectedEvent((index) => Math.max(0, index - 1))}>←</button>
                <button aria-label="Next split" disabled={activeEventIndex >= allEvents.length - 1 || !allEvents.length} onClick={() => setSelectedEvent((index) => Math.min(allEvents.length - 1, index + 1))}>→</button>
              </div>
            </div>
          )}
        </section>
      </section>

      <footer className="control-deck">
        <div>
          <p className="eyebrow">Preview length</p>
          <label className="repeat-control">
            <input type="range" min="1" max="8" value={previewRepeats} onChange={(event) => setPreviewRepeats(Number(event.target.value))} />
            <span>{previewRepeats} repeats</span>
          </label>
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
  selectedEvent: number;
  onSelectEvent: (index: number) => void;
  view: 'braid' | 'construction';
  mirrorFace: Face;
};

function BraidDiagram({ simulation, colors, selectedEvent, onSelectEvent, view, mirrorFace }: DiagramProps) {
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
    <div className={`diagram-frame diagram-frame--${view}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="diagram-title diagram-description">
        <title id="diagram-title">SCOT braid course trace</title>
        <desc id="diagram-description">A lane diagram of stable cords moving through the selected SCOT splitting sequence.</desc>
        <defs>
          <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="2" floodColor="#17293d" floodOpacity="0.24" />
          </filter>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        {Array.from({ length: laneCount }, (_, laneIndex) => (
          <g key={`lane-${laneIndex}`}>
            <line className="lane-guide" x1={xAt(laneIndex)} y1="42" x2={xAt(laneIndex)} y2={height - 24} />
            {view === 'construction' && <text className="lane-label" x={xAt(laneIndex)} y="28">{laneIndex + 1}</text>}
          </g>
        ))}
        {simulation.events.map((event, eventIndex) => {
          const y = yAt(eventIndex + 1);
          if (view !== 'construction') return null;
          return <line key={`row-${eventIndex}`} className="row-guide" x1="28" x2={width - 28} y1={y} y2={y} />;
        })}
        {cordIds.map((cordId) => (
          <CordTrack
            key={cordId}
            cordId={cordId}
            snapshots={simulation.snapshots}
            events={simulation.events}
            colors={colors}
            activeIndex={selectedEvent}
            pointFor={pointFor}
          />
        ))}
        {simulation.events.map((event, eventIndex) => {
          const before = pointFor(event.splitterId, eventIndex);
          const after = pointFor(event.splitterId, eventIndex + 1);
          const x = (before.x + after.x) / 2;
          const y = (before.y + after.y) / 2;
          const selected = eventIndex === selectedEvent;
          const future = eventIndex > selectedEvent;
          return (
            <g
              key={`event-${event.eventIndex}`}
              className={`split-marker ${selected ? 'is-selected' : ''} ${future ? 'is-future' : ''}`}
              onClick={() => onSelectEvent(eventIndex)}
              role="button"
              tabIndex={0}
              aria-label={`Select ${describeEvent(event)}`}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') onSelectEvent(eventIndex);
              }}
            >
              <circle cx={x} cy={y} r={selected ? 12 : 8} />
              <path d={`M ${x - 5} ${y - 2} Q ${x} ${y - 7} ${x + 5} ${y - 2}`} />
              <path d={`M ${x - 5} ${y + 2} Q ${x} ${y + 7} ${x + 5} ${y + 2}`} />
            </g>
          );
        })}
        {view === 'construction' && simulation.events.map((event, eventIndex) => {
          const y = yAt(eventIndex + 1) + 4;
          const label = `R${event.sourceRow}.${event.splitIndex}`;
          return <text className="row-label" key={`label-${eventIndex}`} x={width - 22} y={y}>{label}</text>;
        })}
      </svg>
      {!eventCount && <div className="empty-canvas">Your valid SCOT path will appear here.</div>}
    </div>
  );
}

type FinishedProps = Pick<DiagramProps, 'simulation' | 'colors' | 'mirrorFace'>;

function FinishedBraidPreview({ simulation, colors, mirrorFace }: FinishedProps) {
  const laneCount = simulation.snapshots[0]?.lanes.length ?? 8;
  const courses = surfaceBands(simulation);
  const laneGap = 26;
  const courseHeight = 40;
  const capHeight = 14;
  const gutter = 40;
  const footer = 28;
  const padTop = 12;
  const padRight = 14;
  const bedWidth = laneCount * laneGap;
  const bedHeight = capHeight * 2 + Math.max(1, courses.length) * courseHeight;
  const width = gutter + bedWidth + padRight;
  const height = padTop + bedHeight + footer;

  const laneLeft = (laneIndex: number) => {
    const displayIndex = mirrorFace === 'front' ? laneIndex : laneCount - laneIndex - 1;
    return gutter + displayIndex * laneGap;
  };
  const courseTop = (courseIndex: number) => padTop + capHeight + courseIndex * courseHeight;
  const colorOf = (cord: Cord | undefined) => colors.get(cord?.colorSymbol ?? '') ?? '#d3a448';
  const band = (fromLane: number, toLane: number, top: number, bottom: number) => {
    const start = laneLeft(fromLane);
    const end = laneLeft(toLane);
    return `${start},${top} ${start + laneGap},${top} ${end + laneGap},${bottom} ${end},${bottom}`;
  };

  const startLanes = simulation.snapshots[0]?.lanes ?? [];
  const endLanes = simulation.snapshots.at(-1)?.lanes ?? startLanes;
  const pixelScale = 1.5;

  return (
    <div className="finished-preview">
      <svg viewBox={`0 0 ${width} ${height}`} width={width * pixelScale} height={height * pixelScale} role="img" aria-labelledby="finished-title finished-description">
        <title id="finished-title">Finished SCOT braid chart</title>
        <desc id="finished-description">A flat chart of the finished braid. every cord is drawn as a straight oblique cell coloured by its own cord colour, rows worked into one course of fabric share a band, and each splitter disappears where it passes through the cords it splits, surfacing only where it leaves and rejoins the face.</desc>
        <rect className="finished-bed" x={gutter} y={padTop} width={bedWidth} height={bedHeight} />

        {startLanes.map((cord, laneIndex) => (
          <polygon
            key={`cap-start-${cord.id}`}
            className="finished-cell"
            fill={colorOf(cord)}
            points={band(laneIndex, laneIndex, padTop, padTop + capHeight)}
          />
        ))}

        {courses.map((course, courseIndex) => {
          const before = simulation.snapshots[course.startStep]?.lanes ?? [];
          const after = simulation.snapshots[course.endStep]?.lanes ?? before;
          const top = courseTop(courseIndex);
          const bottom = courseTop(courseIndex + 1);
          const splitterIds = new Set(
            simulation.events.slice(course.startStep, course.endStep).map((event) => event.splitterId),
          );
          const cells = before.map((cord, laneIndex) => ({
            cord,
            laneIndex,
            toLane: after.findIndex((item) => item.id === cord.id),
          })).filter((cell) => cell.toLane >= 0);
          return (
            <g key={`course-${courseIndex}`}>
              {cells.filter((cell) => splitterIds.has(cell.cord.id)).map((cell) => (
                <rect
                  key={`buried-${cell.cord.id}`}
                  className="finished-underlay"
                  fill={colorOf(cell.cord)}
                  x={Math.min(laneLeft(cell.laneIndex), laneLeft(cell.toLane))}
                  y={top}
                  width={Math.abs(laneLeft(cell.toLane) - laneLeft(cell.laneIndex)) + laneGap}
                  height={bottom - top}
                />
              ))}
              {cells.filter((cell) => !splitterIds.has(cell.cord.id)).map((cell) => (
                <polygon key={cell.cord.id} className="finished-cell" fill={colorOf(cell.cord)} points={band(cell.laneIndex, cell.toLane, top, bottom)} />
              ))}
            </g>
          );
        })}

        {endLanes.map((cord, laneIndex) => (
          <polygon
            key={`cap-end-${cord.id}`}
            className="finished-cell"
            fill={colorOf(cord)}
            points={band(laneIndex, laneIndex, courseTop(courses.length), courseTop(courses.length) + capHeight)}
          />
        ))}

        <rect className="finished-frame" x={gutter} y={padTop} width={bedWidth} height={bedHeight} />

        {courses.map((course, courseIndex) => {
          const top = courseTop(courseIndex);
          const bottom = courseTop(courseIndex + 1);
          return (
            <g key={`course-label-${courseIndex}`}>
              <line className="finished-tick" x1={gutter - 7} x2={gutter} y1={bottom} y2={bottom} />
              <text className="finished-axis finished-row-label" x={gutter - 10} y={(top + bottom) / 2 + 3}>
                {course.rows.length > 1 ? `${course.rows[0]}\u2013${course.rows.at(-1)}` : course.rows[0]}
              </text>
            </g>
          );
        })}

        {Array.from({ length: laneCount }, (_, displayIndex) => {
          const x = gutter + displayIndex * laneGap;
          const label = mirrorFace === 'front' ? displayIndex + 1 : laneCount - displayIndex;
          return (
            <g key={`lane-box-${displayIndex}`}>
              <rect className="finished-lane-box" x={x} y={padTop + bedHeight + 7} width={laneGap} height={16} />
              <text className="finished-axis finished-lane-label" x={x + laneGap / 2} y={padTop + bedHeight + 18}>{label}</text>
            </g>
          );
        })}
      </svg>
      {!simulation.events.length && <div className="empty-canvas">Your finished braid preview will appear here.</div>}
    </div>
  );
}

// Consecutive written rows are worked into the same course of fabric as long as no cord
// has to reverse direction. Merging them keeps every cord oblique instead of parking the
// lanes an odd row never touches in a straight filler section.
function surfaceBands(simulation: Simulation): Array<{ rows: number[]; startStep: number; endStep: number }> {
  const bands: Array<{ rows: number[]; startStep: number; endStep: number }> = [];
  courseBands(simulation).forEach((course) => {
    const current = bands.at(-1);
    if (current && travelsOneWay(simulation, current.startStep, current.endStep, course.endStep)) {
      current.endStep = course.endStep;
      current.rows.push(course.row);
      return;
    }
    bands.push({ rows: [course.row], startStep: course.startStep, endStep: course.endStep });
  });
  return bands;
}

function travelsOneWay(simulation: Simulation, startStep: number, middleStep: number, endStep: number): boolean {
  const start = simulation.snapshots[startStep]?.lanes ?? [];
  const middle = simulation.snapshots[middleStep]?.lanes ?? [];
  const end = simulation.snapshots[endStep]?.lanes ?? [];
  return start.every((cord) => {
    const first = Math.sign(middle.findIndex((item) => item.id === cord.id) - start.findIndex((item) => item.id === cord.id));
    const second = Math.sign(end.findIndex((item) => item.id === cord.id) - middle.findIndex((item) => item.id === cord.id));
    return first === 0 || second === 0 || first === second;
  });
}

function courseBands(simulation: Simulation): Array<{ row: number; startStep: number; endStep: number }> {
  const bands: Array<{ row: number; startStep: number; endStep: number }> = [];
  simulation.events.forEach((event, index) => {
    const current = bands.at(-1);
    if (current && current.row === event.rowInstance) current.endStep = index + 1;
    else bands.push({ row: event.rowInstance, startStep: index, endStep: index + 1 });
  });
  return bands;
}

function CordTrack({ cordId, snapshots, events, colors, activeIndex, pointFor }: {
  cordId: string;
  snapshots: Simulation['snapshots'];
  events: Simulation['events'];
  colors: Map<string, string>;
  activeIndex: number;
  pointFor: (cordId: string, snapshotIndex: number) => { x: number; y: number };
}) {
  const cord = snapshots[0]?.lanes.find((item) => item.id === cordId);
  if (!cord) return null;
  const color = colors.get(cord.colorSymbol) ?? '#d3a448';
  return (
    <g className="cord-track" filter="url(#soft-shadow)">
      {snapshots.slice(1).map((_, eventIndex) => {
        if (events[eventIndex]?.splitterId === cordId) return null;
        const start = pointFor(cordId, eventIndex);
        const end = pointFor(cordId, eventIndex + 1);
        const midY = (start.y + end.y) / 2;
        const d = `M ${start.x} ${start.y} Q ${start.x} ${midY} ${end.x} ${end.y}`;
        const future = eventIndex > activeIndex;
        return (
          <g key={`${cordId}-${eventIndex}`} className={future ? 'is-future' : ''}>
            <path className="cord-outline" d={d} />
            <path className="cord-fill" d={d} stroke={color} />
          </g>
        );
      })}
      <circle className="cord-start" cx={pointFor(cordId, 0).x} cy={pointFor(cordId, 0).y} r="5" fill={color} />
    </g>
  );
}

function buildColorMap(symbols: string[]): Map<string, string> {
  const map = new Map<string, string>();
  symbols.forEach((symbol) => {
    if (!map.has(symbol)) map.set(symbol, palette[map.size % palette.length]);
  });
  return map;
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
