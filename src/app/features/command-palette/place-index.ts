import { Injectable, computed, inject, signal } from '@angular/core';
import { hasAnyPermission } from '../../core/auth/permission';
import { LanguageService } from '../../core/i18n/language.service';
import { LocationsApi } from '../../core/locations/locations-api';
import { LocationVocabulary } from '../../core/locations/locations.models';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { Output } from '../../core/outputs/outputs.models';
import { MODULE_NAV_ITEMS, SETTINGS_NAV_ITEM } from '../../layout/nav';
import { REGISTER_SYNONYMS, normalise, splitLabel } from '../registers/register-groups';
import { moduleIcon } from '../ask/ask-icons';
import { queryTerms } from '../ask/ask-howto';

/**
 * "Finn" (U06): the instant, client-side index of every place in CoreFlow the user
 * can open: the shell pages and settings pages (declared here), every module page
 * (`MODULE_NAV_ITEMS`), every register, page, tab and settings page of the enabled
 * modules (the requirement-locations vocabulary, `GET /locations`) and every
 * document / report the user can make (the output registry, `GET /outputs`).
 *
 * Search is synchronous over the loaded index, so page hits show while the user
 * types; the two server lists are fetched once per org and language when the
 * palette opens (the static places answer before they arrive). Words people use that
 * a label does not carry ("nestenulykke", "databehandler") come from
 * {@link REGISTER_SYNONYMS} and the `words` below, in both languages.
 */

export type PlaceKind = 'page' | 'register' | 'settings' | 'output';

export interface Place {
  /** Unique per link: the url. */
  readonly url: string;
  readonly kind: PlaceKind;
  readonly title: string;
  /** The module or area the place belongs to ("Personvern"), or null. */
  readonly area: string | null;
  readonly icon: string;
  readonly path: string;
  readonly queryParams: Readonly<Record<string, string>> | null;
  /** Normalised search texts, strongest first: title, synonyms, the rest. */
  readonly search: readonly [string, string, string];
}

/** A shell or settings page (not owned by a module). */
interface StaticPlace {
  readonly path: string;
  readonly labelKey: string;
  readonly descriptionKey?: string;
  readonly icon: string;
  readonly kind: PlaceKind;
  readonly permission?: string | readonly string[];
  /** Search words in both languages, never shown. */
  readonly words: string;
}

const SETTINGS = SETTINGS_NAV_ITEM.permission;

