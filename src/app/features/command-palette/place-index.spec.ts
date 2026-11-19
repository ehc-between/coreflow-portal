import nb from '../../../assets/i18n/nb.json';
import { LocationVocabulary } from '../../core/locations/locations.models';
import { Output } from '../../core/outputs/outputs.models';
import { buildPlaces, placeTerms, searchPlaces, splitUrl, vocabularyPlaces } from './place-index';

/** Real nb labels of the locations vocabulary (GET /locations?lang=nb), trimmed. */
const VOCAB: [string, string, string, LocationVocabulary['kind']][] = [
  ['assets.calibration', '/assets/calibration', 'Eiendeler og endringer: kalibrering', 'register'],
  [
    'assets.access_reviews',
    '/assets/access-reviews',
    'Eiendeler og endringer: tilgangsgjennomganger',
    'register',
  ],
  ['assets.changes', '/assets/changes', 'Eiendeler og endringer: endringshåndtering', 'register'],
  ['assets.register', '/assets', 'Eiendeler og endringer: eiendelsregister', 'register'],
  ['deviations.register', '/deviations', 'Avvik: avviksoversikt', 'register'],
  ['deviations.types', '/deviations/types', 'Avvik: avvikstyper og arbeidsflyt', 'settings'],
  ['privacy.processors', '/privacy/processors', 'Personvern: databehandlere', 'register'],
  ['privacy.ropa', '/privacy/ropa', 'Personvern: behandlingsprotokoll', 'register'],
  ['privacy.breaches', '/privacy/breaches', 'Personvern: personvernbrudd', 'register'],
  [
    'privacy.requests',
    '/privacy/data-subject-requests',
    'Personvern: henvendelser fra registrerte',
    'register',
  ],
  ['hse.sja', '/hse/sja', 'HMS: sikker jobbanalyse (SJA)', 'register'],
  ['risk.risks', '/risk/risks', 'Risiko og muligheter: risikoregister', 'register'],
  [
    'risk.soa',
    '/risk/soa/{standard_key}',
    'Risiko og muligheter: anvendelseserklæring',
    'register',
  ],
  ['suppliers.register', '/suppliers', 'Leverandører: leverandøroversikt', 'register'],
  [
    'context.interested_parties',
    '/context/interested-parties',
    'Kontekst og ledelse: interessenter',
    'register',
  ],
  ['training.matrix', '/training/matrix', 'Opplæring: opplæringsmatrise', 'page'],
  ['settings.modules', '/settings/modules', 'Innstillinger: moduler', 'settings'],
];

const VOCABULARY: LocationVocabulary[] = VOCAB.map(([key, route, label, kind]) => ({
  key,
  module: key.split('.')[0],
  module_enabled: true,
  label,
  route,
  query: {},
  url: route,
  description: '',
  kind,
  rule_kinds: [],
  states: [],
}));

const OUTPUTS = [
  {
    key: 'register.processing_records',
    module: 'privacy',
    title: { en: 'Record of processing (art. 30)', nb: 'Behandlingsprotokoll (art. 30)' },
    description: { en: '', nb: '' },
    route: null,
    generates: true,
  },
  {
    key: 'reports.audit_pack',
    module: 'reports',
    title: { en: 'Audit pack', nb: 'Revisjonspakke' },
    description: { en: '', nb: '' },
    route: '/library/audit-packs',
    generates: false,
  },
] as unknown as Output[];

function translate(key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], nb);
  return typeof value === 'string' ? value : key;
}

const PLACES = buildPlaces({
  lang: 'nb',
  translate,
  allowed: () => true,
  vocabulary: VOCABULARY,
  outputs: OUTPUTS,
});

/** 15 nb findability queries (simplify plan U06) and the page each must find. */
const NB_QUERIES: [string, string][] = [
  ['kalibrering', '/assets/calibration'],
  ['nestenulykke', '/deviations'],
  ['databehandler', '/privacy/processors'],
  ['behandlingsprotokoll', '/privacy/ropa'],
  ['tilgangsgjennomgang', '/assets/access-reviews'],
  ['sja', '/hse/sja'],
  ['inviter bruker', '/settings/invitations'],
  ['risikoregister', '/risk/risks'],
  ['leverandører', '/suppliers'],
  ['slå på moduler', '/settings/modules'],
  ['revisjonslogg', '/settings/audit-log'],
  ['personvernbrudd', '/privacy/breaches'],
  ['hvor er interessentene', '/context/interested-parties'],
  ['mitt arbeid', '/my-work'],
  ['endringer', '/assets/changes'],
];

describe('place index', () => {
  it.each(NB_QUERIES)('"%s" finds %s in the top 3', (query, url) => {
    expect(searchPlaces(PLACES, query, 3).map((p) => p.url)).toContain(url);
  });

  it('finds a page from a typed beginning and exports in the library', () => {
    expect(searchPlaces(PLACES, 'kalib', 3).map((p) => p.url)).toContain('/assets/calibration');
    expect(searchPlaces(PLACES, 'eksport', 3).map((p) => p.url)).toContain('/library');
  });

  it('answers in well under 300 ms', () => {
    const start = performance.now();
    for (const [query] of NB_QUERIES) {
      searchPlaces(
        buildPlaces({
          lang: 'nb',
          translate,
          allowed: () => true,
          vocabulary: VOCABULARY,
          outputs: OUTPUTS,
        }),
        query,
      );
    }
    expect((performance.now() - start) / NB_QUERIES.length).toBeLessThan(300);
  });

  it('keeps one place per link and folds the words of the others into it', () => {
    const deviations = PLACES.filter((p) => p.url === '/deviations');
    expect(deviations).toHaveLength(1);
    // The module page keeps its name; the register's synonyms still find it.
    expect(deviations[0].title).toBe('Avvik');
    expect(deviations[0].search[1]).toContain('nestenulykke');
  });

  it('drops placeholder routes and disabled modules', () => {
    expect(PLACES.some((p) => p.url.includes('{'))).toBe(false);
    const off = vocabularyPlaces([{ ...VOCABULARY[0], module_enabled: false }]);
    expect(off).toEqual([]);
  });

  it('hides what the user may not open', () => {
    const places = buildPlaces({
      lang: 'nb',
      translate,
      allowed: (entry) => !entry.permission,
      vocabulary: VOCABULARY,
      outputs: [],
    });
    expect(places.some((p) => p.url === '/settings/invitations')).toBe(false);
    // Registers of a module the user cannot read are gone with the module.
    expect(places.some((p) => p.url === '/assets/calibration')).toBe(false);
    expect(places.some((p) => p.url === '/my-work')).toBe(true);
  });

  it('links outputs to the module library or to their own flow', () => {
    expect(PLACES.find((p) => p.title.startsWith('Behandlingsprotokoll (art'))?.url).toBe(
      '/library?module=privacy',
    );
    expect(splitUrl('/library?module=privacy')).toEqual({
      path: '/library',
      queryParams: { module: 'privacy' },
    });
    expect(PLACES.some((p) => p.url === '/library/audit-packs')).toBe(true);
  });

  it('ignores question and navigation words', () => {
    expect(placeTerms('Hvor finner jeg kalibrering?')).toEqual(['kalibrering']);
    expect(searchPlaces(PLACES, 'hvor finner jeg')).toEqual([]);
    expect(searchPlaces(PLACES, 'flyreiser')).toEqual([]);
  });
});
