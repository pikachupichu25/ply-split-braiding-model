import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  constrainExpectedGroupDelta,
  createExpectedLayout,
  expectedCellPoints,
  expectedCellsMatchingEventId,
  expectedGeometry,
  expectedLayoutStorageKey,
  nextExpectedCellId,
  parseExpectedLayout,
  snapExpectedCell,
} from './domain/expectedLayout';
import type {
  ExpectedCell,
  EventIdComparator,
  ExpectedLayoutDocument,
  ExpectedLean,
  ExpectedPoint,
  SnapResult,
} from './domain/expectedLayout';
import './expectedLayoutEditor.css';

type Tool = 'select' | ExpectedLean;
type DragState = {
  pointerId: number;
  start: ExpectedPoint;
  anchor: ExpectedCell;
  cells: ExpectedCell[];
};
type MarqueeState = {
  pointerId: number;
  start: ExpectedPoint;
  current: ExpectedPoint;
  baseIds: Set<string>;
};

const swatches = ['#d3a448', '#d76b52', '#77b6c9', '#6f8f65', '#a47aa3', '#17293d'];
const canvasGutterX = 72;
const canvasDisplayScale = 0.25;

export default function ExpectedLayoutEditor() {
  const [document, setDocument] = useState<ExpectedLayoutDocument | null>(() => loadSavedDocument());
  const [setupColumns, setSetupColumns] = useState(7);
  const [tool, setTool] = useState<Tool>('select');
  const [snapOn, setSnapOn] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [eventComparator, setEventComparator] = useState<EventIdComparator>('>');
  const [eventThreshold, setEventThreshold] = useState(0);
  const [activeFill, setActiveFill] = useState(swatches[0]);
  const [dragPreviews, setDragPreviews] = useState<ExpectedCell[] | null>(null);
  const [hoverPreview, setHoverPreview] = useState<ExpectedCell | null>(null);
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [notice, setNotice] = useState('Ready to draft');
  const [importError, setImportError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const marqueeRef = useRef<MarqueeState | null>(null);
  const undoStack = useRef<ExpectedLayoutDocument[]>([]);
  const redoStack = useRef<ExpectedLayoutDocument[]>([]);

  const geometry = useMemo(
    () => document ? expectedGeometry(document.geometry) : null,
    [document],
  );
  const selectedCells = document?.cells.filter((cell) => selectedIds.has(cell.id)) ?? [];
  const selected = selectedCells.length === 1 ? selectedCells[0] : null;
  const selectOnly = (id: string | null) => setSelectedIds(id ? new Set([id]) : new Set());

  const commit = (next: ExpectedLayoutDocument, message?: string) => {
    if (document) {
      undoStack.current = [...undoStack.current.slice(-99), document];
      redoStack.current = [];
    }
    setDocument(next);
    if (message) setNotice(message);
  };

  const updateDocument = (
    change: (current: ExpectedLayoutDocument) => ExpectedLayoutDocument,
    message?: string,
  ) => {
    if (!document) return;
    commit(change(document), message);
  };

  const undo = () => {
    if (!document) return;
    const previous = undoStack.current.at(-1);
    if (!previous) return;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [document, ...redoStack.current].slice(0, 100);
    setDocument(previous);
    selectOnly(null);
    setNotice('Undid the last edit');
  };

  const redo = () => {
    if (!document) return;
    const next = redoStack.current[0];
    if (!next) return;
    redoStack.current = redoStack.current.slice(1);
    undoStack.current = [...undoStack.current, document].slice(-100);
    setDocument(next);
    selectOnly(null);
    setNotice('Redid the edit');
  };

  useEffect(() => {
    if (document) localStorage.setItem(expectedLayoutStorageKey, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    const previousTitle = window.document.title;
    window.document.title = 'Expected Layout · SCOT Braid Studio';
    return () => { window.document.title = previousTitle; };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (command && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (typing || !document) return;
      if (event.key === 'Escape' || event.key.toLowerCase() === 'v') {
        setTool('select');
        setDragPreviews(null);
        setMarquee(null);
        dragRef.current = null;
        marqueeRef.current = null;
        return;
      }
      if (event.key.toLowerCase() === 'l') { setTool('left'); return; }
      if (event.key.toLowerCase() === 'r') { setTool('right'); return; }
      if (command && event.key.toLowerCase() === 'd' && selected) {
        event.preventDefault();
        duplicateCell(selected);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedCells.length) {
        event.preventDefault();
        deleteCells(selectedCells.map((cell) => cell.id));
        return;
      }
      if (!selectedCells.length || !event.key.startsWith('Arrow')) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        moveSelectedCells(delta, 0);
        return;
      }
      const step = event.altKey ? 0.01 : event.shiftKey ? 0.1 : 0.5;
      const delta = event.key === 'ArrowUp' ? -step : step;
      moveSelectedCells(0, delta);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!document || !geometry) {
    return (
      <main className="expected-setup">
        <a className="expected-back-link" href="#/">← SCOT Braid Studio</a>
        <section className="expected-setup-card" aria-labelledby="setup-title">
          <span className="expected-thread-mark" aria-hidden="true">↙↗</span>
          <p className="expected-kicker">Human-authored ground truth</p>
          <h1 id="setup-title">Set the drafting table.</h1>
          <p>Choose how many gap columns the finished layout needs. You can change this later.</p>
          <label htmlFor="setup-columns">Number of columns</label>
          <div className="expected-setup-row">
            <input
              id="setup-columns"
              type="number"
              min="1"
              max="64"
              value={setupColumns}
              onChange={(event) => setSetupColumns(clampColumns(Number(event.target.value)))}
            />
            <button
              type="button"
              onClick={() => {
                setDocument(createExpectedLayout(setupColumns));
                setNotice(`${setupColumns}-column layout created`);
              }}
            >Create layout <span>→</span></button>
          </div>
          <small>Columns represent gaps between cord lanes, numbered from the left.</small>
        </section>
      </main>
    );
  }

  const displayGeometry = {
    ...geometry,
    columnWidth: geometry.columnWidth * canvasDisplayScale,
    crossGapDrop: geometry.crossGapDrop * canvasDisplayScale,
    cellSide: geometry.cellSide * canvasDisplayScale,
    halfSide: geometry.halfSide * canvasDisplayScale,
  };
  const canvasOriginY = displayGeometry.cellSide + 54;
  const dragPreviewById = new Map((dragPreviews ?? []).map((cell) => [cell.id, cell]));
  const dragAnchorPreview = dragPreviews?.find((cell) => cell.id === dragRef.current?.anchor.id) ?? null;
  const renderedCells = document.cells.map((cell) => dragPreviewById.get(cell.id) ?? cell);
  const maxUnits = Math.max(1.5, ...renderedCells.map((cell) => cell.ySideUnits + 1.5));
  const canvasWidth = canvasGutterX * 2 + document.columnCount * displayGeometry.columnWidth;
  const canvasHeight = Math.max(760, canvasOriginY + maxUnits * displayGeometry.cellSide + 100);
  const orderedCells = [...renderedCells].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));

  const idsInsideMarquee = (selection: MarqueeState) => {
    const bounds = selectionBounds(selection.start, selection.current);
    const ids = new Set(selection.baseIds);
    for (const cell of document.cells) {
      const centre = polygonCentre(pointsForDisplay(cell, displayGeometry, canvasOriginY));
      if (pointInsideBounds(centre, bounds)) ids.add(cell.id);
    }
    return ids;
  };
  const visibleSelectedIds = marquee ? idsInsideMarquee(marquee) : selectedIds;

  const toCanvasPoint = (event: ReactPointerEvent<SVGSVGElement | SVGElement>): ExpectedPoint => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const bounds = svg.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvasWidth / bounds.width,
      y: (event.clientY - bounds.top) * canvasHeight / bounds.height,
    };
  };

  const previewAt = (point: ExpectedPoint, lean: ExpectedLean): ExpectedCell | null => {
    const column = columnAt(point.x, document.columnCount, displayGeometry.columnWidth);
    if (!column) return null;
    const id = nextExpectedCellId(document.cells);
    const provisional: ExpectedCell = {
      id,
      column,
      lean,
      ySideUnits: Math.max(0, (point.y - canvasOriginY) / displayGeometry.cellSide),
      fill: activeFill,
      zIndex: Math.max(-1, ...document.cells.map((cell) => cell.zIndex)) + 1,
    };
    const snapped = snapOn
      ? snapExpectedCell(provisional, provisional.ySideUnits, document.cells, displayGeometry)
      : null;
    return snapped ? { ...provisional, ySideUnits: snapped.ySideUnits } : provisional;
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = toCanvasPoint(event);
    const activeMarquee = marqueeRef.current;
    if (activeMarquee) {
      const next = { ...activeMarquee, current: point };
      marqueeRef.current = next;
      setMarquee(next);
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      const column = columnAt(point.x, document.columnCount, displayGeometry.columnWidth) ?? drag.anchor.column;
      const requestedColumnDelta = column - drag.anchor.column;
      const requestedYDelta = (point.y - drag.start.y) / displayGeometry.cellSide;
      let delta = constrainExpectedGroupDelta(
        drag.cells,
        requestedColumnDelta,
        requestedYDelta,
        document.columnCount,
      );
      const moving = {
        ...drag.anchor,
        column: drag.anchor.column + delta.columnDelta,
        ySideUnits: drag.anchor.ySideUnits + delta.ySideUnitsDelta,
      };
      const shouldSnap = snapOn && !event.altKey;
      const movingIds = new Set(drag.cells.map((cell) => cell.id));
      const stationaryCells = document.cells.filter((cell) => !movingIds.has(cell.id));
      const snapped = shouldSnap
        ? snapExpectedCell(moving, moving.ySideUnits, stationaryCells, displayGeometry)
        : null;
      if (snapped) {
        delta = constrainExpectedGroupDelta(
          drag.cells,
          delta.columnDelta,
          snapped.ySideUnits - drag.anchor.ySideUnits,
          document.columnCount,
        );
      }
      setDragPreviews(drag.cells.map((cell) => ({
        ...cell,
        column: cell.column + delta.columnDelta,
        ySideUnits: cell.ySideUnits + delta.ySideUnitsDelta,
      })));
      setSnapResult(snapped);
      return;
    }
    if (tool === 'left' || tool === 'right') setHoverPreview(previewAt(point, tool));
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    const point = toCanvasPoint(event);
    if (tool === 'left' || tool === 'right') {
      const cell = previewAt(point, tool);
      if (!cell) return;
      commit({ ...document, cells: [...document.cells, cell] }, `${cell.id} added to column ${cell.column}`);
      selectOnly(cell.id);
      setHoverPreview({ ...cell, id: nextExpectedCellId([...document.cells, cell]) });
      return;
    }
    const next: MarqueeState = {
      pointerId: event.pointerId,
      start: point,
      current: point,
      baseIds: event.shiftKey || event.metaKey || event.ctrlKey ? new Set(selectedIds) : new Set(),
    };
    marqueeRef.current = next;
    setMarquee(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startDrag = (event: ReactPointerEvent<SVGPolygonElement>, cell: ExpectedCell) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(cell.id)) next.delete(cell.id); else next.add(cell.id);
        return next;
      });
      setTool('select');
      return;
    }
    const movingCells = selectedIds.has(cell.id) && selectedCells.length > 1
      ? selectedCells
      : [cell];
    if (movingCells.length === 1) selectOnly(cell.id);
    setTool('select');
    dragRef.current = {
      pointerId: event.pointerId,
      start: toCanvasPoint(event),
      anchor: cell,
      cells: movingCells,
    };
    setDragPreviews(movingCells);
    if (movingCells.length > 1) setNotice(`Moving ${movingCells.length} selected cells`);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const activeMarquee = marqueeRef.current;
    if (activeMarquee) {
      const distance = Math.hypot(
        activeMarquee.current.x - activeMarquee.start.x,
        activeMarquee.current.y - activeMarquee.start.y,
      );
      const ids = distance < 3 ? new Set(activeMarquee.baseIds) : idsInsideMarquee(activeMarquee);
      setSelectedIds(ids);
      setNotice(ids.size ? `${ids.size} cell${ids.size === 1 ? '' : 's'} selected by area` : 'Selection cleared');
      marqueeRef.current = null;
      setMarquee(null);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    if (dragPreviews) {
      const originals = new Map(drag.cells.map((cell) => [cell.id, cell]));
      const moved = dragPreviews.some((cell) => {
        const original = originals.get(cell.id)!;
        return cell.column !== original.column
          || Math.abs(cell.ySideUnits - original.ySideUnits) > 0.000001;
      });
      if (moved) {
        const previewsById = new Map(dragPreviews.map((cell) => [
          cell.id,
          { ...cell, ySideUnits: roundPosition(cell.ySideUnits) },
        ]));
        updateDocument(
          (current) => ({
            ...current,
            cells: current.cells.map((cell) => previewsById.get(cell.id) ?? cell),
          }),
          `${dragPreviews.length} cell${dragPreviews.length === 1 ? '' : 's'} moved${snapResult ? `, ${snapLabel(snapResult.kind)} snapped` : ''}`,
        );
      }
    }
    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
    dragRef.current = null;
    setDragPreviews(null);
    setSnapResult(null);
  };

  function moveSelectedCells(requestedColumnDelta: number, requestedYSideUnitsDelta: number) {
    if (!document || !selectedCells.length) return;
    const delta = constrainExpectedGroupDelta(
      selectedCells,
      requestedColumnDelta,
      requestedYSideUnitsDelta,
      document.columnCount,
    );
    if (!delta.columnDelta && !delta.ySideUnitsDelta) return;
    updateDocument(
      (current) => ({
        ...current,
        cells: current.cells.map((cell) => selectedIds.has(cell.id) ? {
          ...cell,
          column: cell.column + delta.columnDelta,
          ySideUnits: roundPosition(cell.ySideUnits + delta.ySideUnitsDelta),
        } : cell),
      }),
      `${selectedCells.length} cell${selectedCells.length === 1 ? '' : 's'} moved together`,
    );
  }

  function replaceCell(nextCell: ExpectedCell, message?: string) {
    updateDocument(
      (current) => ({
        ...current,
        cells: current.cells.map((cell) => cell.id === nextCell.id ? nextCell : cell),
      }),
      message,
    );
  }

  function deleteCells(ids: string[]) {
    const deleting = new Set(ids);
    updateDocument(
      (current) => ({ ...current, cells: current.cells.filter((cell) => !deleting.has(cell.id)) }),
      `${ids.length} cell${ids.length === 1 ? '' : 's'} deleted`,
    );
    selectOnly(null);
  }

  function deleteCell(id: string) { deleteCells([id]); }

  function duplicateCell(cell: ExpectedCell) {
    if (!document) return;
    const copy: ExpectedCell = {
      ...cell,
      id: nextExpectedCellId(document.cells),
      ySideUnits: roundPosition(cell.ySideUnits + 0.5),
      zIndex: Math.max(-1, ...document.cells.map((item) => item.zIndex)) + 1,
      eventId: undefined,
      splitterId: undefined,
      splitteeId: undefined,
    };
    commit({ ...document, cells: [...document.cells, copy] }, `${cell.id} duplicated as ${copy.id}`);
    selectOnly(copy.id);
  }

  const changeColumnCount = (nextCount: number) => {
    const columnCount = clampColumns(nextCount);
    if (columnCount === document.columnCount) return;
    const removed = document.cells.filter((cell) => cell.column > columnCount);
    if (removed.length && !window.confirm(`Remove ${removed.length} cell${removed.length === 1 ? '' : 's'} in the deleted columns?`)) return;
    commit(
      { ...document, columnCount, cells: document.cells.filter((cell) => cell.column <= columnCount) },
      `Layout changed to ${columnCount} columns`,
    );
    setSelectedIds((current) => new Set([...current].filter((id) =>
      document.cells.some((cell) => cell.id === id && cell.column <= columnCount))));
  };

  const createNew = () => {
    if (document.cells.length && !window.confirm('Start a new layout? Download this layout first if you want to keep it.')) return;
    localStorage.removeItem(expectedLayoutStorageKey);
    undoStack.current = [];
    redoStack.current = [];
    setDocument(null);
    selectOnly(null);
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = parseExpectedLayout(JSON.parse(await file.text()));
      commit(parsed, `${parsed.cells.length} cells loaded from ${file.name}`);
      selectOnly(null);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The selected file could not be opened.');
    }
  };

  const selectByEventCondition = () => {
    const matches = expectedCellsMatchingEventId(document.cells, eventComparator, eventThreshold);
    setSelectedIds(new Set(matches.map((cell) => cell.id)));
    setTool('select');
    setNotice(`${matches.length} cell${matches.length === 1 ? '' : 's'} selected where event ID ${eventComparator} ${eventThreshold}`);
  };

  const updateSelectedCells = (
    change: (cell: ExpectedCell) => ExpectedCell,
    message: string,
  ) => {
    updateDocument(
      (current) => ({
        ...current,
        cells: current.cells.map((cell) => selectedIds.has(cell.id) ? change(cell) : cell),
      }),
      message,
    );
  };

  const selectedPoints = selected ? pointsForDisplay(selected, displayGeometry, canvasOriginY) : null;
  const snapPoint = snapResult?.boundary !== undefined && snapResult.targetYSideUnits !== undefined
    ? {
        x: canvasGutterX + snapResult.boundary * displayGeometry.columnWidth,
        y: canvasOriginY + snapResult.targetYSideUnits * displayGeometry.cellSide,
      }
    : null;

  return (
    <main className="expected-editor">
      <header className="expected-header">
        <div className="expected-brand">
          <a href="#/" aria-label="Back to SCOT Braid Studio">←</a>
          <div className="expected-brand-mark" aria-hidden="true"><i /><i /><i /></div>
          <div>
            <p className="expected-kicker">SCOT Braid Studio · ground truth</p>
            <input
              className="expected-title-input"
              aria-label="Layout name"
              value={document.name}
              onChange={(event) => updateDocument((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
        </div>
        <div className="expected-header-actions">
          <span className="expected-save-state"><i /> Saved locally</span>
          <button type="button" className="expected-quiet-button" onClick={() => fileInputRef.current?.click()}>Open JSON</button>
          <button type="button" className="expected-quiet-button" onClick={() => downloadJson(document)}>Download JSON</button>
          <button type="button" className="expected-export-button" onClick={() => downloadSvg(document)}>Export SVG <span>↗</span></button>
          <input ref={fileInputRef} className="expected-visually-hidden" type="file" accept="application/json,.json" onChange={importJson} />
        </div>
      </header>

      <section className="expected-toolstrip" aria-label="Drawing tools">
        <div className="expected-tool-group">
          <button type="button" className={tool === 'select' ? 'is-active' : ''} onClick={() => setTool('select')}><ToolIcon kind="select" /> Select <kbd>V</kbd></button>
          <button type="button" className={tool === 'left' ? 'is-active' : ''} onClick={() => setTool('left')}><ToolIcon kind="left" /> Lean left <kbd>L</kbd></button>
          <button type="button" className={tool === 'right' ? 'is-active' : ''} onClick={() => setTool('right')}><ToolIcon kind="right" /> Lean right <kbd>R</kbd></button>
        </div>
        <div className="expected-tool-divider" />
        <div className="expected-swatch-strip" aria-label="Active cell colour">
          {swatches.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={activeFill === swatch ? 'is-active' : ''}
              style={{ '--swatch': swatch } as React.CSSProperties}
              aria-label={`Use colour ${swatch}`}
              onClick={() => setActiveFill(swatch)}
            />
          ))}
          <label className="expected-custom-colour" title="Choose another colour">
            <span>+</span>
            <input type="color" value={activeFill} onChange={(event) => setActiveFill(event.target.value)} />
          </label>
        </div>
        <div className="expected-tool-spacer" />
        <button type="button" className={`expected-snap-toggle ${snapOn ? 'is-active' : ''}`} aria-pressed={snapOn} onClick={() => setSnapOn((value) => !value)}><span className="expected-magnet">∩</span> Snap <i>{snapOn ? 'on' : 'off'}</i></button>
        <button type="button" className="expected-icon-button" aria-label="Undo" title="Undo" disabled={!undoStack.current.length} onClick={undo}>↶</button>
        <button type="button" className="expected-icon-button" aria-label="Redo" title="Redo" disabled={!redoStack.current.length} onClick={redo}>↷</button>
      </section>

      {importError && <div className="expected-error" role="alert"><b>Could not open layout.</b> {importError}<button type="button" onClick={() => setImportError(null)}>×</button></div>}

      <section className="expected-workbench">
        <aside className="expected-layers" aria-label="Cell list">
          <div className="expected-panel-heading">
            <div><p className="expected-kicker">Placed material</p><h2>Cells</h2></div>
            <span>{document.cells.length}</span>
          </div>
          <div className="expected-layer-list">
            {[...document.cells].sort((a, b) => b.zIndex - a.zIndex).map((cell) => (
              <button
                type="button"
                key={cell.id}
                className={visibleSelectedIds.has(cell.id) ? 'is-selected' : ''}
                onClick={(event) => {
                  if (event.shiftKey || event.metaKey || event.ctrlKey) {
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(cell.id)) next.delete(cell.id); else next.add(cell.id);
                      return next;
                    });
                  } else {
                    selectOnly(cell.id);
                  }
                  setTool('select');
                }}
              >
                <span className={`expected-mini-cell is-${cell.lean}`} style={{ '--cell-fill': cell.fill } as React.CSSProperties} />
                <span>
                  <b>{cell.eventId === undefined ? cell.id : `e${cell.eventId} · ${cell.id}`}</b>
                  <small>{cell.splitterId || cell.splitteeId
                    ? `${cell.splitterId || '—'} → ${cell.splitteeId || '—'}`
                    : `column ${cell.column} · ${cell.lean}`}</small>
                </span>
              </button>
            ))}
            {!document.cells.length && (
              <div className="expected-layer-empty"><span>↙</span><p>No material placed yet.</p><small>Choose a lean tool, then click a column.</small></div>
            )}
          </div>
          <button type="button" className="expected-new-button" onClick={createNew}>＋ New layout</button>
        </aside>

        <section className={`expected-canvas-shell tool-${tool}`} aria-label="Expected finished layout canvas">
          <div className="expected-canvas-ruler">
            <span>{document.columnCount} gap columns</span>
            <span>{Math.round(displayGeometry.cellSide)} display side</span>
            <span>25% view · 30° slant</span>
          </div>
          <div className="expected-canvas-scroll">
            <svg
              ref={svgRef}
              width={canvasWidth}
              height={canvasHeight}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              role="img"
              aria-labelledby="expected-canvas-title expected-canvas-description"
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              onPointerLeave={() => { if (!dragRef.current) setHoverPreview(null); }}
            >
              <title id="expected-canvas-title">Human-authored expected finished layout</title>
              <desc id="expected-canvas-description">Editable gap columns containing left- and right-leaning parallelogram cells.</desc>
              <defs>
                <pattern id="expected-paper-grid" width="18" height="18" patternUnits="userSpaceOnUse">
                  <path d="M 18 0 L 0 0 0 18" fill="none" stroke="#7f6d58" strokeOpacity=".055" strokeWidth="1" />
                </pattern>
                <filter id="expected-cell-shadow" x="-20%" y="-20%" width="140%" height="150%">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#17293d" floodOpacity=".15" />
                </filter>
              </defs>
              <rect width={canvasWidth} height={canvasHeight} fill="#f5ead4" />
              <rect width={canvasWidth} height={canvasHeight} fill="url(#expected-paper-grid)" />

              {Array.from({ length: document.columnCount }, (_, index) => {
                const x = canvasGutterX + index * displayGeometry.columnWidth;
                return (
                  <g key={index} className="expected-column">
                    <rect
                      x={x}
                      y="0"
                      width={displayGeometry.columnWidth}
                      height={canvasHeight}
                      fill={index % 2 ? '#17293d' : '#ffffff'}
                      fillOpacity={index % 2 ? '.018' : '.1'}
                      onPointerDown={handleCanvasPointerDown}
                    />
                    <text x={x + displayGeometry.columnWidth / 2} y="32" textAnchor="middle">{String(index + 1).padStart(2, '0')}</text>
                    <line x1={x} y1="48" x2={x} y2={canvasHeight} />
                    {index === document.columnCount - 1 && <line x1={x + displayGeometry.columnWidth} y1="48" x2={x + displayGeometry.columnWidth} y2={canvasHeight} />}
                  </g>
                );
              })}

              <line className="expected-origin-line" x1={canvasGutterX} y1={canvasOriginY} x2={canvasWidth - canvasGutterX} y2={canvasOriginY} />
              <text className="expected-origin-label" x={canvasGutterX - 13} y={canvasOriginY + 4} textAnchor="end">0</text>

              <g className="expected-cell-layer">
                {orderedCells.map((cell) => {
                  const points = pointsForDisplay(cell, displayGeometry, canvasOriginY);
                  const labelPoint = polygonCentre(points);
                  const isSelected = visibleSelectedIds.has(cell.id);
                  return (
                    <g key={cell.id} className={`expected-cell ${isSelected ? 'is-selected' : ''}`} data-cell-id={cell.id}>
                      <polygon
                        points={pointString(points)}
                        fill={cell.fill}
                        filter={isSelected ? 'url(#expected-cell-shadow)' : undefined}
                        data-event-id={cell.eventId}
                        data-splitter-id={cell.splitterId}
                        data-splittee-id={cell.splitteeId}
                        onPointerDown={(event) => startDrag(event, cell)}
                      />
                      {isSelected && <polygon className="expected-cell-selection" points={pointString(points)} />}
                      <text
                        className="expected-cell-event-label"
                        x={labelPoint.x}
                        y={labelPoint.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        aria-hidden="true"
                      >e{cell.eventId ?? '—'}</text>
                    </g>
                  );
                })}
              </g>

              {hoverPreview && (tool === 'left' || tool === 'right') && (
                <polygon className="expected-add-preview" points={pointString(pointsForDisplay(hoverPreview, displayGeometry, canvasOriginY))} fill={hoverPreview.fill} />
              )}

              {selectedPoints && !dragPreviews && (
                <g className="expected-handles" aria-hidden="true">
                  {sideMidpoints(selectedPoints).map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="6" />)}
                </g>
              )}

              {snapPoint && dragAnchorPreview && (
                <g className="expected-snap-feedback" aria-hidden="true">
                  <line x1={snapPoint.x} y1={snapPoint.y - 34} x2={snapPoint.x} y2={snapPoint.y + 34} />
                  <circle cx={snapPoint.x} cy={snapPoint.y} r="7" />
                  <text x={snapPoint.x + 12} y={snapPoint.y - 12}>{snapLabel(snapResult!.kind)}</text>
                </g>
              )}
              {snapResult?.kind === 'half-side-grid' && dragAnchorPreview && (
                <g className="expected-grid-feedback" aria-hidden="true">
                  <line
                    x1={canvasGutterX + (dragAnchorPreview.column - 1) * displayGeometry.columnWidth}
                    y1={canvasOriginY + dragAnchorPreview.ySideUnits * displayGeometry.cellSide}
                    x2={canvasGutterX + dragAnchorPreview.column * displayGeometry.columnWidth}
                    y2={canvasOriginY + dragAnchorPreview.ySideUnits * displayGeometry.cellSide}
                  />
                  <text
                    x={canvasGutterX + dragAnchorPreview.column * displayGeometry.columnWidth + 10}
                    y={canvasOriginY + dragAnchorPreview.ySideUnits * displayGeometry.cellSide - 8}
                  >½-side grid</text>
                </g>
              )}
              {dragPreviews && dragPreviews.length > 1 && dragAnchorPreview && (() => {
                const centre = polygonCentre(pointsForDisplay(dragAnchorPreview, displayGeometry, canvasOriginY));
                return (
                  <g className="expected-group-drag-badge" aria-hidden="true">
                    <rect x={centre.x - 29} y={centre.y - 45} width="58" height="21" rx="10.5" />
                    <text x={centre.x} y={centre.y - 34} textAnchor="middle" dominantBaseline="central">{dragPreviews.length} cells</text>
                  </g>
                );
              })()}
              {marquee && (() => {
                const bounds = selectionBounds(marquee.start, marquee.current);
                return (
                  <g className="expected-marquee" aria-hidden="true">
                    <rect x={bounds.left} y={bounds.top} width={bounds.width} height={bounds.height} />
                    <text x={bounds.left + 7} y={Math.max(14, bounds.top - 7)}>{visibleSelectedIds.size} selected</text>
                  </g>
                );
              })()}
            </svg>
          </div>
          <footer className="expected-statusbar" aria-live="polite">
            <span><i className={`is-${tool}`} /> {tool === 'select' ? 'Select and move' : `Place ${tool}-leaning cells`}</span>
            <span>{notice}</span>
            <span>{snapOn ? 'Snap · midpoint / endpoint / ½-side' : 'Free placement'}</span>
          </footer>
        </section>

        <aside className="expected-inspector" aria-label="Properties inspector">
          <div className="expected-panel-heading">
            <div><p className="expected-kicker">Exact position</p><h2>Inspector</h2></div>
          </div>

          <section className="expected-selection-filter" aria-labelledby="event-selection-title">
            <div>
              <p className="expected-kicker" id="event-selection-title">Select by condition</p>
              <span>{selectedIds.size} selected</span>
            </div>
            <label>Event ID</label>
            <div className="expected-condition-row">
              <select aria-label="Event ID comparison" value={eventComparator} onChange={(event) => setEventComparator(event.target.value as EventIdComparator)}>
                <option value=">">greater than</option>
                <option value=">=">at least</option>
                <option value="=">equal to</option>
                <option value="<">less than</option>
                <option value="<=">at most</option>
              </select>
              <input aria-label="Event ID threshold" type="number" min="0" step="1" value={eventThreshold} onChange={(event) => setEventThreshold(Math.max(0, Math.round(Number(event.target.value) || 0)))} />
              <button type="button" onClick={selectByEventCondition}>Select</button>
            </div>
            <small>Or drag a rectangle over cell centres. Hold Shift to add to the current selection.</small>
          </section>

          {selectedCells.length > 1 ? (
            <div className="expected-property-stack expected-bulk-selection">
              <div className="expected-selected-heading">
                <span className="expected-multi-mark" aria-hidden="true">◇◇</span>
                <div><b>{selectedCells.length} cells</b><small>Multiple selection</small></div>
              </div>
              <fieldset>
                <legend>Set lean for all</legend>
                <div className="expected-segmented">
                  <button type="button" onClick={() => updateSelectedCells((cell) => ({ ...cell, lean: 'left' }), `${selectedCells.length} cells now lean left`)}>↙ Left</button>
                  <button type="button" onClick={() => updateSelectedCells((cell) => ({ ...cell, lean: 'right' }), `${selectedCells.length} cells now lean right`)}>Right ↘</button>
                </div>
              </fieldset>
              <label className="expected-colour-field">Fill all<span><input type="color" value={selectedCells[0].fill} onChange={(event) => updateSelectedCells((cell) => ({ ...cell, fill: event.target.value }), `${selectedCells.length} cell colours updated`)} /><code>{selectedCells[0].fill.toUpperCase()}</code></span></label>
              <div className="expected-danger-actions">
                <button type="button" onClick={() => selectOnly(null)}>Clear selection</button>
                <button type="button" onClick={() => deleteCells(selectedCells.map((cell) => cell.id))}>Delete selected</button>
              </div>
            </div>
          ) : selected ? (
            <div className="expected-property-stack">
              <div className="expected-selected-heading">
                <span className={`expected-mini-cell is-${selected.lean}`} style={{ '--cell-fill': selected.fill } as React.CSSProperties} />
                <div><b>{selected.id}</b><small>{selected.eventId === undefined ? 'Selected cell' : `Split event ${selected.eventId}`}</small></div>
              </div>
              <fieldset className="expected-event-fields">
                <legend>Split event</legend>
                <label>
                  Event ID
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 12"
                    value={selected.eventId ?? ''}
                    onChange={(event) => replaceCell({
                      ...selected,
                      eventId: event.target.value === '' ? undefined : Math.max(0, Math.round(Number(event.target.value))),
                    }, `${selected.id} event metadata updated`)}
                  />
                </label>
                <div className="expected-event-cords">
                  <label>
                    Splitter
                    <input
                      type="text"
                      placeholder="e.g. C01"
                      value={selected.splitterId ?? ''}
                      onChange={(event) => replaceCell({ ...selected, splitterId: event.target.value || undefined }, `${selected.id} splitter updated`)}
                    />
                  </label>
                  <span aria-hidden="true">→</span>
                  <label>
                    Splittee
                    <input
                      type="text"
                      placeholder="e.g. C02"
                      value={selected.splitteeId ?? ''}
                      onChange={(event) => replaceCell({ ...selected, splitteeId: event.target.value || undefined }, `${selected.id} splittee updated`)}
                    />
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>Lean</legend>
                <div className="expected-segmented">
                  <button type="button" className={selected.lean === 'left' ? 'is-active' : ''} onClick={() => replaceCell({ ...selected, lean: 'left' }, `${selected.id} now leans left`)}>↙ Left</button>
                  <button type="button" className={selected.lean === 'right' ? 'is-active' : ''} onClick={() => replaceCell({ ...selected, lean: 'right' }, `${selected.id} now leans right`)}>Right ↘</button>
                </div>
              </fieldset>
              <div className="expected-field-grid">
                <label>Column<input type="number" min="1" max={document.columnCount} value={selected.column} onChange={(event) => replaceCell({ ...selected, column: Math.max(1, Math.min(document.columnCount, Number(event.target.value))) })} /></label>
                <label>Y · side units<input type="number" min="0" step="0.5" value={roundPosition(selected.ySideUnits)} onChange={(event) => replaceCell({ ...selected, ySideUnits: Math.max(0, Number(event.target.value)) })} /></label>
              </div>
              <label className="expected-colour-field">Fill colour<span><input type="color" value={selected.fill} onChange={(event) => replaceCell({ ...selected, fill: event.target.value })} /><code>{selected.fill.toUpperCase()}</code></span></label>
              <div className="expected-layer-actions">
                <button type="button" onClick={() => replaceCell({ ...selected, zIndex: Math.max(...document.cells.map((cell) => cell.zIndex)) + 1 }, `${selected.id} brought forward`)}>Bring forward</button>
                <button type="button" onClick={() => replaceCell({ ...selected, zIndex: Math.min(...document.cells.map((cell) => cell.zIndex)) - 1 }, `${selected.id} sent backward`)}>Send backward</button>
              </div>
              <div className="expected-danger-actions">
                <button type="button" onClick={() => duplicateCell(selected)}>Duplicate</button>
                <button type="button" onClick={() => deleteCell(selected.id)}>Delete</button>
              </div>
              <p className="expected-key-hint">Arrow keys move by ½ side. Hold Shift for 0.1 or Option for 0.01.</p>
            </div>
          ) : (
            <div className="expected-inspector-empty"><span>◇</span><p>Select a cell to edit its exact placement.</p></div>
          )}

          <section className="expected-document-settings">
            <p className="expected-kicker">Document</p>
            <label>Columns<input type="number" min="1" max="64" value={document.columnCount} onChange={(event) => changeColumnCount(Number(event.target.value))} /></label>
            <dl>
              <div><dt>Column width</dt><dd>{geometry.columnWidth}</dd></div>
              <div><dt>Side length</dt><dd>{geometry.cellSide.toFixed(2)}</dd></div>
              <div><dt>Half-side</dt><dd>{geometry.halfSide.toFixed(2)}</dd></div>
            </dl>
          </section>
        </aside>
      </section>
    </main>
  );
}

