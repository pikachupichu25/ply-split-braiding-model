# Colourway Designer — UI review (2026-09-15)

A walkthrough of `#/colour` in the browser: the template picker, the paint screen, the
colour editor, the paint gestures (strip tap, sweep, tap-on-braid), and the desktop,
tablet (768 px) and phone (375 px) widths. No console errors at any width.

Ranked by how badly each item misleads or blocks a maker, then by cost. All nine items have landed. Update the
status column if any regress; strike a row out or delete it once it has shipped and the
spec reflects it.

| # | Status | Severity | Item | What was seen | Suggested fix |
| --- | --- | --- | --- | --- | --- |
| 1 | ✅ Done | Critical | Cord strip hid most cords | The strip was a horizontally scrolling flex row with no scrollbar or edge fade. Desktop showed cords 1–8 of 32; tablet showed exactly 1–16, ending on a symmetric `C` so the strip *looked* complete. Tapping the braid highlighted cords that were off-screen. | Strip is now a wrapping grid (`repeat(auto-fill, minmax(var(--cw-cord-min), 1fr))`, 48 px minimum on touch). Spec §"Touch layout" updated. |
| 2 | ✅ Done | High | Picker card overflows | The preset note prints the raw cord string (`CBAAAAAAAAAAAABCCB…`) in monospace with no wrapping, so the thumbnail and note push ~16 px past the "Chevron" card's right border at the 190 px column. 64 cords doubles it. | `.cw-preset { min-width: 0 }` and `.cw-preset-note { overflow-wrap: anywhere }`; the note now wraps inside the card. Replacing the string with counts is still #4. |
| 3 | ✅ Done | High | Phone: sticky paint bar taller than the screen | At 375×812 the paint bar is ~700 px tall pinned at `top: 318px`, so the palette (the brush picker) sits below the fold while stuck. With 64 cords it is ~1300 px. Spec acceptance #14 (preview, strip and palette visible together) no longer holds past ~16 cords. | The paint bar no longer sticks as a whole: the preview stays pinned at the top, the palette (`.cw-palette-bar`) pins to the bottom of the viewport within thumb reach, and the strip scrolls between them. Spec §8 diagram, CW-20 and acceptance #14 updated. |
| 4 | ✅ Done | Medium | Preset note is low-information | A 32-letter string tells a maker nothing at a glance. | Preset cards now read `24 A · 4 B · 4 C` (`describeCounts` in `colourwayTemplates.ts`). |
| 5 | ✅ Done | Medium | Chevron grouping not legible in the strip | Rows now wrap, but nothing shows which cords belong to which chevron. | Templates can name a repeating unit (`build().group`); the strip draws one labelled group per unit — *Chevron 1 · cords 1–16* — each wrapping on its own, so rows line up per chevron. |
| 6 | ✅ Done | Medium | Tap-on-braid feedback on phones | Painting from the braid highlights the cord in the strip, but on a phone that cord may be scrolled out of view. | Braid taps call `scrollIntoView({ block: 'nearest' })` (smooth unless reduced motion), with a `scroll-margin` on narrow screens so the cord lands between the pinned preview and palette. |
| 7 | ✅ Done | Low | Notice text far from the action | The live-region message ("Cord 27 painted C") sits in the footer, easy to miss on desktop. | The live region moved into the palette bar, directly under the swatches (and so pinned on phones). |
| 8 | ✅ Done | Low | Disabled "Reset to Chevron" reads as enabled | The disabled state is only a slightly lighter border. | Disabled buttons and selects render at 40 % opacity with `cursor: not-allowed`. |
| 9 | ✅ Done | Low | Stage note is hard to read | One long 10 px uppercase line under the preview. | Sentence case at 11 px, with the repeats/rows figure set off in bold from the painting hint. |

## Notes

- The dev server on :5173 was reused; the Chrome extension was not connected, so the
  review ran in the app's browser pane.
- `npm test` has 9 pre-existing failures in `tests/cordNetwork.test.ts` (segment-count
  assertions); they fail identically with the designer changes stashed and are not
  related to this review.
