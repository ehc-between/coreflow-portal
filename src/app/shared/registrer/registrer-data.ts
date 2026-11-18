import { PageContext } from '../../core/ai/page-context';
import { QuickContext, QuickCreateRequest, QuickType, QuickTypeKey } from './registrer.models';

/**
 * "Meld noe som gikk galt" (simplify-plan §3.2): the plain-language answers to
 * "Hva har skjedd?". Each picks the quick type (and, for HMS and security, the kind),
 * so nobody has to know the words avvik, nestenulykke or personvernbrudd first.
 * Labels: `registrer.triage.<key>.label` / `.term` (the formal word, in parentheses).
 */
export interface TriageOption {
  readonly key: string;
  readonly type: QuickTypeKey;
  readonly kind?: string;
  readonly icon: string;
}

export const TRIAGE_OPTIONS: readonly TriageOption[] = [
  { key: 'wentWrong', type: 'deviation', icon: 'alert' },
  { key: 'nearMiss', type: 'near_miss', kind: 'near_miss', icon: 'hardhat' },
  { key: 'injury', type: 'near_miss', kind: 'injury', icon: 'hardhat' },
  { key: 'phishing', type: 'security_incident', kind: 'phishing', icon: 'lock' },
  { key: 'security', type: 'security_incident', icon: 'lock' },
  { key: 'breach', type: 'data_breach', icon: 'shield' },
  { key: 'complaint', type: 'complaint', icon: 'comment' },
];

/** Icons of the "Registrer noe annet" row (labels: `registrer.types.<key>`). */
export const TYPE_ICONS: Readonly<Record<QuickTypeKey, string>> = {
  deviation: 'alert',
  near_miss: 'hardhat',
  security_incident: 'lock',
  data_breach: 'shield',
  complaint: 'comment',
  improvement: 'spark',
  customer_feedback: 'smile',
  risk: 'risk',
  task: 'checkcircle',
  document: 'documents',
  supplier: 'link',
};

/** Field keys the quick form can show (labels: `registrer.fields.<key>`). */
export const QUICK_FIELD_KEYS = [
  'title',
  'kind',
  'description',
  'occurred_at',
  'customer_name',
  'document_type',
  'due_at',
  'owner_user_id',
] as const;

/** Built-in select options the backend sends untranslated (`registrer.options.kind.<value>`). */
export const KIND_OPTIONS = [
  'near_miss',
  'injury',
  'occupational_illness',
  'dangerous_condition',
  'property_damage',
  'phishing',
  'malware',
  'unauthorised_access',
  'data_loss',
  'denial_of_service',
  'lost_device',
  'complaint',
  'compliment',
  'suggestion',
  'inquiry',
  'other',
] as const;

/** "Hva skjer videre" codes (`registrer.next.<code>`). */
export const NEXT_STEP_CODES = [
  'deviation_follow_up',
  'hse_follow_up',
  'security_follow_up',
  'breach_72h',
  'breach_reported_72h',
  'complaint_response',
  'improvement_review',
  'feedback_follow_up',
  'risk_assess',
  'task_assigned',
  'document_draft',
  'supplier_evaluate',
] as const;

/** "Fullfør posten" fields (`registrer.complete.fields.<field>`). */
export const COMPLETE_FIELDS = [
  'severity',
  'location',
  'immediate_action',
  'root_cause',
  'persons_involved',
  'breach_types',
  'data_categories',
  'approx_subjects',
  'risk_level',
  'measures_taken',
  'customer_organisation',
  'product_or_service',
  'benefit',
  'effort',
  'channel',
  'satisfaction_score',
  'inherent_likelihood',
  'inherent_consequence',
  'treatment_strategy',
  'priority',
  'checklist',
  'content',
  'review',
  'criticality',
  'category',
  'country',
  'contact_name',
] as const;

