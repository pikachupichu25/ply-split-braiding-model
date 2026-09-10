# Ply-Split Braiding: Foundations and Existing Resources

> Research notes for a future ply-split braiding design program.  
> Last reviewed: 2026-09-03

For a detailed review of existing chart and instruction systems, see [Ply-Split Braiding Pattern Conventions](./ply-split-pattern-conventions.md).

## 1. Purpose and scope

This document summarizes the craft concepts that a digital design tool will need to represent. It is an orientation document, not a substitute for hands-on instruction or the detailed structures in Peter Collingwood's *The Techniques of Ply-Split Braiding*.

The first software should support a deliberately narrow structure and project shape. Ply-split work can be flat, tubular, branched, open, or fully three-dimensional; trying to model all of these at once would hide important differences between them.

## 2. What ply-split braiding is

Ply-split braiding (or, more generally, **ply-splitting**) is an off-loom textile construction in which one cord passes through a gap opened between the plies of another cord. This differs from ordinary weaving or plaiting, where elements normally pass over and under one another without entering the other element.[^about]

Useful terms for one interaction are:

- **Splitter:** the cord that passes through another cord.
- **Splittee:** the cord whose plies are opened and split.
- **Split:** one structural interaction between a splitter and a splittee.
- **Ply:** one of the constituent strands twisted together to form a cord.
- **Course:** a working sequence or row of related splits. The exact visual direction depends on the structure and working orientation.
- **Face:** the visible front or back surface of the work.

The basic action is simple, but the order of splits, which cord takes each role, cord rotation, colour placement, edge treatment, and changes in cord count can produce many different structures and forms.

### Cultural context

The most highly developed and best-documented tradition comes from camel-herding communities of the Thar Desert, particularly Rajasthan and Gujarat in north-west India and adjoining Sindh in Pakistan. Makers used ply-splitting for camel girths and other regalia. Traditional cords were commonly made from goat hair; cotton is now also used.[^traditional][^fraser]

The exact age of the tradition is not established in written evidence. Surviving illustrations date to the nineteenth century, while knowledge was transmitted orally. A design program should therefore credit the communities and makers from whom the documented knowledge comes and avoid presenting traditional motifs as anonymous software assets.[^traditional]

Ply-splitting is not exclusive to this region. Examples and related structures occur elsewhere, including three-ply chevron straps made by Wayuu makers in Colombia and diverse forms categorized as ply-split darning.[^about]

### Recent documentation

Important milestones in English-language documentation include:

- Virginia Harvey's *Split-Ply Twining* (1976), an early written description of what is now called SCOT.
- Betsy Quick and Judith Stein's *Ply-Split Camel Girths of West India* (1982), based on fieldwork in Rajasthan and Gujarat.
- Peter Collingwood's *The Techniques of Ply-Split Braiding* (1998), the first comprehensive reference and the source of much of the terminology now in use.
- Later work by Julie Hedges, Linda Hendrickson, David W. Fraser, Barbara J. Walker, and many other makers expanded instruction, pattern design, basketry, and three-dimensional forms.[^about][^bibliography]

## 3. Materials and tools

### Cords

Most contemporary introductory work uses firm, evenly made, high-twist **four-ply cords** whose plies remain distinct enough to open. Three-ply and two-ply cords are also used in particular traditions and contemporary practices, so software should not make four plies an irreversible global assumption.[^tools]

Common materials include cotton, linen, wool, paper cord, goat hair, and synthetics. Material, diameter, surface friction, stiffness, twist, and working tension all affect the physical result, even when the abstract split sequence is identical.

Cord properties worth recording digitally are:

- stable cord identifier;
- number of plies;
- colour of every ply, in circular order;
- cord diameter or size;
- S or Z final twist direction;
- amount of twist, if known;
- material;
- initial length and estimated consumed length;
- start and end treatment.

For colour-patterned TLOI, the usual four-ply cord has two adjacent plies of one colour and two adjacent plies of a contrasting colour (often described as `AABB`).[^fraser]

### Working tools

