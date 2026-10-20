import { DeviationEvent } from '../../core/deviations/deviation.models';
import { describeEvent } from './deviation-events';

/** Echo translator: `key{json params}` so assertions see both. */
const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}${JSON.stringify(params)}` : key;

function ev(
  kind: string,
  summary: string,
  detail?: Record<string, unknown> | null,
): DeviationEvent {
  return {
    id: 'e1',
    deviation_id: 'd1',
    kind,
    summary,
    detail,
    created_at: '2026-10-20T08:00:00',
  };
}

describe('describeEvent', () => {
  it('localises a status change with its reason', () => {
    const text = describeEvent(
      ev('status_changed', 'Status changed from open to investigating', {
        from: 'open',
        to: 'investigating',
        reason: 'Needs analysis',
      }),
      t,
    );
    expect(text.summary).toBe(
      'deviations.events.statusChanged{"from":"deviations.status.open","to":"deviations.status.investigating"}',
    );
    expect(text.detail).toBe('deviations.events.reason{"reason":"Needs analysis"}');
  });

  it('treats a close like a status change', () => {
    const text = describeEvent(ev('closed', 'x', { from: 'verification', to: 'closed' }), t);
    expect(text.summary).toContain('deviations.status.closed');
  });

  it('lists edited fields by their localised names', () => {
    const text = describeEvent(
      ev('updated', 'Updated title, root_cause', { fields: ['title', 'root_cause'] }),
      t,
    );
    expect(text.summary).toBe(
      'deviations.events.updatedFields{"fields":"deviations.events.fields.title, deviations.events.fields.root_cause"}',
    );
  });

  it('recognises a no-op save', () => {
    expect(describeEvent(ev('updated', 'No changes'), t).summary).toBe(
      'deviations.events.noChanges',
    );
  });

  it('names the action kind from detail, or from the English summary as a fallback', () => {
    expect(
      describeEvent(ev('action_added', 'Corrective action added', { kind: 'corrective' }), t)
        .summary,
    ).toBe('deviations.events.actionAdded{"action":"deviations.actions.kindNoun.corrective"}');
    expect(
      describeEvent(ev('action_updated', 'Preventive action updated (done)', { status: 'done' }), t)
        .summary,
    ).toBe(
      'deviations.events.actionStatus{"action":"deviations.actions.kindNoun.preventive","status":"deviations.actions.status.done"}',
    );
    expect(
      describeEvent(ev('action_updated', 'Containment action removed', { action_id: 'a1' }), t)
        .summary,
    ).toBe('deviations.events.actionRemoved{"action":"deviations.actions.kindNoun.containment"}');
  });

  it('resolves the access subject by name when known', () => {
    const granted = describeEvent(
      ev('access_changed', 'Granted edit to user', {
        subject_type: 'user',
        subject_id: 'u1',
        level: 'edit',
      }),
      t,
      (type, id) => (type === 'user' && id === 'u1' ? 'Kari' : undefined),
    );
    expect(granted.summary).toBe(
      'deviations.events.accessGranted{"subject":"Kari","level":"deviations.access.edit"}',
    );
    const revoked = describeEvent(
      ev('access_changed', 'Revoked access from department', {
        subject_type: 'department',
        subject_id: 'x',
      }),
      t,
    );
    expect(revoked.summary).toBe(
      'deviations.events.accessRevoked{"subject":"deviations.events.subject.department"}',
    );
  });

  it('falls back to the backend summary for unknown kinds', () => {
    expect(describeEvent(ev('comment', 'Some backend text'), t).summary).toBe('Some backend text');
  });
});
