import type { FinishedCell, FinishedLayout } from '../domain/finishedLayout';
import type { FinishedSurface } from '../domain/finishedSurface';
import type { Face, SplitEvent } from '../domain/types';
import type { Tooltip } from './tooltip';

type FinishedChartProps = {
  layout: FinishedLayout;
  surfaces: FinishedSurface[];
  /** Fill for a cord id such as `C03`. */
  colorFor: (cordId: string) => string;
  mirrorFace: Face;
  widthScale?: number;
  showEventIds?: boolean;
  /** Explains each cell on hover or tap; leave out for a read-only chart. */
  tooltip?: Tooltip;
  /** Makes the cells clickable, e.g. to pick the cord a cell belongs to. */
  onCellClick?: (cell: FinishedCell) => void;
  /** Outlines every cell of one cord. */
  highlightCordId?: string | null;
  /** Prefix for the title and description element ids, so two charts can share a page. */
  idPrefix?: string;
  title?: string;
  description?: string;
};

const defaultTitle = 'Finished SCOT parallelogram chart, version two';
const defaultDescription = 'One splittee-coloured parallelogram per split event, placed by the splitter’s course, the cord’s full-edge join and the half-side role change, in that order of authority. No column packing is applied, so cells in a gap column sit wherever their own runs leave them. Where a cord changes role across a shared boundary, the two diagonals extend to their intersection in the neighbouring column and the extra triangle is filled with the colour of the ribbon crossing the seam; the placed cells keep their shapes.';

/** The Finished v2 drawing on its own: cells, transition triangles, optional event labels. */
export default function FinishedChart({
  layout,
  surfaces,
  colorFor,
  mirrorFace,
  widthScale = 1,
  showEventIds = false,
  tooltip,
  onCellClick,
  highlightCordId,
  idPrefix = 'finished-v2',
  title = defaultTitle,
  description = defaultDescription,
}: FinishedChartProps) {
  const faceTransform = mirrorFace === 'back' ? `translate(${layout.width} 0) scale(-1 1)` : undefined;

  return (
    <svg
      className={onCellClick ? 'finished-chart--interactive' : undefined}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width * widthScale}
      height={layout.height * widthScale}
      role="img"
      aria-labelledby={`${idPrefix}-title ${idPrefix}-description`}
    >
      <title id={`${idPrefix}-title`}>{title}</title>
      <desc id={`${idPrefix}-description`}>{description}</desc>
      <g transform={faceTransform}>
        {surfaces.map(({ cell, path, emergence, departure }) => {
          const transitions = [emergence, departure].filter(transition => transition !== undefined);
          const modelDirection = cell.event.toLane > cell.event.fromLane ? 'right' : 'left';
          const displayDirection = mirrorFace === 'front' ? modelDirection : modelDirection === 'right' ? 'left' : 'right';
          const highlighted = highlightCordId !== undefined && highlightCordId !== null && cell.event.splitteeId === highlightCordId;
          return (
            <path
              key={cell.event.eventIndex}
              className={`finished-split-cell${emergence ? ' is-splitter-to-splittee' : ''}${departure ? ' is-splittee-to-splitter' : ''}${highlighted ? ' is-highlighted' : ''}`}
              d={path}
              fill={colorFor(cell.event.splitteeId)}
              data-event-index={cell.event.eventIndex}
              data-column={cell.column}
              data-direction={displayDirection}
              data-role-transition={transitions.map(transition => transition.kind).join(' ') || undefined}
              data-emerges-from-event={emergence?.hostEventIndex}
              data-departs-from-event={departure?.hostEventIndex}
              {...(tooltip ? tooltip.anchorProps(`e${cell.event.eventIndex} · ${describeEvent(cell.event)} · column ${cell.column} · ${displayDirection}-leaning`) : {})}
              onClick={onCellClick ? () => onCellClick(cell) : undefined}
            />
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
      {showEventIds && (
        <g className="finished-event-labels" aria-hidden="true">
          {layout.cells.map((cell) => {
            const centre = cell.points.reduce(
              (point, item) => ({ x: point.x + item.x / cell.points.length, y: point.y + item.y / cell.points.length }),
              { x: 0, y: 0 },
            );
            return (
              <text
                key={cell.event.eventIndex}
                x={mirrorFace === 'back' ? layout.width - centre.x : centre.x}
                y={centre.y}
                textAnchor="middle"
                dominantBaseline="central"
              >e{cell.event.eventIndex}</text>
            );
          })}
        </g>
      )}
    </svg>
  );
}

export function describeEvent(event: SplitEvent): string {
  return `${event.splitterId} splits ${event.splitteeId} · row ${event.sourceRow}, ${event.splitIndex} of ${event.splitCount}`;
}
