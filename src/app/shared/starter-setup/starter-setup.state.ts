import { StarterItem, StarterResult } from './starter-setup.models';

/** One proposal in the review list, as the user edits it. */
export interface StarterRow {
  readonly key: string;
  readonly group: string;
  readonly why: string;
  readonly hints: readonly string[];
  readonly selected: boolean;
  readonly expanded: boolean;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface StarterGroup {
  readonly group: string;
  readonly rows: readonly StarterRow[];
}

export interface RaciSlot {
  readonly type: 'user' | 'role' | 'department';
  readonly value: string;
  readonly raci: 'R' | 'A' | 'C' | 'I';
}

/** Every proposal starts selected and collapsed. */
export function toRows(items: readonly StarterItem[]): StarterRow[] {
  return items.map((item) => ({
    key: item.key,
    group: item.group,
    why: item.why,
    hints: item.hints ?? [],
    selected: true,
    expanded: false,
    fields: structuredClone(item.fields) as Record<string, unknown>,
  }));
}

/** Rows grouped in first-seen order. */
export function groupRows(rows: readonly StarterRow[]): StarterGroup[] {
  const groups = new Map<string, StarterRow[]>();
  for (const row of rows) {
    const list = groups.get(row.group) ?? [];
    list.push(row);
    groups.set(row.group, list);
  }
  return [...groups].map(([group, list]) => ({ group, rows: list }));
}

export function updateRow(
  rows: readonly StarterRow[],
  key: string,
  change: (row: StarterRow) => StarterRow,
): StarterRow[] {
  return rows.map((row) => (row.key === key ? change(row) : row));
}

export function setField(row: StarterRow, name: string, value: unknown): StarterRow {
  return { ...row, fields: { ...row.fields, [name]: value } };
}

/** The required fields of a row that are still empty. */
export function missingRequired(row: StarterRow, result: StarterResult): string[] {
  return result.fields
    .filter((f) => f.required)
    .filter((f) => {
      const value = row.fields[f.name];
      return value === null || value === undefined || String(value).trim() === '';
    })
    .map((f) => f.name);
}

/** The accept payload: the selected rows' fields. */
export function selectedItems(rows: readonly StarterRow[]): { fields: Record<string, unknown> }[] {
  return rows.filter((r) => r.selected).map((r) => ({ fields: { ...r.fields } }));
}

/** One tag per line (names such as "Kontor Bergen (Bergen, NO)" may contain commas). */
export function parseTags(text: string): string[] {
  return text
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function raciSlots(value: unknown): RaciSlot[] {
  return Array.isArray(value) ? (value as RaciSlot[]) : [];
}

/** Sets the letter of one slot; a new A turns the previous A into an R (exactly one A). */
export function setRaciLetter(
  slots: readonly RaciSlot[],
  index: number,
  raci: RaciSlot['raci'],
): RaciSlot[] {
  return slots.map((slot, i) => {
    if (i === index) {
      return { ...slot, raci };
    }
    return raci === 'A' && slot.raci === 'A' ? { ...slot, raci: 'R' } : slot;
  });
}

/** Points one slot at another assignee (`type:value` from the lookups). */
export function setRaciAssignee(
  slots: readonly RaciSlot[],
  index: number,
  ref: string,
): RaciSlot[] {
  const [type, ...rest] = ref.split(':');
  return slots.map((slot, i) =>
    i === index ? { ...slot, type: type as RaciSlot['type'], value: rest.join(':') } : slot,
  );
}

/** The hints a RACI row needs now (after edits): no A / no R. */
export function raciHints(slots: readonly RaciSlot[]): string[] {
  const letters = new Set(slots.map((s) => s.raci));
  const hints: string[] = [];
  if (!letters.has('A')) {
    hints.push('no_accountable');
  }
  if (!letters.has('R')) {
    hints.push('no_responsible');
  }
  return hints;
}
