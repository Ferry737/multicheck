// lib/curriculum.ts
// OFFICIAL Multicheck Attest (EBA) taxonomy, per gateway.one 2026/2027 structure.
// Source: established Attest EBA category model (Schulwissen / Potenzial / Berufsbezogen).
// Independent prep tool — NOT affiliated with gateway.one or Multicheck®.
// Subskills mapped to the official areas.

export type AreaId =
  | "deutsch" | "mathematik" | "logik" | "konzentration"
  | "merkfaehigkeit" | "praktisch" | "textschreiben";

export interface Subskill {
  id: string;
  area: AreaId;
  name: string;
  examWeight: number; // 1..5
}

export interface Area {
  id: AreaId;
  label: string;
  group: "Schulwissen" | "Potenzial" | "Berufsbezogen";
  subskills: Subskill[];
}

export const AREAS: Area[] = [
  {
    id: "deutsch", group: "Schulwissen", label: "Deutsch",
    subskills: [
      { id: "satzbau", area: "deutsch", name: "Satzbau", examWeight: 3 },
      { id: "textverstaendnis", area: "deutsch", name: "Textverständnis", examWeight: 5 },
    ],
  },
  {
    id: "mathematik", group: "Schulwissen", label: "Mathematik",
    subskills: [
      { id: "textaufgaben", area: "mathematik", name: "Textaufgaben", examWeight: 5 },
      { id: "kopfrechnen", area: "mathematik", name: "Kopfrechnen & Umwandeln", examWeight: 4 },
    ],
  },
  {
    id: "logik", group: "Potenzial", label: "Logik",
    subskills: [
      { id: "prozesslogik", area: "logik", name: "Prozesslogik", examWeight: 3 },
      { id: "wortgruppen", area: "logik", name: "Wortgruppen", examWeight: 3 },
    ],
  },
  {
    id: "konzentration", group: "Potenzial", label: "Konzentration",
    subskills: [
      { id: "bilder_zaehlen", area: "konzentration", name: "Bilder zählen", examWeight: 3 },
      { id: "symbole_entdecken", area: "konzentration", name: "Symbole entdecken", examWeight: 3 },
    ],
  },
  {
    id: "merkfaehigkeit", group: "Potenzial", label: "Merkfähigkeit",
    subskills: [
      { id: "schilder_erinnern", area: "merkfaehigkeit", name: "Schilder erinnern", examWeight: 2 },
    ],
  },
  {
    id: "praktisch", group: "Berufsbezogen", label: "Praktisches Grundwissen",
    subskills: [
      { id: "sortierverfahren", area: "praktisch", name: "Sortierverfahren", examWeight: 3 },
      { id: "alltagswissen", area: "praktisch", name: "Praktisches Alltagswissen", examWeight: 3 },
    ],
  },
  {
    id: "textschreiben", group: "Berufsbezogen", label: "Textschreiben",
    subskills: [
      { id: "textschreiben", area: "textschreiben", name: "Textschreiben (10 Min.)", examWeight: 2 },
    ],
  },
];

export const ALL_SUBSKILLS: Subskill[] = AREAS.flatMap((a) => a.subskills);

export function subskillById(id: string): Subskill | undefined {
  return ALL_SUBSKILLS.find((s) => s.id === id);
}
export function areaOf(id: string): Area | undefined {
  return AREAS.find((a) => a.subskills.some((s) => s.id === id));
}

export const EXAM_DATE_DEFAULT = new Date("2026-10-15T00:00:00");
export const EXAM_MINUTES = 90;
export const WRITING_MINUTES = 10;

export const DISCLAIMER =
  "Unabhängiges Vorbereitungswerkzeug — nicht verbunden mit gateway.one oder Multicheck®. " +
  "Unsere Werte sind Trainingswerte, keine offiziellen Multicheck-Ergebnisse.";