- A **gripfid** is the common modern tool: it opens the splittee and grips the splitter so the latter can be pulled through.
- Traditional and alternative tools include carved wooden needles and long flat metal needles. Some makers open the cord by twisting it and work without a separate tool.
- An anchor, ring, rod, or starter cord may hold the initial set of cords, depending on the project.
- A cord winder or a drill with a suitable hook can make tight cords. Ready-made cords are also available.[^tools][^cord-making]

Consistent cord construction and tension are essential to a useful physical preview. A first program can treat these as metadata and warnings rather than attempt a full mechanical simulation.

## 4. Principal structures

The following names describe the sequence and placement of splits. They were developed for braid-like pieces with two clear edges. For edge-less or three-dimensional work, the broader term **ply-splitting** may be more accurate than “ply-split braiding,” and “oblique” may lack a meaningful reference axis.[^about]

| Abbreviation | Name | Structural rule | Main design consequence |
| --- | --- | --- | --- |
| **POT** | Plain Oblique Twining | Each cord alternates between splitting and being split as it meets other cords. A four-ply cord typically turns a quarter turn between sequential splits. | The structure tightly constrains which cord appears at a junction. Cord sequence and colour carry much of the design. |
| **SCOT** | Single Course Oblique Twining | A cord may split, or be split by, several cords consecutively. A four-ply cord also typically turns a quarter turn between sequential splits. | Choosing which cord is split at each meeting gives comparatively free surface-colour patterning. |
| **TLOI** | Two-Layered Oblique Interlacing | As in POT, cords alternate roles, but a typical four-ply `AABB` cord turns either zero or one half-turn between splits. | The rotation decision selects which colour pair appears, producing reversible two-faced geometric or pictorial patterns. |
| **PSD** | Ply-Split Darning | One more-active element passes through several broadly parallel plied elements; the construction need not be oblique. | Best represented as an active “darning” path through a field of relatively stationary elements. |

The POT, SCOT, and TLOI descriptions above follow Fraser's concise structural comparison.[^fraser] Real work includes hybrids, variations, linking, openwork, cord additions and removals, and structures that do not fit a rectangular chart.

## 5. Why a normal pixel or weaving grid is insufficient

A coloured grid records appearance but can lose the construction that makes the object possible. At minimum, each crossing-like location must retain:

1. which two cords meet;
2. which cord is the splitter and which is the splittee;
3. which partition of the splittee's plies is opened;
4. how far each cord rotated since its preceding split;
5. the direction and continuity of both cords;
6. which ply colours are visible on the front and back;
7. its position in the making sequence.

This is best treated as a **topological event model** with a chart rendered from it, rather than a picture that the program later tries to interpret. “Pixel” editing can still be offered as a friendly interface, especially for TLOI, but every edit should compile to valid split events.

## 6. Proposed software representation

This section is a software proposal derived from the craft rules above; it is not established textile terminology.

### Core entities

```text
Project
  metadata, units, structure mode, project form, palette
  cords[]
  events[]
  boundaries[]

Cord
  id, plyCount, plyColours[], twistDirection, material, diameter
  start, path[], end

SplitEvent
  id, step, position
  splitterCordId, splitteeCordId
  splitPartition
  rotationSincePrevious
  frontAppearance, backAppearance

BoundaryOperation
  id, step, kind
  addCord | removeCord | turn | join | finish
  affectedCordIds[]
```

### Validation rules

A structure-specific validator should check:

- both referenced cords exist and are continuous at the event;
- a cord does not intersect itself or another cord without an explicit event;
- the split partition is compatible with the splittee's ply count;
- POT alternates each cord's splitter/splittee role;
- SCOT permits consecutive roles while preserving a possible path;
- TLOI uses the selected rotation and ply-colour rules;
- no cord is added, removed, turned, or joined without an explicit boundary operation;
- front and back previews agree with the same underlying state;
- the instructions can be followed in a valid step order.

### Separate views generated from one model

- **Design chart:** colour or symbol grid for planning.
- **Structure view:** named cords and splitter/splittee relationships.
- **Front and back previews:** important for TLOI and other two-faced work.
- **Cord plan:** ply colours, twist, quantities, and approximate lengths.
- **Step-by-step instructions:** an ordered making sequence with optional diagrams.
- **Diagnostics:** invalid or unreachable splits, broken continuity, and unsupported edge operations.

