import { formulaRefs, parseFormula } from '../../core/records/formula';
import { hasLabel } from '../../core/records/localized';
import {
  DefinitionIssue,
  FieldIssue,
  FieldSpec,
  FieldType,
  LayoutSection,
  LocalizedText,
  StateDef,
  TransitionDef,
  WorkflowDefinition,
} from '../../core/records/record.models';

/**
 * Module keys a record type or workflow can belong to (platform contracts 1.1).
 * Labels live under `records.modules.<key>`.
 */
export const MODULE_KEYS = [
  'deviations',
  'context',
  'processes',
  'risk',
  'inspections',
  'audits',
  'management_review',
  'objectives',
  'people',
  'recruitment',
  'training',
  'contracts',
  'suppliers',
  'projects',
  'privacy',
  'ai_governance',
  'environment',
  'obligations',
  'assets',
  'continuity',
  'hse',
  'feedback',
  'reports',
  'documents',
] as const;

export function moduleLabelKey(module: string): string {
  return (MODULE_KEYS as readonly string[]).includes(module)
    ? `records.modules.${module}`
    : 'records.modules.other';
}

/** Default role keys offered for allowed roles, approvers and task assignees. */
export const ROLE_OPTIONS = [
  'admin',
  'quality_manager',
  'auditor',
  'dpo',
  'ciso',
  'member',
  'hse_manager',
  'hr_manager',
  'ai_officer',
] as const;

/** Guards modules register with the engine today (free text is allowed too). */
export const GUARD_OPTIONS = ['no_open_tasks', 'deviation_closure'] as const;

export const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
export const STATE_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
export const TYPE_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
export const CODE_PREFIX_RE = /^[A-Z][A-Z0-9-]{0,15}$/;
const ROLE_RE = /^[a-z][a-z0-9_]{0,63}$/;
const PERMISSION_RE = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

/** Field types that take options. */
export const OPTION_TYPES: readonly FieldType[] = ['select', 'multiselect'];
/** Field types a formula may reference. */
export const NUMERIC_TYPES: readonly FieldType[] = ['number', 'calculated'];

/** A key-safe slug of free text (`"Root cause"` -> `root_cause`). */
export function slugify(text: string, max = 64): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  const safe = /^[a-z]/.test(slug) ? slug : slug ? `k_${slug}` : '';
  return safe.slice(0, max);
}

