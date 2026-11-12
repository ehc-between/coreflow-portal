import guideEn from '../../../assets/guidance/en/assets.json';
import guideNb from '../../../assets/guidance/nb/assets.json';
import en from '../../../assets/i18n/assets/en.json';
import nb from '../../../assets/i18n/assets/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { ASSET_FIELD_LABELS } from './asset-detail';
import { ASSET_FLAGS } from './assets-list';
import { CHANGE_FIELD_LABELS } from './changes/change-detail';
import { STEP_REQUIRED_FIELDS } from './data/asset-display';
import { ASSET_ERROR_CODES } from './data/asset-errors';
import {
  ASSET_SORTS,
  ASSET_TYPES,
  CALIBRATION_RESULTS,
  CALIBRATION_STATUSES,
  CHANGE_CATEGORIES,
  CHANGE_SORTS,
  CHANGE_STATES,
  CHANGE_TYPES,
  CLASSIFICATIONS,
  CRITICALITIES,
  DECISIONS,
  LEVELS,
  LIFECYCLE_STATUSES,
  REVIEW_OUTCOMES,
  REVIEW_SORTS,
  REVIEW_STATUSES,
  RISK_LEVELS,
} from './data/asset.models';

type Tree = Record<string, unknown>;

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Tree).flatMap(strings);
  }
  return [];
}

/** The backend's event kinds (app/modules/assets/events.py) by scoped key name. */
const EVENT_NAMES = [
  'assetCreated',
  'assetUpdated',
  'assetOwnerChanged',
  'assetCustodianChanged',
  'assetLifecycleChanged',
  'assetDeleted',
  'calibrationRecorded',
  'calibrationFailed',
  'calibrationDeleted',
  'reviewCreated',
  'reviewUpdated',
  'reviewAssigned',
  'reviewStarted',
  'reviewItemDecided',
  'reviewCompleted',
  'reviewCancelled',
  'reviewDeleted',
  'changeCreated',
  'changeUpdated',
  'changeOwnerChanged',
  'changeDeleted',
];

/** Guidance pages the module's components reference, with the field-help keys they use. */
const GUIDANCE_PAGES: Readonly<Record<string, readonly string[]>> = {
  list: [],
  form: [
    'asset_type',
    'classification',
    'criticality',
    'cia',
    'handling_rules',
    'owner',
    'custodian',
    'lifecycle_status',
    'review_date',
    'disposal_method',
    'requires_calibration',
  ],
  detail: ['calibration_result', 'impact_assessment'],
  calibration: [],
  reviews: [],
  reviewForm: ['system', 'scope', 'reviewer', 'frequency_months'],
  review: ['decision'],
  changes: [],
  changeForm: [
    'change_type',
    'description',
    'reason',
    'affected_assets',
    'risk_level',
    'impact_assessment',
    'risk_assessment',
    'implementation_plan',
    'rollback_plan',
    'implemented_at',
    'review_outcome',
  ],
  change: [],
};

/** List pages that render `<app-teaching-empty>`. */
const EMPTY_PAGES = ['list', 'calibration', 'reviews', 'changes'];

describe('assets i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => {
    expectKeyParity(en, nb);
  });

  it('keeps the guidance files at full en/nb parity', () => {
    expectKeyParity(guideEn, guideNb);
  });

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => /claude|anthropic|gpt|openai/i.test(s))).toEqual([]);
    }
  });

  it.each([
    ['assetType', ASSET_TYPES],
    ['classification', CLASSIFICATIONS],
    ['classificationHelp', CLASSIFICATIONS],
    ['level', LEVELS],
    ['criticality', CRITICALITIES],
    ['criticality', RISK_LEVELS],
    ['lifecycle', LIFECYCLE_STATUSES],
    ['calibrationStatus', CALIBRATION_STATUSES],
    ['calibrationResult', CALIBRATION_RESULTS],
    ['reviewStatus', REVIEW_STATUSES],
    ['decision', DECISIONS],
    ['changeType', CHANGE_TYPES],
    ['changeCategory', CHANGE_CATEGORIES],
    ['changeState', CHANGE_STATES],
    ['reviewOutcome', REVIEW_OUTCOMES],
    ['filters.flags', ASSET_FLAGS],
    ['filters.sorts', ASSET_SORTS],
    ['filters.reviewSorts', REVIEW_SORTS],
    ['filters.changeSorts', CHANGE_SORTS],
    ['errors', ASSET_ERROR_CODES],
    ['notifications', EVENT_NAMES],
    ['timeline', EVENT_NAMES],
    ['changeStep.intro', Object.keys(STEP_REQUIRED_FIELDS)],
  ] as const)('translates every %s value', (prefix, values) => {
    for (const value of values) {
      expect(typeof lookup(en, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
    }
  });

  it('labels every revision field', () => {
    for (const key of [
      ...Object.values(ASSET_FIELD_LABELS),
      ...Object.values(CHANGE_FIELD_LABELS),
    ]) {
      expect(typeof lookup({ assets: en }, key), key).toBe('string');
    }
  });

  it('has the notification params the backend sends', () => {
    for (const name of EVENT_NAMES) {
      expect(lookup(en, `notifications.${name}`)).toContain('{{ code }}');
    }
  });

  it('has guidance for every page and field the module uses', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const [page, fields] of Object.entries(GUIDANCE_PAGES)) {
        expect(lookup(guide, `pages.${page}.intro.title`), `${page} intro`).toBeTruthy();
        expect(lookup(guide, `pages.${page}.why.body`), `${page} why`).toBeTruthy();
        for (const field of fields) {
          expect(
            lookup(guide, `pages.${page}.fields.${field}.help`),
            `${page}.${field}`,
          ).toBeTruthy();
        }
      }
      for (const page of EMPTY_PAGES) {
        expect(lookup(guide, `pages.${page}.empty.title`), `${page} empty`).toBeTruthy();
      }
    }
  });

  it('has the lessons and tours the pages open', () => {
    for (const lesson of [
      'asset-inventory',
      'calibration',
      'access-reviews',
      'change-management',
    ]) {
      const content = lookup(guideEn, `lessons.${lesson}`) as {
        sections: unknown[];
        quiz: { options: unknown[]; answer: number }[];
      };
      expect(content.sections.length).toBeGreaterThan(0);
      for (const q of content.quiz) {
        expect(q.answer).toBeLessThan(q.options.length);
      }
    }
    for (const tour of ['list', 'reviews', 'changes']) {
      expect((lookup(guideEn, `tours.${tour}`) as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it('cites clauses from the frameworks the module supports', () => {
    const clauses = strings(
      Object.values((guideEn as { pages: Tree }).pages).map((p) => (p as Tree)['why']),
    ).filter((s) => /^(iso27001|iso9001):/.test(s));
    expect(clauses).toEqual(
      expect.arrayContaining([
        'iso27001:A.5.9',
        'iso27001:A.5.18',
        'iso27001:A.8.32',
        'iso9001:7.1.5',
        'iso9001:6.3',
      ]),
    );
  });
});
