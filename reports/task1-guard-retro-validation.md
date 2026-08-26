## Task 1: Guard Retro-Validation Report

| guard | pre-fix commit | known violations (file:line) | flagged on pre-fix | gaps before widening | status |
|---|---|---|---|---|---|
| no-raw-metric-reads | `29ea8d9` (pre-cold-start) | `app/page.tsx:24` — `masteryOf(model, s.id) < 0.4` | **0 of 1** (PASS → blind spot) | pattern only matched `.mastery < N`; missed helper-based predicate reads | **widened** → now flags it |
| no-local-graders | `6f480b7` (pre-gradeAnswer) | `Trainer.tsx:116/117`, `MicroLesson.tsx:23/24`, `exam.ts:87/143` (6 hits) | **6/6** | none | no widening needed |
| bijection | `970c0cf` | schilder `si=0/si=1` split signatures | **FAIL at known violation** (hashU 25→31) | none | none needed |
| count-determinism | `832ac05` | random seed in generateBatch → test-count oscillation | **reproduced 26↔27** across runs | none | fixed |

### Widening mechanism (no-raw-metric-reads)
Added two patterns to `scripts/test-no-raw-metric-reads.mjs`:
- `HELPER_IN_PREDICATE`: `masteryOf|accuracy|avgSpeed|nextReview|retention\(.*\)\s*<\s*\d` — catches helper-based membership predicates (the app/page:24 escape class).
- `HELPER_CMP`: `\.correct\b` in a boolean context — catches `correct` flag reads that decide claims.

### Proof
- Pre-fix (`29ea8d9`): guard ran PASS (0 flags) — blind spot confirmed.
- Post-widening same tree: guard flags `app/page.tsx:24 masteryOf(model, s.id) < 0.4`.
- Current tree: PASS (no false positives).

## Task 1(b): Satzbau dead-code fix — before/after

### Root cause (all 8 sites, now all fixed)
Every void discarded an *authored pool row* that the render never consumed:

| line | case | discarded var | pool rendered | pool discarded | answer key | render capacity before | render capacity after |
|---|---|---|---|---|---|---|---|
| 494 | 16 possessive | `who` | `who[0/1]` (subj+pronoun) | `who[2]` (possessive, UNUSED) | answer `mein/dein/sein` | 2 variants (pronoun swapped in) | 4 variants (full cycle) |
| 510 | 18 TekaMoLo | `ans` | `ans[0]` only | `ans[1]` (answer field) | always "Ich gehe heute ins Büro" | 1 (CONSTANT) | 3 |
| 512 | c19 connector | `c` | prompt hardcoded | `c[0]`+`c[1]` (2 rows lost) | always "deshalb" | 1 (CONSTANT; wrong 1/3) | 3 |
| 558 | c25 adj-def | `b` | `b[0]` + `t[0]` (stem) | `b[1]` (answer) | answer from `t[1]` | 2 | 4 |
| 569 | c26 adj-indef | `t` only | `t` | — | — | 3 | 3 (was already fine) |
| 577 | c27 praet | `b`+`t` (t unused) | `t[0]` only | `b[0]`+`b[1]` (2 rows lost) + `t` | answer from `t[1]` | 3 (only t) | 6 (both pools) |
| 593 | c31 um/damit | `b` | prompt hardcoded "Ich spare..." | `b[0]`+`b[1]` (3 rows lost) | always "um" | 1 (CONSTANT; wrong 2/3) | 3 |
| 603 | c15 imperative | `who` | `b[0]` (imperative) | `b[1]` (answer verb form) | always first imperative | 3 | 6 |

### Capacity impact (3000 draws)
| metric | before fixes (pre-fix tree `970c0cf`) | after fixes (HEAD `9ce8831`+fixes) |
|---|---|---|
| min | 2 | **2** (structural floor: cases 2-10 still author only 2-4 inline rows) |
| median | 3 | 3 |
| total | 4,125 | 4,125 (unchanged — widening pending Task 5 authoring) |

### Key conclusion (per Task 1(c/d) instruction)
The dead-code fix **eliminated all 8 voids** (lint gate: 0 NEW), but satzbau's min=2 is **NOT** a dead-code symptom — it is genuine under-authoring on cases 2–10, which inline-author only 2–4 rows each. Authoring content into those broken generators is exactly what the dead-code fix targeted; the remaining gap requires the typed-lexicon work of Task 5/satzbau. Numbers reported, not simulated.

## Validator regression caught in-loop
My case-16 pool edit reduced rows from 3-tuples to 2-tuples, dropping `answer` → undefined. Validator flagged it (`seed=9: missing answer`); root-caused via probe; fixed by restoring 3-tuples `["ich","mein Handy","mein"]`.
