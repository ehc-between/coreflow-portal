import { FrameworkKey, ObligationType } from './obligation.models';

/** One duty of a library entry; its text is `obligations.library.entries.<key>.duties.<id>`. */
export interface LibraryDuty {
  readonly id: string;
  readonly clause_refs: readonly string[];
}

/**
 * A common law or regulation a Norwegian organisation can add in one click. The texts
 * (title, issuer, description, duties) live in the `obligations` i18n scope under
 * `library.entries.<key>`; everything language-neutral is here.
 */
export interface LibraryEntry {
  readonly key: string;
  readonly obligation_type: ObligationType;
  readonly jurisdiction: string;
  readonly reference: string;
  readonly source_url: string;
  readonly frameworks: readonly FrameworkKey[];
  readonly clause_refs: readonly string[];
  /** The evaluation frequency usually chosen for it. */
  readonly evaluation_rrule: string;
  readonly duties: readonly LibraryDuty[];
}

/**
 * The curated starter library (polish item A20, UX finding 19): the obligations almost
 * every Norwegian organisation has, with the authority, the Lovdata link, typical duties
 * and the standards' clauses they document. Users adapt the result before saving.
 */
export const OBLIGATION_LIBRARY: readonly LibraryEntry[] = [
  {
    key: 'arbeidsmiljoloven',
    obligation_type: 'law',
    jurisdiction: 'NO',
    reference: 'LOV-2005-06-17-62',
    source_url: 'https://lovdata.no/lov/2005-06-17-62',
    frameworks: ['iso45001'],
    clause_refs: ['iso45001:6.1.3', 'iso45001:9.1.2'],
    evaluation_rrule: 'FREQ=YEARLY',
    duties: [
      { id: 'd1', clause_refs: ['iso45001:6.1.2'] },
      { id: 'd2', clause_refs: ['iso45001:5.4'] },
      { id: 'd3', clause_refs: [] },
      { id: 'd4', clause_refs: [] },
    ],
  },
  {
    key: 'internkontrollforskriften',
    obligation_type: 'regulation',
    jurisdiction: 'NO',
    reference: 'FOR-1996-12-06-1127',
    source_url: 'https://lovdata.no/forskrift/1996-12-06-1127',
    frameworks: ['iso45001', 'iso14001'],
    clause_refs: ['iso45001:6.1.3', 'iso14001:6.1.3'],
    evaluation_rrule: 'FREQ=YEARLY',
    duties: [
      { id: 'd1', clause_refs: [] },
      { id: 'd2', clause_refs: [] },
      { id: 'd3', clause_refs: ['iso45001:6.1.2', 'iso14001:6.1.2'] },
      { id: 'd4', clause_refs: ['iso45001:9.1.2', 'iso14001:9.1.2'] },
    ],
  },
  {
    key: 'personopplysningsloven',
    obligation_type: 'law',
    jurisdiction: 'NO',
    reference: 'LOV-2018-06-15-38',
    source_url: 'https://lovdata.no/lov/2018-06-15-38',
    frameworks: ['gdpr', 'iso27001'],
    clause_refs: ['gdpr:5', 'gdpr:24', 'iso27001:A.5.34'],
    evaluation_rrule: 'FREQ=YEARLY',
    duties: [
      { id: 'd1', clause_refs: ['gdpr:30'] },
      { id: 'd2', clause_refs: ['gdpr:6', 'gdpr:13'] },
      { id: 'd3', clause_refs: ['gdpr:12'] },
      { id: 'd4', clause_refs: ['gdpr:33'] },
      { id: 'd5', clause_refs: ['gdpr:28'] },
    ],
  },
  {
    key: 'forurensningsloven',
    obligation_type: 'permit',
    jurisdiction: 'NO',
    reference: 'LOV-1981-03-13-6',
    source_url: 'https://lovdata.no/lov/1981-03-13-6',
    frameworks: ['iso14001'],
    clause_refs: ['iso14001:6.1.3', 'iso14001:9.1.2'],
    evaluation_rrule: 'FREQ=MONTHLY;INTERVAL=3',
    duties: [
      { id: 'd1', clause_refs: [] },
      { id: 'd2', clause_refs: [] },
      { id: 'd3', clause_refs: [] },
    ],
  },
  {
    key: 'brannvernloven',
    obligation_type: 'law',
    jurisdiction: 'NO',
    reference: 'LOV-2002-06-14-20',
    source_url: 'https://lovdata.no/lov/2002-06-14-20',
    frameworks: ['iso45001'],
    clause_refs: ['iso45001:6.1.3', 'iso45001:8.2'],
    evaluation_rrule: 'FREQ=YEARLY',
    duties: [
      { id: 'd1', clause_refs: [] },
      { id: 'd2', clause_refs: ['iso45001:8.2'] },
      { id: 'd3', clause_refs: [] },
    ],
  },
  {
    key: 'apenhetsloven',
    obligation_type: 'law',
    jurisdiction: 'NO',
    reference: 'LOV-2021-06-18-99',
    source_url: 'https://lovdata.no/lov/2021-06-18-99',
    frameworks: ['iso9001'],
    clause_refs: ['iso9001:4.2'],
    evaluation_rrule: 'FREQ=YEARLY',
    duties: [
      { id: 'd1', clause_refs: [] },
      { id: 'd2', clause_refs: [] },
      { id: 'd3', clause_refs: [] },
    ],
  },
  {
    key: 'bokforingsloven',
    obligation_type: 'law',
    jurisdiction: 'NO',
    reference: 'LOV-2004-11-19-73',
    source_url: 'https://lovdata.no/lov/2004-11-19-73',
    frameworks: ['iso9001'],
    clause_refs: ['iso9001:7.5.3'],
    evaluation_rrule: 'FREQ=YEARLY',
    duties: [
      { id: 'd1', clause_refs: [] },
      { id: 'd2', clause_refs: ['iso9001:7.5.3'] },
    ],
  },
  {
    key: 'digitalsikkerhetsloven',
    obligation_type: 'law',
    jurisdiction: 'NO',
    reference: 'LOV-2023-12-20-108',
    source_url: 'https://lovdata.no/lov/2023-12-20-108',
    frameworks: ['nis2', 'iso27001'],
    clause_refs: ['nis2:21', 'iso27001:A.5.31'],
    evaluation_rrule: 'FREQ=YEARLY',
    duties: [
      { id: 'd1', clause_refs: ['nis2:21'] },
      { id: 'd2', clause_refs: ['nis2:23'] },
      { id: 'd3', clause_refs: ['nis2:20'] },
    ],
  },
  {
    key: 'ki_forordningen',
    obligation_type: 'regulation',
    jurisdiction: 'EU',
    reference: 'EU 2024/1689',
    source_url: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
    frameworks: ['eu_ai_act', 'iso42001'],
    clause_refs: ['eu_ai_act:26'],
    evaluation_rrule: 'FREQ=YEARLY',
    duties: [
      { id: 'd1', clause_refs: ['eu_ai_act:4'] },
      { id: 'd2', clause_refs: ['eu_ai_act:26'] },
      { id: 'd3', clause_refs: ['eu_ai_act:50'] },
    ],
  },
];

export function libraryEntry(key: string): LibraryEntry | null {
  return OBLIGATION_LIBRARY.find((e) => e.key === key) ?? null;
}

/** i18n key of a library entry's text (`title`, `issuer`, `description`, `duties.d1` …). */
export function libraryKey(entry: LibraryEntry | string, path: string): string {
  return `obligations.library.entries.${typeof entry === 'string' ? entry : entry.key}.${path}`;
}
