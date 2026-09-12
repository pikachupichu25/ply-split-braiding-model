---
name: add-sample-pattern
description: Add a new bundled sample pattern to SCOT Braid Studio. Use when the user gives a SCOT pattern text script (color/palette + numbered rows, optionally [repeat] blocks) and asks to add it as a sample, example, or preset pattern to the app.
---

# Add Sample Pattern

Add a new pattern to the gallery of bundled samples in `src/examples`. Each sample is
its own `.ts` file exporting the raw pattern text, registered in
`src/examples/index.ts`.

## Inputs

- A pattern text script from the user (the `color:`/`palette:` header, numbered rows,
  and optional `[repeat ...]` lines — the same format documented in
  [`docs/scot-pattern-format-spec.md`](../../../docs/scot-pattern-format-spec.md)).
- Optionally: a display name, a source URL/attribution comment, and a reference photo.

If the user only pastes the raw script with no name, infer a name from a leading
`# Title` comment in the script itself. If there is none, ask for a short name before
proceeding — don't invent a cute name for an unlabeled pattern.

## Workflow

1. **Read [`src/examples/index.ts`](../../../src/examples/index.ts)** first, every time,
   even if you've done this before — to get the current import list, the last entry in
   `samplePatterns`, and to check the new id/filename won't collide with an existing one.

2. **Pick a filename and export name.**
   - Filename: `lowerCamelCase.ts` in `src/examples/`, derived from the pattern's name
     (e.g. "Eight-cord chevron" → `chevron.ts`, "Eyes 36-cord" → `eyes36.ts`).
   - Append a cord-count suffix (`eyes36`, `braid16`, `colorBlock8`, `doubleChevron24`)
     when it helps disambiguate from a similarly-named existing sample, or when the
     source material itself names the cord count; otherwise a plain name
     (`arrow`, `chevron`, `eyelets`) is fine — match whichever existing file this new
     pattern most resembles.
   - Export name: same camelCase name with a `Pattern` suffix, e.g.
     `export const eyes36Pattern = ...`.

3. **Create the file** at `src/examples/<name>.ts` with exactly this shape:

   ```ts
   export const <name>Pattern = `<verbatim script text>`;
   ```

   Rules for the template literal body:
   - Paste the given script **exactly as provided** — same line breaks, spacing,
     comments, and blank lines. Do not reformat, re-wrap, fix perceived typos, or
     normalize whitespace. Treat it as opaque data, not code to clean up.
   - If the script doesn't already start with a `# Title` comment line, add one line
     `# <Name>` at the top (and a `# source: <url>` comment under it, if the user gave
     a source link) — mirroring the style in
     [`eyes36.ts`](../../../src/examples/eyes36.ts) and
     [`wayuuFajon20.ts`](../../../src/examples/wayuuFajon20.ts). Otherwise leave the
     header exactly as given.
   - Use a backtick template literal (not a plain string) since patterns are
     multi-line. If the script itself contains a backtick or `${`, escape it
     (`` \` `` / `\${`) so the literal stays valid.

4. **Wire it into [`src/examples/index.ts`](../../../src/examples/index.ts):**
   - Add an import line for the new export, appended after the last existing import in
     that block (import order in this file is insertion order, not alphabetical — don't
     re-sort the existing imports).
   - Append a new object to the end of the `samplePatterns` array (after the current
     last entry — check `git status`/the file first, since the exact last entry drifts).
     Add a trailing comma to the previous last entry if it doesn't already have one.
     Each object needs:
     - `id`: kebab-case, unique, short (e.g. `'eyes-36'`, `'wayuu-fajon-20'`).
     - `name`: short human title, Title Case (e.g. `'Eyes (36-cord)'`).
     - `summary`: one sentence in the voice of the existing summaries — mention cord
       count (length of the `color:` string), the structural idea (rows/repeats,
       symmetry, how many times it closes), e.g. *"Two eighteen-cord eyes side by side,
       each a concentric A-B-C-D-E diamond converging on its own centre. Closes after 9
       repeats, 37 rows."* Derive the numbers from the pattern text itself — don't
       guess. Count cords from the `color:` line length; count rows/repeats from the
       numbered rows and `[repeat ...]` blocks.
     - `source`: the `<name>Pattern` identifier you imported (not a string literal).
     - `image` (optional): only include this if the user actually supplied a reference
       photo. Save the image under `public/expected-layouts/<name>.<ext>` and set
       `src: '/expected-layouts/<name>.<ext>'` with a descriptive `alt` text. Omit the
       field entirely if there's no photo — don't add a placeholder.

5. **Sanity-check the pattern parses.** Run:

   ```bash
   npm run test
   ```

   This runs the parser/simulation test suite (`tests/*.test.ts`) and will catch a
   malformed row or lane reference. It won't catch a pattern that's *valid but wrong*
   (e.g. a mistyped lane number that still parses) — that's on the source script being
   accurate.

6. **Visually verify** by starting the dev server and opening the new sample in the
   gallery (it should appear as the last entry), checking the diagram renders without
   console errors and roughly matches the intended motif.

## Things to avoid

- Don't touch any existing sample file or reorder the `samplePatterns` array — always
  append.
- Don't "clean up" the pasted script text (indentation, spacing, comments) — it's
  copied verbatim per the source instructions above.
- Don't fabricate a `summary` number (cord count, row count, repeat count) — compute it
  from the actual text.
- Don't add an `image` entry without a real photo file to back it.