## 7. Sensible first-program scope

A practical first release should support one flat rectangular structure, then prove that it can round-trip between design, structural validation, preview, save/load, and written instructions.

Two reasonable starting points are:

- **TLOI colour-chart MVP:** attractive for motif design because visible colour behaves like pixels and an existing Excel TLOI plotter demonstrates demand. It requires careful modelling of ply order, rotation, and both faces.
- **SCOT chart MVP:** attractive for teaching the splitter/splittee decision and for flexible colour patterning. It requires a clear working-order convention so a visually valid chart is also physically makeable.

The recommendation is to prototype the event model with a very small SCOT sampler, then add a TLOI motif editor as the first polished design workflow. POT and three-dimensional shaping should follow only after the underlying cord-continuity model is trusted.

### Questions to settle with an experienced maker before implementation

- Which working orientation, cord numbering, handedness, and symbol conventions should the UI use?
- What exact start, edge, turn, and finish methods belong in version 1?
- For each supported structure, which rotations are required, optional, or invalid?
- How should a chart show the selected gap in a three-ply or four-ply cord?
- What information does a maker need at each physical step: cord number, direction, colour, role, split location, or all of these?
- How should cord take-up and required length be estimated from real samples?
- Which traditional motifs may be included, with what names, provenance, permission, and attribution?

## 8. Existing resources

### Best starting points

