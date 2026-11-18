import { LocationCount } from '../../core/locations/locations.models';
import { pinKeyOf, splitLabel } from '../../core/registers/register-catalog.service';

export { splitLabel };

/**
 * The Registre hub's grouping (simplify plan §3.1, U04): registers by job area, not
 * by module. Location keys come from the requirement-locations registry
 * (`GET /locations/counts`); a register whose key is not listed here lands in
 * "other", so a new module is never lost. Group labels are
 * `registers.groups.<key>`.
 */
export const REGISTER_GROUPS = [
  {
    key: 'governance',
    registers: [
      'context.interested_parties',
      'context.analyses',
      'context.scopes',
      'context.policies',
      'context.responsibilities',
      'objectives.objectives',
      'objectives.kpis',
      'management_review.reviews',
      'management_review.meetings',
      'processes.register',
      'projects.register',
      'tasks.register',
    ],
  },
  {
    key: 'risk',
    registers: [
      'risk.risks',
      'risk.treatments',
      'risk.opportunities',
      'obligations.register',
      'risk.soa',
    ],
  },
  {
    key: 'improvement',
    registers: [
      'deviations.register',
      'deviations.actions',
      'deviations.intake_reports',
      'inspections.register',
      'inspections.findings',
      'audits.programmes',
      'audits.plans',
      'audits.findings',
      'audits.certifications',
      'audits.auditors',
      'feedback.items',
      'feedback.surveys',
    ],
  },
  {
    key: 'suppliersAssets',
    registers: [
      'suppliers.register',
      'privacy.processors',
      'suppliers.evaluations',
      'contracts.register',
      'contracts.deadlines',
      'assets.register',
      'assets.calibration',
      'assets.access_reviews',
      'assets.changes',
    ],
  },
  {
    key: 'people',
    registers: [
      'people.employees',
      'people.positions',
      'people.competences',
      'people.checklists',
      'training.courses',
      'training.assignments',
      'training.records',
      'recruitment.requisitions',
      'recruitment.candidates',
      'recruitment.applications',
    ],
  },
  {
    key: 'privacy',
    registers: [
      'privacy.ropa',
      'privacy.dpias',
      'privacy.requests',
      'privacy.breaches',
      'privacy.transfers',
      'privacy.retention',
      'privacy.consents',
      'privacy.legal_basis',
    ],
  },
  {
    key: 'ai',
    registers: ['ai_governance.systems', 'ai_governance.assessments', 'ai_governance.literacy'],
  },
  {
    key: 'environmentHse',
    registers: [
      'environment.aspects',
      'environment.metrics',
      'environment.emissions',
      'hse.sja',
      'hse.safety_rounds',
      'hse.ppe',
      'hse.consultations',
    ],
  },
  {
    key: 'continuity',
    registers: [
      'continuity.bias',
      'continuity.plans',
      'environment.emergency_plans',
      'continuity.exercises',
      'continuity.ict_systems',
      'continuity.contacts',
    ],
  },
  {
    key: 'documents',
    registers: [
      'documents.register',
      'documents.external',
      'documents.distribution',
      'reports.audit_packs',
      'reports.definitions',
    ],
  },
  { key: 'other', registers: [] },
] as const satisfies readonly { readonly key: string; readonly registers: readonly string[] }[];

export type RegisterGroupKey = (typeof REGISTER_GROUPS)[number]['key'];

/**
 * Setup lists (types, templates, schedules, matrices, questionnaires): configuration,
 * not daily work (plan principle 11). They always sit under "More registers" unless
 * pinned. Most are places of kind `settings`; no other settings place shows in the hub.
 */
export const SETUP_REGISTERS: ReadonlySet<string> = new Set([
  'deviations.types',
  'documents.types',
  'documents.templates',
  'documents.retention',
  'inspections.templates',
  'inspections.schedules',
  'risk.registers',
  'risk.matrices',
  'suppliers.questionnaires',
]);

/**
 * Places of kind `page` that are lists people browse (the rest of the pages are
 * overviews, matrices or maps, and settings never show in the hub).
 */
export const LIST_PAGES: ReadonlySet<string> = new Set([
  'hse.safety_rounds',
  'environment.emissions',
]);

/**
 * Extra search words per register, in both languages, so a register is found by the
 * word people use rather than the module that holds it ("kalibrering", "nestenulykke",
 * "databehandler"). Never shown; matched together with the label and description.
 */