function ToolIcon({ kind }: { kind: Tool }) {
  if (kind === 'select') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 2 11 9-6 .7L6 17Z" /></svg>;
  return <span className={`expected-tool-cell is-${kind}`} aria-hidden="true" />;
}

function pointsForDisplay(
  cell: ExpectedCell,
  geometry: ReturnType<typeof expectedGeometry>,
  originY: number,
) {
  return expectedCellPoints(cell, geometry).map((point) => ({
    x: point.x + canvasGutterX,
    y: point.y + originY,
  })) as [ExpectedPoint, ExpectedPoint, ExpectedPoint, ExpectedPoint];
}

function pointString(points: ExpectedPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function polygonCentre(points: ExpectedPoint[]) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function selectionBounds(start: ExpectedPoint, end: ExpectedPoint) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  return {
    left,
    top,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function pointInsideBounds(point: ExpectedPoint, bounds: ReturnType<typeof selectionBounds>) {
  return point.x >= bounds.left && point.x <= bounds.left + bounds.width
    && point.y >= bounds.top && point.y <= bounds.top + bounds.height;
}

function sideMidpoints(points: [ExpectedPoint, ExpectedPoint, ExpectedPoint, ExpectedPoint]) {
  const byX = new Map<number, ExpectedPoint[]>();
  for (const point of points) byX.set(point.x, [...(byX.get(point.x) ?? []), point]);
  return [...byX.values()].map((side) => ({
    x: side[0].x,
    y: (side[0].y + side[1].y) / 2,
  }));
}

function columnAt(x: number, columnCount: number, columnWidth: number) {
  const index = Math.floor((x - canvasGutterX) / columnWidth);
  return index >= 0 && index < columnCount ? index + 1 : null;
}

function snapLabel(kind: SnapResult['kind']) {
  return kind === 'half-side-grid' ? '½-side grid' : kind;
}

function roundPosition(value: number) {
  return Number(value.toFixed(4));
}

function clampColumns(value: number) {
  return Math.min(64, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));
}

function loadSavedDocument(): ExpectedLayoutDocument | null {
  try {
    const saved = localStorage.getItem(expectedLayoutStorageKey);
    return saved ? parseExpectedLayout(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

function downloadJson(document: ExpectedLayoutDocument) {
  downloadBlob(
    `${safeFileName(document.name)}.json`,
    JSON.stringify(document, null, 2),
    'application/json',
  );
}

function downloadSvg(document: ExpectedLayoutDocument) {
  const geometry = expectedGeometry(document.geometry);
  const points = document.cells.flatMap((cell) => expectedCellPoints(cell, geometry));
  const padding = 24;
  const minX = points.length ? Math.min(...points.map((point) => point.x)) : 0;
  const maxX = points.length ? Math.max(...points.map((point) => point.x)) : document.columnCount * geometry.columnWidth;
  const minY = points.length ? Math.min(...points.map((point) => point.y)) : 0;
  const maxY = points.length ? Math.max(...points.map((point) => point.y)) : 240;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const polygons = [...document.cells]
    .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))
    .map((cell) => {
      const shifted = expectedCellPoints(cell, geometry).map((point) => ({
        x: point.x - minX + padding,
        y: point.y - minY + padding,
      }));
      const eventAttributes = [
        cell.eventId === undefined ? '' : ` data-event-id="${cell.eventId}"`,
        cell.splitterId ? ` data-splitter-id="${escapeXml(cell.splitterId)}"` : '',
        cell.splitteeId ? ` data-splittee-id="${escapeXml(cell.splitteeId)}"` : '',
      ].join('');
      return `  <polygon id="${escapeXml(cell.id)}"${eventAttributes} points="${pointString(shifted)}" fill="${escapeXml(cell.fill)}" stroke="#17293d" stroke-width="0.8" stroke-linejoin="miter" />`;
    })
    .join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(document.name)}</title>
  <desc id="desc">Human-authored expected finished layout with ${document.cells.length} cells across ${document.columnCount} columns.</desc>
${polygons}
</svg>\n`;
  downloadBlob(`${safeFileName(document.name)}.svg`, svg, 'image/svg+xml');
}

function downloadBlob(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'expected-layout';
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character] ?? character);
}
