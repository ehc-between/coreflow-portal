import { HttpErrorResponse } from '@angular/common/http';
import { memberErrorKey } from './member-errors';

const err = (status: number, detail?: string) =>
  new HttpErrorResponse({ status, error: detail === undefined ? null : { detail } });

describe('memberErrorKey', () => {
  it('maps invite conflicts to pending vs already-member', () => {
    expect(
      memberErrorKey(err(409, 'A pending invitation already exists for this email'), 'invite'),
    ).toBe('settings.errors.invitePending');
    expect(
      memberErrorKey(err(409, 'This user is already a member of the organization'), 'invite'),
    ).toBe('settings.errors.alreadyMember');
  });

  it('maps invite 400/403', () => {
    expect(memberErrorKey(err(400, "Unknown role 'x'"), 'invite')).toBe(
      'settings.errors.unknownRole',
    );
    expect(
      memberErrorKey(
        err(403, 'You cannot grant a role with permissions you do not hold'),
        'invite',
      ),
    ).toBe('settings.errors.escalation');
    expect(memberErrorKey(err(403, 'Insufficient permissions'), 'invite')).toBe(
      'settings.errors.forbidden',
    );
    expect(memberErrorKey(err(403), 'invite')).toBe('settings.errors.forbidden');
  });

  it('maps role-change errors', () => {
    expect(memberErrorKey(err(400, 'You cannot change your own role'), 'changeRole')).toBe(
      'settings.errors.selfChange',
    );
    expect(memberErrorKey(err(400, "Unknown role 'x'"), 'changeRole')).toBe(
      'settings.errors.unknownRole',
    );
    expect(
      memberErrorKey(
        err(403, 'You cannot modify a member with permissions you do not hold'),
        'changeRole',
      ),
    ).toBe('settings.errors.escalation');
    expect(memberErrorKey(err(403, 'Insufficient permissions'), 'changeRole')).toBe(
      'settings.errors.forbidden',
    );
    expect(memberErrorKey(err(404), 'changeRole')).toBe('settings.errors.notMember');
    expect(memberErrorKey(err(409), 'changeRole')).toBe('settings.errors.lastManager');
  });

  it('maps remove errors', () => {
    expect(
      memberErrorKey(
        err(403, 'You cannot modify a member with permissions you do not hold'),
        'remove',
      ),
    ).toBe('settings.errors.escalation');
    expect(memberErrorKey(err(400), 'remove')).toBe('errors.generic');
    expect(memberErrorKey(err(404), 'remove')).toBe('settings.errors.notMember');
    expect(memberErrorKey(err(409), 'remove')).toBe('settings.errors.lastManager');
  });

  it('maps revoke and deactivate errors', () => {
    expect(memberErrorKey(err(404), 'revoke')).toBe('settings.errors.invitationNotFound');
    expect(memberErrorKey(err(400), 'deactivate')).toBe('settings.errors.selfDeactivate');
    expect(memberErrorKey(err(404), 'reactivate')).toBe('settings.errors.userNotFound');
  });

  it('falls back to neutral messages', () => {
    expect(memberErrorKey(err(0), 'remove')).toBe('errors.network');
    expect(memberErrorKey(err(503), 'invite')).toBe('errors.server');
    expect(memberErrorKey(err(422), 'invite')).toBe('errors.generic');
    expect(memberErrorKey(new Error('boom'), 'invite')).toBe('errors.generic');
  });
});
