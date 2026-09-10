# Finished appearance from split events

Research date: 2026-09-09. Reference: [`eyes.webp`](../../public/expected-layouts/eyes.webp).

**Recommendation: reconstruct a network of continuous cords, solve its packed geometry, then render the local ply openings.** The eyes should emerge from cord colours and connectivity. They should not be drawn as predefined eye shapes or positioned as independent coloured cells.

The existing finished renderers and their annotated layouts are not evidence for this proposal. The investigation uses the supplied photograph, the current parser/simulator, and the 20-cord source named **Eyes**. The photograph's exact cord count and correspondence to this source have not been independently established.

Read these in order:

1. [Findings](findings.md): observations from the photo, measured event topology, and a removal experiment showing why colour alone is insufficient.
2. [Proposed system](system.md): data contracts, geometric solver, split rendering, boundaries, and failure handling.
3. [Validation and implementation sequence](validation.md): how to establish that the result actually predicts this photograph and generalises beyond Eyes.

Companion reading: [Physics behind the harmonic seed](harmonic-model.md) derives the spring/electrical-network equilibrium behind system.md §3's harmonic embedding and states exactly what that linear step does and does not guarantee.

The executable part of this investigation is a topology audit, **not a completed finished-product renderer**. It confirms that the event data can produce an ordered planar cord network under the simulator's current coordinate convention. It does not establish that the proposed geometric solver reproduces the photographed fabric.

```sh
node --experimental-strip-types docs/harmonic/audit-events.mjs
```

This writes [`event-audit.json`](event-audit.json), including the input text and hashes, every cord's event sequence, every connecting segment, face boundaries, and removal experiments. It imports no finished-layout code and changes no application files.

Main measured results for one written block:

| Quantity | Result |
| --- | ---: |
| Physical cord identities | 20 |
| Expanded instruction rows | 39 |
| Split events | 173 |
| Bounded regions of the cord network | 154 |
| Region boundary sizes | 2 digons, 16 triangles, 132 quadrilaterals, 4 pentagons |
| Role changes along individual cords | 67 |
| Later pairings changed by removing source rows 5, 6, 15 | 35 |
| Remaining splittee colours changed in that experiment | 0 |

The non-quadrilateral regions and colour-invisible structural changes are specific reasons to use the full network. They are not proof of the proposed material geometry. The next useful implementation is a plain, traceable cord rendering with topology checks; texture comes after photo validation.