/** Error codes with their own message (`registrer.errors.<code>`); others use `generic`. */
export const ERROR_CODES = [
  'forbidden',
  'module_disabled',
  'type_inactive',
  'field_required',
  'invalid_option',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the new record gets linked to, with the title shown in the dialog. */
export interface ContextChoice {
  readonly context: QuickContext;
  readonly title: string | null;
}

/**
 * The record or requirement the dialog was opened from, read from the page context
 * the page registered for the assistant: a record detail page (a UUID id), or a
 * requirement focused in a standard's workspace. Lists, dashboards and the standard
 * itself give no context.
 */
export function contextFromPage(ctx: PageContext | null): ContextChoice | null {
  if (!ctx || ctx.view !== 'detail' || !ctx.entityType) {
    return null;
  }
  const title = ctx.title?.trim() || null;
  if (ctx.entityType === 'standard_requirement') {
    const refs = ctx.requirements ?? [];
    return refs.length === 1 && refs[0] ? { context: { requirement_ref: refs[0] }, title } : null;
  }
  if (ctx.entityType === 'standard' || !ctx.entityId || !UUID_RE.test(ctx.entityId)) {
    return null;
  }
  return { context: { entity_type: ctx.entityType, entity_id: ctx.entityId }, title };
}

/** The options of the dialog's first step, in order, for the types the caller may use. */
export function pickOptions(types: readonly QuickType[]): {
  readonly triage: readonly TriageOption[];
  readonly common: readonly QuickType[];
} {
  const available = new Set(types.filter((t) => t.available).map((t) => t.key));
  return {
    triage: TRIAGE_OPTIONS.filter((option) => available.has(option.type)),
    common: types.filter((t) => t.available && t.group === 'common' && t.featured),
  };
}

/** `datetime-local` value ("2026-11-18T09:30") → ISO UTC, or null. */
export function localToIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The POST body for `type` from the form values: only the fields the type asks for,
 * trimmed, empty ones dropped (the backend applies defaults; owner defaults to me).
 */
export function buildRequest(
  type: QuickType,
  values: Readonly<Record<string, string>>,
  context: QuickContext | null,
): QuickCreateRequest {
  const body: Record<string, unknown> = { type: type.key, title: (values['title'] ?? '').trim() };
  for (const field of type.fields) {
    if (field.key === 'title') {
      continue;
    }
    const raw = (values[field.key] ?? '').trim();
    if (!raw) {
      continue;
    }
    body[field.key] = field.kind === 'datetime' ? localToIso(raw) : raw;
  }
  if (context) {
    body['context'] = context;
  }
  return body as unknown as QuickCreateRequest;
}

/** The required fields still empty (the submit button names the first). */
export function missingRequired(
  type: QuickType,
  values: Readonly<Record<string, string>>,
): string[] {
  return type.fields
    .filter((field) => field.required && !(values[field.key] ?? '').trim())
    .map((field) => field.key);
}

/** The error shape `{ detail: { code } }` (or a 403), as one of {@link ERROR_CODES} or `generic`. */
export function errorCode(error: unknown): { code: string; field: string | null } {
  const err = error as { status?: number; error?: { detail?: unknown } } | null;
  if (err?.status === 403) {
    return { code: 'forbidden', field: null };
  }
  const detail = err?.error?.detail as { code?: unknown; field?: unknown } | undefined;
  const code = typeof detail?.code === 'string' ? detail.code : '';
  const field = typeof detail?.field === 'string' ? detail.field : null;
  return {
    code: (ERROR_CODES as readonly string[]).includes(code) ? code : 'generic',
    field,
  };
}

/**
 * True when the error may come from the page context (a record that cannot be linked,
 * or one the caller may not see or edit): the dialog then registers once more without
 * it, so a link problem never stops a report. A real permission problem fails again.
 */
export function isContextError(error: unknown): boolean {
  const err = error as { status?: number; error?: { detail?: { code?: unknown } } } | null;
  const code = err?.error?.detail?.code;
  if (err?.status === 403 || (err?.status === 404 && code !== 'module_disabled')) {
    return true;
  }
  return err?.status === 422 && (code === 'not_linkable' || code === 'unsupported_entity_type');
}

/**
 * The "Registrer" shortcut: a bare N, outside text fields and while no other dialog
 * (palette, drawer, confirm) is open.
 */
export function isRegistrerShortcut(event: KeyboardEvent, doc: Document = document): boolean {
  if ((event.key ?? '').toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  if (event.defaultPrevented || event.repeat || event.isComposing) {
    return false;
  }
  const target = event.target as HTMLElement | null;
  if (
    target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
  ) {
    return false;
  }
  return !doc.querySelector('[aria-modal="true"]');
}
