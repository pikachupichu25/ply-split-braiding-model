import type { Colourway } from '../domain/colourway.ts';
import { checkLinkedChevrons, linkedChevronsDefaults, linkedChevronsPattern, linkedChevronsPreset, minimumCordsPerChevron } from '../domain/linkedChevrons.ts';

/** A number the user sets before painting; shown as a field on the template card. */
export type TemplateParam = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
};

export type TemplateValues = Record<string, number>;

/** A locked row structure offered to the Colourway Designer with starting colourways. */
export type ColourwayTemplate = {
  id: string;
  name: string;
  /** One plain-language sentence for the picker. */
  description: string;
  /** Empty for a fixed template. */
  params: TemplateParam[];
  /** Why the values cannot be built, or undefined when they can. Ranges are already checked. */
  check?: (values: TemplateValues) => string | undefined;
  /**
   * The `.scot` source whose rows are locked, and the starting colourways; the first is the default.
   * `group` names the band's repeating unit so the cord strip can be drawn in labelled groups.
   */
  build: (values: TemplateValues) => { source: string; presets: Colourway[]; group?: { size: number; label: string } };
};

export const colourwayTemplates: ColourwayTemplate[] = [
  {
    id: 'linked-chevrons',
    name: 'Linked chevrons',
    description: 'Any number of chevrons side by side on one band, worked the way the twenty-four cord double chevron is. Choose how many cords and how many chevrons share them — one chevron on eight cords is the classic zig-zag. The pattern closes after one repeat per cord.',
    params: [
      { key: 'cords', label: 'Cords', min: minimumCordsPerChevron, max: 64, step: 1, default: linkedChevronsDefaults.cords },
      { key: 'ways', label: 'Chevrons', min: 1, max: 16, step: 1, default: linkedChevronsDefaults.ways },
    ],
    check: ({ cords, ways }) => checkLinkedChevrons({ cords, ways }),
    build: ({ cords, ways }) => ({
      source: linkedChevronsPattern({ cords, ways }),
      presets: [linkedChevronsPreset({ cords, ways })],
      group: { size: cords / ways, label: 'Chevron' },
    }),
  },
];

export const defaultColourwayTemplate = colourwayTemplates[0];

export function defaultValues(template: ColourwayTemplate): TemplateValues {
  return Object.fromEntries(template.params.map((param) => [param.key, param.default]));
}

/** Why the values cannot be used with the template, or undefined when they can. */
export function checkValues(template: ColourwayTemplate, values: TemplateValues): string | undefined {
  for (const param of template.params) {
    const value = values[param.key];
    if (!Number.isFinite(value) || value < param.min || value > param.max || (value - param.min) % param.step !== 0) {
      return `${param.label} must be a whole number from ${param.min} to ${param.max}.`;
    }
  }
  return template.check?.(values);
}

/** Stored values that still fit the template, or undefined. */
export function validateValues(template: ColourwayTemplate, value: unknown): TemplateValues | undefined {
  if (!template.params.length) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const values: TemplateValues = {};
  for (const param of template.params) {
    const item = record[param.key];
    if (typeof item !== 'number') return undefined;
    values[param.key] = item;
  }
  return checkValues(template, values) ? undefined : values;
}

/** `24 A · 4 B · 4 C` — what a colourway needs, in palette order, for a preset card. */
export function describeCounts(colourway: Colourway): string {
  const counts = new Map<string, number>();
  colourway.cords.forEach((symbol) => counts.set(symbol, (counts.get(symbol) ?? 0) + 1));
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([symbol, count]) => `${count} ${symbol}`).join(' · ');
}

/** `32 cords · 2 chevrons` — the values a parametric template was built with. */
export function describeValues(template: ColourwayTemplate, values: TemplateValues): string {
  return template.params.map((param) => `${values[param.key]} ${param.label.toLowerCase()}`).join(' · ');
}
