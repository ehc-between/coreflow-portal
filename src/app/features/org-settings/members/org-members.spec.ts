import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgMember, OrgRole } from '../../../core/org/org.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OrgMembers } from './org-members';

const BASE = 'http://test/api';
const ORG = 'org-1';

const ROLES: OrgRole[] = [
  { key: 'admin', name: 'Administrator', permissions: ['org:manage'], grantable: false },
  { key: 'auditor', name: 'Auditor', permissions: ['audit:read', 'risk:read'], grantable: true },
  { key: 'member', name: 'Member', permissions: ['documents:read'], grantable: true },
];

const MEMBERS: OrgMember[] = [
  { user_id: 'me', email: 'me@x.no', full_name: 'Me', is_active: true, roles: ['member'] },
  {
    user_id: 'u-1',
    email: 'ada@x.no',
    full_name: 'Ada',
    is_active: true,
    roles: ['member'],
    departments: [{ id: 'd-1', name: 'IT' }],
    person: { id: 'p-1', code: 'EMP-0001', url: '/people/employees/p-1' },
    mfa_enabled: false,
  },
  { user_id: 'u-2', email: 'bo@x.no', full_name: 'Bo', is_active: false, roles: ['admin'] },
  {
    user_id: 'ops',
    email: 'super@x.no',
    full_name: 'Super',
    is_active: true,
    roles: ['admin'],
    is_platform_operator: true,
  },
];

/** Protected API surface exercised by the tests. */
interface MembersInternals {
  confirmRemove(): void;
  askRemove(member: OrgMember): void;
  pendingRemoval(): OrgMember | null;
  errorKey(): string | null;
  showRoleHint(): boolean;
  members(): readonly OrgMember[];
  editing(): OrgMember | null;
  openEditor(member: OrgMember): void;
  saveRoles(keys: readonly string[]): void;
  patchFilter(patch: Record<string, unknown>): void;
}