export const STATIC_PLACES: readonly StaticPlace[] = [
  {
    path: 'dashboard',
    labelKey: 'nav.dashboard',
    icon: 'home',
    kind: 'page',
    permission: 'dashboard:view',
    words: 'hjem start forside oversikt status home front page overview',
  },
  {
    path: 'my-work',
    labelKey: 'nav.myWork',
    icon: 'inbox',
    kind: 'page',
    words:
      'mitt arbeid mine oppgaver tildelt meg frister godkjenne gjennomgang innboks my tasks assigned approvals inbox',
  },
  {
    path: 'registers',
    labelKey: 'nav.registers',
    icon: 'grid',
    kind: 'page',
    words: 'registre alle registre lister liste registers lists',
  },
  {
    path: 'library',
    labelKey: 'nav.library',
    icon: 'documents',
    kind: 'page',
    words:
      'dokumenter rapporter hent ut eksport eksporter utskrift skriv ut pdf word excel dokumentasjon export report print download',
  },
  {
    path: 'account/learning',
    labelKey: 'nav.learning',
    icon: 'book',
    kind: 'page',
    words: 'leksjoner lære opplæring i coreflow lessons learn tutorial',
  },
  {
    path: 'account',
    labelKey: 'account.title',
    icon: 'lock',
    kind: 'settings',
    words: 'profil passord språk min konto profile password language',
  },
  {
    path: 'settings',
    labelKey: 'settings.hub.title',
    descriptionKey: 'settings.hub.description',
    icon: 'sliders',
    kind: 'settings',
    permission: SETTINGS,
    words: 'innstillinger organisasjon oppsett settings organisation setup',
  },
  {
    path: 'settings/members',
    labelKey: 'settings.members.title',
    descriptionKey: 'settings.members.subtitle',
    icon: 'people',
    kind: 'settings',
    permission: ['org:manage', 'users:invite'],
    words: 'brukere medlemmer tilgang legg til bruker users members access',
  },
  {
    path: 'settings/invitations',
    labelKey: 'settings.invitations.title',
    descriptionKey: 'settings.invitations.subtitle',
    icon: 'userplus',
    kind: 'settings',
    permission: ['org:manage', 'users:invite'],
    words: 'inviter invitasjon ny bruker legg til bruker invite new user',
  },
  {
    path: 'settings/roles',
    labelKey: 'settings.roles.title',
    descriptionKey: 'settings.roles.description',
    icon: 'shield',
    kind: 'settings',
    permission: SETTINGS,
    words: 'roller rettigheter tilganger tilgangsnivå roles permissions',
  },
  {
    path: 'settings/departments',
    labelKey: 'settings.departments.title',
    icon: 'people',
    kind: 'settings',
    permission: SETTINGS,
    words: 'avdelinger avdeling organisasjonskart departments',
  },
  {
    path: 'settings/audit-log',
    labelKey: 'settings.audit.title',
    descriptionKey: 'settings.audit.description',
    icon: 'history',
    kind: 'settings',
    permission: 'audit:read',
    words: 'logg endringslogg hvem endret sporbarhet audit log history',
  },
  {
    path: 'settings/security',
    labelKey: 'settings.security.title',
    descriptionKey: 'settings.security.description',
    icon: 'lock',
    kind: 'settings',
    permission: SETTINGS,
    words: 'sikkerhet tofaktor totrinns mfa passordregler security two-factor',
  },
  {
    path: 'settings/modules',
    labelKey: 'settings.hub.moduleSettings',
    icon: 'gear',
    kind: 'settings',
    permission: 'org:manage',
    words: 'moduler modul slå på aktiver konfigurasjon modules enable configure',
  },
];

/** Stop words beyond the how-to ones: navigation verbs ("finner", "registrerer"). */
const NAV_STOP = new Set([
  'finner',
  'finne',
  'finn',
  'ligger',
  'ser',
  'åpne',
  'vis',
  'registrerer',
  'registrere',
  'lage',
  'lager',
  'eksportere',
  'eksporterer',
  'melde',
  'melder',
  'coreflow',
  'find',
  'open',
  'show',
  'record',
  'export',
]);

/** The words of a query the index matches on. */
export function placeTerms(query: string): string[] {
  return queryTerms(query)
    .map(normalise)
    .filter((term) => term.length > 1 && !NAV_STOP.has(term));
}

/** Two inflections of one word ("interessentene" / "interessenter"). */
function sameStem(a: string, b: string): boolean {
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) {
    shared++;
  }
  return shared >= Math.max(6, Math.min(a.length, b.length) - 2);
}

function wordScore(term: string, text: string): number {
  if (!text) {
    return 0;
  }
  let best = 0;
  for (const token of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!token) {
      continue;
    }
    if (token === term) {
      return 3;
    }
    // A typed beginning ("kalib") or an inflected form ("risikoene"), but not a
    // short word inside a long one ("data" in "databehandleravtale").
    const typed = term.length >= 3 && token.startsWith(term);
    const inflected = token.length >= Math.max(5, 0.6 * term.length) && term.startsWith(token);
    if (typed || inflected || sameStem(term, token)) {
      best = 2;
    }
  }
  // Compound words: "brudd" inside "personvernbrudd".
  return best || (term.length >= 5 && text.includes(term) ? 1 : 0);
}

const WEIGHTS = [3, 2, 1] as const;
const STRONG = 6;

