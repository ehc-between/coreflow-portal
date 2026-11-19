import { StatusLineTone } from '../../shared/kit/record-sections';
import {
  AssessmentGap,
  Feedback,
  FeedbackStatus,
  Survey,
  SurveyStatus,
} from './data/feedback.models';

/** Tone of the feedback status sentence: resolved / closed is done, the rest open work. */
export const FEEDBACK_STATUS_TONE: Readonly<Record<FeedbackStatus, StatusLineTone>> = {
  new: 'warn',
  acknowledged: 'warn',
  in_progress: 'info',
  resolved: 'pass',
  closed: 'pass',
};

/** Tone of the survey status sentence: open collects answers, a draft is a to-do. */
export const SURVEY_STATUS_TONE: Readonly<Record<SurveyStatus, StatusLineTone>> = {
  draft: 'warn',
  open: 'pass',
  closed: 'neutral',
};

/**
 * One line of a feedback record's "Oppfølging" (docs/ux-guide.md §2.7) before the
 * page attaches the click: an assessment gap (fixed on the page), the overdue
 * reply, what the feedback is about, or a field on the edit page.
 */
export type FeedbackTodo =
  | {
      readonly key: string;
      readonly labelKey: string;
      readonly kind: 'gap';
      readonly gap: AssessmentGap;
    }
  | { readonly key: string; readonly labelKey: string; readonly kind: 'reply' }
  | { readonly key: string; readonly labelKey: string; readonly kind: 'subjects' }
  | { readonly key: string; readonly labelKey: string; readonly kind: 'edit' };

/**
 * What a feedback record still needs, most important first: an overdue reply, the
 * complaint's assessment gaps (what an auditor would miss), what it is about and
 * who owns it. A closed record needs nothing.
 */
export function feedbackTodos(
  f: Pick<
    Feedback,
    'status' | 'kind' | 'overdue' | 'assessment_gaps' | 'subjects' | 'owner' | 'replies'
  >,
): FeedbackTodo[] {
  if (f.status === 'closed') {
    return [];
  }
  const items: FeedbackTodo[] = [];
  const gaps = f.kind === 'complaint' ? f.assessment_gaps : [];
  if (f.overdue && !gaps.includes('reply')) {
    items.push(
      f.replies.length === 0
        ? { key: 'overdue', labelKey: 'feedback.detail.missing.overdue', kind: 'reply' }
        : { key: 'overdue', labelKey: 'feedback.detail.missing.overdueReplied', kind: 'edit' },
    );
  }
  for (const gap of gaps) {
    const labelKey =
      gap === 'reply' && f.overdue ? 'feedback.detail.missing.overdue' : `feedback.gaps.${gap}`;
    items.push({ key: `gap-${gap}`, labelKey, kind: 'gap', gap });
  }
  if (f.subjects.length === 0) {
    items.push({ key: 'subjects', labelKey: 'feedback.detail.missing.subjects', kind: 'subjects' });
  }
  if (!f.owner) {
    items.push({ key: 'owner', labelKey: 'feedback.detail.missing.owner', kind: 'edit' });
  }
  return items;
}

/** One line of a survey's "Oppfølging": publish it, add questions, share it, or edit it. */
export type SurveyTodo =
  | { readonly key: string; readonly labelKey: string; readonly kind: 'publish' }
  | { readonly key: string; readonly labelKey: string; readonly kind: 'edit' }
  | { readonly key: string; readonly labelKey: string; readonly kind: 'copy' };

/** What a survey still needs: questions, publishing, sharing the link, an owner. */
export function surveyTodos(
  s: Pick<Survey, 'status' | 'questions' | 'response_count' | 'owner'>,
): SurveyTodo[] {
  const items: SurveyTodo[] = [];
  if (s.status === 'draft') {
    if (s.questions.length === 0) {
      items.push({
        key: 'questions',
        labelKey: 'feedback.surveyDetail.missing.questions',
        kind: 'edit',
      });
    } else {
      items.push({
        key: 'publish',
        labelKey: 'feedback.surveyDetail.missing.publish',
        kind: 'publish',
      });
    }
  } else if (s.status === 'open' && s.response_count === 0) {
    items.push({ key: 'share', labelKey: 'feedback.surveyDetail.missing.share', kind: 'copy' });
  }
  if (!s.owner) {
    items.push({ key: 'owner', labelKey: 'feedback.surveyDetail.missing.owner', kind: 'edit' });
  }
  return items;
}
