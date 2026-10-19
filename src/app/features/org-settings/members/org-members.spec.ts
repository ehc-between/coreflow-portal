import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgMember, OrgRole } from '../../../core/org/org.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OrgMembers } from './org-members';

const BASE = 'http://test/api';
const ORG = 'org-1';

const ROLES: OrgRole[] = [
  { key: 'admin', name: 'Administrator', permissions: ['org:manage'], grantable: false },
  { key: 'auditor', name: 'Auditor', permissions: [], grantable: true },
  { key: 'member', name: 'Member', permissions: [], grantable: true },
];

const MEMBERS: OrgMember[] = [
  { user_id: 'me', email: 'me@x.no', full_name: 'Me', is_active: true, roles: ['member'] },
  { user_id: 'u-1', email: 'ada@x.no', full_name: 'Ada', is_active: true, roles: ['member'] },
  { user_id: 'u-2', email: 'bo@x.no', full_name: 'Bo', is_active: false, roles: ['admin'] },
];

/** Protected API surface exercised by the tests. */
interface MembersInternals {
  confirmRemove(): void;
  askRemove(member: OrgMember): void;
  pendingRemoval(): OrgMember | null;
  errorKey(): string | null;
  showRoleHint(): boolean;
  members(): readonly OrgMember[];
}

function setup(): {
  fixture: ComponentFixture<OrgMembers>;
  http: HttpTestingController;
  cmp: MembersInternals;
} {
  TestBed.configureTestingModule({
    imports: [OrgMembers, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: AuthService, useValue: { user: signal({ id: 'me' }).asReadonly() } },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal(ORG).asReadonly(), currentOrg: signal(null).asReadonly() },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrgMembers);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(`${BASE}/v1/orgs/${ORG}/roles`).flush(ROLES);
  http.expectOne(`${BASE}/v1/orgs/${ORG}/members`).flush(MEMBERS);
  fixture.detectChanges();
  return { fixture, http, cmp: fixture.componentInstance as unknown as MembersInternals };
}

const row = (fixture: ComponentFixture<OrgMembers>, userId: string): HTMLElement =>
  (fixture.nativeElement as HTMLElement).querySelector(`tr[data-user-id="${userId}"]`)!;

describe('OrgMembers', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('offers only grantable roles in the role select', () => {
    const { fixture } = setup();
    const select = row(fixture, 'u-1').querySelector('select')!;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['auditor', 'member']);
    expect(select.value).toBe('member');
  });

  it('does not allow editing the signed-in user', () => {
    const { fixture } = setup();
    const self = row(fixture, 'me');
    expect(self.querySelector('select')).toBeNull();
    expect(self.querySelector('button')!.disabled).toBe(true);
  });

  it('does not allow editing a member holding a non-grantable role', () => {
    const { fixture } = setup();
    const admin = row(fixture, 'u-2');
    expect(admin.querySelector('select')).toBeNull();
    expect(admin.querySelector('button')!.disabled).toBe(true);
    expect(admin.textContent).toContain('settings.members.inactive');
  });

  it('changes a role and shows the token-refresh hint', () => {
    const { fixture, http, cmp } = setup();
    const select = row(fixture, 'u-1').querySelector('select')!;
    select.value = 'auditor';
    select.dispatchEvent(new Event('change'));

    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/members/u-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role_key: 'auditor' });
    req.flush({ ...MEMBERS[1], roles: ['auditor'] });

    expect(cmp.members().find((m) => m.user_id === 'u-1')!.roles).toEqual(['auditor']);
    expect(cmp.showRoleHint()).toBe(true);
  });

  it('maps a 409 on role change to the last-manager message and reverts the select', () => {
    const { fixture, http, cmp } = setup();
    const notifications = TestBed.inject(NotificationService);
    const select = row(fixture, 'u-1').querySelector('select')!;
    select.value = 'auditor';
    select.dispatchEvent(new Event('change'));

    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/members/u-1`)
      .flush(
        { detail: 'Cannot remove or demote the last organization manager' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(cmp.errorKey()).toBe('settings.errors.lastManager');
    expect(select.value).toBe('member');
    expect(notifications.notifications().at(-1)?.message).toBe('settings.errors.lastManager');
  });

  it('removes a member only after confirmation', () => {
    const { http, cmp } = setup();
    cmp.askRemove(MEMBERS[1]);
    expect(cmp.pendingRemoval()?.user_id).toBe('u-1');
    http.expectNone(`${BASE}/v1/orgs/${ORG}/members/u-1`);

    cmp.confirmRemove();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/members/u-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(cmp.members().map((m) => m.user_id)).toEqual(['u-2', 'me']);
    expect(cmp.pendingRemoval()).toBeNull();
  });

  it('refuses to start removing the signed-in user', () => {
    const { cmp } = setup();
    cmp.askRemove(MEMBERS[0]);
    expect(cmp.pendingRemoval()).toBeNull();
  });

  it('maps a 403 on removal to the escalation message', () => {
    const { http, cmp } = setup();
    cmp.askRemove(MEMBERS[1]);
    cmp.confirmRemove();
    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/members/u-1`)
      .flush({ detail: 'nope' }, { status: 403, statusText: 'Forbidden' });
    expect(cmp.errorKey()).toBe('settings.errors.escalation');
    expect(cmp.members()).toHaveLength(3);
  });
});
