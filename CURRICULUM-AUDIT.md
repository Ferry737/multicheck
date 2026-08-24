# CURRICULUM-AUDIT — Multicheck Attest (EBA) 2026/27

Versioned curriculum lock. Every training question maps to: category · subskill · concept · difficulty(0–100) · learning objective · estimated response time · question type.

## Coverage matrix

| Area | Subskill | Trained via | Validated variants | Difficulty levels | Mastery measured by | Speed measured by | Retention measured by | Gaps |
|---|---|---|---|---|---|---|---|---|
| Deutsch | Satzbau | generator `genSatzbau` (sort) | word-order sets | 1–3 | accuracy+EMA | ms vs 20s target | spaced recall | more sentence variety |
| Deutsch | Textverständnis | generator `genTextverst` (reading) | 3 texts | 1–3 | accuracy | ms vs 30s | spaced | more texts |
| Mathematik | Textaufgaben | `genPercent/Money/Word/Frac` | 4 generators | 1–3 | accuracy | ms | spaced | more word-problem templates |
| Mathematik | Kopfrechnen & Umwandeln | `genMental` (conv+arith) | 2 families | 1–3 | accuracy | ms vs 15s | spaced | harder mental |
| Logik | Prozesslogik | `genProzess` (sort) | 3 sequences | 1–3 | accuracy | ms vs 25s | spaced | more sequences |
| Logik | Wortgruppen | `genWortgruppen` (odd-one-out) | 3 sets | 1–3 | accuracy | ms vs 22s | spaced | more categories |
| Konzentration | Bilder zählen | `genBilderZaehlen` (visual SVG) | grid 4–6 | 1–3 | accuracy | ms vs 18s | spaced | mobile reflow verified |
| Konzentration | Symbole entdecken | `genSymbole` (visual SVG) | grid 4–5 | 1–3 | accuracy | ms vs 20s | spaced | **P0 fixed**: prompt now matches counted symbol |
| Merkfähigkeit | Schilder erinnern | `genSchilder` (recall) | 8 signs, k=3–4 | 1–3 | accuracy | ms vs 25s | spaced (core) | retention interval tuning |
| Praktisch | Sortierverfahren | `genSort` (numbers) | n=4 | 1–3 | accuracy | ms vs 25s | spaced | real sorting tasks |
| Praktisch | Alltagswissen | `genAlltag` (safety) | 3 scenarios | 1–3 | accuracy | ms vs 25s | spaced | more scenarios |
| Textschreiben | Textschreiben | timed writing UI | open topics | n/a | AI eval (draft) | timer+deadline | n/a | rubric scoring |

## Difficulty calibration (Phase 4)
Continuous `difficultyScore` 0–100 per question, calibrated from `TYPE_BASE` + level step, refined by empirical success-rate/response-time as usage grows. Display labels: Leicht/Mittel/Schwer/Sehr schwer.

## Next audit actions
- Phase 17 human audit: sample 30–50 per subskill for Natural German / ambiguity / distractor plausibility.
- Phase 18 hard-mode audit: produce Easy/Medium/Hard/VeryHard samples per subskill; verify Hard requires substantially more skill.
- Expand generator template variety to reduce memorization risk (Phase 32).
