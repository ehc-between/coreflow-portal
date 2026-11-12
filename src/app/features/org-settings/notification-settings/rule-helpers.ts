import {
  BUILTIN_CATEGORIES,
  Channel,
  NotificationRule,
  NotificationRuleUpdate,
  RecipientSpec,
  RecipientType,
  VALUE_RECIPIENT_TYPES,
} from '../../../core/notifications/activity.models';

/** Recipient types without a value, in display order. */
export const SIMPLE_RECIPIENT_TYPES = ['owner', 'assignee', 'watchers', 'department_lead'] as const;
export type SimpleRecipientType = (typeof SIMPLE_RECIPIENT_TYPES)[number];

/** Recipient types that carry a value, in display order. */
export const VALUE_TYPES = ['role', 'department', 'user'] as const;
export type ValueRecipientType = (typeof VALUE_TYPES)[number];

/** Translates a key; returns null when it has no translation (so the caller can fall back). */
export type Lookup = (key: string, params?: Record<string, unknown>) => string | null;

/** Editable form state of one rule. */
export interface RuleDraft {
  readonly enabled: boolean;
  readonly simple: ReadonlySet<SimpleRecipientType>;
  readonly values: Readonly<Record<ValueRecipientType, readonly string[]>>;
  readonly channels: ReadonlySet<Channel>;
}

export function draftFromRule(rule: NotificationRule): RuleDraft {
  const simple = new Set<SimpleRecipientType>();
  const values: Record<ValueRecipientType, string[]> = { role: [], department: [], user: [] };
  for (const r of rule.recipients) {
    if (isValueType(r.type)) {
      if (r.value && !values[r.type].includes(r.value)) values[r.type].push(r.value);
    } else {
      simple.add(r.type as SimpleRecipientType);
    }
  }
  return { enabled: rule.enabled, simple, values, channels: new Set(rule.channels) };
}

/** Build the PUT body (recipients in a stable order: simple types first, then values). */
export function draftToUpdate(draft: RuleDraft): NotificationRuleUpdate {
  const recipients: RecipientSpec[] = SIMPLE_RECIPIENT_TYPES.filter((t) => draft.simple.has(t)).map(
    (type) => ({ type }),
  );
  for (const type of VALUE_TYPES) {
    for (const value of draft.values[type]) recipients.push({ type, value });
  }
  const channels = (['in_app', 'email', 'digest'] as const).filter((c) => draft.channels.has(c));
  return { recipients, channels, enabled: draft.enabled };
}

/** i18n key of a validation problem with the draft, or null when it can be saved. */
export function draftProblem(draft: RuleDraft): string | null {
  if (!draft.enabled) return null;
  const hasRecipients =
    draft.simple.size > 0 || VALUE_TYPES.some((t) => draft.values[t].length > 0);
  if (!hasRecipients) return 'activity.rules.editor.needRecipient';
  if (draft.channels.size === 0) return 'activity.rules.editor.needChannel';
  return null;
}

export function isValueType(type: RecipientType): type is ValueRecipientType {
  return VALUE_RECIPIENT_TYPES.includes(type);
}

/** Label for an event kind: `activity.kinds.<kind>` when translated, else the humanised kind. */
export function kindLabel(kind: string, lookup: Lookup): string {
  return lookup(`activity.kinds.${kind}`) ?? humanizeKind(kind);
}

/** `risk.owner_changed` -> `Risk: owner changed` (fallback for kinds without a label). */
export function humanizeKind(kind: string): string {
  const [entity, ...rest] = kind.split('.');
  const verb = rest.join(' ').replace(/_/g, ' ').trim();
  const subject = entity.replace(/_/g, ' ');
  const head = subject.charAt(0).toUpperCase() + subject.slice(1);
  return verb ? `${head}: ${verb}` : head;
}

/** Module label: F3's own `events` module, else the module's name, else its key. */
export function moduleLabel(module: string, lookup: Lookup): string {
  return lookup(`activity.modules.${module}`) ?? lookup(`modules.names.${module}`) ?? module;
}

/** Category label: built-ins from the `activity` scope, module categories by module name. */
export function categoryLabel(category: string, lookup: Lookup): string {
  if ((BUILTIN_CATEGORIES as readonly string[]).includes(category)) {
    return lookup(`activity.categories.${category}.label`) ?? category;
  }
  return lookup(`modules.names.${category}`) ?? category;
}

/** Group rules by module (sorted by module label, rules sorted by kind label). */
export interface RuleGroup {
  readonly module: string;
  readonly label: string;
  readonly rules: readonly NotificationRule[];
}

export function groupRules(rules: readonly NotificationRule[], lookup: Lookup): RuleGroup[] {
  const byModule = new Map<string, NotificationRule[]>();
  for (const rule of rules) {
    const list = byModule.get(rule.module) ?? [];
    list.push(rule);
    byModule.set(rule.module, list);
  }
  return [...byModule.entries()]
    .map(([module, list]) => ({
      module,
      label: moduleLabel(module, lookup),
      rules: [...list].sort((a, b) =>
        kindLabel(a.event_kind, lookup).localeCompare(kindLabel(b.event_kind, lookup)),
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface RuleFilter {
  readonly query: string;
  readonly module: string | null;
  readonly customOnly: boolean;
}

export function filterRules(
  rules: readonly NotificationRule[],
  filter: RuleFilter,
  lookup: Lookup,
): NotificationRule[] {
  const q = filter.query.trim().toLowerCase();
  return rules.filter((rule) => {
    if (filter.module && rule.module !== filter.module) return false;
    if (filter.customOnly && rule.is_default) return false;
    if (!q) return true;
    return (
      rule.event_kind.toLowerCase().includes(q) ||
      kindLabel(rule.event_kind, lookup).toLowerCase().includes(q)
    );
  });
}
