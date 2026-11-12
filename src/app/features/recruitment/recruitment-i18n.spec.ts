import en from '../../../assets/i18n/recruitment/en.json';
import nb from '../../../assets/i18n/recruitment/nb.json';
import guidanceEn from '../../../assets/guidance/en/recruitment.json';
import guidanceNb from '../../../assets/guidance/nb/recruitment.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { RECRUITMENT_ERROR_CODES } from './data/recruitment-errors';
import {
  CHECK_STATUSES,
  CHECK_TYPES,
  EMPLOYMENT_TYPES,
  INTERVIEW_KINDS,
  INTERVIEW_STATUSES,
  OFFER_STATUSES,
  RECOMMENDATIONS,
  REJECTION_REASONS,
  REQUISITION_STATUSES,
  ROLE_RISKS,
  SCREENING_RESULTS,
  SOURCES,
  STAGES,
  TEAM_ROLES,
} from './data/recruitment.models';

type Dict = Record<string, unknown>;

function paths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => paths(item, `${prefix}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Dict).flatMap(([key, v]) =>
      paths(v, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function get(dict: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce<unknown>((node, key) => (node as Dict | undefined)?.[key], dict);
}

function params(text: unknown): string[] {
  return typeof text === 'string'
    ? [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort()
    : [];
}

/** Event names the backend declares (`recruitment:notifications.<name>` / `timeline.<name>`). */
const EVENT_NAMES = [
  'requisitionCreated',
  'requisitionUpdated',
  'requisitionSubmitted',
  'requisitionApproved',
  'requisitionRejected',
  'requisitionOpened',
  'requisitionOnHold',
  'requisitionFilled',
  'requisitionCancelled',
  'requisitionDeleted',
  'teamChanged',
  'candidateCreated',
  'candidateUpdated',
  'candidatePrivacyUpdated',
  'candidateErased',
  'applicationCreated',
  'applicationUpdated',
  'stageChanged',
  'checksPlanned',
  'checkUpdated',
  'interviewScheduled',
  'interviewUpdated',
  'scorecardSubmitted',
  'offerExtended',
  'offerResponded',
  'hired',
  'applicationDeleted',
];

const REQUISITION_ACTIONS = [
  'submit',
  'approve',
  'reject',
  'open',
  'hold',
  'fill',
  'cancel',
  'delete',
];

describe('recruitment i18n', () => {
  it('keeps en and nb at full key parity', () => expectKeyParity(en, nb));

  it('uses the same interpolation params in every language', () => {
    for (const path of paths(en)) {
      expect(params(get(nb, path)), path).toEqual(params(get(en, path)));
    }
  });

  it('has no empty strings and no vendor or model names', () => {
    for (const [lang, dict] of Object.entries({ en, nb, guidanceEn, guidanceNb })) {
      for (const path of paths(dict)) {
        const text = get(dict, path);
        if (typeof text !== 'string') {
          continue;
        }
        expect(text.trim(), `${lang}:${path}`).not.toBe('');
        expect(text, `${lang}:${path}`).not.toMatch(/claude|anthropic|openai|gpt|gemini/i);
      }
    }
  });

  const groups: [string, readonly string[]][] = [
    ['requisitionStatus', REQUISITION_STATUSES],
    ['employmentType', EMPLOYMENT_TYPES],
    ['roleRisk', ROLE_RISKS],
    ['teamRole', TEAM_ROLES],
    ['source', SOURCES],
    ['stage', STAGES],
    ['rejectionReason', REJECTION_REASONS],
    ['offerStatus', OFFER_STATUSES],
    ['interviewKind', INTERVIEW_KINDS],
    ['interviewStatus', INTERVIEW_STATUSES],
    ['recommendation', RECOMMENDATIONS],
    ['screeningResult', SCREENING_RESULTS],
    ['checkType', CHECK_TYPES],
    ['checkStatus', CHECK_STATUSES],
    ['errors', RECRUITMENT_ERROR_CODES],
    ['rating', ['1', '2', '3', '4', '5']],
    ['scorecardStatus', ['draft', 'submitted']],
    ['candidates.sort', ['newest', 'oldest', 'name', 'retention_until']],
    ['requisitions.sort', ['newest', 'oldest', 'title', 'status', 'target_start_date']],
    ['requisition.actions', REQUISITION_ACTIONS],
    ['requisition.confirm', REQUISITION_ACTIONS],
    ['requisition.done', REQUISITION_ACTIONS],
    ['application.actions', ['offer', 'accept', 'decline', 'hire']],
  ];

  it.each(groups)('translates every %s value', (group, values) => {
    for (const value of values) {
      expect(typeof get(en, `${group}.${value}`), `${group}.${value}`).toBe('string');
    }
  });

  it('has the notification and timeline keys the backend declares', () => {
    for (const name of EVENT_NAMES) {
      expect(typeof get(en, `notifications.${name}`), name).toBe('string');
      expect(typeof get(en, `timeline.${name}`), name).toBe('string');
    }
  });
});

describe('recruitment guidance', () => {
  it('keeps en and nb at full key parity', () => expectKeyParity(guidanceEn, guidanceNb));

  it('keeps quiz answers, minutes, pass marks, clauses and tour targets identical', () => {
    const fixed = paths(guidanceEn).filter((p) =>
      /answer$|minutes$|pass_mark$|clauses\[|target$/.test(p),
    );
    for (const path of fixed) {
      expect(get(guidanceNb, path), path).toEqual(get(guidanceEn, path));
    }
  });

  it('has an intro and a why-it-matters note with clauses on every page', () => {
    const pages = Object.keys(guidanceEn.pages);
    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const page of pages) {
      expect(get(guidanceEn, `pages.${page}.intro.title`), page).toBeTruthy();
      expect(get(guidanceEn, `pages.${page}.why.body`), page).toBeTruthy();
      const clauses = get(guidanceEn, `pages.${page}.why.clauses`) as unknown[];
      expect(clauses.length, page).toBeGreaterThan(0);
    }
    for (const list of ['requisitions', 'candidates', 'applications']) {
      expect(get(guidanceEn, `pages.${list}.empty.cta`), list).toBeTruthy();
    }
  });

  it('has field help for the key fields and the lessons and tour the pages use', () => {
    const formFields = [
      'title',
      'justification',
      'role_risk',
      'screening_criteria',
      'posting_text',
      'change_reason',
    ];
    for (const field of formFields) {
      expect(get(guidanceEn, `pages.requisitionForm.fields.${field}.help`), field).toBeTruthy();
    }
    for (const field of ['screening', 'interviewers', 'scorecards', 'checks']) {
      expect(get(guidanceEn, `pages.application.fields.${field}.help`), field).toBeTruthy();
    }
    for (const lesson of ['fair-screening', 'screening-proportionate', 'candidate-privacy']) {
      expect(get(guidanceEn, `lessons.${lesson}.sections`), lesson).toBeTruthy();
    }
    expect((get(guidanceEn, 'tours.requisitions') as unknown[]).length).toBeGreaterThan(0);
  });

  it('cites the screening control and the GDPR articles M10 declares', () => {
    const clauses = paths(guidanceEn)
      .filter((p) => /clauses\[/.test(p))
      .map((p) => get(guidanceEn, p));
    const expected = [
      'iso27001:A.6.1',
      'iso27001:A.6.2',
      'hs:7.2',
      'gdpr:5',
      'gdpr:13',
      'gdpr:14',
      'gdpr:17',
    ];
    for (const ref of expected) {
      expect(clauses, ref).toContain(ref);
    }
  });
});
