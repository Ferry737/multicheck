# PRODUCTION-AUDIT.md

Critical-path audit of https://multicheck-one.vercel.app (v3→v4 hardening).
Priority order applied: P0 first. Environment has no headless browser, so client
click-through was validated by code review + build + data-layer E2E; routes verified by HTTP.

## P0 — Application startup / infinite Lade…
| ID | Sev | Screen | Problem | Root cause | Fix | Verification |
|---|---|---|---|---|---|---|
| P0-1 | P0 | All (useLearner) | Risk of indefinite "Lade…" if localStorage corrupt/blocked | useLearner only set model on success; no error state; no corruption guard | Rewrote useLearner: try/catch, schema merge (v2), corrupt→emptyModel (never stuck), explicit status 'loading'|'ready'|'error' + "Erneut versuchen" | Build + unit: corrupt JSON → ready with empty model |
| P0-2 | P0 | Trainer | getQuestions could throw → blank/Lade | wrapped in try/catch + 2.5s timeout → failed state w/ retry | done v2 | validated generators return non-empty |
| P0-3 | P1 | Trainer | fallback used removed `container-x` class (unstyled) | replaced with shell + error/retry UI | grep: 0 `container-x` in code |

## P1 — Training quality / correctness
| ID | Sev | Screen | Problem | Fix | Verification |
|---|---|---|---|---|---|
| P1-1 | P0 | Questions | subskill id not mapped to generator (v1) → Training froze | fixed v2 (GENERATORS keyed by subskill) | generateBatch returns questions |
| P1-2 | P0 | Math | answer validity | 10,080 generated + independently recomputed → 0 mismatches | scripts/validate-math.mjs |
| P1-3 | P1 | Merkfähigkeit | no memorization pause | added "Merke dir…" + explicit hide; refresh regenerates (no answer leak) | code review |

## P2 — Consistency / analytics
| ID | Sev | Screen | Problem | Fix |
|---|---|---|---|---|
| P2-1 | P2 | All | readiness formula undocumented | documented in learner.ts (mean mastery; NOT official score) |
| P2-2 | P2 | Fortschritt | consistency | single source (model) for Heute/Training/Fehler/Fortschritt/Prüfung |

## P3 — Visual
Deferred per priority order (no P0/P1 open).

## Release gate status (this iteration)
- zero P0 (startup hardened, generators valid)
- zero incorrect answer keys (10k math verified)
- full exam completable (Prüfung 3 modes)
- progress survives refresh (localStorage + migration guard)
- all 7 Attest areas trainable
- mobile bottom-nav + 44px targets
Remaining: real-browser click-through not executed here (no browser) — owner: external test / user.
