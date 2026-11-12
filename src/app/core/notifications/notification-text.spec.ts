import {
  NOTIFICATION_FALLBACK_KEY,
  notificationLink,
  notificationText,
  parseScopedKey,
  scopeAlias,
  scopesFor,
} from './notification-text';
import { UserNotification } from './user-notification.models';

function make(title_key: string, params: Record<string, unknown> = {}): UserNotification {
  return {
    id: 'n-1',
    org_id: 'org-1',
    kind: 'deviation_assigned',
    entity_type: 'deviation_action',
    entity_id: 'act-1',
    title_key,
    params: { deviation_id: 'dev-1', ...params },
    created_at: '2026-10-19T10:00:00Z',
    read_at: null,
    is_read: false,
  };
}

describe('notificationText', () => {
  it('uses the backend key for assignments with an actor', () => {
    expect(
      notificationText(make('notifications.deviationAssigned', { actor_name: 'Ada' })).key,
    ).toBe('notifications.deviationAssigned');
  });

  it('switches to the no-actor wording when the actor is missing', () => {
    expect(notificationText(make('notifications.actionAssigned', { actor_name: null })).key).toBe(
      'notifications.actionAssignedNoActor',
    );
  });

  it('words due-soon reminders for today, tomorrow and later', () => {
    expect(notificationText(make('notifications.deviationDueSoon', { days: 0 })).key).toBe(
      'notifications.deviationDueSoonToday',
    );
    expect(notificationText(make('notifications.actionDueSoon', { days: 1 })).key).toBe(
      'notifications.actionDueSoonTomorrow',
    );
    expect(notificationText(make('notifications.actionDueSoon', { days: 3 })).key).toBe(
      'notifications.actionDueSoon',
    );
  });

  it('words a single overdue day separately', () => {
    expect(notificationText(make('notifications.deviationOverdue', { days: 1 })).key).toBe(
      'notifications.deviationOverdueOne',
    );
    expect(notificationText(make('notifications.actionOverdue', { days: 4 })).key).toBe(
      'notifications.actionOverdue',
    );
  });

  it('falls back for unknown keys and passes params through', () => {
    const text = notificationText(make('notifications.somethingNew', { code: 'D-1' }));
    expect(text.key).toBe('notifications.fallback');
    expect(text.params['code']).toBe('D-1');
  });
});

describe('notificationText description fallback', () => {
  it('uses the deviation title when an action has no description', () => {
    const text = notificationText(
      make('notifications.actionDueSoon', { days: 3, description: '', deviation_title: 'Spill' }),
    );
    expect(text.params['description']).toBe('Spill');
  });

  it('keeps a non-empty description', () => {
    const text = notificationText(
      make('notifications.actionAssigned', {
        description: 'Recalibrate',
        deviation_title: 'Spill',
      }),
    );
    expect(text.params['description']).toBe('Recalibrate');
  });
});

describe('notificationLink', () => {
  it('links to the deviation from params', () => {
    expect(notificationLink(make('notifications.actionAssigned'))).toEqual([
      '/deviations',
      'dev-1',
    ]);
  });
});

describe('document notifications', () => {
  function docNotification(title_key: string, params: Record<string, unknown> = {}) {
    return {
      ...make(title_key),
      kind: 'document_submitted' as const,
      entity_type: 'document' as const,
      entity_id: 'doc-9',
      params: { document_id: 'doc-1', doc_code: 'QM-1', title: 'Quality manual', ...params },
    };
  }

  it('words submitted / changes-requested around the actor', () => {
    expect(
      notificationText(docNotification('notifications.documentSubmitted', { actor_name: 'Ada' }))
        .key,
    ).toBe('notifications.documentSubmitted');
    expect(
      notificationText(
        docNotification('notifications.documentChangesRequested', { actor_name: null }),
      ).key,
    ).toBe('notifications.documentChangesRequestedNoActor');
  });

  it('words review reminders like other due-soon / overdue reminders', () => {
    const key = (k: string, days: number) => notificationText(docNotification(k, { days })).key;
    expect(key('notifications.documentReviewDue', 0)).toBe('notifications.documentReviewDueToday');
    expect(key('notifications.documentReviewDue', 1)).toBe(
      'notifications.documentReviewDueTomorrow',
    );
    expect(key('notifications.documentReviewDue', 14)).toBe('notifications.documentReviewDue');
    expect(key('notifications.documentReviewOverdue', 1)).toBe(
      'notifications.documentReviewOverdueOne',
    );
    expect(key('notifications.documentReviewOverdue', 5)).toBe(
      'notifications.documentReviewOverdue',
    );
  });

  it('links to the document from params', () => {
    expect(notificationLink(docNotification('notifications.documentSubmitted'))).toEqual([
      '/documents',
      'doc-1',
    ]);
  });

  it('falls back to the document entity when params carry no id', () => {
    const notification = { ...docNotification('notifications.documentSubmitted'), params: {} };
    expect(notificationLink(notification)).toEqual(['/documents', 'doc-9']);
  });
});

