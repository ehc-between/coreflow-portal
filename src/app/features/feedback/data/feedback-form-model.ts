import { EntityRefDto } from '../../../core/entities/entity.models';
import type { CustomerRef } from '../../../shared/customers';
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
  MAX_SUBJECTS,
  SUBJECT_TYPES,
  SubjectIn,
  SubjectType,
} from './feedback.models';

export const MAX_TAGS = 20;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A yes / no answer that may still be open ('' = not assessed yet). */
export type YesNo = '' | 'yes' | 'no';

export const yesNo = (value: boolean | null | undefined): YesNo =>
  value === true ? 'yes' : value === false ? 'no' : '';
export const fromYesNo = (value: YesNo): boolean | null =>
  value === 'yes' ? true : value === 'no' ? false : null;

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
  /** The Kunde field (customer register, '' = none) and its ref (shown by the picker). */
  readonly customer_id: string;
  readonly customer: CustomerRef | null;
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
  /** Complaint assessment (ISO 9001 10.2). */
  readonly complaint_justified: YesNo;
  readonly root_cause: string;
  readonly corrective_action_required: YesNo;
  readonly customer_accepted: YesNo;
  /** What the feedback is about: suppliers, contracts, processes, … */
  readonly subjects: readonly EntityRefDto[];
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
    customer_id: '',
    customer: null,
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
    complaint_justified: '',
    root_cause: '',
    corrective_action_required: '',
    customer_accepted: '',
    subjects: [],
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
    customer_id: f.customer_id ?? '',
    customer: f.customer ?? null,
    customer_email: f.customer_email ?? '',
    customer_phone: f.customer_phone ?? '',
    product_or_service: f.product_or_service ?? '',
    satisfaction_score: f.satisfaction_score ? String(f.satisfaction_score) : '',
    received_on: f.received_on,
    response_due_on: f.response_due_on ?? '',
    owner_user_id: f.owner?.id ?? '',
    department_id: f.department?.id ?? f.department_id ?? '',
    resolution: f.resolution ?? '',
    customer_informed: f.customer_informed,
    complaint_justified: yesNo(f.complaint_justified),
    root_cause: f.root_cause ?? '',
    corrective_action_required: yesNo(f.corrective_action_required),
    customer_accepted: yesNo(f.customer_accepted),
    subjects: f.subjects ?? [],
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

export function isSubjectType(type: string): type is SubjectType {
  return (SUBJECT_TYPES as readonly string[]).includes(type);
}

/** The related records as the API takes them (unknown types dropped, de-duplicated). */
export function toSubjects(refs: readonly EntityRefDto[]): SubjectIn[] {
  const seen = new Set<string>();
  const out: SubjectIn[] = [];
  for (const r of refs) {
    const key = `${r.entity_type}:${r.entity_id}`;
    if (isSubjectType(r.entity_type) && !seen.has(key)) {
      seen.add(key);
      out.push({ entity_type: r.entity_type, entity_id: r.entity_id });
    }
  }
  return out;
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
  if (v.subjects.length > MAX_SUBJECTS) {
    errors['subjects'] = 'feedback.form.errors.tooManySubjects';
  }
  return errors;
}

const text = (value: string): string | null => value.trim() || null;
const opt = <T extends string>(value: T | '', allowed: readonly string[]): T | null =>
  value && allowed.includes(value) ? value : null;

export function toCreateRequest(v: FeedbackFormValue): FeedbackCreate {
  const complaint = v.kind === 'complaint';
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
    customer_id: v.customer_id || null,
    customer_email: text(v.customer_email),
    customer_phone: text(v.customer_phone),
    product_or_service: text(v.product_or_service),
    satisfaction_score: v.satisfaction_score ? Number(v.satisfaction_score) : null,
    received_on: v.received_on || null,
    response_due_on: v.response_due_on || null,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    // The assessment only applies to complaints.
    complaint_justified: complaint ? fromYesNo(v.complaint_justified) : null,
    root_cause: complaint ? text(v.root_cause) : null,
    corrective_action_required: complaint ? fromYesNo(v.corrective_action_required) : null,
    customer_accepted: complaint ? fromYesNo(v.customer_accepted) : null,
    subjects: toSubjects(v.subjects),
  };
}

const subjectKey = (s: readonly SubjectIn[] | undefined) =>
  (s ?? [])
    .map((x) => `${x.entity_type}:${x.entity_id}`)
    .sort()
    .join('|');

/**
 * Only the fields that changed (the backend treats a sent `null` as "clear"), plus
 * the change reason. An unchanged form gives `{}` (+ reason). `subjects` is sent
 * as the full new set when it changed.
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
    if (key === 'subjects') {
      continue;
    }
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      body[key] = b[key];
    }
  }
  if (subjectKey(a.subjects) !== subjectKey(b.subjects)) {
    body['subjects'] = b.subjects;
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
