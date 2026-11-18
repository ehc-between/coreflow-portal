import {
  ClauseRef,
  ClauseStandard,
  ReportingObligation,
} from '../../core/deviations/deviation.models';
import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';
import { CLAUSE_FRAMEWORKS } from './deviation-enums';

/** The module root as the first breadcrumb (= nav label = module h1). */
export const DEVIATIONS_ROOT_CRUMB = {
  labelKey: 'modules.names.deviations',
  link: '/deviations',
} as const;

/**
 * The module's sub-pages, shown as `app-module-nav` under every page header
 * (replaces the header link buttons). "Received reports" needs `deviations:intake`
 * and carries the count of new reports.
 */
export function deviationsNav(opts: {
  readonly intake: boolean;
  readonly newReports?: number | null;
}): ModuleNavItem[] {
  const items: ModuleNavItem[] = [
    { labelKey: 'deviations.nav.all', link: '/deviations', exact: true, testId: 'nav-all' },
    { labelKey: 'deviations.nav.actions', link: '/deviations/actions', testId: 'nav-actions' },
  ];
  if (opts.intake) {
    items.push({
      labelKey: 'deviations.nav.intake',
      link: '/deviations/intake',
      count: opts.newReports || null,
      testId: 'nav-intake',
    });
  }
  items.push({ labelKey: 'deviations.nav.stats', link: '/deviations/stats', testId: 'nav-stats' });
  return items;
}

/** A person in a picker: the name, plus the e-mail when the name alone is ambiguous. */
export interface PersonOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Picker labels for org members. When two members share a name (or one has none),
 * the e-mail is added ("Kari Nordmann (kari@…)") so the right person can be chosen.
 */
export function personOptions(
  users: readonly { readonly id: string; readonly name: string; readonly email?: string }[],
): PersonOption[] {
  const counts = new Map<string, number>();
  for (const user of users) {
    const key = (user.name ?? '').trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return users
    .map((user) => {
      const name = (user.name ?? '').trim();
      const ambiguous = !name || (counts.get(name.toLowerCase()) ?? 0) > 1;
      const label = !name
        ? (user.email ?? user.id)
        : ambiguous && user.email
          ? `${name} (${user.email})`
          : name;
      return { id: user.id, name: label };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Cited clauses → canonical clause refs (`iso9001:10.2`, `hs:10.2`). */
export function clauseRefsOf(clauses: readonly ClauseRef[] | null | undefined): string[] {
  return (clauses ?? []).map((c) => `${c.standard}:${c.clause}`);
}

const CLAUSE_STANDARDS = new Set<string>([...CLAUSE_FRAMEWORKS, 'hs']);

/**
 * Canonical clause refs (from the clause picker) → the API's clause rows. A
 * standard-key prefix (`iso27001-2022`) is reduced to its framework; refs of a
 * framework deviations cannot cite are dropped. Duplicates are removed.
 */
export function clausesFromRefs(refs: readonly string[] | null | undefined): ClauseRef[] {
  const seen = new Set<string>();
  const out: ClauseRef[] = [];
  for (const raw of refs ?? []) {
    const at = raw.indexOf(':');
    if (at <= 0) {
      continue;
    }
    const standard = raw
      .slice(0, at)
      .replace(/-\d{4}$/, '')
      .replace(/-/g, '_');
    const clause = raw.slice(at + 1).trim();
    const key = `${standard}:${clause}`;
    if (!clause || !CLAUSE_STANDARDS.has(standard) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ standard: standard as ClauseStandard, clause });
  }
  return out;
}

/** Whether two clause lists cite the same clauses in the same order. */
export function sameClauses(a: readonly ClauseRef[], b: readonly ClauseRef[]): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => c.standard === b[i].standard && c.clause === b[i].clause)
  );
}

// --- Date-times -------------------------------------------------------------

/** A `datetime-local` value (local time) as the naive UTC datetime the API stores, or null. */
export function localToUtc(local: string | null | undefined): string | null {
  if (!local) {
    return null;
  }
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19);
}

/** A naive UTC datetime as a `datetime-local` value in the viewer's time zone. */
export function utcToLocal(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Parse a naive UTC (or offset) datetime from the API. */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The latest a `datetime-local` input may pick (now), so facts are never in the future. */
export function nowLocal(now = new Date()): string {
  return utcToLocal(now.toISOString().slice(0, 19));
}

/**
 * The event-time rule of the API (`invalid_event_times`) checked before saving:
 * neither time in the future, and not detected before it happened. Returns the
 * i18n key of the problem, or null.
 */
export function eventTimesErrorKey(
  occurredLocal: string,
  detectedLocal: string,
  now = new Date(),
): string | null {
  const occurred = occurredLocal ? new Date(occurredLocal) : null;
  const detected = detectedLocal ? new Date(detectedLocal) : null;
  const limit = now.getTime() + 60_000;
  if ((occurred && occurred.getTime() > limit) || (detected && detected.getTime() > limit)) {
    return 'deviations.facts.errors.future';
  }
  if (occurred && detected && detected.getTime() < occurred.getTime()) {
    return 'deviations.facts.errors.order';
  }
  return null;
}

// --- Authority reporting ----------------------------------------------------

/** Countdown of an open obligation: hours left (negative when late), or null. */
export function hoursLeft(obligation: ReportingObligation, now = new Date()): number | null {
  const deadline = parseUtc(obligation.deadline_at);
  if (!deadline) {
    return null;
  }
  return Math.floor((deadline.getTime() - now.getTime()) / 3_600_000);
}

/** Whether an obligation still needs the user to act (not notified / not waived). */
export function isOpenObligation(obligation: ReportingObligation): boolean {
  return obligation.status === 'pending' || obligation.status === 'overdue';
}

/** The tone-map value of an obligation status. */
export function obligationToneValue(status: string): string {
  switch (status) {
    case 'notified':
      return 'done';
    case 'not_required':
      return 'not_applicable';
    case 'closed_unreported':
      return 'failed';
    default:
      return status;
  }
}

/** Save a downloaded file (export, poster). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
