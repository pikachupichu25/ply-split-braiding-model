import { useMemo } from 'react';
import { samplePatterns } from './examples';
import type { SamplePattern } from './examples';
import { parsePattern } from './domain/parser';
import { simulatePattern } from './domain/simulate';
import { buildFinishedLayoutV2 } from './domain/finishedLayoutV2';
import type { FinishedLayoutV2 } from './domain/finishedLayoutV2';
import { buildFinishedSurfaces } from './domain/finishedSurface';
import type { FinishedSurface } from './domain/finishedSurface';
import { buildColorMap } from './domain/colourway';
import FinishedChart from './ui/FinishedChart';
import { savedPatternKey } from './App';
import './overview.css';

/** Enough repeats to show the motif; the studio works out the full cycle. */
const previewRepeats = 4;
/** Taller charts are cropped to this height-to-width ratio, so one braid cannot fill the feed. */
const maxAspect = 2.4;

type PatternCard = {
  sample: SamplePattern;
  layout: FinishedLayoutV2;
  surfaces: FinishedSurface[];
  colorFor: (cordId: string) => string;
  swatches: string[];
  cords: number;
  rows: number;
};

function buildCard(sample: SamplePattern): PatternCard | undefined {
  const { pattern } = parsePattern(sample.source);
  if (!pattern) return undefined;
  const simulation = simulatePattern(pattern, previewRepeats);
  if (!simulation.events.length) return undefined;
  const layout = buildFinishedLayoutV2(simulation, { theta: 30, tipAngle: 30 });
  const surfaces = buildFinishedSurfaces(layout.cells, { enabled: true });
  const colors = buildColorMap(pattern.colors, pattern.colorAssignments);
  const startCords = new Map((simulation.snapshots[0]?.lanes ?? []).map((cord) => [cord.id, cord]));
  const colorFor = (cordId: string) => colors.get(startCords.get(cordId)?.colorSymbol ?? '') ?? '#d3a448';
  return {
    sample,
    layout,
    surfaces,
    colorFor,
    swatches: [...new Set(colors.values())],
    cords: pattern.colors.length,
    rows: pattern.rows.length,
  };
}

const openInStudio = (source: string) => {
  localStorage.setItem(savedPatternKey, source);
  window.location.hash = '#/studio';
};

/** The landing page: every bundled sample as a cell chart, laid out as an image feed. */
export default function Overview() {
  const cards = useMemo(
    () => samplePatterns.map(buildCard).filter((card) => card !== undefined),
    [],
  );

  return (
    <main className="app-shell overview">
      <header className="masthead">
        <div className="masthead-mark" aria-hidden="true">↝</div>
        <div>
          <p className="eyebrow">Ply-split drafting table</p>
          <h1>SCOT Braid Studio</h1>
        </div>
        <nav className="masthead-actions" aria-label="Tools">
          <a className="expected-layout-link" href="#/studio">Open the studio <span>↗</span></a>
          <a className="expected-layout-link" href="#/colour">Colour a pattern <span>↗</span></a>
          <a className="expected-layout-link" href="#/expected-layout">Expected layout editor <span>↗</span></a>
          <a className="expected-layout-link" href="#/models">How the models work <span>↗</span></a>
        </nav>
      </header>

      <section className="overview-intro">
        <p className="eyebrow">Overview · {cards.length} patterns</p>
        <h2>Patterns in the system</h2>
        <p className="quiet">Each braid is drawn as a cell chart from its written pattern, {previewRepeats} repeats long. Pick one to open it in the studio.</p>
      </section>

      <section className="overview-feed" aria-label="Sample patterns">
        {cards.map((card) => (
          <PatternTile key={card.sample.id} card={card} />
        ))}
      </section>
    </main>
  );
}

function PatternTile({ card }: { card: PatternCard }) {
  const { sample, layout, surfaces, colorFor, swatches, cords, rows } = card;
  const aspect = layout.height / layout.width;
  const cropped = aspect > maxAspect;

  return (
    <article className="overview-tile">
      <button
        type="button"
        className={`overview-tile-image${cropped ? ' is-cropped' : ''}`}
        style={{ aspectRatio: `1 / ${Math.min(aspect, maxAspect)}` }}
        onClick={() => openInStudio(sample.source)}
        aria-label={`Open ${sample.name} in the studio`}
      >
        <FinishedChart
          layout={layout}
          surfaces={surfaces}
          colorFor={colorFor}
          mirrorFace="front"
          idPrefix={`overview-${sample.id}`}
          title={`${sample.name} cell chart`}
          description={sample.summary}
        />
        <span className="overview-tile-open" aria-hidden="true">Open in studio ↗</span>
      </button>
      <div className="overview-tile-body">
        <h3>{sample.name}</h3>
        <p className="overview-tile-meta">
          {cords} cords · {rows} rows{sample.image ? ' · photo' : ''}
        </p>
        <p className="overview-tile-summary">{sample.summary}</p>
        <div className="overview-tile-swatches" aria-hidden="true">
          {swatches.map((swatch) => <span key={swatch} style={{ background: swatch }} />)}
        </div>
      </div>
    </article>
  );
}
