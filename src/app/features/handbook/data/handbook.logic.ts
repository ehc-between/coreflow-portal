import { WorkItem } from '../../../core/tasks/task.models';
import { BadgeTone } from '../../../shared/ui/badge/badge';
import { laneOf } from '../../my-work/my-work-data';
import {
  HandbookBand,
  HandbookBox,
  HandbookDocument,
  HandbookDot,
  HandbookMap,
  HandbookProcedure,
  HandbookRisk,
} from './handbook.models';

/** The band of the process map → its eyebrow / kind label key (`handbook.bands.<band>`). */
export const BAND_ORDER: readonly HandbookBand[] = ['management', 'core', 'support'];

/** Status dot colour (design tokens). */
export const DOT_CLASS: Readonly<Record<HandbookDot, string>> = {
  ok: 'bg-pass',
  warn: 'bg-warn',
  bad: 'bg-fail',
};

/** "Erik Larsen (produksjonsleder)" → "Erik". */
export function firstName(name: string | null | undefined): string {
  const clean = (name ?? '').split(' (')[0].trim();
  return clean.split(/\s+/)[0] ?? '';
}

/** Every box, core first (the value chain), then management, then support. */
export function allBoxes(map: HandbookMap | null): HandbookBox[] {
  if (!map) {
    return [];
  }
  return [...map.core, ...map.management, ...map.support];
}

export function isEmptyMap(map: HandbookMap | null): boolean {
  return allBoxes(map).length === 0;
}

/** A group on "Alle prosedyrer": one per process (with procedures), "Uten prosess" last. */
export interface ProcedureGroup {
  /** The process, or null for "Uten prosess". */
  readonly process: HandbookBox | null;
  readonly documents: readonly HandbookDocument[];
}

/**
 * Group the readable work procedures by the process(es) they belong to (a procedure
 * used by two processes shows under both); procedures no process uses come last.
 */
export function groupProcedures(
  map: HandbookMap | null,
  documents: readonly HandbookDocument[],
): ProcedureGroup[] {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const used = new Set<string>();
  const groups: ProcedureGroup[] = [];
  for (const box of allBoxes(map)) {
    const docs = (box.procedure_ids ?? [])
      .map((id) => byId.get(id))
      .filter((d): d is HandbookDocument => !!d);
    docs.forEach((d) => used.add(d.id));
    if (docs.length) {
      groups.push({ process: box, documents: docs });
    }
  }
  const rest = documents.filter((d) => !used.has(d.id));
  if (rest.length) {
    groups.push({ process: null, documents: rest });
  }
  return groups;
}

/** Move the process at `index` one step up (-1) or down (+1) in its band. */
export function moveInBand(ids: readonly string[], index: number, dir: -1 | 1): string[] {
  const target = index + dir;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) {
    return [...ids];
  }
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The pill of a procedure row: what needs attention, else how well it is read. */
export function procedurePill(p: HandbookProcedure): {
  readonly key: string;
  readonly params?: Record<string, unknown>;
  readonly tone: BadgeTone;
} {
  if (p.review_overdue) {
    return { key: 'handbook.procedure.reviewOverdue', tone: 'warn' };
  }
  if (p.read_pct !== null && p.read_pct !== undefined) {
    return {
      key: 'handbook.procedure.readPct',
      params: { pct: p.read_pct },
      tone: p.read_pct >= 80 ? 'pass' : 'warn',
    };
  }
  if (p.review_soon) {
    return { key: 'handbook.procedure.reviewSoon', tone: 'warn' };
  }
  if (p.status === 'approved') {
    return { key: 'handbook.procedure.approved', tone: 'pass' };
  }
  return { key: 'handbook.procedure.draft', tone: 'neutral' };
}

export function riskTone(level: HandbookRisk['level']): BadgeTone {
  switch (level) {
    case 'high':
      return 'fail';
    case 'medium':
      return 'warn';
    case 'low':
      return 'pass';
    default:
      return 'neutral';
  }
}

/** "94 %" / "2 dager" — a KPI value with its unit (a percent sign hugs the number). */
export function withUnit(value: number | string | null, unit: string | null): string {
  if (value === null || value === undefined || value === '') {
    return '–';
  }
  const text = typeof value === 'number' ? String(Math.round(value * 10) / 10) : value;
  if (!unit) {
    return text;
  }
  return unit === '%' ? `${text} %` : `${text} ${unit}`;
}

/** The document a My Work item is about (its entity, else its `/documents/<id>` url). */
export function workDocumentId(item: WorkItem): string | null {
  if (item.entity_type === 'document' && item.entity_id) {
    return item.entity_id;
  }
  const match = /^\/documents\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(item.url ?? '');
  return match ? match[1] : null;
}

/** "Venter på deg": my approvals and read confirmations of work procedures. */
export function waitingItems(
  items: readonly WorkItem[],
  procedureIds: ReadonlySet<string>,
): WorkItem[] {
  return items.filter((item) => {
    const lane = laneOf(item);
    const docId = workDocumentId(item);
    return (
      (lane === 'review' || lane === 'acknowledge') &&
      docId !== null &&
      procedureIds.has(docId) &&
      item.mine !== false
    );
  });
}
