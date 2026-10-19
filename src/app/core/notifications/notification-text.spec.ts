import { notificationLink, notificationText } from './notification-text';
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

describe('notificationLink', () => {
  it('links to the deviation from params', () => {
    expect(notificationLink(make('notifications.actionAssigned'))).toEqual([
      '/deviations',
      'dev-1',
    ]);
  });
});
