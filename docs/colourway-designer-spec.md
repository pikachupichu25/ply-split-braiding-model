# Colourway Designer — Product Requirements

> Status: shipped MVP; linked-chevrons template added  
> Last updated: 2026-09-15  
> Purpose: let a general user recolour an existing, known-good pattern without reading or writing SCOT notation.

Backlog origin: the **Template painting** item in [`TODO.md`](./TODO.md#samples--docs). The notation this feature reads and writes is defined in the [SCOT Pattern Text Format Specification](./scot-pattern-format-spec.md) (`color:` and `palette:` lines).

## 1. Summary

The **Colourway Designer** is a colouring-book style mode for SCOT Braid Studio. The user picks a template whose row structure is already correct and locked, then does only two things: decide **which cord gets which colour** (the arrangement) and decide **what each colour actually is** (the swatch). The finished braid updates live as they paint.

The template is **Linked chevrons** (section 6.4): the double-chevron structure generated for any cord count and any number of chevrons. One chevron on eight cords is the bundled **Eight-cord chevron** sample, so that sample is not a separate template.

Everything the designer produces is an ordinary `.scot` pattern: the template's rows, plus a rewritten `color:` and `palette:` line. Nothing new is added to the notation, and the existing studio can open the result unchanged.

## 2. Who it is for

- **The maker.** Someone who wants to braid a chevron in their own colours. They do not want to learn the row notation; they think in terms of "cord 3 is navy" and "what will it look like". They may be on a phone or tablet next to their materials.
- **The teacher or workshop host.** Wants a link they can hand to students so each student can plan a colourway on a proven structure before cutting cord.
- **The existing studio user.** Wants a faster way to try colour ideas on a sample than editing letters in the `color:` line, then wants to keep working on the result in the studio.

The designer is not aimed at people inventing new row structures; that remains the studio's job.

## 3. Goals

The MVP must let a user:

1. open the designer from the studio without any setup;
2. choose a template and one of its starting colourways;
3. see every cord of the template as a labelled, tappable swatch in starting order;
4. paint any cord with any colour slot, one tap per cord;
5. change the actual colour of a slot with a colour picker;
6. add and remove colour slots;
7. see the finished braid update live, front and back, over the full closed cycle;
8. use mirror and fill helpers so symmetric colourways take a few taps rather than sixteen;
9. undo and redo painting and slot changes;
10. read a cord setup summary — the ordered cord list and how many cords of each colour to prepare;
11. download the result as a `.scot` file; and
12. hand the result to the studio as its current draft.

It should feel closer to a colouring app than to a text editor: no typing is required to complete a colourway.

## 4. Non-goals for the MVP

- Editing, adding, or removing rows or repeats. Rows are locked per template.
- Changing the number of cords while painting. A parametric template (section 6.4) chooses its cord count before painting starts; once a colourway is loaded the count is fixed.
- Letting the user define a new template from their own pattern (follow-up, section 14).
- Per-row or mid-braid colour changes, variegated cords, or gradients — SCOT colour is one colour per cord for its whole path.
- Naming colours, yarn-brand swatch libraries, or colour-matching to photos.
- Shareable URLs, cloud storage, or multiple named saved designs (follow-ups; see the TODO entries for shareable URL and named saved patterns).
- Photo comparison, cord-network view, event IDs, slant/tip/width controls, and other drafting-table instruments. The designer shows one preview with fixed geometry.

## 5. Terms

- **Template**: a row structure whose rows and repeats are locked, either a bundled sample or one generated from a few numbers the user sets first. It supplies the structure. Shipped: `linked-chevrons`.
- **Colourway**: the user's design — one colour slot per cord, plus the swatch for each slot. Equivalent to a `color:` line and a `palette:` line.
- **Colour slot** (or **slot**): one palette symbol `A`–`Z` with a swatch. Slots are the paint pots.
- **Swatch**: the actual displayed colour of a slot, stored as a hex value.
- **Cord**: one position `1..N` in the starting sequence. Every cord uses exactly one slot.
- **Preset**: a named colourway bundled with a template as a starting point (e.g. *Chevron*).
- **Active slot**: the slot currently loaded on the brush; tapping a cord paints it with the active slot.
- **Cord strip**: the row of `N` cord swatches, in starting order, that the user paints.

## 6. Templates and colourways

### 6.1 Template registry

Templates are registered in code next to the samples. Each one builds its locked `.scot` source and its presets, optionally from a few numbers the user sets first:

```ts
type Colourway = {
  name?: string;                    // preset name, absent for the user's own design
  cords: string[];                  // one slot symbol per cord, starting order — the color: line
  palette: Record<string, string>;  // slot symbol → swatch — the palette: line
};

type TemplateParam = { key: string; label: string; min: number; max: number; step: number; default: number };

type ColourwayTemplate = {
  id: string;                       // 'linked-chevrons'
  name: string;                     // 'Linked chevrons'
  description: string;              // one plain-language sentence for the picker
  params: TemplateParam[];          // empty for a fixed template
  check?: (values) => string | undefined;   // why the values cannot be built, beyond their ranges
  build: (values) => { source: string; presets: Colourway[] };  // rows locked; first preset is the default
};
```

The registry has one entry:

| Template | Rows from | Presets |
| --- | --- | --- |
| Linked chevrons | generated for *Cords* × *Chevrons* (section 6.4); default 32 cords, 2 chevrons | *Chevron* — `CB…A…BC` on every chevron (`CBAAAABC` when a chevron has eight cords), `A=#d3a448, B=#77b6c9, C=#d76b52` |

Adding a fixed template is one registry entry with no `params` whose `build` returns a bundled sample; nothing else changes.

### 6.2 Why the eight-cord chevron is not its own template

One linked chevron on eight cords (`8>7,6,5` / `1>2,3,4,5`) is the bundled eight-cord chevron structure: the same cord count, the same 16-row closed cycle, and the same `CBAAAABC` starting colourway. The bundled colour-block sample is that structure's mirror image with `AAAABBBB` painted on it, which the user can paint in two taps. Registering the sample separately would only duplicate the *Cords 8 · Chevrons 1* setting.

### 6.4 Parametric templates: linked chevrons

The bundled twenty-four cord double chevron is two twelve-cord chevrons side by side whose inward splits start from the neighbouring chevron's edge cord, so the two halves are one fabric. `linkedChevronsPattern({ cords, ways })` in [`src/domain/linkedChevrons.ts`](../src/domain/linkedChevrons.ts) generalises that to any number of chevrons on any width:

- `cords` must be a multiple of `2 × ways`, so every chevron has an even width and two equal arms, with at least four cords per chevron; the picker shows why a value cannot be built (`28 cords do not divide evenly into 4 chevrons with equal arms — use a multiple of 8.`).
- Each chevron `k` (lanes `b+1..b+w`, `w = cords / ways`, `b = (k−1)·w`) takes two rows, worked right to left across the band: a leftward split from lane `b+w` into `b+w/2+1`, then a rightward split from lane `b` (lane 1 for the first chevron) into the same lane. That is `2·ways` rows per repeat, e.g. `32>31,…,25` / `16>17,…,25` / `16>15,…,9` / `1>2,…,9` on 32 cords in two ways.
- Both arms of every chevron hold `w/2` lanes. On 24 cords in two ways the right chevron matches the bundled sample row for row and the left one meets one lane further in.
- Every cord walks the whole band, so the pattern closes after `cords` repeats — 32 repeats of 4 rows (128 rows) for the default. The picker states the closure, and thumbnails show the first 64 rows rather than the whole cycle.

Parameters are set on the template card, before a preset is chosen; the card's thumbnails and closure note follow the values live. The paint screen shows the values under the template name (`32 cords · 2 chevrons`), and they are saved with the autosave and written into the download filename (`linked-chevrons-32-2-custom.scot`).

### 6.3 Colourway rules

- `cords.length` equals the template's cord count. It never changes in the designer.
- Every entry in `cords` is a symbol present in `palette`.
- `palette` may contain slots that no cord uses (a slot the user added but has not painted with yet).
- Slot symbols are single uppercase letters `A`–`Z`, so there are at most 26 slots.
- Swatches are lowercase six-digit hex (`#d76b52`). When a preset or an opened pattern uses a CSS colour name (`brown`, `lightblue`), the designer resolves it to hex for the picker and writes hex back out.
- Symbols are stable while editing. Removing slot `B` does not re-letter `C` to `B`; the letters a user saw on the swatches are the letters in the downloaded file.

## 7. Main user flow

### 7.1 Enter and choose

The studio masthead gains a **Colour a pattern** link beside the existing *Expected layout editor* link. It opens the designer at the hash route `#/colour`.

On first open the designer shows:

- the template picker (a single card while there is one template, still rendered as a picker so more can be added);
- the template's presets as thumbnails rendered from the real simulation, not static images; and
- the last autosaved colourway for this template, if there is one, offered as **Continue where you left off** above the presets.

Choosing a preset or the autosave loads it and moves to the painting screen. The default preset loads immediately if the user does nothing else, so the painting screen is one tap away and never empty.

### 7.2 Paint cords

The painting screen is dominated by two things: the **cord strip** and the **live preview**.

The cord strip shows every cord of the template left to right in starting order, numbered `1..N`, each drawn as a swatch of its current colour with its slot letter on it. When the template names a repeating unit (each chevron of *Linked chevrons*), the strip is drawn in labelled groups — *Chevron 1 · cords 1–16*, *Chevron 2 · cords 17–32* — so a maker can see which cords belong together; a template with a single unit shows one unlabelled run. Interaction follows a paint-pot model:

1. one slot in the palette bar is the active slot and is visibly marked;
2. tapping a cord paints it with the active slot;
3. tapping a cord that already has the active slot does nothing (it does not toggle back);
4. pressing on a cord and dragging across its neighbours paints each cord the pointer passes over; and
5. the preview updates as each cord changes.

There is no "select a cord, then choose its colour" mode in the MVP. One model keeps the number of taps for a whole colourway predictable: pick a pot, tap the cords.

Painting must work with touch, mouse, and keyboard (section 12).

### 7.3 Edit colour slots

The **palette bar** shows every slot as a swatch with its letter. Below or beside each slot, a small count says how many cords use it (`× 4`, or `unused`).

- Tapping a slot makes it active.
- Tapping the active slot again — or its edit affordance — opens the **slot editor**: a native colour input (`<input type="color">`, so phones get their own picker), a hex field, and a fixed **suggested swatches** grid of around sixteen yarn-like colours starting with the six studio defaults. Picking a suggested swatch, typing a valid hex, or committing the native picker changes the slot's swatch everywhere it is used, live.
- **Add colour** appends a new slot using the next unused letter, gives it the next unused suggested swatch, and makes it active. The button is disabled with a hint once all 26 letters are in use.
- **Remove** is available on a slot that no cord uses. On a slot in use, it is replaced by **Replace with…**, which asks for another slot and repaints every cord of the removed slot with the chosen one as a single undoable step. A template can never end up with fewer than one slot.

Letters are shown on the swatches so two similar colours are still distinguishable and so the design matches the `color:` line someone might later read in the studio.

### 7.4 Helpers

Helpers act on the cord strip as one undoable step each:

- **Mirror →** copies the left half onto the right half, reflected, so cords `1..⌊N/2⌋` define the whole strip. For an odd `N` the middle cord is left as it is.
- **← Mirror** does the same from the right half.
- **Fill all** paints every cord with the active slot.
- **Swap** exchanges two slots everywhere they are used (`A ↔ B`), which is the quickest way to try a negative of the current design.
- **Reset to preset** restores the preset the design started from.

A **symmetry lock** toggle (off by default) keeps the strip mirrored while painting: painting cord `k` also paints cord `N+1−k`. Both the chevron presets are symmetric, so this is expected to be on for most chevron designs, but it stays opt-in so asymmetric designs remain possible.

### 7.5 Live preview

The preview is the Finished v2 rendering already used by the studio, configured for reading rather than drafting:

- surface on, event IDs off, no lane guides;
- front face by default with a **Front / Back** toggle;
- length is the full closed cycle (for the chevron, 8 repeats / 16 rows) with a **×2** option to see how the motif continues;
- fixed geometry (30° slant, 30° tip) and a width chosen to fill the available space; and
- no other instruments.

The preview re-renders within one frame of a paint on the chevron template. If a future template is slow enough that painting feels laggy, updates are batched per pointer move, not skipped.

Tapping a cell in the preview highlights the cord that owns it in the strip (the cell's splittee cord) and scrolls that cord into view if the strip runs off-screen, so a user can find "that stripe" in the strip without counting. Painting directly on the preview — tapping a cell to paint its cord with the active slot — is the natural extension and is a should-have (section 9); it uses the same cord mapping.

### 7.6 Cord setup summary

Beneath the strip, a **Cord setup** panel restates the design in the form a maker prepares materials from:

- **You will need**: one line per slot in use, with swatch, letter, hex, and cord count — `A · #d3a448 · 4 cords`; and
- **Starting order**: the numbered cord list, `1 C · 2 B · 3 A …`, matching the strip left to right.

The summary is plain text so it can be selected, copied, and read by a screen reader. It is also the content of the print view (section 9, could-have).

### 7.7 Save, export, and hand off

- The current colourway autosaves per template (section 11).
- **Download .scot** writes the template's source with the `color:` and `palette:` lines rewritten (section 10). The filename is `<template-id>-<preset-or-custom>.scot`.
- **Open in studio** hands the same text to the studio as its current draft and navigates to it. The studio's sample picker then shows *Edited draft* because the text no longer matches a bundled sample; that is correct and expected.
- **Show pattern text** is a read-only disclosure of the generated `.scot`, for the curious and for teachers explaining the notation. It is never editable in the designer.

## 8. Interface layout and visual direction

The designer shares the studio's visual language — the dark navy chrome, warm paper panels, DM Mono and Fraunces, and the rust, teal, and gold accents — but strips it back. The preview is the hero; controls are few and large.

Desktop layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ ↝ SCOT Braid Studio · Colour a pattern         Template ▾  Studio ↗ │
├──────────────────────────┬─────────────────────────────────────────┤
│ 01 · colours             │ 02 · your braid          Front  Back  ×2 │
│ [A●] [B●] [C●] [+ Add]   │                                          │
│  ×4   ×2   ×2            │                                          │
│ Edit A: [■ picker] #d3a448│            live finished preview         │
│ suggested: ■■■■■■■■■■■■  │                                          │
│                          │                                          │
│ 03 · cords               │                                          │
│ 1  2  3  4  5  6  7  8   │                                          │
│ [C][B][A][A][A][A][B][C] │                                          │
│ Mirror→ ←Mirror Fill Swap│                                          │
│ ☐ Symmetry lock   Reset  │                                          │
│                          │                                          │
│ 04 · cord setup          │                                          │
│ You will need: A×4 B×2… │                                          │
│ Order: 1 C · 2 B · 3 A … │                                          │
├──────────────────────────┴─────────────────────────────────────────┤
│ Undo  Redo             Download .scot   Open in studio   Show text │
└────────────────────────────────────────────────────────────────────┘
```

Narrow screens (the maker on a phone) stack the panels with the preview pinned at the top and the palette bar pinned at the bottom, within thumb reach, so the cord strip — which can run to many rows on a wide band — scrolls between the two while paint and result stay visible together:

```text
┌──────────────────────┐
│ Colour a pattern   ⋯ │
│                      │
│    live preview      │  ← sticky top
│   Front  Back  ×2    │
├──────────────────────┤
│ 1 2 3 4               │
│ [C][B][A][A]          │  ← cord strip, scrolls
│ [A][A][B][C]          │
│  …                    │
├──────────────────────┤
│ [A●][B●][C●][+]      │  ← palette bar, sticky bottom
├──────────────────────┤
│ helpers · setup ·    │
│ download · studio    │
└──────────────────────┘
```

Every cord swatch and palette swatch is at least `44 × 44` CSS pixels on touch layouts. The cord strip wraps into as many rows as it needs, numbered left to right then top to bottom, so every cord is visible at once — a strip that scrolled sideways hid most of a 32-cord band behind an invisible scrollbar; the palette bar wraps too.

## 9. Requirements by priority

| ID | Requirement | Priority |
| --- | --- | --- |
| CW-01 | Designer reachable from the studio masthead at `#/colour`; studio reachable back from the designer. | Must |
| CW-02 | Template picker and preset thumbnails rendered from the real simulation. | Must |
| CW-03 | Cord strip: one numbered, lettered swatch per cord in starting order. | Must |
| CW-04 | Paint-pot model: active slot; tap a cord to paint it. | Must |
| CW-05 | Drag-to-paint across neighbouring cords in one gesture. | Should |
| CW-06 | Palette bar with per-slot use counts; tap to activate. | Must |
| CW-07 | Slot editor: native colour input, hex field, suggested swatches. | Must |
| CW-08 | Add slot (next unused letter); remove unused slot; replace-with on a used slot. | Must |
| CW-09 | Live Finished v2 preview, front/back, full cycle, ×2 option, fixed geometry. | Must |
| CW-10 | Tap a preview cell to highlight its cord in the strip. | Should |
| CW-11 | Tap a preview cell to paint its cord with the active slot. | Should |
| CW-12 | Helpers: mirror both ways, fill all, swap, reset to preset. | Must |
| CW-13 | Symmetry lock toggle. | Should |
| CW-14 | Undo/redo, at least 50 steps, `Cmd/Ctrl+Z` and `Shift+Cmd/Ctrl+Z`. | Must |
| CW-15 | Cord setup summary: per-colour counts and starting order. | Must |
| CW-16 | Download `.scot` with rewritten `color:`/`palette:` lines, rows untouched. | Must |
| CW-17 | Open in studio as the current draft. | Must |
| CW-18 | Read-only "Show pattern text" disclosure. | Should |
| CW-19 | Autosave the working colourway per template; offer to continue on return. | Must |
| CW-20 | Touch-first layout; 44 px targets; preview and palette pinned on narrow screens with the strip scrolling between them. | Must |
| CW-21 | Keyboard-only painting and slot editing; live-region announcements. | Must |
| CW-22 | Print view of the cord setup summary with swatches. | Could |
| CW-23 | Open any `.scot` file whose rows match a template and edit its colourway. | Could |
| CW-24 | Register every bundled sample as a template. | Could |

## 10. Pattern text round-trip

The designer never owns a second representation of the structure. Its domain layer provides two pure functions:

```ts
readColourway(source: string): { colourway: Colourway; diagnostics: Diagnostic[] }
applyColourway(source: string, colourway: Colourway): string
```

Rules for `applyColourway`:

- The `color:` line is replaced by `color: ` followed by the cord symbols joined with no spaces.
- The `palette:` line is replaced by `palette: ` followed by `A=#hex` entries for every slot in `palette`, in letter order, separated by `, `. If the source has no `palette:` line, one is inserted directly after `color:`.
- Every other line — title comment, source comment, rows, repeats, blank lines — is preserved byte for byte, in its original order.
- Output uses the canonical formatting from the [format specification §10](./scot-pattern-format-spec.md#10-canonical-formatting) for the two lines it writes.

`readColourway(applyColourway(source, c))` returns a colourway equal to `c`, and `applyColourway(applyColourway(source, c), c)` equals `applyColourway(source, c)`. Both are tested.

The result must parse with the existing parser with no diagnostics, and simulate with the same events, in the same order, as the template with only `colorSymbol` values differing.

## 11. Persistence

- Autosave the working colourway to local storage after every committed edit, keyed by template id (`scot-colourway:<template-id>`), separately from the studio's draft key so painting never clobbers a studio draft. A parametric template's values are saved with it; the card's fields always open at the template defaults (32 cords, 2 chevrons), and **Continue where you left off** carries its own saved values, stated on the card, so it resumes exactly as left whatever the fields say.
- Undo history is session-only.
- **Download .scot** is the portable result; autosave is convenience only.
- Loading a corrupt or incompatible autosave (wrong cord count, unknown symbols) falls back to the default preset silently and logs the reason to the console; it never blocks the painting screen.

## 12. Accessibility and input requirements

- Colour is never the only indicator: every swatch carries its letter; the active slot has a shape or outline marker as well as a colour change; a highlighted cord has an outline, not only a tint.
- The cord strip is a keyboard-operable toolbar: Left/Right arrows move focus between cords, `Enter` or `Space` paints the focused cord with the active slot, and typing a slot letter paints the focused cord with that slot directly.
- The palette bar is likewise arrow-navigable; `Enter` activates a slot; `E` opens its editor.
- Every helper and action has a visible label; icons are never the only label.
- Changes are announced through a polite live region beneath the palette bar, next to where the painting happens: "Cord 3 painted B", "Slot B changed to #77b6c9", "Mirrored left to right".
- All controls have a visible focus state and meet a `3:1` contrast ratio against the paper panels.
- Minimum interactive target size is `44 × 44` CSS pixels on touch layouts and `32 × 32` on pointer layouts.
- The preview SVG carries a text alternative that reads the cord setup summary.

## 13. Engineering notes

- The domain code — `Colourway`, `readColourway`, `applyColourway`, the template registry — lives in `src/domain/` and stays free of React and browser APIs, matching the existing rule for that folder. Tests go in `tests/colourway.test.ts` beside the parser and layout tests.
- The designer is its own component and route, added to the hash router in [`main.tsx`](../src/main.tsx) alongside `#/expected-layout`. It should not add state or controls to the studio's `App`.
- The Finished v2 preview and `buildColorMap` are currently private to [`App.tsx`](../src/App.tsx). They need to move into a shared module so the designer can render the same preview without duplicating the layout or colour logic.
- Cell → cord mapping for preview highlighting and painting uses `FinishedCell.event.splitteeId` and the cord ids `C01..CNN` that the simulator assigns from starting order, so cord index `k` is the cell whose splittee is `C<k>`.
- Swatch resolution from CSS colour names to hex is a UI-layer concern; the domain keeps whatever string the source had until the user edits that slot.
- Preset thumbnails are the same preview component at a small fixed size, memoised per preset.

## 14. Follow-up capabilities

These should remain compatible with the MVP data model but are not required initially:

- register every bundled sample as a template and let a user open their own `.scot` as a template with rows locked (CW-23, CW-24);
- shareable URL carrying template id and colourway (pairs with the TODO's shareable-URL item);
- multiple named designs per template and a small personal gallery;
- optional friendly colour names per slot, written as a comment so the notation stays unchanged;
- a printable materials sheet with swatches and the strip (CW-22);
- a contrast check that warns when two adjacent cords are hard to tell apart;
- yarn or cord brand swatch libraries as alternative suggested-swatch sets; and
- a "randomise within my palette" button for inspiration.

## 15. Acceptance criteria

The MVP is complete when all of the following are true:

1. From the studio, one click opens the designer with the *Chevron* preset painted and previewed; one click returns to the studio.
2. The *Chevron* preset is offered on the linked chevrons template for whatever cords and chevrons are set; at *Cords 8 · Chevrons 1* its thumbnail visibly matches the studio's rendering of the bundled eight-cord chevron.
3. Tapping any cord with any active slot recolours that cord in the strip, the preview, and the cord setup summary within one frame.
4. Dragging across cords 2–7 with slot `A` active paints all six in one gesture and one undo step.
5. Changing slot `B`'s swatch via the native picker, the hex field, or a suggested swatch updates every `B` cord everywhere at once.
6. Adding a slot allocates the next unused letter; removing an unused slot works; a used slot offers *Replace with…* and repaints its cords as one undo step.
7. *Mirror →* on `CBAAxxxx` yields `CBAAAABC`; *Swap A↔B* on `CBAAAABC` yields `CABBBBAC`; *Fill all* and *Reset to preset* behave as named.
8. With symmetry lock on, painting cord 2 also paints cord 7.
9. Undo and redo restore paints, drags, slot swatch changes, adds, removes, replaces, helpers, and preset loads, for at least 50 steps.
10. The cord setup summary lists per-colour counts that sum to `N` and a starting order that matches the strip.
11. **Download .scot** produces a file whose rows and comments are byte-identical to the template source, whose `color:`/`palette:` lines reflect the design, and which parses in the studio with no diagnostics.
12. **Open in studio** shows the same preview in the studio with the sample picker reading *Edited draft*.
13. Reloading the page restores the in-progress colourway; a corrupt autosave falls back to the default preset without an error screen.
14. On a 375 px wide viewport the preview and palette bar stay visible together while the cord strip scrolls between them, whatever the cord count, and every swatch is at least 44 px square.
15. A keyboard-only user can load a preset, paint every cord, edit a slot, use every helper, undo, and download.
16. `readColourway`/`applyColourway` round-trip tests pass for every bundled sample that has a `palette:` line and for one without.

## 16. Decisions requiring confirmation

This draft assumes the following. Each is cheap to change now and expensive later.

1. **One parametric template, not a fixed eight-cord one.** The eight-cord chevron is the *Cords 8 · Chevrons 1* setting of linked chevrons (section 6.2), so it is not registered separately, and the colour-block arrangement is left for the user to paint rather than shipped as a preset. If a fixed eight-cord card is wanted for discoverability, it is one registry entry whose `build` returns the bundled sample.
2. **Separate route, not a studio mode.** `#/colour` keeps the general-user surface free of drafting instruments and keeps `App.tsx` from growing another mode. The cost is a small amount of shared-component extraction (section 13).
3. **Studio stays the landing page.** General users reach the designer through a masthead link. If the designer is the main audience for the deployed site, the routes could be inverted so `/` opens the designer and the studio sits behind a link.
4. **Paint-on-preview is a should-have, not a must.** The strip is sufficient for the MVP; painting on the fabric is the most delightful addition and should follow immediately if the strip feels indirect in testing.
5. **Stable letters, no re-lettering.** A design that uses slots `A` and `C` after removing `B` downloads as `A`/`C`. Canonicalising to `A`/`B` on download would break the match between the letters on screen and in the file.
6. **Hex out, names in.** The designer always writes hex swatches, even for a preset that came in with CSS colour names, so the palette picker and the file agree.
