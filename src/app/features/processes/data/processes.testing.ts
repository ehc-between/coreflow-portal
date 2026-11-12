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
import { APP_CONFIG } from '../../../core/config/app-config';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { AskPanelService } from '../../ask/ask-panel.service';
import { ProcessDetail, ProcessOut, Turtle } from './process.models';
import { ProcessesApi } from './processes-api';

/** Test fixtures for the processes feature (specs only). */

export function makeProcessOut(overrides: Partial<ProcessOut> = {}): ProcessOut {
  return {
    id: 'p-1',
    org_id: 'org-1',
    code: 'PR-001',
    title: 'Purchasing',
    purpose: 'Buy the right things',
    scope: null,
    category: 'support',
    status: 'active',
    owner: { id: 'u-1', name: 'Ada' },
    department: null,
    parent: null,
    review_interval_months: 12,
    next_review_at: '2027-01-01T00:00:00',
    last_reviewed_at: null,
    review_overdue: false,
    description_document_id: null,
    map_version: 1,
    step_count: 2,
    url: '/processes/p-1',
    created_by: 'u-1',
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    ...overrides,
  };
}

export function makeProcess(overrides: Partial<ProcessDetail> = {}): ProcessDetail {
  return {
    ...makeProcessOut(),
    inputs: ['Purchase request'],
    outputs: ['Purchase order'],
    resources: [],
    competence: [],
    methods: [],
    kpis: [{ name: 'On-time orders', target: '95', unit: '%', frequency: 'monthly' }],
    risks: [],
    map: {
      lanes: [{ id: 'lane-1', label: 'Buyer' }],
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', lane_id: 'lane-1', x: 40, y: 56 },
        { id: 'n2', type: 'task', label: 'Order', lane_id: 'lane-1', x: 220, y: 48 },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    },
    description_document: null,
    interactions: [],
    children: [],
    last_reviewed_by: null,
    can_edit: true,
    can_manage: true,
    ...overrides,
  };
}

export function makeTurtle(overrides: Partial<Turtle> = {}): Turtle {
  return {
    process: {
      id: 'p-1',
      code: 'PR-001',
      title: 'Purchasing',
      status: 'active',
      category: 'support',
    },
    owner: { id: 'u-1', name: 'Ada' },
    purpose: 'Buy the right things',
    inputs: ['Purchase request'],
    outputs: ['Purchase order'],
    resources: [],
    competence: [],
    methods: [],
    procedures: [],
    kpis: [],
    risks: [],
    linked_risks: [],
    upstream: [],
    downstream: [],
    ...overrides,
  };
}

// --- TestBed wiring ------------------------------------------------------------------

/** Any route renders nothing (pages navigate after saving). */
@Component({ selector: 'app-processes-test-outlet', template: '' })
class EmptyRoute {}

export interface ProcessesTestDoubles {
  readonly providers: (Provider | EnvironmentProviders)[];
  readonly toasts: { success: Mock; error: Mock; info: Mock; warning: Mock };
  readonly ask: { prompts: string[] };
}

/**
 * Providers for the processes pages: HTTP testing (kit components, watch button,
 * assistant buttons), a fixed org with `permissions`, a fake guidance service, a
 * stubbed assistant, member options and documents, plus `api` as the ProcessesApi.
 */
export function processesTestingProviders(
  api: Partial<Record<keyof ProcessesApi, unknown>>,
  permissions: readonly string[] = ['processes:read', 'processes:write', 'processes:manage'],
): ProcessesTestDoubles {
  const prompts: string[] = [];
  const toasts = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
  const guidance = provideFakeGuidance();
  return {
    toasts,
    ask: { prompts },
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
        provide: AskPanelService,
        useValue: {
          askAbout: (prompt: string) => prompts.push(prompt),
          showWith: (prompt: string) => prompts.push(prompt),
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
      { provide: DocumentsApi, useValue: { list: () => of([]) } },
      { provide: NotificationService, useValue: toasts },
      { provide: ProcessesApi, useValue: api },
      ...guidance.providers,
    ],
  };
}

/** Transloco that echoes keys (empty translations). */
export function processesTransloco() {
  return TranslocoTestingModule.forRoot({ langs: { en: {} } });
}
