import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { savedPatternKey } from './App';
import {
  addSlot,
  applyColourway,
  colourwayStorageKey,
  defaultSwatches,
  fillAll,
  mirror,
  mirrorIndex,
  paintCords,
  removeSlot,
  replaceSlot,
  setSwatch,
  slotCounts,
  swapSlots,
  validateColourway,
} from './domain/colourway';
import type { Colourway } from './domain/colourway';
import { findFullCycle } from './domain/cycle';
import { buildFinishedLayoutV2 } from './domain/finishedLayoutV2';
import { buildFinishedSurfaces } from './domain/finishedSurface';
import { parsePattern } from './domain/parser';
import { cordIdFor, simulatePattern } from './domain/simulate';
import type { Face } from './domain/types';
import { colourwayTemplates, defaultColourwayTemplate } from './examples/colourwayTemplates';
import type { ColourwayTemplate } from './examples/colourwayTemplates';
import { samplePatterns } from './examples';
import { isHex, normaliseColourway, readableTextOn } from './ui/colour';
import { downloadTextFile, safeFileName } from './ui/download';
import FinishedChart from './ui/FinishedChart';
import './colourwayDesigner.css';

const theta = 30;
const tipAngle = 30;
/** The studio defaults first, then a spread of yarn-like colours. */
const suggestedSwatches = [
  ...defaultSwatches,
  '#17293d', '#f5e9cd', '#8c3b2e', '#2f5a3c', '#3b5b8a', '#e4c15a', '#b57ba6', '#7a5230', '#9aa5a8', '#c2472f',
];

type StoredDesign = { presetName: string | null; colourway: Colourway };
type PaintGesture = { before: Colourway; painted: Set<number>; changed: boolean };