export const REGISTER_SYNONYMS: Readonly<Record<string, string>> = {
  'assets.calibration': 'kalibrering måleutstyr instrument calibration measuring equipment',
  'assets.access_reviews':
    'tilgangsgjennomgang tilganger brukertilgang m365 access review permissions',
  'assets.changes': 'endringer endringsforespørsel endringshåndtering brannmur change request',
  'assets.register': 'eiendeler utstyr pc laptop server inventory assets',
  'deviations.register':
    'avvik hendelse nestenulykke uønsket hendelse sikkerhetshendelse klage incident near miss',
  'deviations.actions': 'tiltak korrigerende tiltak capa corrective action',
  'feedback.items': 'kundetilbakemelding klage ros kunde feedback complaint customer',
  'feedback.surveys': 'undersøkelse spørreundersøkelse kundeundersøkelse survey nps',
  'suppliers.register': 'leverandør underleverandør innkjøp vendor supplier',
  'privacy.processors': 'databehandler databehandleravtale dpa processor leverandør',
  'privacy.ropa': 'behandlingsprotokoll protokoll artikkel 30 ropa processing activities',
  'privacy.breaches': 'personvernbrudd brudd datalekkasje breach 72 timer',
  'privacy.requests': 'innsyn sletting henvendelse den registrerte dsar data subject request',
  'privacy.dpias': 'dpia personvernkonsekvensvurdering konsekvensvurdering',
  'privacy.transfers': 'overføring tredjeland scc tia transfer',
  'risk.risks': 'risiko risikovurdering trussel sårbarhet risk threat',
  'risk.treatments': 'behandlingsplan risikotiltak treatment plan',
  'obligations.register': 'lover forskrifter lovkrav juridiske krav legal compliance obligations',
  'hse.sja': 'sja sikker jobbanalyse job safety analysis',
  'hse.ppe': 'verneutstyr personlig verneutstyr ppe',
  'hse.safety_rounds': 'vernerunde safety round',
  'people.employees': 'ansatte medarbeidere personer folk employees staff',
  'people.competences': 'kompetanse ferdigheter competence skills',
  'training.courses': 'kurs opplæring training courses',
  'training.records': 'kursbevis sertifikat gjennomført opplæring certificate',
  'contracts.register': 'kontrakt avtale agreement contract',
  'documents.register': 'dokument prosedyre policy rutine instruks document procedure',
  'context.policies': 'policy retningslinje policies',
  'context.interested_parties': 'interessenter interessentanalyse stakeholders',
  'audits.plans': 'internrevisjon revisjon revisjonsplan audit',
  'audits.findings': 'revisjonsfunn funn avvik fra revisjon finding',
  'inspections.register': 'inspeksjon sjekkliste kontroll inspection',
  'continuity.plans': 'beredskapsplan kriseplan kontinuitetsplan beredskap continuity plan',
  'environment.emergency_plans': 'beredskapsplan miljøberedskap emergency plan',
  'continuity.bias': 'bia konsekvensanalyse business impact',
  'environment.aspects': 'miljøaspekt miljøpåvirkning environmental aspect',
  'ai_governance.systems': 'ki-systemer kunstig intelligens ai systems',
  'management_review.reviews': 'ledelsens gjennomgang management review',
  'objectives.objectives': 'mål målsetting objectives goals',
  'objectives.kpis': 'nøkkeltall kpi indikator',
  'tasks.register': 'oppgaver gjøremål tasks',
};

/** One row of the hub: a register, its title split from the module it lives in. */
export interface RegisterRow {
  readonly key: string;
  /** The pin key (shell preferences): the route without the leading slash. */
  readonly pinKey: string;
  /** "Kalibrering" from "Eiendeler og endringer: kalibrering". */
  readonly title: string;
  /** "Eiendeler og endringer", or null when the label has no module prefix. */
  readonly area: string | null;
  readonly group: RegisterGroupKey;
  readonly route: string;
  readonly query: Readonly<Record<string, string>>;
  readonly count: number | null;
  readonly lastUpdatedAt: string | null;
  /** Shown under "More registers": not needed by a standard and empty, or a setup list. */
  readonly folded: boolean;
  /** Lower-case search texts, strongest first: the title, the synonyms, the rest. */
  readonly search: readonly [string, string, string];
}

export interface RegisterGroup {
  readonly key: RegisterGroupKey;
  readonly rows: readonly RegisterRow[];
}

const GROUP_OF: ReadonlyMap<string, RegisterGroupKey> = new Map(
  REGISTER_GROUPS.flatMap((g) => g.registers.map((key) => [key, g.key] as const)),
);

