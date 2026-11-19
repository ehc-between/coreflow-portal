import { FEEDBACK_STATUSES, SURVEY_STATUSES } from './data/feedback.models';
import {
  FEEDBACK_STATUS_TONE,
  SURVEY_STATUS_TONE,
  feedbackTodos,
  surveyTodos,
} from './feedback-anatomy';
import en from '../../../assets/i18n/feedback/en.json';
import nb from '../../../assets/i18n/feedback/nb.json';

type Tree = Record<string, unknown>;
const lookup = (tree: Tree, key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);

const base = {
  status: 'in_progress' as const,
  kind: 'complaint' as const,
  overdue: false,
  assessment_gaps: [] as const,
  subjects: [{ entity_type: 'supplier' }] as never,
  owner: { id: 'u-1', name: 'Ada' },
  replies: [],
};

describe('feedback detail anatomy', () => {
  it('has a status sentence and a tone for every status (done is green, never red)', () => {
    for (const status of FEEDBACK_STATUSES) {
      expect(FEEDBACK_STATUS_TONE[status]).not.toBe('fail');
      for (const lang of [en, nb]) {
        expect(typeof lookup(lang, `detail.status.${status}`)).toBe('string');
      }
    }
    expect(FEEDBACK_STATUS_TONE.resolved).toBe('pass');
    for (const status of SURVEY_STATUSES) {
      expect(SURVEY_STATUS_TONE[status]).not.toBe('fail');
      for (const lang of [en, nb]) {
        expect(typeof lookup(lang, `surveyDetail.status.${status}`)).toBe('string');
      }
    }
  });

  it('lists nothing for a complete or closed record', () => {
    expect(feedbackTodos(base)).toEqual([]);
    expect(
      feedbackTodos({ ...base, status: 'closed', subjects: [], owner: null, overdue: true }),
    ).toEqual([]);
  });

  it('folds an overdue reply into the "no reply" gap', () => {
    const todos = feedbackTodos({
      ...base,
      overdue: true,
      assessment_gaps: ['assessment', 'reply'],
      subjects: [],
      owner: null,
    });
    expect(todos.map((t) => t.labelKey)).toEqual([
      'feedback.gaps.assessment',
      'feedback.detail.missing.overdue',
      'feedback.detail.missing.subjects',
      'feedback.detail.missing.owner',
    ]);
    // Not a complaint: no assessment gaps, but the overdue reply still shows.
    const other = feedbackTodos({
      ...base,
      kind: 'compliment',
      overdue: true,
      assessment_gaps: ['assessment'],
    });
    expect(other.map((t) => t.key)).toEqual(['overdue']);
    expect(other[0].kind).toBe('reply');
  });

  it('asks a survey for questions, publishing, sharing and an owner', () => {
    const survey = { status: 'draft' as const, questions: [], response_count: 0, owner: null };
    expect(surveyTodos(survey).map((t) => t.key)).toEqual(['questions', 'owner']);
    expect(surveyTodos({ ...survey, questions: [{}] as never }).map((t) => t.key)).toEqual([
      'publish',
      'owner',
    ]);
    expect(
      surveyTodos({ ...survey, status: 'open', owner: { id: 'u', name: 'A' } }).map((t) => t.key),
    ).toEqual(['share']);
    expect(
      surveyTodos({ ...survey, status: 'open', response_count: 3, owner: { id: 'u', name: 'A' } }),
    ).toEqual([]);
  });
});