export default function ColourwayDesigner() {
  const [templateId] = useState(defaultColourwayTemplate.id);
  const template = colourwayTemplates.find((item) => item.id === templateId) ?? defaultColourwayTemplate;
  const sample = samplePatterns.find((item) => item.id === template.sampleId) ?? samplePatterns[0];
  const cordCount = template.presets[0].cords.length;

  const [screen, setScreen] = useState<'pick' | 'paint'>('pick');
  const [presetName, setPresetName] = useState<string | null>(null);
  const [colourway, setColourway] = useState<Colourway>(() => normaliseColourway(template.presets[0]));
  const [activeSymbol, setActiveSymbol] = useState(template.presets[0].cords[0]);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [face, setFace] = useState<Face>('front');
  const [lengthMultiplier, setLengthMultiplier] = useState<1 | 2>(1);
  const [symmetryLock, setSymmetryLock] = useState(false);
  const [highlightCordId, setHighlightCordId] = useState<string | null>(null);
  const [focusedCord, setFocusedCord] = useState(0);
  const [notice, setNotice] = useState('');
  const [resumable] = useState<StoredDesign | null>(() => loadStoredDesign(template));
  const undoStack = useRef<Colourway[]>([]);
  const redoStack = useRef<Colourway[]>([]);
  const gestureRef = useRef<PaintGesture | null>(null);
  const swatchDragging = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);
  /** The committed design as of the last render, for handlers that fire faster than React re-renders. */
  const latest = useRef(colourway);
  latest.current = colourway;

  const structure = useMemo(() => buildStructure(sample.source, lengthMultiplier), [sample.source, lengthMultiplier]);
  const baseStructure = useMemo(() => (lengthMultiplier === 1 ? structure : buildStructure(sample.source, 1)), [sample.source, lengthMultiplier, structure]);
  const colorFor = (cordId: string) => colourway.palette[colourway.cords[Number(cordId.slice(1)) - 1]] ?? '#d3a448';
  const source = useMemo(() => applyColourway(sample.source, colourway), [sample.source, colourway]);
  const counts = slotCounts(colourway);
  const symbols = [...counts.keys()];
  const activePreset = template.presets.find((preset) => preset.name === presetName);
  const unchanged = activePreset !== undefined && sameColourway(normaliseColourway(activePreset), colourway);

  const pushHistory = (before: Colourway) => {
    undoStack.current = [...undoStack.current.slice(-99), before];
    redoStack.current = [];
  };
  const commit = (next: Colourway, message: string) => {
    if (sameColourway(next, colourway)) { setNotice(message); return; }
    pushHistory(colourway);
    setColourway(next);
    setNotice(message);
  };
  const undo = () => {
    const previous = undoStack.current.at(-1);
    if (!previous) return;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [colourway, ...redoStack.current].slice(0, 100);
    setColourway(previous);
    setNotice('Undid the last change');
  };
  const redo = () => {
    const next = redoStack.current[0];
    if (!next) return;
    redoStack.current = redoStack.current.slice(1);
    undoStack.current = [...undoStack.current, colourway].slice(-100);
    setColourway(next);
    setNotice('Redid the change');
  };

  const load = (design: Colourway, name: string | null, message: string) => {
    undoStack.current = [];
    redoStack.current = [];
    // The working design is the user's own: the preset it started from is tracked separately.
    const { name: _presetName, ...working } = normaliseColourway(design);
    setColourway(working);
    setPresetName(name);
    setActiveSymbol(design.cords[0]);
    setEditingSymbol(null);
    setHighlightCordId(null);
    setScreen('paint');
    setNotice(message);
  };

  useEffect(() => {
    if (screen !== 'paint') return;
    const stored: StoredDesign = { presetName, colourway };
    localStorage.setItem(colourwayStorageKey(template.id), JSON.stringify(stored));
  }, [screen, presetName, colourway, template.id]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Colour a pattern · SCOT Braid Studio';
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    if (!(activeSymbol in colourway.palette)) setActiveSymbol(symbols[0]);
  }, [activeSymbol, colourway.palette, symbols]);

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
      if (event.key === 'Escape' && !typing) {
        setEditingSymbol(null);
        setHighlightCordId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const targetsFor = (index: number) => (symmetryLock ? [...new Set([index, mirrorIndex(cordCount, index)])] : [index]);

  /** Paint during a pointer gesture without recording history; the gesture end records it once. */
  const paintLive = (index: number) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const targets = targetsFor(index);
    if (targets.every((target) => gesture.painted.has(target))) return;
    targets.forEach((target) => gesture.painted.add(target));
    if (targets.some((target) => latest.current.cords[target] !== activeSymbol)) gesture.changed = true;
    latest.current = paintCords(latest.current, targets, activeSymbol);
    setColourway(latest.current);
    setHighlightCordId(cordIdFor(index));
  };
  const beginGesture = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    gestureRef.current = { before: latest.current, painted: new Set(), changed: false };
    // Capture keeps the sweep alive when the pointer leaves the strip; painting must not depend on it.
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic or already-released pointer */ }
    event.currentTarget.focus();
    setFocusedCord(index);
    paintLive(index);
  };
  const moveGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gestureRef.current) return;
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-cord]');
    if (element?.dataset.cord !== undefined) paintLive(Number(element.dataset.cord));
  };
  const endGesture = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture) return;
    if (gesture.changed) pushHistory(gesture.before);
    const painted = [...gesture.painted].sort((a, b) => a - b);
    setNotice(painted.length === 1
      ? `Cord ${painted[0] + 1} painted ${activeSymbol}`
      : `Cords ${painted.map((index) => index + 1).join(', ')} painted ${activeSymbol}`);
  };
  const paintFromKeyboard = (index: number, symbol: string) => {
    commit(paintCords(colourway, targetsFor(index), symbol), `Cord ${index + 1} painted ${symbol}`);
    setHighlightCordId(cordIdFor(index));
  };

  const handleStripKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(stripRef.current?.querySelectorAll<HTMLButtonElement>('[data-cord]') ?? [])];
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      event.preventDefault();
      const next = (focusedCord + step + cordCount) % cordCount;
      buttons[next]?.focus();
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : cordCount - 1]?.focus();
      return;
    }
    const symbol = event.key.length === 1 ? event.key.toUpperCase() : '';
    if (symbol && symbol in colourway.palette && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      setActiveSymbol(symbol);
      paintFromKeyboard(focusedCord, symbol);
    }
  };

  const handlePaletteKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-slot]')];
    const current = buttons.findIndex((button) => button === document.activeElement);
    if (current < 0) return;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      event.preventDefault();
      buttons[(current + step + buttons.length) % buttons.length]?.focus();
      return;
    }
    if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      const symbol = buttons[current].dataset.slot;
      if (symbol) { setActiveSymbol(symbol); setEditingSymbol(symbol); }
    }
  };

  const chooseSlot = (symbol: string) => {
    if (symbol === activeSymbol) {
      setEditingSymbol((current) => (current === symbol ? null : symbol));
      return;
    }
    setActiveSymbol(symbol);
    setNotice(`Painting with ${symbol}`);
  };
  const addColour = () => {
    const added = addSlot(colourway);
    if (!added) return;
    commit(added.colourway, `Added colour ${added.symbol}`);
    setActiveSymbol(added.symbol);
    setEditingSymbol(added.symbol);
  };
  const removeColour = (symbol: string) => {
    const next = removeSlot(colourway, symbol);
    if (!next) return;
    commit(next, `Removed colour ${symbol}`);
    setEditingSymbol(null);
  };
  const replaceColour = (from: string, to: string) => {
    commit(replaceSlot(colourway, from, to), `Replaced ${from} with ${to} on ${counts.get(from) ?? 0} cords`);
    setEditingSymbol(null);
  };
  /** A picker drag is one undo step: history is taken when it starts, values stream in, `settled` closes it. */
  const changeSwatch = (symbol: string, swatch: string, settled: boolean) => {
    if (settled) {
      if (swatchDragging.current) {
        swatchDragging.current = false;
        setNotice(`Slot ${symbol} changed to ${latest.current.palette[symbol]}`);
        return;
      }
      commit(setSwatch(colourway, symbol, swatch), `Slot ${symbol} changed to ${swatch}`);
      return;
    }
    if (latest.current.palette[symbol] === swatch) return;
    if (!swatchDragging.current) {
      swatchDragging.current = true;
      pushHistory(latest.current);
    }
    latest.current = setSwatch(latest.current, symbol, swatch);
    setColourway(latest.current);
  };

  const openInStudio = () => {
    localStorage.setItem(savedPatternKey, source);
    window.location.hash = '#/';
  };
  const download = () => {
    const label = unchanged && presetName ? presetName : 'custom';
    downloadTextFile(`${template.id}-${safeFileName(label)}.scot`, source);
    setNotice('Downloaded the pattern');
  };

  if (screen === 'pick') {
    return (
      <main className="cw-designer cw-designer--pick">
        <header className="cw-header">
          <a className="cw-back" href="#/" aria-label="Back to SCOT Braid Studio">←</a>
          <div>
            <p className="cw-kicker">SCOT Braid Studio · colouring book</p>
            <h1>Colour a pattern</h1>
          </div>
        </header>
        <section className="cw-pick" aria-label="Choose a template and a starting colourway">
          <p className="cw-lede">Pick a braid whose structure is already worked out, then choose the colours yourself. No notation needed — paint the cords and watch the braid change.</p>
          {colourwayTemplates.map((item) => (
            <article key={item.id} className="cw-template" aria-labelledby={`template-${item.id}`}>
              <div className="cw-template-heading">
                <p className="cw-kicker">Template</p>
                <h2 id={`template-${item.id}`}>{item.name}</h2>
                <p>{item.description}</p>
              </div>
              <div className="cw-presets">
                {resumable && item.id === template.id && (
                  <button type="button" className="cw-preset cw-preset--resume" onClick={() => load(resumable.colourway, resumable.presetName, 'Continued your saved colourway')}>
                    <span className="cw-thumb"><PresetThumbnail structure={baseStructure} colourway={resumable.colourway} idPrefix="thumb-resume" /></span>
                    <span className="cw-preset-name">Continue where you left off</span>
                    <span className="cw-preset-note">Saved in this browser{resumable.presetName ? ` · started from ${resumable.presetName}` : ''}</span>
                  </button>
                )}
                {item.presets.map((preset, index) => (
                  <button key={preset.name ?? index} type="button" className="cw-preset" onClick={() => load(preset, preset.name ?? null, `Loaded the ${preset.name} colourway`)}>
                    <span className="cw-thumb"><PresetThumbnail structure={baseStructure} colourway={preset} idPrefix={`thumb-${item.id}-${index}`} /></span>
                    <span className="cw-preset-name">{preset.name}</span>
                    <span className="cw-preset-note">{preset.cords.join('')}</span>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </section>
        <p className="cw-live" aria-live="polite">{notice}</p>
      </main>
    );
  }

  const editingSwatch = editingSymbol ? colourway.palette[editingSymbol] : undefined;
  const otherSymbols = (symbol: string) => symbols.filter((item) => item !== symbol);

  return (
    <main className="cw-designer">
      <header className="cw-header">
        <a className="cw-back" href="#/" aria-label="Back to SCOT Braid Studio">←</a>
        <div className="cw-title">
          <p className="cw-kicker">SCOT Braid Studio · colouring book</p>
          <h1>{template.name}</h1>
        </div>
        <div className="cw-header-actions">
          <button type="button" className="cw-quiet-button" onClick={() => setScreen('pick')}>Change colourway</button>
          <span className="cw-save-state"><i /> Saved locally</span>
        </div>
      </header>

      <section className="cw-workbench">
        <div className="cw-stage">
          <div className="cw-stage-bar">
            <p className="cw-kicker">Your braid</p>
            <div className="cw-toggle-group" aria-label="Face">
              <button type="button" className={face === 'front' ? 'is-active' : ''} aria-pressed={face === 'front'} onClick={() => setFace('front')}>Front</button>
              <button type="button" className={face === 'back' ? 'is-active' : ''} aria-pressed={face === 'back'} onClick={() => setFace('back')}>Back</button>
            </div>
            <div className="cw-toggle-group" aria-label="Preview length">
              <button type="button" className={lengthMultiplier === 1 ? 'is-active' : ''} aria-pressed={lengthMultiplier === 1} onClick={() => setLengthMultiplier(1)}>Full cycle</button>
              <button type="button" className={lengthMultiplier === 2 ? 'is-active' : ''} aria-pressed={lengthMultiplier === 2} onClick={() => setLengthMultiplier(2)}>×2</button>
            </div>
          </div>
          <div className="cw-preview">
            <FinishedChart
              layout={structure.layout}
              surfaces={structure.surfaces}
              colorFor={colorFor}
              mirrorFace={face}
              idPrefix="cw-chart"
              title={`${template.name}, ${face} face`}
              description={`${describeNeeds(colourway, counts)} Starting order: ${describeOrder(colourway)}.`}
              highlightCordId={highlightCordId}
              onCellClick={(cell) => {
                const index = Number(cell.event.splitteeId.slice(1)) - 1;
                setHighlightCordId(cell.event.splitteeId);
                setFocusedCord(index);
                commit(paintCords(colourway, targetsFor(index), activeSymbol), `Cord ${index + 1} painted ${activeSymbol}`);
              }}
            />
          </div>
          <p className="cw-stage-note">{structure.repeats} repeats · {structure.simulation.totalRows} rows · tap the braid to paint the cord under your finger with {activeSymbol}</p>
        </div>

        <div className="cw-paintbar">
          <div className="cw-strip-heading">
            <p className="cw-kicker">Cords, left to right</p>
            <label className="cw-lock">
              <input type="checkbox" checked={symmetryLock} onChange={(event) => setSymmetryLock(event.target.checked)} />
              Symmetry lock
            </label>
          </div>
          <div
            ref={stripRef}
            className="cw-strip"
            role="toolbar"
            aria-label="Cords in starting order — tap to paint with the active colour"
            onKeyDown={handleStripKeyDown}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          >
            {colourway.cords.map((symbol, index) => {
              const swatch = colourway.palette[symbol] ?? '#d3a448';
              const cordId = cordIdFor(index);
              return (
                <button
                  key={cordId}
                  type="button"
                  className={`cw-cord${highlightCordId === cordId ? ' is-highlighted' : ''}`}
                  data-cord={index}
                  tabIndex={index === focusedCord ? 0 : -1}
                  aria-label={`Cord ${index + 1}, colour ${symbol}`}
                  style={{ backgroundColor: swatch, color: readableTextOn(swatch) }}
                  onPointerDown={(event) => beginGesture(index, event)}
                  onClick={(event) => { if (event.detail === 0) paintFromKeyboard(index, activeSymbol); }}
                  onFocus={() => setFocusedCord(index)}
                >
                  <span className="cw-cord-number">{index + 1}</span>
                  <span className="cw-cord-letter">{symbol}</span>
                </button>
              );
            })}
          </div>

          <div className="cw-palette-heading">
            <p className="cw-kicker">Colours</p>
            <span className="cw-palette-hint">Painting with <b>{activeSymbol}</b> · tap it again to edit</span>
          </div>
          <div className="cw-palette" onKeyDown={handlePaletteKeyDown}>
            {symbols.map((symbol) => {
              const swatch = colourway.palette[symbol];
              const count = counts.get(symbol) ?? 0;
              return (
                <button
                  key={symbol}
                  type="button"
                  className={`cw-slot${symbol === activeSymbol ? ' is-active' : ''}${symbol === editingSymbol ? ' is-editing' : ''}`}
                  data-slot={symbol}
                  aria-pressed={symbol === activeSymbol}
                  aria-label={`Colour ${symbol}, ${swatch}, ${count === 1 ? '1 cord' : `${count} cords`}${symbol === activeSymbol ? ', active' : ''}`}
                  onClick={() => chooseSlot(symbol)}
                >
                  <span className="cw-slot-swatch" style={{ backgroundColor: swatch, color: readableTextOn(swatch) }}>{symbol}</span>
                  <span className="cw-slot-count">{count ? `× ${count}` : 'unused'}</span>
                </button>
              );
            })}
            <button type="button" className="cw-slot cw-slot--add" onClick={addColour} disabled={symbols.length >= 26} title={symbols.length >= 26 ? 'All 26 letters are in use' : 'Add a colour'}>
              <span className="cw-slot-swatch">+</span>
              <span className="cw-slot-count">Add</span>
            </button>
          </div>
        </div>

        <div className="cw-controls">
          {editingSymbol && editingSwatch && (
            <SlotEditor
              key={editingSymbol}
              symbol={editingSymbol}
              swatch={editingSwatch}
              count={counts.get(editingSymbol) ?? 0}
              canRemove={symbols.length > 1}
              others={otherSymbols(editingSymbol)}
              onSwatch={(swatch, record) => changeSwatch(editingSymbol, swatch, record)}
              onRemove={() => removeColour(editingSymbol)}
              onReplace={(to) => replaceColour(editingSymbol, to)}
              onClose={() => setEditingSymbol(null)}
            />
          )}

          <section className="cw-panel" aria-labelledby="cw-helpers-title">
            <p className="cw-kicker" id="cw-helpers-title">Quick moves</p>
            <div className="cw-helpers">
              <button type="button" className="cw-quiet-button" onClick={() => commit(mirror(colourway, 'left'), 'Mirrored left onto right')}>Mirror →</button>
              <button type="button" className="cw-quiet-button" onClick={() => commit(mirror(colourway, 'right'), 'Mirrored right onto left')}>← Mirror</button>
              <button type="button" className="cw-quiet-button" onClick={() => commit(fillAll(colourway, activeSymbol), `Filled every cord with ${activeSymbol}`)}>Fill all with {activeSymbol}</button>
              <label className="cw-swap">
                <span>Swap {activeSymbol} with</span>
                <select
                  aria-label={`Swap ${activeSymbol} with`}
                  value=""
                  disabled={symbols.length < 2}
                  onChange={(event) => {
                    const other = event.target.value;
                    if (other) commit(swapSlots(colourway, activeSymbol, other), `Swapped ${activeSymbol} and ${other}`);
                  }}
                >
                  <option value="">…</option>
                  {otherSymbols(activeSymbol).map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                </select>
              </label>
              <button type="button" className="cw-quiet-button" disabled={!activePreset || unchanged} onClick={() => activePreset && commit(normaliseColourway(activePreset), `Reset to ${activePreset.name}`)}>Reset to {presetName ?? 'preset'}</button>
            </div>
          </section>

          <section className="cw-panel" aria-labelledby="cw-setup-title">
            <p className="cw-kicker" id="cw-setup-title">Cord setup</p>
            <h2>You will need</h2>
            <ul className="cw-needs">
              {symbols.filter((symbol) => (counts.get(symbol) ?? 0) > 0).map((symbol) => (
                <li key={symbol}>
                  <span className="cw-needs-swatch" style={{ backgroundColor: colourway.palette[symbol], color: readableTextOn(colourway.palette[symbol]) }}>{symbol}</span>
                  <code>{colourway.palette[symbol]}</code>
                  <b>{counts.get(symbol)} {counts.get(symbol) === 1 ? 'cord' : 'cords'}</b>
                </li>
              ))}
            </ul>
            <h2>Starting order</h2>
            <p className="cw-order">{describeOrder(colourway)}</p>
          </section>

          <details className="cw-disclosure">
            <summary>Show pattern text</summary>
            <pre>{source}</pre>
            <p className="cw-fine">This is the <code>.scot</code> file the designer writes: the template's rows with your <code>color:</code> and <code>palette:</code> lines.</p>
          </details>
        </div>
      </section>

      <footer className="cw-footer">
        <div className="cw-history">
          <button type="button" className="cw-icon-button" aria-label="Undo" title="Undo (⌘Z)" disabled={!undoStack.current.length} onClick={undo}>↶</button>
          <button type="button" className="cw-icon-button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!redoStack.current.length} onClick={redo}>↷</button>
        </div>
        <p className="cw-live" aria-live="polite">{notice}</p>
        <div className="cw-footer-actions">
          <button type="button" className="cw-quiet-button" onClick={download}>Download .scot <span aria-hidden="true">↓</span></button>
          <button type="button" className="cw-primary-button" onClick={openInStudio}>Open in studio <span aria-hidden="true">↗</span></button>
        </div>
      </footer>
    </main>
  );
}

function SlotEditor({ symbol, swatch, count, canRemove, others, onSwatch, onRemove, onReplace, onClose }: {
  symbol: string;
  swatch: string;
  count: number;
  canRemove: boolean;
  others: string[];
  /** `settled` is false while the native picker streams values, true once a value is final. */
  onSwatch: (swatch: string, settled: boolean) => void;
  onRemove: () => void;
  onReplace: (to: string) => void;
  onClose: () => void;
}) {
  const [hexDraft, setHexDraft] = useState(swatch);
  const [replaceWith, setReplaceWith] = useState(others[0] ?? '');
  const colorInputRef = useRef<HTMLInputElement>(null);
  const pickerOpen = useRef(false);

  useEffect(() => { setHexDraft(swatch); }, [swatch]);

  // The native picker fires `input` while dragging and `change` when it settles; React folds both into
  // onChange, so the settled value is caught natively to close the one undo step the drag makes.
  useEffect(() => {
    const input = colorInputRef.current;
    if (!input) return;
    const settle = () => { pickerOpen.current = false; onSwatch(input.value, true); };
    input.addEventListener('change', settle);
    return () => input.removeEventListener('change', settle);
  });

  const commitHex = () => {
    const value = hexDraft.trim().toLowerCase();
    if (isHex(value)) onSwatch(value, true);
    else setHexDraft(swatch);
  };

  return (
    <section className="cw-panel cw-slot-editor" aria-labelledby="cw-slot-editor-title">
      <div className="cw-slot-editor-heading">
        <div>
          <p className="cw-kicker">Edit colour</p>
          <h2 id="cw-slot-editor-title">{symbol} <span style={{ backgroundColor: swatch }} aria-hidden="true" /> {count ? `on ${count} ${count === 1 ? 'cord' : 'cords'}` : 'unused'}</h2>
        </div>
        <button type="button" className="cw-icon-button" aria-label="Close colour editor" onClick={onClose}>×</button>
      </div>
      <div className="cw-slot-editor-row">
        <label className="cw-picker">
          <span>Pick</span>
          <input
            ref={colorInputRef}
            type="color"
            value={swatch}
            aria-label={`Colour for ${symbol}`}
            onChange={(event) => {
              pickerOpen.current = true;
              onSwatch(event.target.value, false);
            }}
            onBlur={() => { if (pickerOpen.current) { pickerOpen.current = false; onSwatch(colorInputRef.current?.value ?? swatch, true); } }}
          />
        </label>
        <label className="cw-hex">
          <span>Hex</span>
          <input
            type="text"
            inputMode="text"
            spellCheck={false}
            value={hexDraft}
            aria-label={`Hex value for ${symbol}`}
            aria-invalid={!isHex(hexDraft.trim())}
            onChange={(event) => setHexDraft(event.target.value)}
            onBlur={commitHex}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitHex(); } }}
          />
        </label>
      </div>
      <p className="cw-kicker">Suggested</p>
      <div className="cw-suggested" role="group" aria-label={`Suggested colours for ${symbol}`}>
        {suggestedSwatches.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className={suggestion === swatch ? 'is-active' : ''}
            aria-label={suggestion}
            aria-pressed={suggestion === swatch}
            style={{ backgroundColor: suggestion }}
            onClick={() => onSwatch(suggestion, true)}
          />
        ))}
      </div>
      <div className="cw-slot-editor-actions">
        {count === 0 ? (
          <button type="button" className="cw-quiet-button" disabled={!canRemove} onClick={onRemove}>Remove {symbol}</button>
        ) : (
          <label className="cw-replace">
            <span>Replace {symbol} with</span>
            <select value={replaceWith} aria-label={`Replace ${symbol} with`} disabled={!others.length} onChange={(event) => setReplaceWith(event.target.value)}>
              {others.map((other) => <option key={other} value={other}>{other}</option>)}
            </select>
            <button type="button" className="cw-quiet-button" disabled={!replaceWith} onClick={() => onReplace(replaceWith)}>Replace</button>
          </label>
        )}
      </div>
    </section>
  );
}

function PresetThumbnail({ structure, colourway, idPrefix }: { structure: Structure; colourway: Colourway; idPrefix: string }) {
  const colorFor = (cordId: string) => colourway.palette[colourway.cords[Number(cordId.slice(1)) - 1]] ?? '#d3a448';
  return (
    <FinishedChart
      layout={structure.layout}
      surfaces={structure.surfaces}
      colorFor={colorFor}
      mirrorFace="front"
      idPrefix={idPrefix}
      title={`${colourway.name ?? 'Saved'} colourway`}
      description={`Starting order ${colourway.cords.join('')}.`}
    />
  );
}

type Structure = ReturnType<typeof buildStructure>;

/** Rows never change in the designer, so the geometry is built once per template and length. */
function buildStructure(source: string, multiplier: 1 | 2) {
  const parsed = parsePattern(source);
  if (!parsed.pattern) throw new Error('The template pattern does not parse.');
  const cycle = findFullCycle(parsed.pattern);
  const repeats = (cycle?.repeats ?? 4) * multiplier;
  const simulation = simulatePattern(parsed.pattern, repeats);
  const layout = buildFinishedLayoutV2(simulation, { theta, tipAngle });
  const surfaces = buildFinishedSurfaces(layout.cells, { enabled: true });
  return { cycle, repeats, simulation, layout, surfaces };
}

function loadStoredDesign(template: ColourwayTemplate): StoredDesign | null {
  try {
    const raw = localStorage.getItem(colourwayStorageKey(template.id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { presetName?: unknown; colourway?: unknown };
    const colourway = validateColourway(parsed.colourway, template.presets[0].cords.length);
    if (!colourway) {
      console.warn('Ignoring a saved colourway that no longer fits the template.');
      return null;
    }
    return { presetName: typeof parsed.presetName === 'string' ? parsed.presetName : null, colourway };
  } catch (error) {
    console.warn('Ignoring an unreadable saved colourway.', error);
    return null;
  }
}

function sameColourway(a: Colourway, b: Colourway): boolean {
  if (a.cords.join('') !== b.cords.join('')) return false;
  const keysA = Object.keys(a.palette).sort();
  const keysB = Object.keys(b.palette).sort();
  return keysA.length === keysB.length && keysA.every((key, index) => key === keysB[index] && a.palette[key] === b.palette[key]);
}

function describeOrder(colourway: Colourway): string {
  return colourway.cords.map((symbol, index) => `${index + 1} ${symbol}`).join(' · ');
}

function describeNeeds(colourway: Colourway, counts: Map<string, number>): string {
  const parts = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([symbol, count]) => `${count} ${count === 1 ? 'cord' : 'cords'} of ${symbol} (${colourway.palette[symbol]})`);
  return `You will need ${parts.join(', ')}.`;
}
