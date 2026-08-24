# MULTICHECK DESIGN SYSTEM (visual source of truth)

Adapted from the supplied Figma reference direction: Swiss clarity, calm, premium
educational software. (Figma file was not authorable — read-only token — so the design
system is implemented directly in code as the single source of truth.)

## Foundations
- **Color**: neutral-dominant. ink #16181D, page #F4F3F0 (warm off-white), surface #FFF,
  line #E7E5E0 (hairline). ONE restrained accent: brand blue #2C5FE0 (serious/trustworthy,
  not crypto-teal). good #1F8A4C, bad #C0392B, warn #B7791F. No gradients, no glass.
- **Typography**: Inter (next/font). Scale: 2xs 11 / xs 12 / sm 13 / base 15 / lg 17 /
  xl 22 / 2xl 30 / 3xl 40. Tight tracking on display sizes. tabular-nums for data.
- **Spacing**: 24px shell gutter, consistent 16/12/9px radius, 4px hairline borders.
- **Motion**: fade-up 220ms ease-out on enter; 150–300ms transitions; respects
  prefers-reduced-motion. No bounce, no floating, no looping.

## Components (components/ui.tsx)
Card, StatCard, ProgressRing, Bar, StatusDot, Button(primary/secondary/ghost).
Answer states: default/hover/selected/correct(goodSoft)/incorrect(badSoft) + icon+label
(not color-only). Min 44px touch targets.

## Layout
Desktop: 232px sticky sidebar + shell (max 1080px). Mobile: bottom nav (5 primary),
single column, no horizontal scroll.

## Principles
One obvious primary area per screen (Heute = recommended session). Premium = consistency,
not decoration. Every number must drive a decision.