/** How well a place fits the terms (0 = not at all). */
export function placeScore(place: Place, terms: readonly string[]): number {
  let total = 0;
  let hits = 0;
  let strong = false;
  for (const term of terms) {
    let best = 0;
    place.search.forEach((text, index) => {
      best = Math.max(best, WEIGHTS[index] * wordScore(term, text));
    });
    if (best) {
      hits++;
      total += best;
      strong ||= best >= STRONG;
    }
  }
  return terms.length && (hits * 2 >= terms.length || strong) ? total : 0;
}

/** The best places for the query, best first (registers before pages on a tie). */
export function searchPlaces(places: readonly Place[], query: string, limit = 6): Place[] {
  const terms = placeTerms(query);
  if (!terms.length) {
    return [];
  }
  const order: Record<PlaceKind, number> = { register: 0, page: 1, output: 2, settings: 3 };
  return places
    .map((place, index) => ({ place, index, score: placeScore(place, terms) }))
    .filter((hit) => hit.score > 0)
    .sort(
      (a, b) => b.score - a.score || order[a.place.kind] - order[b.place.kind] || a.index - b.index,
    )
    .slice(0, limit)
    .map((hit) => hit.place);
}

/** `/assets?x=1` → path `/assets`, query `{x: '1'}`. */
export function splitUrl(url: string): {
  path: string;
  queryParams: Record<string, string> | null;
} {
  const at = url.indexOf('?');
  if (at < 0) {
    return { path: url, queryParams: null };
  }
  const params = Object.fromEntries(new URLSearchParams(url.slice(at + 1)));
  return { path: url.slice(0, at), queryParams: Object.keys(params).length ? params : null };
}

function place(
  url: string,
  kind: PlaceKind,
  title: string,
  area: string | null,
  icon: string,
  words: string,
  rest: string,
): Place {
  const { path, queryParams } = splitUrl(url);
  return {
    url,
    kind,
    title,
    area,
    icon,
    path,
    queryParams,
    search: [normalise(title), normalise(words), normalise(rest)],
  };
}

/** Add a place, or fold its words into the place already at that url. */
function addPlace(byUrl: Map<string, Place>, next: Place): void {
  const kept = byUrl.get(next.url);
  if (!kept) {
    byUrl.set(next.url, next);
    return;
  }
  byUrl.set(next.url, {
    ...kept,
    search: [
      kept.search[0],
      `${kept.search[1]} ${next.search[0]} ${next.search[1]}`.trim(),
      `${kept.search[2]} ${next.search[2]}`.trim(),
    ],
  });
}

/** The places of the locations vocabulary (enabled modules, no placeholder routes). */
export function vocabularyPlaces(items: readonly LocationVocabulary[]): Place[] {
  return items
    .filter((item) => item.module_enabled && !item.url.includes('{'))
    .map((item) => {
      const { title, area } = splitLabel(item.label);
      const kind: PlaceKind = item.kind === 'settings' ? 'settings' : item.kind;
      return place(
        item.url,
        kind,
        title,
        area,
        moduleIcon(item.module) ?? (kind === 'settings' ? 'sliders' : 'grid'),
        REGISTER_SYNONYMS[item.key] ?? '',
        `${item.label} ${item.description} ${item.key}`,
      );
    });
}

/** The places of the output registry: the library page of the module, or its own flow. */
export function outputPlaces(items: readonly Output[], lang: string): Place[] {
  return items.map((item) => {
    const url =
      !item.generates && item.route
        ? item.route
        : `/library?module=${encodeURIComponent(item.module)}`;
    const title = item.title[lang] ?? item.title['en'] ?? item.key;
    const both = Object.values(item.title).join(' ');
    return place(
      url,
      'output',
      title,
      null,
      'download',
      'rapport dokument eksport utskrift report document export',
      `${both} ${Object.values(item.description).join(' ')}`,
    );
  });
}

/** What the index is built from. */
export interface PlaceSources {
  readonly lang: string;
  readonly translate: (key: string) => string;
  /** Whether the user may open an entry (module on + permission held). */
  readonly allowed: (entry: {
    readonly permission?: string | readonly string[];
    readonly module?: string;
  }) => boolean;
  readonly vocabulary: readonly LocationVocabulary[];
  readonly outputs: readonly Output[];
}