const ORDER_OF: ReadonlyMap<string, number> = new Map(
  REGISTER_GROUPS.flatMap((g) => g.registers).map((key, index) => [key, index]),
);

/** Lower-cased, without accents (é → e) but keeping æ, ø and å. */
export function normalise(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/(?![̊])[̀-ͯ]/g, '')
    .normalize('NFC');
}

/** Whether a place shows in the hub: registers, the list pages and the setup lists. */
function isList(item: LocationCount): boolean {
  switch (item.kind) {
    case 'register':
      return true;
    case 'page':
      return LIST_PAGES.has(item.key);
    default:
      return SETUP_REGISTERS.has(item.key);
  }
}

/**
 * The hub rows from the counts endpoint: lists only (registers, list pages, setup
 * lists), one row per link, in group order. When two places share a page (the risk
 * register holds the treatment plans too), the first declared keeps the row and the
 * others' words still find it ("behandlingsplan").
 */
export function toRows(items: readonly LocationCount[]): RegisterRow[] {
  const byLink = new Map<string, RegisterRow>();
  for (const item of items) {
    if (!isList(item) || !item.module_enabled || item.route.includes('{')) {
      continue;
    }
    const link = linkId(item.route, item.query);
    const words = [REGISTER_SYNONYMS[item.key] ?? '', item.label, item.description].join(' ');
    const kept = byLink.get(link);
    if (kept) {
      byLink.set(link, {
        ...kept,
        search: [kept.search[0], `${kept.search[1]} ${normalise(words)}`.trim(), kept.search[2]],
      });
      continue;
    }
    const { title, area } = splitLabel(item.label);
    byLink.set(link, {
      key: item.key,
      pinKey: pinKeyOf(item.route),
      title,
      area,
      group: GROUP_OF.get(item.key) ?? 'other',
      route: item.route,
      query: item.query ?? {},
      count: item.count,
      lastUpdatedAt: item.last_updated_at,
      folded: item.folded || SETUP_REGISTERS.has(item.key),
      search: [
        normalise(title),
        normalise(REGISTER_SYNONYMS[item.key] ?? ''),
        normalise([item.label, item.description, item.key].join(' ')),
      ],
    });
  }
  return [...byLink.values()].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

function rank(row: RegisterRow): number {
  return ORDER_OF.get(row.key) ?? Number.MAX_SAFE_INTEGER;
}

function linkId(route: string, query: Readonly<Record<string, string>> | null): string {
  const params = Object.entries(query ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return params ? `${route}?${params}` : route;
}

/**
 * Rows whose texts hold every word of the query (any order), best first: a word in
 * the title weighs most, then a synonym, then the module name or description. Empty
 * query: all rows, unchanged.
 */
export function searchRows(rows: readonly RegisterRow[], query: string): RegisterRow[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [...rows];
  }
  const scored: { row: RegisterRow; score: number; index: number }[] = [];
  rows.forEach((row, index) => {
    let score = 0;
    for (const word of words) {
      const at = row.search.findIndex((text) => text.includes(word));
      if (at < 0) {
        return;
      }
      score += 3 - at;
    }
    scored.push({ row, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.row);
}

/** Non-empty groups in display order. */
export function groupRows(rows: readonly RegisterRow[]): RegisterGroup[] {
  return REGISTER_GROUPS.map((g) => ({
    key: g.key,
    rows: rows.filter((row) => row.group === g.key),
  })).filter((g) => g.rows.length > 0);
}

/**
 * The hub's sections: pinned rows first (in pin order), then the open groups, then
 * the folded rest. Every row appears in exactly one section. Pins are pin keys
 * (route paths); a pin that is not a register of the hub (a module's start page such
 * as `audits`, pinned from the menu's defaults) comes from `pinOnly`, or drops out.
 */
export function arrangeRows(
  rows: readonly RegisterRow[],
  pins: readonly string[],
  pinOnly: (pinKey: string) => RegisterRow | null = () => null,
): { pinned: RegisterRow[]; groups: RegisterGroup[]; folded: RegisterRow[] } {
  const byPin = new Map(rows.map((row) => [row.pinKey, row]));
  const pinned = [...new Set(pins)]
    .map((key) => byPin.get(key) ?? pinOnly(key))
    .filter((row): row is RegisterRow => !!row);
  const pinnedKeys = new Set(pinned.map((row) => row.key));
  const rest = rows.filter((row) => !pinnedKeys.has(row.key));
  return {
    pinned,
    groups: groupRows(rest.filter((row) => !row.folded)),
    folded: rest.filter((row) => row.folded),
  };
}
