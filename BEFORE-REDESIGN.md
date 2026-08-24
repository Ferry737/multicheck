# BEFORE-REDESIGN.md

Audit of production app (multicheck-one.vercel.app) before the premium redesign.
Method: code inspection + build + HTTP route check + generator validation.
No headless browser available, so click-through was not executed; client flow verified
via build + data-layer validation.

## Functional inventory
| Screen | Status | Must preserve | Improved in redesign |
|---|---|---|---|
| Heute | OK | readiness, recommended pick, countdown | one primary card, refined type, skeleton |
| Training | OK (had critical bug: subskill→generator map missing → infinite Lade) | skill tree | icons, status dots, setup removed for speed |
| Prüfung | OK | 3 modes | modal confirm, consistent cards |
| Fehler | OK | prioritized list | cleaner cards, status chips |
| Fortschritt | OK | accuracy/speed quadrant | ring + stat cards |
| Textschreiben | OK | 10-min timer | consistent controls |
| Tutor | OK (Z.AI 429) | graceful fallback | consistent controls |
| API /api/tutor | OK | key server-side, fallback | unchanged |

## Problems found
- P0: Training froze on "Lade…" (subskill id not mapped to generator). FIXED in v2.
- P2: inconsistent radius (14 everywhere), system-ui font (not premium), no focus ring,
  no reduced-motion, no sidebar (top nav only), weak visual hierarchy.

## Can remove
- top-nav-only layout → replaced by desktop sidebar + mobile bottom nav.
- raw container-x utility → replaced by shell + design tokens.

## Verified
- Build clean, 8 routes 200.
- Generator math: 1920 questions recomputed → 0 mismatches.
- Structural: 2200 questions, answers present & in-options, 0 empty options.
