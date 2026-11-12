import { NotificationRule } from '../../../core/notifications/activity.models';
import {
  Lookup,
  categoryLabel,
  draftFromRule,
  draftProblem,
  draftToUpdate,
  filterRules,
  groupRules,
  humanizeKind,
  kindLabel,
  moduleLabel,
} from './rule-helpers';

const dict: Record<string, string> = {
  'activity.kinds.reminder.due_soon': 'Due date approaching',
  'activity.kinds.reminder.overdue': 'Due date passed',
  'activity.modules.events': 'Reminders and platform',
  'modules.names.risk': 'Risk',
  'activity.categories.reminders.label': 'Reminders',
};
const lookup: Lookup = (key) => dict[key] ?? null;

function makeRule(event_kind: string, extra: Partial<NotificationRule> = {}): NotificationRule {
  return {
    event_kind,
    module: 'events',
    category: 'reminders',
    title_key: 'notifications.x',
    notify: true,
    recipients: [{ type: 'owner' }, { type: 'assignee' }],
    channels: ['in_app', 'digest'],
    enabled: true,
    is_default: true,
    ...extra,
  };
}

describe('rule drafts', () => {
  it('round-trips a rule into a PUT body in a stable order', () => {
    const r = makeRule('reminder.due_soon', {
      recipients: [
        { type: 'user', value: 'u-1' },
        { type: 'watchers' },
        { type: 'role', value: 'auditor' },
        { type: 'owner' },
        { type: 'role', value: 'auditor' },
      ],
      channels: ['digest', 'in_app'],
    });
    expect(draftToUpdate(draftFromRule(r))).toEqual({
      recipients: [
        { type: 'owner' },
        { type: 'watchers' },
        { type: 'role', value: 'auditor' },
        { type: 'user', value: 'u-1' },
      ],
      channels: ['in_app', 'digest'],
      enabled: true,
    });
  });

  it('requires recipients and channels only while enabled', () => {
    const empty = draftFromRule(makeRule('a.b', { recipients: [], channels: [] }));
    expect(draftProblem(empty)).toBe('activity.rules.editor.needRecipient');
    expect(draftProblem({ ...empty, simple: new Set(['owner']) })).toBe(
      'activity.rules.editor.needChannel',
    );
    expect(draftProblem({ ...empty, enabled: false })).toBeNull();
  });
});

describe('rule labels', () => {
  it('labels kinds, modules and categories with fallbacks', () => {
    expect(kindLabel('reminder.due_soon', lookup)).toBe('Due date approaching');
    expect(kindLabel('risk.owner_changed', lookup)).toBe('Risk: owner changed');
    expect(humanizeKind('audit_finding.raised')).toBe('Audit finding: raised');
    expect(moduleLabel('events', lookup)).toBe('Reminders and platform');
    expect(moduleLabel('risk', lookup)).toBe('Risk');
    expect(moduleLabel('hse', lookup)).toBe('hse');
    expect(categoryLabel('reminders', lookup)).toBe('Reminders');
    expect(categoryLabel('risk', lookup)).toBe('Risk');
  });
});

describe('rule grouping and filtering', () => {
  const rules = [
    makeRule('reminder.overdue'),
    makeRule('risk.created', { module: 'risk', is_default: false }),
    makeRule('reminder.due_soon'),
  ];

  it('groups by module label and sorts kinds by label', () => {
    const groups = groupRules(rules, lookup);
    expect(groups.map((g) => g.label)).toEqual(['Reminders and platform', 'Risk']);
    expect(groups[0].rules.map((r) => r.event_kind)).toEqual([
      'reminder.due_soon',
      'reminder.overdue',
    ]);
  });

  it('filters by text, module and customized only', () => {
    const none = { query: '', module: null, customOnly: false };
    expect(
      filterRules(rules, { ...none, query: 'passed' }, lookup).map((r) => r.event_kind),
    ).toEqual(['reminder.overdue']);
    expect(filterRules(rules, { ...none, module: 'risk' }, lookup)).toHaveLength(1);
    expect(filterRules(rules, { ...none, customOnly: true }, lookup)[0].event_kind).toBe(
      'risk.created',
    );
  });
});
