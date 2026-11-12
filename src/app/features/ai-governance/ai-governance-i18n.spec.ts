import { expectKeyParity } from '../../../testing/i18n-parity';
import en from '../../../assets/i18n/ai-governance/en.json';
import nb from '../../../assets/i18n/ai-governance/nb.json';
import guidanceEn from '../../../assets/guidance/en/ai-governance.json';
import guidanceNb from '../../../assets/guidance/nb/ai-governance.json';
import { AI_GOVERNANCE_ERROR_CODES } from './data/ai-governance-errors';
import {
  AI_ACT_ROLES,
  ASSESSMENT_KINDS,
  ASSESSMENT_SORTS,
  ASSESSMENT_STATUSES,
  LITERACY_SOURCES,
  MONITORING_KINDS,
  MONITORING_RESULTS,
  RISK_CLASSES,
  SYSTEM_SORTS,
  SYSTEM_STATUSES,
} from './data/ai-governance.models';
import { emptyAnswers } from './data/ai-governance-display';
import { WIZARD_STEPS } from './classification/classification-questions';

type Tree = Record<string, unknown>;

function at(tree: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) => (node && typeof node === 'object' ? (node as Tree)[part] : undefined),
      tree,
    );
}

function expectStrings(tree: unknown, paths: readonly string[]): void {
  const missing = paths.filter((p) => typeof at(tree, p) !== 'string');
  expect(missing, missing.join('\n')).toEqual([]);
}

/** Catalogue keys served by the backend `GET /catalog` (coreflow-core catalog.py). */
const PROHIBITED = [
  'subliminal_manipulation',
  'exploiting_vulnerabilities',
  'social_scoring',
  'crime_risk_profiling',
  'facial_image_scraping',
  'emotion_recognition_work_education',
  'biometric_categorisation_sensitive',
  'realtime_remote_biometric_identification',
];
const ANNEX_III = [
  'biometrics',
  'critical_infrastructure',
  'education',
  'employment',
  'essential_services',
  'law_enforcement',
  'migration_border',
  'justice_democracy',
];
const TRANSPARENCY = [
  'interacts_with_people',
  'synthetic_content',
  'emotion_or_biometric_categorisation',
  'deep_fake',
  'public_interest_text',
];
const IMPACT_SECTIONS = [
  'intended_use',
  'affected_parties',
  'foreseeable_misuse',
  'impacts_individuals',
  'impacts_society',
  'mitigations',
  'residual_impact',
  'conclusion',
];
const FRIA_SECTIONS = [
  'process_description',
  'period_and_frequency',
  'affected_categories',
  'specific_risks',
  'human_oversight_measures',
  'mitigation_and_complaints',
];
const DOC_SECTIONS = [
  'data_documentation',
  'model_documentation',
  'human_oversight',
  'logging',
  'accuracy_robustness',
  'post_market_plan',
  'general_description',
  'development_process',
  'monitoring_and_control',
  'performance_metrics',
  'risk_management',
  'lifecycle_changes',
  'harmonised_standards',
  'declaration_of_conformity',
  'post_market_evaluation',
];
/** Event names of the module's scoped title / timeline keys (backend events.py). */
const EVENTS = [
  'systemCreated',
  'systemUpdated',
  'systemOwnerChanged',
  'systemStatusChanged',
  'systemClassified',
  'systemMonitored',
  'systemMonitoringAlert',
  'systemDeleted',
  'assessmentCreated',
  'assessmentCompleted',
  'assessmentApproved',
  'assessmentReopened',
  'assessmentDeleted',
];

