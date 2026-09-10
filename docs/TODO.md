# TODO / Improvement Ideas

> A running list of ideas for improving SCOT Braid Studio. Nothing here is committed —
> it's a backlog to pull from, not a roadmap. Add to it freely; strike items out or
> delete them once done rather than letting them go stale.

## Scoring method

Each item below is tagged `Impact I, Effort E → P`:

- **Impact (1–5):** how much the item moves the app toward its core purpose (correctly
  designing and following real ply-split patterns) or removes real friction, from
  "nice to have" (1) to "core capability currently missing/broken" (5).
- **Effort (1–5):** rough implementation cost, from "an evening" (1) to "touches the
  simulation model and several views, needs new tests" (5).
- **Priority = Impact ÷ Effort**, rounded to two decimals. Higher sorts first — cheap,
  high-value work floats to the top; expensive, lower-value work sinks.

These are starting estimates, not settled — re-score anything that turns out easier or
harder than it looks once you're in the code, and re-sort before picking the next
piece of work.

## Priority ranking

| Priority | Item | Section | Impact | Effort |
| --- | --- | --- | --- | --- |
| 3.00 | In-app notation help panel | Samples & docs | 3 | 1 |
| 2.00 | Keyboard shortcuts | Editor & interaction | 2 | 1 |
| 2.00 | Shareable URL | Sharing & persistence | 4 | 2 |
| 2.00 | Export to PNG/PDF | Sharing & persistence | 4 | 2 |
| 2.00 | Grow examples | Samples & docs | 2 | 1 |
| 1.67 | Step-by-step playback | Visualization | 5 | 3 |
| 1.50 | Pattern validation messages | Pattern language & simulation | 3 | 2 |
| 1.50 | Side-by-side front/back comparison | Visualization | 3 | 2 |
| 1.50 | Print-friendly / high-contrast view | Visualization | 3 | 2 |
| 1.50 | Expand test coverage | Engineering | 3 | 2 |
| 1.25 | Better rules/constraints for Finished view | Visualization | 5 | 4 |
| 1.00 | Twists | Pattern language & simulation | 4 | 4 |
| 1.00 | Finishing techniques annotation | Pattern language & simulation | 2 | 2 |
| 1.00 | Reconcile Finished v1/v2/dev | Visualization | 3 | 3 |
| 1.00 | Undo/redo | Editor & interaction | 3 | 3 |
| 1.00 | Inline lane hints while typing | Editor & interaction | 3 | 3 |
| 1.00 | Named saved patterns | Sharing & persistence | 3 | 3 |
| 1.00 | Revisit large-preview performance | Engineering | 2 | 2 |
| 1.00 | Keep `domain/` free of React/browser APIs | Engineering | 1 | 1 |
| 0.80 | Multiple simultaneous fells | Pattern language & simulation | 4 | 5 |
| 0.67 | Animate the repeat cycle | Visualization | 2 | 3 |
| 0.67 | Drag-to-reorder / drag-to-build | Editor & interaction | 2 | 3 |
| 0.67 | Pattern versioning/history | Sharing & persistence | 2 | 3 |
| 0.60 | Shaping & joins | Pattern language & simulation | 3 | 5 |
| 0.40 | Weaving-drawdown import | Pattern language & simulation | 2 | 5 |

## Pattern language & simulation

- **Twists.** The [web app plan](./scot-visualization-web-app-plan.md) scopes twists
  out of v1. Decide on notation (a lane instruction vs. a new row type) and extend
  [`parser.ts`](../src/domain/parser.ts) / [`simulate.ts`](../src/domain/simulate.ts).
  _(Impact 4, Effort 4 → 1.00)_
- **Multiple simultaneous fells.** Real SCOT work often splits at more than one point
  in the same pass; the current model assumes a single working row per step.
  _(Impact 4, Effort 5 → 0.80)_
- **Shaping** (adding/dropping cords mid-braid) and **joins** (splicing a new cord in).
  _(Impact 3, Effort 5 → 0.60)_
- **Finishing techniques** (whipping, plying off, tassels) as a terminal annotation on
  a pattern, so a diagram can show how a piece actually ends.
  _(Impact 2, Effort 2 → 1.00)_
