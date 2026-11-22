import { LocationCount } from '../../../core/locations/locations.models';
import { OrgProfile, Site } from '../../../core/modules/module.models';
import { NextAction } from '../../dashboard/data/home.models';

/**
 * Pure helpers of the IA v2 area hubs (Bedriften, Folk, Dokumenter; docs/ia-v2.md
 * §5.4-5.6). Hub cards count from `GET /locations/counts` (decision D4): a card shows
 * when one of its location keys is there (its module is on), with the summed count.
 */

/** A dot / pill colour of the prototype (`bad`, `warn`, `ok`, `info`). */
export type HubTone = 'bad' | 'warn' | 'ok' | 'info';

/** One card of a hub grid. */
export interface HubTile {
  readonly key: string;
  readonly labelKey: string;
  readonly hintKey: string;
  /** Null hides the number (the place has no table of its own). */
  readonly count: number | null;
  readonly link: string;
  readonly query?: Readonly<Record<string, string>>;
  /** Optional status line under the description (Fagområder). */
  readonly status?: {
    readonly tone: HubTone;
    readonly key: string;
    readonly params?: Record<string, unknown>;
  };
}

/** What a hub card is built from: its location keys and its door. */
export interface TileSpec {
  readonly key: string;
  /** Location keys counted (summed) for the card; the card shows when any is present. */
  readonly locations: readonly string[];
  readonly link: string;
  readonly query?: Readonly<Record<string, string>>;
}

/** The summed count of `keys` (null counts as 0), or null when none of them is present. */
export function countFor(items: readonly LocationCount[], keys: readonly string[]): number | null {
  const found = items.filter((i) => keys.includes(i.key));
  if (!found.length) {
    return null;
  }
  return found.reduce((sum, i) => sum + (i.count ?? 0), 0);
}

/** Whether any of `keys` is among the places (its module is on). */
export function hasAny(items: readonly LocationCount[], keys: readonly string[]): boolean {
  return items.some((i) => keys.includes(i.key));
}

/** The cards whose places exist, in spec order, labelled from `<prefix>.<key>.label|hint`. */
export function buildTiles(
  specs: readonly TileSpec[],
  items: readonly LocationCount[],
  prefix: string,
): HubTile[] {
  return specs
    .filter((s) => hasAny(items, s.locations))
    .map((s) => ({
      key: s.key,
      labelKey: `${prefix}.${s.key}.label`,
      hintKey: `${prefix}.${s.key}.hint`,
      count: countFor(items, s.locations),
      link: s.link,
      query: s.query,
    }));
}

// --- next actions --------------------------------------------------------------------

/** The prototype dot of a next action: overdue is bad, review / due soon warn, the rest info. */
export function actionTone(kind: string): HubTone {
  if (kind === 'overdue') {
    return 'bad';
  }
  if (kind === 'due_soon' || kind === 'review') {
    return 'warn';
  }
  return 'info';
}

/** Next actions of the given modules, most urgent first (the API order), at most `max`. */
export function actionsFor(
  actions: readonly NextAction[],
  modules: readonly string[],
  max = Infinity,
): NextAction[] {
  return actions.filter((a) => !!a.module && modules.includes(a.module)).slice(0, max);
}

/** Bedriften's modules (§5.4 "Trenger oppmerksomhet"): its cards and its Fagområder. */
export const COMPANY_MODULES = [
  'context',
  'objectives',
  'risk',
  'obligations',
  'projects',
  'processes',
  'privacy',
  'assets',
  'ai_governance',
  'environment',
  'continuity',
] as const;

/** Folk's modules (§5.5 "Dette trenger oppmerksomhet"). */
export const PEOPLE_MODULES = ['people', 'training', 'recruitment', 'hse'] as const;

// --- company profile -----------------------------------------------------------------

/** The towns of the sites, in order and once each ("Oslo", "Bergen"). */
export function siteTowns(sites: readonly Site[]): string[] {
  const towns: string[] = [];
  for (const site of sites) {
    const town = (site.city ?? '').trim() || site.name.trim();
    if (town && !towns.includes(town)) {
      towns.push(town);
    }
  }
  return towns;
}

/** "Oslo, Bergen og Drammen" in the given BCP 47 locale. */
export function joinList(values: readonly string[], locale: string): string {
  if (values.length < 2) {
    return values[0] ?? '';
  }
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(values);
  } catch {
    return values.join(', ');
  }
}

/** The "Org.nr. … · bransje · N ansatte · steder" facts, each already translated. */
export function profileFacts(
  profile: Pick<OrgProfile, 'org_number' | 'industry' | 'size_band' | 'sites'>,
  t: (key: string, params?: Record<string, unknown>) => string,
  locale: string,
): string[] {
  const facts: string[] = [];
  if (profile.org_number?.trim()) {
    facts.push(t('hubs.company.orgNumber', { value: profile.org_number.trim() }));
  }
  if (profile.industry?.trim()) {
    facts.push(profile.industry.trim());
  }
  if (profile.size_band) {
    facts.push(t('hubs.company.employees', { value: profile.size_band.replace('-', '–') }));
  }
  const towns = siteTowns(profile.sites ?? []);
  if (towns.length) {
    facts.push(joinList(towns, locale));
  }
  return facts;
}

/** Frameworks in scope (the profile's `standards`, falling back to `frameworks`). */
export function frameworksInScope(profile: Pick<OrgProfile, 'frameworks' | 'standards'>): string[] {
  if (profile.standards?.length) {
    return profile.standards.filter((s) => s.in_scope).map((s) => s.framework);
  }
  return [...(profile.frameworks ?? [])];
}

/** Position titles that mean the managing director. */
const CEO_TITLE =
  /\b(daglig leder|adm(\.|inistrerende)? ?dir(\.|ektør)?|ceo|managing director|chief executive)\b/i;

export function isCeoTitle(title: string | null | undefined): boolean {
  return !!title && CEO_TITLE.test(title);
}

/** A certification's next external audit date (surveillance, else expiry). */
export interface CertificationLike {
  readonly framework: string;
  readonly status: string;
  readonly next_surveillance_at?: string | null;
  readonly expires_at?: string | null;
}

/** The earliest upcoming external audit (on or after `now`), or null. */
export function nextExternalAudit(
  certs: readonly CertificationLike[],
  now: Date = new Date(),
): { readonly framework: string; readonly date: string } | null {
  let best: { framework: string; date: string; at: number } | null = null;
  for (const cert of certs) {
    if (cert.status === 'withdrawn' || cert.status === 'expired') {
      continue;
    }
    for (const date of [cert.next_surveillance_at, cert.expires_at]) {
      if (!date) {
        continue;
      }
      const at = Date.parse(date);
      if (Number.isNaN(at) || at < startOfDay(now)) {
        continue;
      }
      if (!best || at < best.at) {
        best = { framework: cert.framework, date, at };
      }
      break;
    }
  }
  return best ? { framework: best.framework, date: best.date } : null;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Mars 2027" / "March 2027" (capitalised month and year). */
export function monthYear(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const text = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Whole days from today to `iso` (negative when it has passed). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const d = new Date(iso);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((day - startOfDay(now)) / 86_400_000);
}
