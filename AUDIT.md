# AUDIT.md — Multicheck Attest (EBA) Coach

Audit date: 2026-08-24. Method: code inspection + HTTP route check + generator
validation (no headless browser available in this environment).

## Current architecture
- `lib/curriculum.ts` — skills list (wrong taxonomy)
- `lib/questions.ts` — generators (math + tiny german + logic seq only)
- `lib/learner.ts` — mastery model, adaptive selectNext, readiness
- `app/page.tsx` (Home), `/practice`, `/diagnostic`, `/exam`, `/progress`, `/tutor`
- `app/api/tutor` — Z.AI key, graceful fallback

## Inventory of issues (Severity)
| Feature | Status | Sev | Problem | Fix |
|---|---|---|---|---|
| Taxonomy | WRONG | P0 | Skills (add/sub/mul/div/frac/dec/pct/ratio) don't match official Attest EBA 7 areas/11 subskills | Rewrite to official taxonomy |
| Konzentration engine | MISSING | P0 | Bilder zählen / Symbole entdecken absent | Build visual SVG generators |
| Merkfähigkeit engine | MISSING | P0 | Schilder erinnern (stimulus→delay→recall) absent | Build recall flow |
| Praktisches Grundwissen | MISSING | P0 | Sortierverfahren / Alltagswissen absent | Build generators |
| Textschreiben | MISSING | P0 | Timed 10-min writing trainer absent | Build writing mode |
| Fehlerliste | MISSING | P0 | No mistake-review system; mistakes not stored/prioritized | Add error store + review |
| Prüfung modes | PARTIAL | P1 | Only 1 mixed mode (12 Q). Need Standortbestimmung / Mini / Vollständig (90min, autosave, no immediate feedback) | Build 3 modes |
| Heute command center | PARTIAL | P1 | Home shows 3 cards but no countdown/streak/today's training plan | Rebuild as Heute |
| Training hierarchy | MISSING | P1 | No official skill-tree view with subskill status | Build Training page |
| Progress analytics | PARTIAL | P1 | No accuracy-vs-speed 2-axis, no per-category trends | Expand |
| Indefinite "Lade…" | RISK | P1 | If JS fails, stuck on Lade… | Add failure/timeout state |
| Affiliation disclaimer | MISSING | P1 | No "not affiliated with gateway.one" notice | Add footer + exam pages |
| Question volume | THIN | P2 | ~10 generators only; risk of repeat | Expand to 60+/subskill or generators |
| Accessibility | WEAK | P2 | Keyboard/ARIA minimal | Add keyboard nav, focus, ARIA |
| AI 429 | EXTERNAL | P2 | Z.AI key rate-limited; handled by fallback | Retry later; acceptable |

## Decision
Rebuild core lib (curriculum + questions + learner) to official taxonomy + 7 engines,
add 5 destinations (Heute/Training/Prüfung/Fehler/Fortschritt), Fehlerliste, exam modes,
disclaimer. Preserve: adaptive logic, deterministic math, AI tutor fallback, localStorage persistence.