- **Weaving-drawdown import.** [`ply-split-pattern-conventions.md`](./ply-split-pattern-conventions.md#l178)
  flags this as a future importer: take an over/under drawdown, preserve it, and show
  the derived splitter/splittee operations next to it for verification instead of
  silently guessing.
  _(Impact 2, Effort 5 → 0.40)_
- **Pattern validation messages.** Audit the diagnostics `parser.ts` produces for
  malformed rows/out-of-range lanes — make sure each one points at the exact token and
  suggests a fix, not just "invalid row N".
  _(Impact 3, Effort 2 → 1.50)_

## Visualization

- **Step-by-step playback ("follow while making").** The plan doc sketches a step view
  with one active event highlighted and past/future events dimmed — useful both for
  learning a pattern and for following along while braiding. Not yet built.
  _(Impact 5, Effort 3 → 1.67)_
- **Side-by-side front/back comparison** instead of (or in addition to) the current
  single-face toggle.
  _(Impact 3, Effort 2 → 1.50)_
- **Print-friendly / high-contrast view** — a layout meant for a page next to the work,
  not a screen: larger lane numbers, minimal chrome, works in black-and-white.
  _(Impact 3, Effort 2 → 1.50)_
- **Animate the repeat cycle** so a user can watch the braid grow rather than only
  seeing the expanded static result.
  _(Impact 2, Effort 3 → 0.67)_
- **Better rules and constraints for the Finished view's cell placement.** The current
  authority order (splitter's course, full-edge join, half-side role change) and the
  [transition-triangle eligibility checks](./finished-visualization-spec.md#75-interlocking-transition-surface)
  still fall back to plain geometry at detached or unsupported joins. Tighten the rule
  set so fewer patterns need that fallback and placement stays correct for wider cord
  counts, asymmetric repeats, and columns with more than one transition.
  _(Impact 5, Effort 4 → 1.25)_
- Reconcile **Finished v1 / v2 / dev** into one settled view once the transition-surface
  rules in [`finished-visualization-spec.md`](./finished-visualization-spec.md) stop
  changing, so the UI doesn't need to expose three variants long-term.
  _(Impact 3, Effort 3 → 1.00)_

## Editor & interaction

- **Undo/redo** for both text edits and click-to-build steps (currently only the
  browser's native textarea undo applies, which click-to-build bypasses).
  _(Impact 3, Effort 3 → 1.00)_
- **Keyboard shortcuts** — e.g. arrow keys to step through repeats, `Esc` already
  cancels an armed splitter, but there's no documented shortcut list.
  _(Impact 2, Effort 1 → 2.00)_
- **Inline lane hints while typing**, not just on hover/click — e.g. underline a lane
  number in the text editor and highlight the matching lane in the diagram.
  _(Impact 3, Effort 3 → 1.00)_
- **Drag-to-reorder or drag-to-build** as an alternative to click-click for the
  splitter/splittee flow.
  _(Impact 2, Effort 3 → 0.67)_

## Sharing & persistence

- **Shareable URL** that encodes the pattern (e.g. compressed in the query string or
  hash) so a link reproduces the exact diagram without needing the `.scot` file.
  _(Impact 4, Effort 2 → 2.00)_
- **Export to PNG/PDF**, not just SVG-in-page / `.scot` text — useful for printing or
  pasting into notes.
  _(Impact 4, Effort 2 → 2.00)_
- **Named saved patterns** (beyond the single localStorage draft) — a small local
  gallery of a user's own patterns, not just the bundled samples in
  [`src/examples`](../src/examples).
  _(Impact 3, Effort 3 → 1.00)_
- **Pattern versioning/history** — even a simple "revert to N edits ago" would help
  recover from an accidental click-to-build sequence.
  _(Impact 2, Effort 3 → 0.67)_

## Samples & docs

- Grow [`src/examples`](../src/examples) with more traditional motifs beyond the
  current chevron/braid/eyes/arrow/color-block set — particularly ones that exercise
  wider cord counts or asymmetric repeats.
  _(Impact 2, Effort 1 → 2.00)_
- ~~Add a short in-app "how to read this notation" panel or link, since the pattern
  format ([`scot-pattern-format-spec.md`](./scot-pattern-format-spec.md)) currently
  lives only in `docs/`.~~ **Done** — a collapsible "How to read this notation" panel
  now sits under the source editor in [`App.tsx`](../src/App.tsx), covering
  `color:`/`palette:`, row syntax, auto-turn, `[repeat]`, comments, and a worked
  example.
  _(Impact 3, Effort 1 → 3.00)_

## Engineering

- Keep `domain/` free of React/browser APIs (already a stated goal in the plan doc) so
  it can eventually back a CLI export tool or a future mobile app.
  _(Impact 1, Effort 1 → 1.00)_
- Expand test coverage in [`tests`](../tests) as new notation (twists, joins, shaping)
  lands, mirroring the existing parser/simulation/layout tests.
  _(Impact 3, Effort 2 → 1.50)_
- Revisit performance for large previews — `previewWidth` and repeat counts can push
  the SVG output large; profile whether layout ([`finishedLayout.ts`](../src/domain/finishedLayout.ts),
  [`finishedLayoutV2.ts`](../src/domain/finishedLayoutV2.ts)) stays fast at the top of
  their ranges.
  _(Impact 2, Effort 2 → 1.00)_