1. [PlySplitBraiding.com — About](https://www.plysplitbraiding.com/about) — concise definition, history, terminology, and the limits of the standard abbreviations.
2. [PlySplitBraiding.com — Traditional ply-split braiding](https://www.plysplitbraiding.com/traditional-ply-split-braiding) — cultural background, traditional objects, and examples of SCOT, combined SCOT/POT, and TLOI.
3. [PlySplitBraiding.com — Tools and materials](https://www.plysplitbraiding.com/toolsmaterials) — cords, gripfids, cord winders, and current suppliers.
4. [The Braid Society — Ply splitting](https://thebraidsociety.wildapricot.org/Ply-splitting) — a beginner page and a linked Julie Hedges introductory guide covering basic splitting, PSD, SCOT, and POT.
5. [Louise French — Getting started](https://www.louisefrench.com/techniques/getting-started/getting-started.html) — beginner-oriented equipment and learning advice.
6. [Louise French — Making cords](https://www.louisefrench.com/making_cords_for_ply-splitting.htm) — comparison of cord-making methods and equipment.
7. Julie Hedges, Sandy Jessett, and Jennie Parry, [*Basic Ply-Splitting*](https://thebraidsociety.wildapricot.org/resources/Documents/Current%20lists%20and%20documents/BasicPly-Splittingforweb.pdf) (The Braid Society) — the clearest short primary source found for the cord-position `A>B` splitting notation and letter-coded colour sequences used to write patterns as text; see [Section 9](#9-conventions-for-writing-patterns-as-text).[^hedges-leaflet]

### Foundational and technical reading

- Peter Collingwood, *The Techniques of Ply-Split Braiding* (1998). This remains the foundational comprehensive reference. [Borrowable digital copy at Internet Archive](https://archive.org/details/techniquesofplys0000coll/page/n5/mode/2up) (account/loan may be required).
- Betsy D. Quick and Judith A. Stein, *Ply-Split Camel Girths of West India* (1982), Fowler Museum/UCLA — important field documentation of cord making and the traditional structures.
- Julie Hedges, *Ply-Split Braiding: An Introduction to Designs in Single Course Oblique Twining* (2006; second edition 2018) — widely recommended beginner text.
- Linda Hendrickson, *Great SCOT! A Beginner's Guide to Ply-Split Braids in Single Course Oblique Twining* (2000).
- David W. Fraser, [“View From the Shoulders of Thar Masters: New Space for Ply-Split Braiding”](https://digitalcommons.unl.edu/tsaconf/67/) (2010) — a clear comparison of POT, SCOT, and TLOI plus discussion of three-dimensional POT.
- David W. Fraser, “Mathematics of Design in Plain Oblique Twining,” *The Textile Museum Journal* 49 (2022), pp. 8–27. [Journal issue page](https://museum.gwu.edu/volume-49-2022) — especially relevant to computational shaping and predictive models.
- Peter Collingwood's short magazine articles are indexed in the [University of Arizona weaving archive](https://www2.cs.arizona.edu/patterns/weaving/articles937.html):
  - [“Single Course Oblique Twining” (PDF)](https://www2.cs.arizona.edu/patterns/weaving/articles/cp_obtwn.pdf)
  - [“Ply-Split Braiding” (PDF)](https://www2.cs.arizona.edu/patterns/weaving/articles/cp_spb1.pdf)
  - [“Ply-Split Braiding II” (PDF)](https://www2.cs.arizona.edu/patterns/weaving/articles/cp_spb2.pdf)

### Bibliography, examples, and community

- [Ply-split braiding links and resources](https://www.plysplitbraiding.com/links-and-resources) — curated books, articles, videos, organisations, and software.
- [Full ply-split braiding bibliography (August 2025 PDF)](https://www.plysplitbraiding.com/s/PlySplit-bibliography-final-version-August-2025.pdf) — the most useful current reading index found during this review.
- [Contemporary ply-splitting](https://www.plysplitbraiding.com/contemporary-ply-splitting/) and the site's [gallery](https://www.plysplitbraiding.com/gallery) — examples of current artistic practice.
- [Ply-Split Aficionados discussion group](https://groups.io/g/plysplit) — worldwide discussion and online show-and-tell/demo meetings.
- [The Braid Society](https://thebraidsociety.wildapricot.org/) — books, events, tutors, and the journal *Strands*.

### Existing software

The only purpose-built design software found in this initial review is **Ply-Split TLOI Plotter**, an Excel macro by Ginko Koubou/Ginko Arita for designing and plotting TLOI patterns:

- [Product/download page](https://ginakoubou.ocnk.net/product/24)
- [Explanatory video](https://www.youtube.com/watch?v=xPhlQAwhELs)

Before treating it as a baseline, test its supported platforms, file format, chart conventions, export options, and handling of front/back colour. Its implementation and pattern assets must not be copied without checking their licences or obtaining permission.

## 9. Conventions for writing patterns as text

The clearest primary sources reviewed — Collingwood's *Weaver's* magazine articles and Julie Hedges' Braid Society leaflet — independently converge on the same shorthand for writing a pattern as reproducible instructions, not just a picture.[^hedges-leaflet][^obtwn-article][^spb1-article]

1. **Cord position numbering.** Cords are numbered by their position in the current working row (e.g. left to right, or around a tube), not by a fixed identity. A given physical cord's number changes as it moves through the row.
2. **Splitter > splittee notation.** A split is written `A>B`, meaning the cord at position A splits the cord at position B. A splitter passing through several splittees in sequence chains the targets: Collingwood writes `4 > 1, 2, & 3` (cord 4 splits cord 1, then 2, then 3); Hedges writes the equivalent as `2>3`, `4>5`, `6>7` per row, or `1>2,3,4` for one cord splitting three others in turn.
3. **Row-by-row instructions with explicit turn state.** Steps are grouped into rows, and every row ends by stating whether the work is turned over, e.g. Hedges' "Row 1 (short): Omit 1st cord, 2>3, 4>5, 6>7, leave 8 unsplit. Turn work over." / "Row 2 (long): 1>2, 3>4, 5>6, 7>8. Turn work over." Collingwood's SCOT description likewise states "Do not turn the piece over" as a explicit instruction, not an assumed default.
4. **Colour sequence as a letter string.** The colour of each cord, in starting position order, is written as one letter string: `CBAAAABC`, `AABBBBAA`, `AAAABBBB`. Repeated letters show which adjacent cords are visually paired. The same letter-string convention describes a single cord's own ply colour layout around its circumference (`AABB`, `ABAB`, `AAAB`, `ABAC`...), consistent with the `AABB` notation already used in [Section 3](#3-materials-and-tools).
5. **Quarter-twist rotation notation.** Rotation of a cord between successive splits is counted in quarter turns: Collingwood's diagrams use one oblique line per quarter twist on the cord, and the text states counts explicitly ("leave a quarter twist... between this and their splitting in the previous row").
6. **Structure name prefixes the whole pattern.** POT, SCOT, and TLOI each imply different default alternation and rotation rules, so the abbreviation is stated once for the whole pattern rather than repeated at every step.

Put together, a plain-text pattern in this convention reads like:

```text
Structure: SCOT
Setup: 4 cords x 4-ply, colour order CBAAAABC
Row 1: 1>2,3,4,5,6,7,8. Pull splitter tight. Do not turn.
Row 2: 1>2,3,4,5,6,7,8. Pull splitter tight. Do not turn.
...
```

This maps closely onto the `SplitEvent` schema already sketched in [Section 6](#6-proposed-software-representation): `splitPartition` is the real-world comma/ampersand-separated splittee list, and `rotationSincePrevious` already matches the quarter-twist counting used in the sources. It also answers part of the open question in [Section 7](#7-sensible-first-program-scope) about cord numbering and symbol conventions — position-based numbering with an explicit turn state per row is the existing convention to build on or deliberately diverge from.

Caveat: this is the convention found in two authoritative English-language sources, not a verified universal standard. [Section 8](#8-existing-resources) already notes that terms and diagram conventions are not necessarily uniform across books, teachers, or regions; the same caution applies to this row/notation shorthand.

## 10. Research cautions

- Terms and diagram conventions are not necessarily uniform across books, teachers, or regions.
- A visually plausible chart is not proof that a piece is physically makeable.
- Tension, cord compression, friction, and take-up can materially alter geometry; a schematic preview should say that it is schematic.
- Some books are out of print, and some online resources require an account or purchase.
- Link availability changes. Record retrieved copies and permissions before relying on a resource as a permanent application dependency.
- Traditional patterns, photographs, diagrams, and instructional texts can be culturally significant and/or copyrighted. Store provenance and licence metadata with every bundled asset.

## References

[^about]: [PlySplitBraiding.com, “About ply-split braiding”](https://www.plysplitbraiding.com/about), accessed 2026-09-03.
[^traditional]: [PlySplitBraiding.com, “Traditional ply-split braiding”](https://www.plysplitbraiding.com/traditional-ply-split-braiding), accessed 2026-09-03.
[^tools]: [PlySplitBraiding.com, “Tools and materials for ply-split braiding”](https://www.plysplitbraiding.com/toolsmaterials), accessed 2026-09-03.
[^fraser]: David W. Fraser, [“View From the Shoulders of Thar Masters: New Space for Ply-Split Braiding”](https://digitalcommons.unl.edu/tsaconf/67/), Textile Society of America Symposium Proceedings, 2010.
[^bibliography]: [*Ply-Split Braiding Bibliography*](https://www.plysplitbraiding.com/s/PlySplit-bibliography-final-version-August-2025.pdf), compiled by Helen Leaf, updated 2025-08-04.
[^cord-making]: [Louise French, “Making Cords for Ply-split Braiding”](https://www.louisefrench.com/making_cords_for_ply-splitting.htm), accessed 2026-09-03.
[^hedges-leaflet]: Julie Hedges, Sandy Jessett, and Jennie Parry, [*Basic Ply-Splitting*](https://thebraidsociety.wildapricot.org/resources/Documents/Current%20lists%20and%20documents/BasicPly-Splittingforweb.pdf) (The Braid Society leaflet, 2003/2006; PDF text © Julie Hedges 2016), retrieved 2026-09-03 and archived at `tmp/pdfs/hedges-basic-plysplitting.pdf`. The server blocks default command-line user agents; fetch with a standard browser `User-Agent` header if re-downloading.
[^obtwn-article]: Peter Collingwood, “Ply-Split Braiding,” *Weaver's* Issue 29 (Winter 1998), pp. 47–48 — archived at `tmp/pdfs/cp_obtwn.pdf`.
[^spb1-article]: Peter Collingwood, “Single Course Oblique Twining,” *Weaver's* Issue 31, pp. 57–58 — archived at `tmp/pdfs/cp_spb1.pdf`.
