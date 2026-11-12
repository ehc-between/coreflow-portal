import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  Component,
  EnvironmentProviders,
  Provider,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { Mock, vi } from 'vitest';
import { AttachmentsApi } from '../../../core/attachments/attachments-api';
import { AuthService } from '../../../core/auth/auth.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { AskPanelService } from '../../ask/ask-panel.service';
import { newQuestion } from './answer-model';
import {
  Finding,
  Inspection,
  InspectionDetail,
  Question,
  Template,
  TemplateDetail,
} from './inspection.models';
import { InspectionsApi } from './inspections-api';

/** Test fixtures for the inspections feature (specs only). */

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return { ...newQuestion('yes_no'), id: 'q1', text: 'Exits clear?', ...overrides };
}

export const QUESTIONS: readonly Question[] = [
  makeQuestion({ id: 'q1', section: 'Exits', text: 'Exits clear?' }),
  makeQuestion({
    id: 'q2',
    section: 'Exits',
    text: 'Signs lit?',
    type: 'score',
    scale_min: 0,
    scale_max: 4,
    pass_score: 2,
  }),
  makeQuestion({
    id: 'q3',
    section: 'Readings',
    text: 'Temperature',
    type: 'number',
    min: 15,
    max: 25,
    unit: '°C',
  }),
  makeQuestion({ id: 'q4', section: 'Readings', text: 'Notes', type: 'text', required: false }),
];

export function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 't-1',
    org_id: 'org-1',
    code: 'CL-001',
    title: 'Safety walk',
    description: 'Monthly walk',
    category: 'safety',
    frameworks: ['iso45001'],
    status: 'active',
    version: 2,
    question_count: QUESTIONS.length,
    pass_threshold: 80,
    auto_deviation: true,
    deviation_type_id: null,
    library_key: null,
    published_at: '2026-11-01T10:00:00',
    created_by: { id: 'u-1', name: 'Ada' },
    updated_by: null,
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-02T10:00:00',
    url: '/inspections/templates/t-1',
    ...overrides,
  };
}

export function makeTemplateDetail(overrides: Partial<TemplateDetail> = {}): TemplateDetail {
  return { ...makeTemplate(), questions: QUESTIONS, inspection_count: 3, ...overrides };
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f-1',
    org_id: 'org-1',
    code: 'FND-0001',
    inspection: { id: 'i-1', code: 'INS-0001', title: 'Warehouse walk' },
    question_id: 'q1',
    question_text: 'Exits clear?',
    source: 'auto',
    title: 'Blocked exit',
    description: null,
    severity: 'high',
    status: 'open',
    owner: { id: 'u-1', name: 'Ada' },
    due_at: null,
    is_overdue: false,
    deviation: null,
    closed_at: null,
    closed_by: null,
    created_by: null,
    created_at: '2026-11-03T10:00:00',
    updated_at: '2026-11-03T10:00:00',
    url: '/inspections/i-1?finding=f-1',
    ...overrides,
  };
}

export function makeInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: 'i-1',
    org_id: 'org-1',
    code: 'INS-0001',
    title: 'Warehouse walk',
    status: 'in_progress',
    result: null,
    template: { id: 't-1', title: 'Safety walk', version: 2 },
    schedule_id: null,
    location: 'Warehouse B',
    inspector: { id: 'u-1', name: 'Ada' },
    owner: null,
    department_id: null,
    due_at: '2026-11-20T00:00:00',
    started_at: '2026-11-03T09:00:00',
    completed_at: null,
    completed_by: null,
    score_earned: null,
    score_possible: null,
    score_pct: null,
    pass_threshold: 80,
    is_overdue: false,
    question_count: QUESTIONS.length,
    required_count: 3,
    answered_count: 0,
    failed_count: 0,
    finding_count: 0,
    open_finding_count: 0,
    created_by: { id: 'u-1', name: 'Ada' },
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-03T10:00:00',
    url: '/inspections/i-1',
    ...overrides,
  };
}

export function makeInspectionDetail(overrides: Partial<InspectionDetail> = {}): InspectionDetail {
  return {
    ...makeInspection(),
    notes: null,
    summary: null,
    signature: null,
    cancel_reason: null,
    auto_deviation: true,
    deviation_type_id: null,
    questions: QUESTIONS,
    responses: [],
    findings: [],
    permissions: { can_edit: true, can_perform: true, can_manage: true },
    ...overrides,
  };
}

// --- TestBed wiring ------------------------------------------------------------------

@Component({ selector: 'app-inspections-test-outlet', template: '' })
class EmptyRoute {}

export interface InspectionsTestDoubles {
  readonly providers: (Provider | EnvironmentProviders)[];
  readonly toasts: { success: Mock; error: Mock; info: Mock; warning: Mock };
  readonly attachments: { upload: Mock; list: Mock };
}

export const ALL_PERMISSIONS: readonly string[] = [
  'inspections:read',
  'inspections:write',
  'inspections:manage',
  'inspections:templates',
];

/**
 * Providers for the inspections pages: HTTP testing (kit components), a fixed org with
 * `permissions`, a fake guidance service, a stubbed assistant, member options,
 * attachments and deviation types, plus `api` as the InspectionsApi.
 */
export function inspectionsTestingProviders(
  api: Partial<Record<keyof InspectionsApi, unknown>>,
  permissions: readonly string[] = ALL_PERMISSIONS,
): InspectionsTestDoubles {
  const toasts = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
  const attachments = { upload: vi.fn(() => of()), list: vi.fn(() => of([])) };
  const guidance = provideFakeGuidance();
  return {
    toasts,
    attachments,
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: EmptyRoute }]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1').asReadonly(),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }).asReadonly(),
        },
      },
      {
        provide: AuthService,
        useValue: { user: signal({ id: 'u-1', full_name: 'Ada Lovelace', email: 'a@x' }) },
      },
      {
        provide: AskPanelService,
        useValue: {
          askAbout: () => undefined,
          showWith: () => undefined,
          openTutor: () => undefined,
        },
      },
      {
        provide: AssigneeOptionsService,
        useValue: {
          options: signal({
            users: [{ value: 'user:u-1', label: 'Ada', labelIsKey: false }],
            roles: [],
            departments: [{ value: 'department:d-1', label: 'Ops', labelIsKey: false }],
          }),
          ensureLoaded: () => undefined,
        },
      },
      { provide: AttachmentsApi, useValue: attachments },
      { provide: DeviationsApi, useValue: { listTypes: () => of([]) } },
      { provide: NotificationService, useValue: toasts },
      { provide: InspectionsApi, useValue: api },
      ...guidance.providers,
    ],
  };
}

/** Transloco that echoes keys (empty translations). */
export function inspectionsTransloco() {
  return TranslocoTestingModule.forRoot({ langs: { en: {} } });
}
