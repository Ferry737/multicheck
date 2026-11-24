<div align="center">

# Multicheck

**An adaptive trainer for the Swiss Multicheck entry test — built around evidence, not vibes.**
Learners train the exact sub-skills the *Attest EBA 2026/27* certificate demands, and every answer is recorded as evidence the coach uses to decide what to show next.

[![Live](https://img.shields.io/badge/Live-multicheck--one.vercel.app-00d4aa?style=for-the-badge&logo=vercel&logoColor=white)](https://multicheck-one.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-App%20Router-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](./package.json)
[![Tailwind](https://img.shields.io/badge/Tailwind-CSS-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)](./tailwind.config.ts)
[![Framer](https://img.shields.io/badge/Framer%20Motion-animations-E64CE6?style=for-the-badge&logo=framer&logoColor=white)](./package.json)

[**Open the app →**](https://multicheck-one.vercel.app) · [Curriculum](./CURRICULUM-V2.md) · [Production audit](./PRODUCTION-AUDIT.md) · [Design system](./DESIGN-SYSTEM.md)

</div>

---

## 🎯 Why this exists

Apprenticeship candidates in Switzerland sit the **Multiccheck** test before they get an apprenticeship. Most prep tools show questions; they don't show *what the learner is actually weak at*. Multicheck does both, and it can prove it.

> All items are **original**. The curriculum is verified against the official certificate; no proprietary questions are copied.

## ✨ What it does

| | |
|---|---|
| 🧭 **Diagnostic start** | The learner begins at their *demonstrated* level, not an assumed one. |
| 🧠 **Evidence-based coach** | Every attempt is recorded. An orchestrator decides the next micro-lesson from the evidence, not a fixed script. |
| 🇩🇪 **German sub-skills** | Satzbau, Textverständnis and more — each with concept maps: prerequisites, question families, difficulty progression, common mistakes. |
| 🔢 **Math generators** | 10,080 generated answers were independently recomputed during audit — **0 mismatches**. |
| 📝 **Exam simulation** | Timed `Prüfung` mode with regrade notices and a simulation archive. |
| 📈 **Progress & mistakes** | `Fortschritt` and `Fehler` screens make the weak spots visible. |
| 📴 **Offline coach** | A local coaching path keeps working when the AI provider isn't reachable. |
| 🪫 **Hardened** | Corrupt local storage, frozen generators and blank-screen states all have explicit error + retry states. |

## 🗺 The learning loop

```
   attempt  ──▶  evaluate  ──▶  explain  ──▶  correct  ──▶  retry
      ▲                                                       │
      └────────────  review  ◀──  record  ◀───────────────────┘
```

## 📁 Project layout

```
app/
├── page.tsx              ← start
├── training/             ← practice by sub-skill
├── pruefung/             ← timed exam simulation
├── tutor/                ← AI tutor
├── textschreiben/        ← writing tasks
├── fortschritt/          ← progress
├── fehler/               ← mistakes review
└── einstellungen/        ← settings
components/               ← AppShell, Trainer, MicroLesson, …
lib/
├── curriculum.ts         ← sub-skill map (drives everything)
├── orchestrator.ts     ← evidence → next action
b��─── grading.ts · exam.ts · evidence.ts · learner.ts · offlineCoach.ts · coach.ts · lessons.ts · writing.ts
└── sazbau-lexicon.json · pools.json
```

## 🚀 Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

> AI features read a provider key from the environment — see `.env.example`. Everything else runs offline.

## 📚 Documentation in this repo

| File | What's in it |
|---|---|
| [`CURRICULUM-V2.md`](./CURRICULUM-V2.md) | Concept maps per sub-skill, locked to the official Attest EBA structure |
| [`PRODUCTION-AUDIT.md`](./PRODUCTION-AUDIT.md) | P0/P1 hardening audit of the live deployment, with verification per fix |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | Tokens, components, motion rules |
| [`AUDIT.md`](./AUDIT.md) · [`CURRICULUM-AUDIT.md`](./CURRICULUM-AUDIT.md) · [`BEFORE-REDESIGN.md`](./BEFORE-REDESIGN.md) | Earlier audits and the redesign baseline |

## 🧩 Related

- **[Adaptive-Learning-Tutor](https://github.com/Ferry737/Adaptive-Learning-Tutor)** — the installable, database-backed tutor built for the same exam family.

---

<div align="center">
<sub>Built by <a href="https://github.com/Ferry737">Ferry</a> · Multiccheck® is a trademark of its owner; this is an independent preparation tool.</sub>
</div>