describe('document notifications without a code', () => {
  const kinds: [string, Record<string, unknown>, string][] = [
    [
      'notifications.documentSubmitted',
      { actor_name: 'Ada' },
      'notifications.documentSubmittedNoCode',
    ],
    [
      'notifications.documentChangesRequested',
      { actor_name: null },
      'notifications.documentChangesRequestedNoActorNoCode',
    ],
    ['notifications.documentReviewDue', { days: 0 }, 'notifications.documentReviewDueTodayNoCode'],
    [
      'notifications.documentReviewOverdue',
      { days: 3 },
      'notifications.documentReviewOverdueNoCode',
    ],
  ];

  for (const [key, params, expected] of kinds) {
    it(`uses the NoCode wording for ${key} when doc_code is null`, () => {
      const notification = {
        ...make(key),
        entity_type: 'document' as const,
        params: { document_id: 'doc-1', title: 'Quality manual', doc_code: null, ...params },
      };
      expect(notificationText(notification).key).toBe(expected);
    });
  }

  it('keeps the coded wording when doc_code is present', () => {
    const notification = {
      ...make('notifications.documentReviewOverdue'),
      params: { document_id: 'doc-1', title: 'Quality manual', doc_code: 'QM-1', days: 3 },
    };
    expect(notificationText(notification).key).toBe('notifications.documentReviewOverdue');
  });
});

describe('notification due dates', () => {
  const review = (lang?: string) =>
    notificationText(
      {
        ...make('notifications.documentReviewDue'),
        params: {
          document_id: 'doc-1',
          doc_code: 'QM-1',
          title: 'T',
          days: 5,
          due_date: '2026-11-03',
        },
      },
      lang,
    ).params['due_date'];

  it('formats due_date for the UI language without shifting the day', () => {
    expect(review('en')).toBe(
      new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2026, 10, 3)),
      ),
    );
    expect(review('nb')).toContain('2026');
    expect(review('nb')).not.toBe('2026-11-03');
  });

  it('leaves due_date untouched without a language', () => {
    expect(review()).toBe('2026-11-03');
  });
});

describe('platform event notifications', () => {
  const reminder = (title_key: string, params: Record<string, unknown>): UserNotification => ({
    ...make(title_key),
    kind: 'reminder.due_soon',
    entity_type: 'task',
    entity_id: 'task-1',
    category: 'reminders',
    params: {
      title: 'Review supplier list',
      code: 'T-12',
      days: 3,
      entity_label_key: 'modules.entities.task',
      url: null,
      ...params,
    },
  });
  const dict: Record<string, string> = {
    'modules.entities.task': 'Task',
    'notifications.reminderEntityFallback': 'Item',
    'risk.notifications.treatmentAssigned': 'Assigned {{title}}',
  };
  const options = {
    has: (key: string) => key in dict,
    translate: (key: string) => dict[key] ?? key,
  };

  it('words reminders by days and adds the entity label', () => {
    const soon = notificationText(
      reminder('notifications.reminderDueSoon', {}),
      undefined,
      options,
    );
    expect(soon.key).toBe('notifications.reminderDueSoon');
    expect(soon.params['entity']).toBe('Task');
    expect(
      notificationText(reminder('notifications.reminderDueSoon', { days: 0 }), undefined, options)
        .key,
    ).toBe('notifications.reminderDueSoonToday');
    expect(
      notificationText(reminder('notifications.reminderOverdue', { days: 1 }), undefined, options)
        .key,
    ).toBe('notifications.reminderOverdueOne');
    expect(
      notificationText(reminder('notifications.reminderEscalated', { days: 6 }), undefined, options)
        .key,
    ).toBe('notifications.reminderEscalated');
  });

  it('uses the no-code variant and the fallback entity label', () => {
    const text = notificationText(
      reminder('notifications.reminderEscalated', {
        code: '',
        days: 1,
        entity_label_key: 'modules.entities.unknown',
      }),
      undefined,
      options,
    );
    expect(text.key).toBe('notifications.reminderEscalatedOneNoCode');
    expect(text.params['entity']).toBe('Item');
  });

  it('resolves scoped title keys once the scope is loaded, else falls back', () => {
    const scoped = { ...make('risk:notifications.treatmentAssigned'), params: { title: 'R' } };
    expect(notificationText(scoped, undefined, options).key).toBe(
      'risk.notifications.treatmentAssigned',
    );
    expect(notificationText(scoped).key).toBe(NOTIFICATION_FALLBACK_KEY);
    expect(
      notificationText({ ...scoped, title_key: 'risk:notifications.other' }, undefined, options)
        .key,
    ).toBe(NOTIFICATION_FALLBACK_KEY);
  });

  it('links tasks, in-app urls and unknown entity types', () => {
    expect(notificationLink(reminder('notifications.reminderDueSoon', {}))).toEqual([
      '/tasks',
      'task-1',
    ]);
    const risk = {
      ...reminder('notifications.reminderDueSoon', { url: '/risk/risks/r-1' }),
      entity_type: 'risk',
    };
    expect(notificationLink(risk)).toEqual(['/risk/risks/r-1']);
    const external = { ...risk, params: { url: '//evil.example' } };
    expect(notificationLink(external)).toBeNull();
  });

  it('lists the scopes notifications need', () => {
    const items = [
      make('risk:notifications.a'),
      { ...make('notifications.reminderDueSoon'), params: { entity_label_key: 'ai-governance:x' } },
      make('notifications.deviationAssigned'),
    ];
    expect(scopesFor(items)).toEqual(['risk', 'ai-governance']);
  });

  it('maps scopes to Transloco aliases', () => {
    expect(scopeAlias('activity')).toBe('activity');
    expect(scopeAlias('ai-governance')).toBe('aiGovernance');
    expect(scopeAlias('management-review')).toBe('managementReview');
    expect(parseScopedKey('notifications.x')).toBeNull();
    expect(parseScopedKey('risk:a.b')).toEqual({ scope: 'risk', path: 'a.b' });
  });
});