/** The index: shell and settings pages, module pages, then the server lists (one per url). */
export function buildPlaces(sources: PlaceSources): Place[] {
  const { translate: t, allowed } = sources;
  const byUrl = new Map<string, Place>();
  for (const item of STATIC_PLACES.filter(allowed)) {
    const description = item.descriptionKey ? t(item.descriptionKey) : '';
    addPlace(
      byUrl,
      place(`/${item.path}`, item.kind, t(item.labelKey), null, item.icon, item.words, description),
    );
  }
  for (const item of MODULE_NAV_ITEMS.filter(allowed)) {
    addPlace(byUrl, place(`/${item.path}`, 'page', t(item.labelKey), null, item.icon, '', ''));
  }
  const readable = (module: string) => {
    const nav = MODULE_NAV_ITEMS.find((item) => item.module === module);
    return !nav || allowed(nav);
  };
  vocabularyPlaces(sources.vocabulary.filter((item) => readable(item.module))).forEach((p) =>
    addPlace(byUrl, p),
  );
  outputPlaces(sources.outputs, sources.lang).forEach((p) => addPlace(byUrl, p));
  return [...byUrl.values()];
}

interface Loaded<T> {
  readonly org: string;
  readonly lang: string;
  readonly items: readonly T[];
}

@Injectable({ providedIn: 'root' })
export class PlaceIndexService {
  private readonly language = inject(LanguageService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);
  private readonly locationsApi = inject(LocationsApi);
  private readonly outputsApi = inject(OutputsApi);

  private readonly vocabulary = signal<Loaded<LocationVocabulary> | null>(null);
  private readonly outputs = signal<Loaded<Output> | null>(null);
  private readonly pending = new Set<string>();

  /** Every place the user can open, for the current org and language. */
  readonly places = computed<readonly Place[]>(() => {
    const org = this.selectedOrg.currentOrgId();
    const lang = this.language.active();
    const granted = this.selectedOrg.currentOrg()?.permissions;
    const allowed = (entry: { permission?: string | readonly string[]; module?: string }) =>
      (!entry.module || this.modules.isEnabled(entry.module)) &&
      (!entry.permission || hasAnyPermission(granted, entry.permission));
    const vocabulary = this.vocabulary();
    const outputs = this.outputs();
    return buildPlaces({
      lang,
      translate: (key) => this.language.translate(key),
      allowed,
      vocabulary:
        vocabulary && vocabulary.org === org && vocabulary.lang === lang ? vocabulary.items : [],
      outputs: outputs && outputs.org === org ? outputs.items : [],
    });
  });

  /** Load the server lists for the current org and language, once. */
  ensure(): void {
    const org = this.selectedOrg.currentOrgId();
    const lang = this.language.active();
    if (!org) {
      return;
    }
    const vocab = this.vocabulary();
    const vocabKey = `v:${org}:${lang}`;
    if ((!vocab || vocab.org !== org || vocab.lang !== lang) && !this.pending.has(vocabKey)) {
      this.pending.add(vocabKey);
      this.locationsApi.vocabulary(org, lang).subscribe({
        next: (items) => this.vocabulary.set({ org, lang, items }),
        // Pages and settings still answer; registers are tried again on the next open.
        error: () => this.pending.delete(vocabKey),
        complete: () => this.pending.delete(vocabKey),
      });
    }
    const outputs = this.outputs();
    const outKey = `o:${org}`;
    if ((!outputs || outputs.org !== org) && !this.pending.has(outKey)) {
      this.pending.add(outKey);
      this.outputsApi.list(org, { readiness: false }).subscribe({
        next: (list) => this.outputs.set({ org, lang, items: list.items }),
        error: () => this.pending.delete(outKey),
        complete: () => this.pending.delete(outKey),
      });
    }
  }
}
