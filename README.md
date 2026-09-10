# SCOT Braid Studio

A design tool for **ply-split braiding** — an off-loom textile technique where one cord (the *splitter*) passes through a gap opened in the plies of another cord (the *splittee*), rather than simply crossing over or under it.

This app focuses on **SCOT** (Single Course Oblique Twining), where a cord can split, or be split by, several other cords in a row. You write a pattern as compact text — cord colours and per-row splitter/splittee instructions — and the app simulates the splits and renders the resulting braid.

**Live app:** [ply-split-braiding.vercel.app](https://ply-split-braiding.vercel.app/)

## Features

- Plain-text SCOT pattern editor with live parsing and diagnostics
- Click-to-build: click a lane, then a target lane, to append a split row
- Structural simulation using stable cord identities (not just final lane order)
- Multiple render views: braid trace, finished chart (v1/v2/dev), front and back faces
- Cord network view that solves the finished fabric as a spring network, with a harmonic model to compare against
- Repeat handling, including automatic full-cycle length detection
- Sample patterns (chevron, colour block, double chevron, braid, eyes, arrow)
- `.scot` pattern download; drafts persist locally in the browser

## Getting started

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build    # type-check and build for production
npm run preview  # preview the production build
npm test         # run the domain (parser/simulation/layout) tests
```

## Pattern format

A pattern lists cord colours and numbered split rows, then an optional repeat range:

```text
color: CBAAAABC

1 1>2,3,4
2 8>7,6,5,4

[repeat 1-2]
```

- `color:` gives each cord's starting colour, left to right, as one letter per cord.
- Each row is `<splitter lane>><splittee lane>,<splittee lane>,...` — the cord at the splitter lane splits the listed cords in order.
- Lane numbers refer to the current working row and are resolved against whichever physical cord occupies that position at the time; the braid turns automatically after each row.
- `[repeat A-B]` repeats rows A through B until the braid closes or a preview limit is reached.

## Tech stack

React + TypeScript, built with Vite, rendered as native SVG. Domain logic (parsing, simulation, layout) is framework-free and covered by the tests in [tests](tests).
