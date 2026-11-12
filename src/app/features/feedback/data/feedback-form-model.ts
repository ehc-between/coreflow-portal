import { isoDay } from './feedback-display';
import {
  FEEDBACK_CHANNELS,
  FEEDBACK_KINDS,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_SEVERITIES,
  Feedback,
  FeedbackChannel,
  FeedbackCreate,
  FeedbackKind,
  FeedbackSentiment,
  FeedbackSeverity,
  FeedbackUpdate,
} from './feedback.models';

export const MAX_TAGS = 20;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The editable fields of a feedback record, as plain form values ('' = not set). */
export interface FeedbackFormValue {
  readonly kind: FeedbackKind;
  readonly title: string;
  readonly description: string;
  readonly channel: FeedbackChannel;
  readonly severity: FeedbackSeverity | '';
  readonly sentiment: FeedbackSentiment | '';
  readonly category: string;
  /** Comma-separated tags. */
  readonly tags: string;
  readonly customer_name: string;
  readonly customer_organisation: string;
  readonly customer_email: string;
  readonly customer_phone: string;
  readonly product_or_service: string;
  /** '' or '1'..'5'. */
  readonly satisfaction_score: string;
  readonly received_on: string;
  readonly response_due_on: string;
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly resolution: string;
  readonly customer_informed: boolean;
}

export function emptyFeedbackForm(today: Date = new Date()): FeedbackFormValue {
  return {
    kind: 'complaint',
    title: '',
    description: '',
    channel: 'email',
    severity: '',
    sentiment: '',
    category: '',
    tags: '',
    customer_name: '',
    customer_organisation: '',
    customer_email: '',
    customer_phone: '',
    product_or_service: '',
    satisfaction_score: '',
    received_on: isoDay(today),
    response_due_on: '',
    owner_user_id: '',
    department_id: '',
    resolution: '',
    customer_informed: false,
  };
}

export function formFromFeedback(f: Feedback): FeedbackFormValue {
  return {
    kind: f.kind,
    title: f.title,
    description: f.description ?? '',
    channel: f.channel,
    severity: f.severity ?? '',
    sentiment: f.sentiment ?? '',
    category: f.category ?? '',
    tags: f.tags.join(', '),
    customer_name: f.customer_name ?? '',
    customer_organisation: f.customer_organisation ?? '',
    customer_email: f.customer_email ?? '',
    customer_phone: f.customer_phone ?? '',
    product_or_service: f.product_or_service ?? '',
    satisfaction_score: f.satisfaction_score ? String(f.satisfaction_score) : '',
    received_on: f.received_on,
    response_due_on: f.response_due_on ?? '',
    owner_user_id: f.owner?.id ?? '',
    department_id: f.department_id ?? '',
    resolution: f.resolution ?? '',
    customer_informed: f.customer_informed,
  };
}

/** Split, trim and de-duplicate a comma-separated tag list. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const tag = part.trim().slice(0, 64);
    if (tag) {
      seen.add(tag);
    }
  }
  return [...seen];
}

/** Field -> i18n error key (scope `feedback`). Empty when the form is valid. */
export function validateFeedbackForm(v: FeedbackFormValue): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) {
    errors['title'] = 'feedback.form.errors.titleRequired';
  }
  if (!(FEEDBACK_KINDS as readonly string[]).includes(v.kind)) {
    errors['kind'] = 'feedback.form.errors.kindRequired';
  }
  if (v.customer_email.trim() && !EMAIL.test(v.customer_email.trim())) {
    errors['customer_email'] = 'feedback.form.errors.email';
  }
  if (parseTags(v.tags).length > MAX_TAGS) {
    errors['tags'] = 'feedback.form.errors.tooManyTags';
  }
  if (v.received_on && v.response_due_on && v.response_due_on < v.received_on) {
    errors['response_due_on'] = 'feedback.form.errors.dueBeforeReceived';
  }
  return errors;
}

const text = (value: string): string | null => value.trim() || null;
const opt = <T extends string>(value: T | '', allowed: readonly string[]): T | null =>
  value && allowed.includes(value) ? value : null;

export function toCreateRequest(v: FeedbackFormValue): FeedbackCreate {
  return {
    kind: v.kind,
    title: v.title.trim(),
    description: text(v.description),
    channel: (FEEDBACK_CHANNELS as readonly string[]).includes(v.channel) ? v.channel : 'other',
    severity: opt(v.severity, FEEDBACK_SEVERITIES),
    sentiment: opt(v.sentiment, FEEDBACK_SENTIMENTS),
    category: text(v.category),
    tags: parseTags(v.tags),
    customer_name: text(v.customer_name),
    customer_organisation: text(v.customer_organisation),
    customer_email: text(v.customer_email),
    customer_phone: text(v.customer_phone),
    product_or_service: text(v.product_or_service),
    satisfaction_score: v.satisfaction_score ? Number(v.satisfaction_score) : null,
    received_on: v.received_on || null,
    response_due_on: v.response_due_on || null,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
  };
}

/**
 * Only the fields that changed (the backend treats a sent `null` as "clear"), plus
 * the change reason. An unchanged form gives `{}` (+ reason).
 */
export function toUpdateRequest(
  original: FeedbackFormValue,
  next: FeedbackFormValue,
  changeReason: string,
): FeedbackUpdate {
  const a = { ...toCreateRequest(original), resolution: text(original.resolution) };
  const b = { ...toCreateRequest(next), resolution: text(next.resolution) };
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(b) as (keyof typeof b)[]) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      body[key] = b[key];
    }
  }
  // An owner cannot be cleared: leaving it empty keeps the current owner.
  if (body['owner_user_id'] === null) {
    delete body['owner_user_id'];
  }
  if (body['received_on'] === null) {
    delete body['received_on'];
  }
  if (original.customer_informed !== next.customer_informed) {
    body['customer_informed'] = next.customer_informed;
  }
  if (changeReason.trim()) {
    body['change_reason'] = changeReason.trim();
  }
  return body as FeedbackUpdate;
}
