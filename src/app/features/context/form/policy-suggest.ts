import { AcceptedSuggestion, FormSuggestFieldDef } from '../../../shared/ask/form-suggest';
import { FRAMEWORK_KEYS, POLICY_KINDS, PolicyKind } from '../data/context.models';
import { ContextDraft } from './context-draft';

/** The server's form suggest key of the policy form. */
export const POLICY_SUGGEST_KEY = 'context.policy';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** The policy form's fields as the suggestion knows them (backend names, form order). */
export function policySuggestFields(t: Translate): readonly FormSuggestFieldDef[] {
  return [
    { name: 'title', labelKey: 'context.fields.title' },
    {
      name: 'kind',
      labelKey: 'context.fields.kind',
      format: (value) => t(`context.policyKinds.${String(value)}`),
    },
    { name: 'statement', labelKey: 'context.fields.statement', long: true },
    {
      name: 'frameworks',
      labelKey: 'context.fields.frameworks',
      format: (value) =>
        (Array.isArray(value) ? value : []).map((fw) => t(`context.frameworks.${fw}`)).join(', '),
    },
    {
      name: 'document_id',
      labelKey: 'context.policy.document',
      format: (value, field) => (typeof field.display === 'string' ? field.display : ''),
    },
    {
      name: 'available_to_interested_parties',
      labelKey: 'context.fields.availableToParties',
      format: (value) => t(value ? 'context.common.yes' : 'context.common.no'),
    },
    {
      name: 'owner_user_id',
      labelKey: 'context.fields.owner',
      format: (value, field) => (typeof field.display === 'string' ? field.display : ''),
    },
    {
      name: 'review_interval_months',
      labelKey: 'context.fields.reviewInterval',
      format: (value) => (value ? t('context.detail.everyMonths', { count: value }) : ''),
    },
  ];
}

/** The draft as the suggestion's current values (backend names). */
export function policySuggestValues(draft: ContextDraft): Record<string, unknown> {
  return {
    title: draft.title,
    kind: draft.kind,
    statement: draft.statement,
    frameworks: draft.frameworks,
    owner_user_id: draft.owner_user_id || null,
    review_interval_months: draft.review_interval_months
      ? Number(draft.review_interval_months)
      : null,
    available_to_interested_parties: draft.available_to_interested_parties,
    document_id: draft.document?.id ?? null,
  };
}

/** The draft change for accepted suggestions (unknown or invalid values are skipped). */
export function policyPatch(accepted: AcceptedSuggestion): Partial<ContextDraft> {
  const patch: { -readonly [K in keyof ContextDraft]?: ContextDraft[K] } = {};
  const value = (name: string): unknown => accepted[name]?.value;
  if (typeof value('title') === 'string') {
    patch.title = value('title') as string;
  }
  const kind = value('kind');
  if (typeof kind === 'string' && (POLICY_KINDS as readonly string[]).includes(kind)) {
    patch.kind = kind as PolicyKind;
  }
  if (typeof value('statement') === 'string') {
    patch.statement = value('statement') as string;
  }
  const frameworks = value('frameworks');
  if (Array.isArray(frameworks)) {
    patch.frameworks = frameworks.filter((fw): fw is string =>
      (FRAMEWORK_KEYS as readonly string[]).includes(fw as string),
    );
  }
  if (typeof value('owner_user_id') === 'string') {
    patch.owner_user_id = value('owner_user_id') as string;
  }
  const interval = value('review_interval_months');
  if (typeof interval === 'number' && interval >= 1 && interval <= 60) {
    patch.review_interval_months = String(interval);
  }
  if (typeof value('available_to_interested_parties') === 'boolean') {
    patch.available_to_interested_parties = value('available_to_interested_parties') as boolean;
  }
  const documentId = value('document_id');
  const display = accepted['document_id']?.display;
  if (typeof documentId === 'string') {
    patch.document = {
      id: documentId,
      title: typeof display === 'string' ? display : documentId,
      code: null,
    };
  }
  return patch;
}
