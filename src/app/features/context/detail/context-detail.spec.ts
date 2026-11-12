import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { APP_CONFIG } from '../../../core/config/app-config';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { ContextApi } from '../data/context-api';
import { Policy } from '../data/context.models';
import { ContextDetail } from './context-detail';

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'p-1',
    org_id: 'org-1',
    code: 'POL-1',
    entity_type: 'policy',
    url: '/context/policies/p-1',
    owner: { id: 'u-1', name: 'Ada' },
    created_by: { id: 'u-1', name: 'Ada' },
    updated_by: null,
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    can_edit: true,
    status: 'draft',
    version_no: 1,
    submitted_by: null,
    submitted_at: null,
    approved_by: null,
    approved_at: null,
    review_interval_months: 12,
    next_review_at: null,
    last_reviewed_at: null,
    review_overdue: false,
    can_approve: true,
    kind: 'quality',
    title: 'Quality policy',
    statement: 'We put customers first.',
    frameworks: ['iso9001'],
    documents: [],
    ...overrides,
  };
}

function setup(policy: Policy, permissions: readonly string[]) {
  const api = {
    get: vi.fn(() => of(policy)),
    transition: vi.fn(() => of({ ...policy, status: 'in_review' as const })),
    delete: vi.fn(() => of(undefined)),
    communicate: vi.fn(),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  const prompts: string[] = [];
  TestBed.configureTestingModule({
    imports: [ContextDetail, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api', i18n: {} } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }),
        },
      },
      {
        provide: AskPanelService,
        useValue: { askAbout: (p: string) => prompts.push(p), openTutor: () => undefined },
      },
      {
        provide: AssigneeOptionsService,
        useValue: {
          options: signal({ users: [], roles: [], departments: [] }),
          ensureLoaded: () => undefined,
        },
      },
      { provide: ContextApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
    ],
  });
  const fixture = TestBed.createComponent(ContextDetail);
  fixture.componentRef.setInput('id', policy.id);
  fixture.componentRef.setInput('contextKind', 'policy');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, toasts, prompts };
}

describe('ContextDetail', () => {
  it('renders a draft policy and submits it for approval', () => {
    const { el, api, toasts, fixture } = setup(makePolicy(), [
      'context:read',
      'context:write',
      'context:approve',
    ]);
    expect(el.textContent).toContain('Quality policy');
    expect(el.textContent).toContain('POL-1');
    expect(el.querySelector('[data-testid="context-approve"]')).not.toBeNull();
    // Retire and delete need context:manage.
    expect(el.querySelector('[data-testid="context-retire"]')).toBeNull();
    expect(el.querySelector('[data-testid="context-communicate"]')).toBeNull();

    el.querySelector<HTMLElement>('[data-testid="context-submit"] button')!.click();
    fixture.detectChanges();
    expect(api.transition).toHaveBeenCalledWith('org-1', 'policy', 'p-1', 'submit', {});
    expect(toasts.success).toHaveBeenCalledWith('context.notices.submit', { code: 'POL-1' });
  });

  it('offers review, retire and communicate on an approved policy for a manager', () => {
    const { el } = setup(makePolicy({ status: 'approved', can_approve: false }), [
      'context:read',
      'context:write',
      'context:approve',
      'context:manage',
    ]);
    expect(el.querySelector('[data-testid="context-review"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="context-retire"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="context-communicate"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="context-submit"]')).toBeNull();
  });

  it('is read-only for a reader', () => {
    const { el } = setup(makePolicy({ can_edit: false, can_approve: false }), ['context:read']);
    expect(el.querySelector('[data-testid="context-edit"]')).toBeNull();
    expect(el.querySelector('[data-testid="context-submit"]')).toBeNull();
    expect(el.querySelector('[data-testid="context-approve"]')).toBeNull();
  });
});
