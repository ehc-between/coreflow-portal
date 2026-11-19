import { ContextKind, PartyCategory } from '../data/context.models';
import { linesOf } from '../context-kinds';
import { ContextDraft, createBody, emptyDraft, localItemId } from '../form/context-draft';

/** The party groups a beginner can tick (the rest are typed under "Andre"). */
export const INTERVIEW_PARTIES = [
  'customer',
  'employee',
  'owner',
  'supplier',
  'regulator',
  'partner',
  'community',
] as const satisfies readonly PartyCategory[];

/** Groups that sit inside the organisation. */
const INTERNAL: ReadonlySet<PartyCategory> = new Set<PartyCategory>(['employee', 'owner']);

/** The four answers of the context interview. */
export interface InterviewAnswers {
  /** 1. What do you do, and for whom? */
  readonly what: string;
  /** 2. Who has needs or demands on you? Ticked groups plus typed names, one per line. */
  readonly parties: readonly PartyCategory[];
  readonly otherParties: string;
  /** 3. What helps you, and what can get in the way? One per line. */
  readonly helps: string;
  readonly hinders: string;
  /** 4. Which parts of the organisation should the system cover? */
  readonly covers: string;
}

export function emptyAnswers(): InterviewAnswers {
  return { what: '', parties: [], otherParties: '', helps: '', hinders: '', covers: '' };
}

/** One record the interview will create as a draft. */
export interface PlannedRecord {
  readonly kind: ContextKind;
  readonly title: string;
  readonly body: Record<string, unknown>;
}

/** Translate an i18n key (with params); injected so the plan stays a pure function. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * The drafts the four answers produce: one context analysis (what helps → strengths,
 * what hinders → threats), one interested party per group or typed name, and one
 * scope per standard that has none yet. Nothing is approved: a person reviews the
 * list before it is created, and every record starts as a draft.
 */
export function interviewPlan(
  answers: InterviewAnswers,
  frameworksWithoutScope: readonly string[],
  t: Translate,
  year: number,
): PlannedRecord[] {
  const what = answers.what.trim();
  const helps = linesOf(answers.helps);
  const hinders = linesOf(answers.hinders);
  const covers = answers.covers.trim();
  const plan: PlannedRecord[] = [];
  const add = (kind: ContextKind, draft: ContextDraft) =>
    plan.push({ kind, title: draft.title, body: createBody(kind, draft) });

  if (what || helps.length || hinders.length) {
    add('analysis', {
      ...emptyDraft(),
      title: t('context.interview.analysisTitle', { year }),
      method: 'swot',
      summary: what,
      items: [
        ...helps.map((text) => ({
          id: localItemId(),
          category: 'strength',
          text,
          impact: 'medium' as const,
        })),
        ...hinders.map((text) => ({
          id: localItemId(),
          category: 'threat',
          text,
          impact: 'medium' as const,
        })),
      ],
    });
  }

  for (const category of answers.parties) {
    add('party', {
      ...emptyDraft(),
      title: t(`context.partyCategories.${category}`),
      category,
      party_type: INTERNAL.has(category) ? 'internal' : 'external',
    });
  }
  for (const name of linesOf(answers.otherParties)) {
    add('party', { ...emptyDraft(), title: name, category: 'other', party_type: 'external' });
  }

  if (what || covers) {
    for (const framework of frameworksWithoutScope) {
      add('scope', {
        ...emptyDraft(),
        title: t('context.interview.scopeTitle', {
          framework: t(`context.frameworks.${framework}`),
        }),
        framework,
        statement: what,
        products_services: what,
        boundaries: covers,
      });
    }
  }
  return plan;
}