function setup(members: OrgMember[] = MEMBERS): {
  fixture: ComponentFixture<OrgMembers>;
  http: HttpTestingController;
  cmp: MembersInternals;
} {
  TestBed.configureTestingModule({
    imports: [OrgMembers, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      ...provideFakeGuidance().providers,
      provideRouter([]),
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
  http
    .expectOne(`${BASE}/v1/orgs/${ORG}/departments`)
    .flush([{ id: 'd-1', name: 'IT', member_count: 1 }]);
  http.expectOne(`${BASE}/v1/orgs/${ORG}/members`).flush(members);
  fixture.detectChanges();
  return { fixture, http, cmp: fixture.componentInstance as unknown as MembersInternals };
}

const row = (fixture: ComponentFixture<OrgMembers>, userId: string): HTMLElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-user-id="${userId}"]`);

describe('OrgMembers', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('hides platform operators until asked, and links members to the People register', () => {
    const { fixture, cmp } = setup();
    expect(row(fixture, 'ops')).toBeNull();
    const ada = row(fixture, 'u-1')!;
    expect(ada.querySelector('[data-testid="member-person-link"]')?.getAttribute('href')).toBe(
      '/people/employees/p-1',
    );
    expect(ada.textContent).toContain('IT');
    expect(ada.textContent).toContain('settings.members.mfaOff');

    cmp.patchFilter({ showOperators: true });
    fixture.detectChanges();
    expect(row(fixture, 'ops')?.textContent).toContain('settings.members.operator');
  });

  it('U26: flags staff without an employee card (never operators or unknown)', () => {
    const { fixture } = setup([
      ...MEMBERS,
      {
        user_id: 'u-3',
        email: 'emma@x.no',
        full_name: 'Emma',
        is_active: true,
        roles: ['member'],
        person: null,
      },
      { ...MEMBERS[3], user_id: 'ops-2', person: null },
    ]);
    expect(row(fixture, 'u-3')?.querySelector('[data-testid="member-no-card"]')).not.toBeNull();
    expect(row(fixture, 'u-1')?.querySelector('[data-testid="member-no-card"]')).toBeNull();
    expect(row(fixture, 'me')?.querySelector('[data-testid="member-no-card"]')).toBeNull();
    const summary = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="members-without-card"]',
    );
    expect(summary?.textContent).toContain('settings.members.withoutCardOne');
    expect(summary?.getAttribute('href')).toBe('/people/employees');
  });

  it('filters by search text, department and status', () => {
    const { fixture, cmp } = setup();
    cmp.patchFilter({ query: 'ada' });
    fixture.detectChanges();
    expect(row(fixture, 'u-1')).not.toBeNull();
    expect(row(fixture, 'u-2')).toBeNull();
    cmp.patchFilter({ query: '', status: 'inactive' });
    fixture.detectChanges();
    expect(row(fixture, 'u-2')).not.toBeNull();
    expect(row(fixture, 'u-1')).toBeNull();
    cmp.patchFilter({ status: 'all', department: 'd-1' });
    fixture.detectChanges();
    expect(row(fixture, 'u-1')).not.toBeNull();
    expect(row(fixture, 'me')).toBeNull();
  });

  it('does not allow editing the signed-in user or a member holding a non-grantable role', () => {
    const { fixture } = setup();
    expect(row(fixture, 'me')!.querySelector('[data-testid="member-edit-access"]')).toBeNull();
    expect(row(fixture, 'me')!.textContent).toContain('settings.members.selfHint');
    const admin = row(fixture, 'u-2')!;
    expect(admin.querySelector('[data-testid="member-edit-access"]')).toBeNull();
    expect(admin.textContent).toContain('settings.members.inactive');
  });

  it('changes access in a dialog, saving several roles at once', () => {
    const { fixture, http, cmp } = setup();
    row(fixture, 'u-1')!
      .querySelector<HTMLElement>('[data-testid="member-edit-access"] button')!
      .click();
    fixture.detectChanges();
    expect(cmp.editing()?.user_id).toBe('u-1');
    // Nothing is saved until the explicit save.
    http.expectNone(`${BASE}/v1/orgs/${ORG}/members/u-1`);

    const root = document.body;
    root.querySelector<HTMLInputElement>('[data-testid="role-option-auditor"] input')!.click();
    fixture.detectChanges();
    const summary = root.querySelector('[data-testid="role-change-summary"]')!;
    expect(summary.textContent).toContain('settings.members.editor.gains');
    root.querySelector<HTMLElement>('[data-testid="role-save"] button')!.click();
    fixture.detectChanges();

    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/members/u-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role_keys: ['auditor', 'member'] });
    req.flush({ ...MEMBERS[1], roles: ['auditor', 'member'] });

    expect(cmp.members().find((m) => m.user_id === 'u-1')!.roles).toEqual(['auditor', 'member']);
    expect(cmp.showRoleHint()).toBe(true);
    expect(cmp.editing()).toBeNull();
  });

  it('maps a 409 on role change to the last-manager message', () => {
    const { fixture, http, cmp } = setup();
    const notifications = TestBed.inject(NotificationService);
    cmp.openEditor(MEMBERS[1]);
    fixture.detectChanges();
    cmp.saveRoles(['auditor']);
    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/members/u-1`)
      .flush(
        { detail: 'Cannot remove or demote the last organization manager' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(cmp.errorKey()).toBe('settings.errors.lastManager');
    expect(cmp.members().find((m) => m.user_id === 'u-1')!.roles).toEqual(['member']);
    expect(notifications.notifications().at(-1)?.message).toBe('settings.errors.lastManager');
  });

  it('refuses roles the caller cannot grant', () => {
    const { http, cmp } = setup();
    cmp.openEditor(MEMBERS[1]);
    cmp.saveRoles(['admin']);
    http.expectNone(`${BASE}/v1/orgs/${ORG}/members/u-1`);
    expect(cmp.errorKey()).toBe('settings.errors.escalation');
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

    expect(cmp.members().map((m) => m.user_id)).toEqual(['u-2', 'me', 'ops']);
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
      .flush(
        { detail: 'You cannot modify a member with permissions you do not hold' },
        { status: 403, statusText: 'Forbidden' },
      );
    expect(cmp.errorKey()).toBe('settings.errors.escalation');
    expect(cmp.members()).toHaveLength(4);
  });
});