describe('AI governance translations', () => {
  it('keeps en/nb at full key parity', () => expectKeyParity(en, nb));

  it('keeps the guidance files at full key parity', () => expectKeyParity(guidanceEn, guidanceNb));

  for (const [lang, file] of [
    ['en', en],
    ['nb', nb],
  ] as const) {
    it(`has every dynamic key in ${lang}`, () => {
      expectStrings(file, [
        ...RISK_CLASSES.flatMap((r) => [`risk.${r}`, `riskExplain.${r}`]),
        ...SYSTEM_STATUSES.map((s) => `status.${s}`),
        ...AI_ACT_ROLES.flatMap((r) => [`role.${r}`, `roleHelp.${r}`]),
        ...ASSESSMENT_KINDS.flatMap((k) => [`kind.${k}`, `kindHelp.${k}`]),
        ...ASSESSMENT_STATUSES.map((s) => `assessmentStatus.${s}`),
        ...MONITORING_KINDS.map((k) => `monitoringKind.${k}`),
        ...MONITORING_RESULTS.map((r) => `monitoringResult.${r}`),
        ...LITERACY_SOURCES.map((s) => `literacySource.${s}`),
        ...['open', 'in_progress', 'blocked', 'done', 'cancelled'].map((s) => `taskStatus.${s}`),
        ...PROHIBITED.map((k) => `prohibited.${k}`),
        ...ANNEX_III.map((k) => `annexIii.${k}`),
        ...TRANSPARENCY.map((k) => `transparency.${k}`),
        ...IMPACT_SECTIONS.flatMap((k) => [
          `sections.impact.${k}.title`,
          `sections.impact.${k}.hint`,
        ]),
        ...FRIA_SECTIONS.flatMap((k) => [`sections.fria.${k}.title`, `sections.fria.${k}.hint`]),
        ...DOC_SECTIONS.flatMap((k) => [`docSections.${k}.title`, `docSections.${k}.hint`]),
        ...WIZARD_STEPS.flatMap((s) =>
          ['short', 'title', 'body', 'ask'].map((p) => `wizard.steps.${s}.${p}`),
        ),
        ...Object.keys(emptyAnswers()).map((k) => `wizard.answerLabels.${k}`),
        ...SYSTEM_SORTS.map((s) => `systems.sorts.${s}`),
        ...ASSESSMENT_SORTS.map((s) => `assessments.sorts.${s}`),
        ...AI_GOVERNANCE_ERROR_CODES.map((c) => `errors.${c}`),
        ...['forbidden', 'conflict', 'invalid'].map((c) => `errors.${c}`),
        ...['complete', 'approve', 'reopen', 'delete'].flatMap((a) =>
          ['title', 'message', 'action'].map((p) => `assessmentDetail.confirm.${a}.${p}`),
        ),
        ...['complete', 'approve', 'reopen'].map((a) => `assessmentDetail.done.${a}`),
        ...['governance', 'annex_iv'].map((g) => `docs.groups.${g}`),
        ...EVENTS.flatMap((e) => [`notifications.${e}`, `timeline.${e}`]),
        ...[
          'unclassified',
          'prohibited',
          'assessmentsOverdue',
          'reviewsOverdue',
          'monitoringFailures',
          'noPolicy',
        ].map((k) => `overview.attentionItems.${k}`),
        ...['prohibited', 'high_annex_i', 'high_area', 'high_profiling', 'exception_art6_3'].map(
          (k) => `reasons.${k}`,
        ),
        ...['transparency', 'minimal', 'gpai', 'gpai_systemic', 'other'].map((k) => `reasons.${k}`),
      ]);
    });
  }

  it('has the guidance pages, lessons and tours the pages use', () => {
    const pages = [
      'overview',
      'systems',
      'systemForm',
      'systemDetail',
      'classify',
      'documentation',
      'assessments',
      'assessmentNew',
      'assessmentEdit',
      'assessmentDetail',
      'literacy',
      'settings',
    ];
    for (const page of pages) {
      expect(typeof at(guidanceEn, `pages.${page}.intro.title`), page).toBe('string');
      expect(typeof at(guidanceEn, `pages.${page}.why.body`), page).toBe('string');
    }
    for (const page of ['systems', 'assessments', 'literacy']) {
      expect(typeof at(guidanceEn, `pages.${page}.empty.cta`), page).toBe('string');
    }
    for (const step of WIZARD_STEPS) {
      expect(typeof at(guidanceEn, `pages.classify.fields.${step}.help`), step).toBe('string');
    }
    const lessons = [
      'ai-governance-intro',
      'ai-inventory-basics',
      'eu-ai-act-risk-classes',
      'ai-act-obligations',
      'technical-documentation',
      'impact-assessment-and-fria',
      'ai-literacy',
    ];
    for (const lesson of lessons) {
      const content = at(guidanceEn, `lessons.${lesson}`) as {
        sections?: unknown[];
        quiz?: unknown[];
      };
      expect(content?.sections?.length, lesson).toBeGreaterThan(0);
      expect(content?.quiz?.length, lesson).toBeGreaterThan(0);
    }
    for (const tour of ['overview', 'systems', 'classify']) {
      expect((at(guidanceEn, `tours.${tour}`) as unknown[]).length, tour).toBeGreaterThan(0);
    }
  });

  it('never names an AI vendor or model in user-facing text', () => {
    const text = JSON.stringify([en, nb, guidanceEn, guidanceNb]);
    expect(text).not.toMatch(/claude|anthropic|openai|\bgpt\b|chatgpt|gemini|copilot/i);
  });
});
