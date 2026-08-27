# Release Gates — CANONICAL DEFINITIONS

These definitions are canonical as of 2026-08-26. R6/R7/R10/R12 previously existed
only as labels carried forward in "NOT RUN" claims, with no definition, setup, or
expected result. That ambiguity caused repeated wasted searching. This file is the
single source of truth; update it here, never in a chat message.

Rules that apply to every gate below:
- `PASS (proxy)` is NOT a valid verdict for R6/R7/R10/R12. Only DIRECT PASS counts.
- A gate is not PASS because the implementing function exists.
- Every gate needs a deterministic regression test committed alongside it.

---

## R6 — ADAPTIVE INTERVENTION INTEGRITY

**Purpose:** prove the coach responds *differently* to different failure/performance
modes rather than just serving more questions.

Scenarios (one controlled learner + subskill):

| Path | Input | Expected |
|---|---|---|
| A fast + wrong | several clearly fast incorrect answers | classify careless/guessing/accuracy; accuracy intervention; no speed reward; difficulty must NOT rise from speed; no beginner concept lesson without independent concept evidence |
| B slow + correct | correct but clearly above the subskill timing target | correctness still credited; speed/fluency intervention; no concept-gap lesson; no accuracy punishment |
| C repeated related failure | ~3 related failures on one concept | drill → MicroLesson → explanation → worked example → guided task → independent retest → mastery check → resume |
| D recovery | correct answers after intervention | failure streak clears; coach does not stay stuck in intervention mode |

**Evidence required:** attempt pattern, responseMs, error classification, intervention
chosen, difficulty before/after, resulting next questions.
**PASS only if all four behavioural paths differ appropriately.**

---

## R7 — LONGITUDINAL PLAN ADAPTIVITY

**Purpose:** prove "Heute trainieren" genuinely changes over time from learner behaviour.

Profiles: weak Math · slow but accurate · fast careless · poor retention · strong ·
practice-strong/simulation-weak. Run each ≥10 sessions including spaced/delayed evidence.

Per session record: selected subskills, allocation/count, difficulty, intervention type,
due reviews, unseen checks, simulation recommendation, readiness.

Expected divergence: weak Math → more Math; slow accurate → speed work not beginner
teaching; fast careless → accuracy work; poor retention → shorter review intervals /
more due review; strong → harder/unseen and less trivial repetition;
practice-strong/sim-weak → more simulation/exam conditioning.

**FAIL if different profiles receive nearly identical plans.** Also verify improvement
moves the plan (weak skill improves → allocation decreases / difficulty rises).
Synthetic scale is acceptable, plus ≥1 real browser multi-session smoke.

---

## R10 — FULL EXAM INTEGRITY + RECOVERY

**Purpose:** prove a complete Full Simulation behaves like an exam and survives
interruption. A partial run (e.g. 5/14) is useful evidence but does NOT complete R10.

Requires a fresh Full Simulation on live production, **completed end to end**, verifying:
instructions · all sections reachable · no correctness feedback · no hints · no
MicroLessons · no AI coaching · stable question order · answers persist · absolute
deadline · refresh does not reset timer · refresh restores position · close/reopen
resumes if supported · memory stimulus cannot be re-exposed · section transitions ·
submission succeeds exactly once · double-submit does not duplicate · consistent result
calculation · simulation updates the student model · simulation changes the future plan.

**Critical adaptivity test:** record Math state before, perform intentionally poorly in
Math, complete the exam, then record Math mastery, confidence, readiness and next-plan
Math priority. Poor simulation must materially affect future training.

---

## R12 — PERSISTENCE + IDEMPOTENCY + DATA INTEGRITY

**Purpose:** prove long-term history cannot be lost, duplicated or corrupted by normal
browser behaviour.

- **Training:** answer → refresh → continue; history stays correct.
- **Fehler:** exact wrong answer + correct answer recorded; no duplicate entry from
  rerender/refresh.
- **Fortschritt:** recompute analytics independently; displayed values must match
  persisted history.
- **Textschreiben:** draft restored; absolute deadline continues; timer does not reset;
  submit clears the right draft state.
- **Double actions:** double-click submit, repeated Enter, back/forward, rapid
  navigation, refresh immediately after answer/submission → no duplicate attempts,
  simulation results, error records, or readiness double-update.
- **Corrupt/old storage:** missing fields, older schema, malformed non-critical state →
  graceful migration/reset/fallback, no blank screen, no silent corruption.

**PASS only when write-side AND read-side integrity are both verified.**

---

## Deployment policy

Canonical path is GitHub → Vercel Git integration; production auto-deploys from `main`.
`VERCEL_TOKEN` and a local `.vercel` link are NOT release requirements. If no preview
deployment is produced, record `PREVIEW: UNAVAILABLE VIA CURRENT GIT INTEGRATION` — not
a blocker on its own, but production testing must not be weakened: local build/tests →
local browser verification → merge → exact production SHA verification → production
browser QA → fix → second production browser QA.

## QA naming

This environment cannot run the literal Claude-Code `/qa --exhaustive` skill. Never
report that command as executed. Run the equivalent matrix with available browser
tooling and label the results:

- `PRODUCTION QA EQUIVALENT PASS #1`
- `PRODUCTION QA EQUIVALENT PASS #2`

Pass #2 requires 0 P0, 0 P1, 0 unresolved functional P2 from a fresh state.