/** A key not yet in `taken`, derived from `base` (`status`, `status_2`, …). */
export function uniqueKey(base: string, taken: Iterable<string>, max = 64): string {
  const used = new Set(taken);
  const root = (slugify(base, max) || 'field').slice(0, max - 3);
  if (!used.has(root)) {
    return root;
  }
  for (let n = 2; ; n++) {
    const candidate = `${root}_${n}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

/** A fresh field of `type` with a unique key. */
export function newField(
  type: FieldType,
  taken: readonly string[],
  label: LocalizedText,
): FieldSpec {
  const base: FieldSpec = {
    key: uniqueKey(type, taken),
    label,
    type,
    required: false,
    width: 'full',
  };
  if (OPTION_TYPES.includes(type)) {
    return { ...base, options: [{ value: 'option_1', label: { en: 'Option 1', nb: 'Valg 1' } }] };
  }
  if (type === 'calculated') {
    return { ...base, formula: '' };
  }
  if (type === 'entity_ref') {
    return { ...base, entity_type: '' };
  }
  return base;
}

/** A small starter workflow: open -> in progress -> done, plus cancel. */
export function starterDefinition(): WorkflowDefinition {
  return {
    initial_state: 'open',
    states: [
      { key: 'open', label: { en: 'Open', nb: 'Åpen' }, category: 'open' },
      { key: 'in_progress', label: { en: 'In progress', nb: 'Pågår' }, category: 'in_progress' },
      { key: 'done', label: { en: 'Done', nb: 'Ferdig' }, category: 'done' },
      { key: 'cancelled', label: { en: 'Cancelled', nb: 'Kansellert' }, category: 'cancelled' },
    ],
    transitions: [
      {
        key: 'start',
        from: ['open'],
        to: 'in_progress',
        label: { en: 'Start', nb: 'Start' },
      },
      {
        key: 'complete',
        from: ['in_progress'],
        to: 'done',
        label: { en: 'Complete', nb: 'Fullfør' },
      },
      {
        key: 'cancel',
        from: ['open', 'in_progress'],
        to: 'cancelled',
        label: { en: 'Cancel', nb: 'Kanseller' },
        require_comment: true,
      },
    ],
  };
}

/** A new state with a unique key. */
export function newState(taken: readonly string[], label: LocalizedText): StateDef {
  return { key: uniqueKey('state', taken, 32), label, category: 'in_progress' };
}

/** A new transition with a unique key between two states. */
export function newTransition(
  taken: readonly string[],
  from: string,
  to: string,
  label: LocalizedText,
): TransitionDef {
  return { key: uniqueKey(`to_${to}`, taken), from: from ? [from] : [], to, label };
}

/** Rename a state everywhere it is referenced. */
export function renameState(
  definition: WorkflowDefinition,
  from: string,
  to: string,
): WorkflowDefinition {
  if (from === to) {
    return definition;
  }
  return {
    initial_state: definition.initial_state === from ? to : definition.initial_state,
    states: definition.states.map((s) => (s.key === from ? { ...s, key: to } : s)),
    transitions: definition.transitions.map((t) => ({
      ...t,
      from: t.from.map((k) => (k === from ? to : k)),
      to: t.to === from ? to : t.to,
    })),
  };
}

/** Remove a state and every transition that ends there (and its use as a source). */
export function removeState(definition: WorkflowDefinition, key: string): WorkflowDefinition {
  const states = definition.states.filter((s) => s.key !== key);
  return {
    initial_state:
      definition.initial_state === key ? (states[0]?.key ?? '') : definition.initial_state,
    states,
    transitions: definition.transitions
      .filter((t) => t.to !== key)
      .map((t) => ({ ...t, from: t.from.filter((k) => k !== key) }))
      .filter((t) => t.from.length > 0),
  };
}

/**
 * Client-side checks mirroring the backend's `validate_definition`, so the
 * designer can point at problems before publishing. The server still decides.
 * `loc` uses the backend's paths (`states.1`, `transitions.0.to`, …).
 */
export function checkDefinition(definition: WorkflowDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  if (definition.states.length === 0) {
    issues.push({ code: 'no_states', loc: 'states' });
    return issues;
  }
  const keys = definition.states.map((s) => s.key);
  const known = new Set(keys);
  if (known.size !== keys.length) {
    issues.push({ code: 'duplicate_state', loc: 'states' });
  }
  definition.states.forEach((state, index) => {
    if (!STATE_KEY_RE.test(state.key)) {
      issues.push({ code: 'invalid_key', loc: `states.${index}` });
    }
    if (!hasLabel(state.label)) {
      issues.push({ code: 'no_label', loc: `states.${index}` });
    }
  });
  if (!known.has(definition.initial_state)) {
    issues.push({ code: 'unknown_state', loc: 'initial_state' });
  }
  const tKeys = definition.transitions.map((t) => t.key);
  if (new Set(tKeys).size !== tKeys.length) {
    issues.push({ code: 'duplicate_transition', loc: 'transitions' });
  }
  definition.transitions.forEach((t, index) => {
    const loc = `transitions.${index}`;
    if (!KEY_RE.test(t.key)) {
      issues.push({ code: 'invalid_key', loc });
    }
    if (!hasLabel(t.label)) {
      issues.push({ code: 'no_label', loc });
    }
    if (t.from.length === 0) {
      issues.push({ code: 'no_from', loc: `${loc}.from` });
    }
    for (const source of t.from) {
      if (!known.has(source)) {
        issues.push({ code: 'unknown_state', loc: `${loc}.from`, state: source });
      }
    }
    if (!known.has(t.to)) {
      issues.push({ code: 'unknown_state', loc: `${loc}.to`, state: t.to });
    }
    for (const field of t.required_fields ?? []) {
      if (!KEY_RE.test(field)) {
        issues.push({ code: 'invalid_field_key', loc: `${loc}.required_fields` });
      }
    }
    const roles = [...(t.allowed_roles ?? []), ...(t.approval?.approver_roles ?? [])];
    for (const role of roles) {
      if (!ROLE_RE.test(role)) {
        issues.push({ code: 'invalid_role', loc, role });
      }
    }
    for (const permission of t.allowed_permissions ?? []) {
      if (!PERMISSION_RE.test(permission)) {
        issues.push({ code: 'invalid_permission', loc });
      }
    }
    for (const guard of t.guards ?? []) {
      if (!ROLE_RE.test(guard)) {
        issues.push({ code: 'invalid_guard', loc, guard });
      }
    }
    if (t.approval) {
      if (!t.approval.approver_roles.length && !t.approval.approver_user_field) {
        issues.push({ code: 'approval_without_approver', loc: `${loc}.approval` });
      }
      if (t.approval.mode === 'quorum' && !t.approval.quorum) {
        issues.push({ code: 'quorum_required', loc: `${loc}.approval` });
      }
    }
    for (const task of t.create_tasks ?? []) {
      if (task.assignee && task.assignee.type !== 'owner' && !task.assignee.value) {
        issues.push({ code: 'assignee_value_required', loc: `${loc}.create_tasks` });
      }
      if (!hasLabel(task.title)) {
        issues.push({ code: 'no_label', loc: `${loc}.create_tasks` });
      }
    }
    for (const notify of t.notify ?? []) {
      if (['role', 'user_field', 'user'].includes(notify.type) && !notify.value) {
        issues.push({ code: 'notify_value_required', loc: `${loc}.notify` });
      }
    }
  });
  return issues;
}

/** Client-side checks mirroring the backend's `validate_fields`. */
export function checkFields(fields: readonly FieldSpec[]): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const seen = new Map<string, FieldSpec>();
  fields.forEach((field, index) => {
    const add = (code: string) => issues.push({ index, key: field.key, code });
    if (!KEY_RE.test(field.key)) {
      add('invalid_field');
    }
    if (!hasLabel(field.label)) {
      add('no_label');
    }
    if (seen.has(field.key)) {
      add('duplicate_key');
    }
    if (OPTION_TYPES.includes(field.type)) {
      const values = (field.options ?? []).map((o) => (typeof o === 'string' ? o : o.value));
      if (values.length === 0 || values.some((v) => !v.trim())) {
        add('options_required');
      } else if (new Set(values).size !== values.length) {
        add('duplicate_option');
      }
    }
    if (
      field.min !== null &&
      field.min !== undefined &&
      field.max !== null &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      add('invalid_range');
    }
    if (field.type === 'entity_ref' && !field.entity_type) {
      add('entity_type_required');
    }
    if (field.type === 'calculated') {
      if (!field.formula?.trim()) {
        add('formula_required');
      } else {
        try {
          const refs = formulaRefs(parseFormula(field.formula));
          if (refs.some((ref) => !NUMERIC_TYPES.includes(seen.get(ref)?.type as FieldType))) {
            add('invalid_formula');
          }
        } catch {
          add('invalid_formula');
        }
      }
    }
    seen.set(field.key, field);
  });
  fields.forEach((field, index) => {
    const cond = field.visible_if;
    if (cond && (cond.field === field.key || !seen.has(cond.field))) {
      issues.push({ index, key: field.key, code: 'invalid_visible_if' });
    }
  });
  return issues;
}

/** An editable layout section (fields are assigned through `FieldSpec.section`). */
export interface SectionDraft {
  readonly key: string;
  readonly label: LocalizedText | null;
  readonly columns: 1 | 2;
}

/** Sections to edit from a stored layout, or from the fields' `section` hints. */
export function sectionsFrom(
  fields: readonly FieldSpec[],
  layout: readonly LayoutSection[] | null | undefined,
  fallbackLabel: LocalizedText,
): SectionDraft[] {
  if (layout && layout.length) {
    return layout.map((s) => ({ key: s.key, label: s.label ?? null, columns: s.columns }));
  }
  const keys = [...new Set(fields.map((f) => f.section || 'details'))];
  if (keys.length === 0) {
    keys.push('details');
  }
  return keys.map((key) => ({
    key: slugify(key) || 'details',
    label: key === 'details' ? fallbackLabel : key,
    columns: fields.some((f) => (f.section || 'details') === key && f.width === 'half') ? 2 : 1,
  }));
}

/**
 * Fields with their `section` pointing at an existing section key (a field
 * from a stored layout gets the section it was placed in; anything else goes
 * to the first section).
 */
export function assignSections(
  fields: readonly FieldSpec[],
  layout: readonly LayoutSection[] | null | undefined,
  sections: readonly SectionDraft[],
): FieldSpec[] {
  const placed = new Map<string, string>();
  for (const section of layout ?? []) {
    for (const key of section.fields) {
      placed.set(key, section.key);
    }
  }
  const valid = new Set(sections.map((s) => s.key));
  const first = sections[0]?.key ?? 'details';
  return fields.map((field) => {
    const fromLayout = placed.get(field.key);
    const hint = field.section ? slugify(field.section) : null;
    const section =
      (fromLayout && valid.has(fromLayout) && fromLayout) ||
      (hint && valid.has(hint) && hint) ||
      first;
    return { ...field, section };
  });
}

/** The layout to publish: each section with its fields in field order. */
export function buildLayout(
  fields: readonly FieldSpec[],
  sections: readonly SectionDraft[],
): LayoutSection[] {
  const first = sections[0]?.key;
  return sections.map((section) => {
    const out: LayoutSection = {
      key: section.key,
      columns: section.columns,
      fields: fields
        .filter(
          (f) =>
            (f.section && sections.some((s) => s.key === f.section) ? f.section : first) ===
            section.key,
        )
        .map((f) => f.key),
    };
    return section.label ? { ...out, label: section.label } : out;
  });
}

/** Fields cleaned for publishing: empty optional bits dropped, type-specific keys only. */
export function cleanFields(fields: readonly FieldSpec[]): FieldSpec[] {
  return fields.map((field) => {
    const out: Record<string, unknown> = {
      key: field.key,
      label: field.label,
      type: field.type,
      required: !!field.required,
      width: field.width ?? 'full',
    };
    if (field.section) out['section'] = field.section;
    if (hasLabel(field.help)) out['help'] = field.help;
    if (hasLabel(field.placeholder)) out['placeholder'] = field.placeholder;
    if (OPTION_TYPES.includes(field.type)) out['options'] = field.options ?? [];
    if (field.min !== null && field.min !== undefined) out['min'] = field.min;
    if (field.max !== null && field.max !== undefined) out['max'] = field.max;
    if (field.type === 'entity_ref') out['entity_type'] = field.entity_type;
    if (field.type === 'calculated') out['formula'] = field.formula;
    if (field.visible_if?.field) out['visible_if'] = field.visible_if;
    if (
      field.default !== null &&
      field.default !== undefined &&
      field.default !== '' &&
      field.type !== 'calculated'
    ) {
      out['default'] = field.default;
    }
    return out as unknown as FieldSpec;
  });
}

/** Stable JSON for change detection (unsaved changes). */
export function fingerprint(value: unknown): string {
  return JSON.stringify(value ?? null);
}
