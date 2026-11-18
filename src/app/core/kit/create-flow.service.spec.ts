import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { kitTransloco } from '../../shared/kit/kit.testing';
import { APP_CONFIG } from '../config/app-config';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { PrefillResponse } from './connections.models';
import {
  CreateFlowService,
  decodeClaims,
  patchFromPrefill,
  pathOf,
  withParam,
  withPrefill,
} from './create-flow.service';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/${path}`;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const SOURCE_ID = '6e2fd6ba-6856-476c-93d6-f11c9eac4b11';
const NEW_ID = '7bbcd00a-c0a6-4bef-aa38-30c5a00c6317';

/** A token whose payload says flow + source (signature irrelevant client-side). */
function token(claims: Record<string, string>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

const TOKEN = token({ key: 'deviation.to_risk', st: 'deviation', sid: SOURCE_ID });

function prefill(overrides: Partial<PrefillResponse> = {}): PrefillResponse {
  return {
    key: 'deviation.to_risk',
    target_type: 'risk',
    target_route: '/risk/risks/new',
    prefill: {
      title: 'Late delivery',
      description: 'Eight days late',
      from: {
        entity_type: 'deviation',
        entity_id: SOURCE_ID,
        code: 'AVV-3',
        title: 'Late delivery',
        url: `/deviations/${SOURCE_ID}`,
      },
    },
    token: TOKEN,
    source: {
      entity_type: 'deviation',
      entity_id: SOURCE_ID,
      title: 'Late delivery',
      code: 'AVV-3',
      url: `/deviations/${SOURCE_ID}`,
      status: 'open',
      module: 'deviations',
      label_key: null,
    },
    ...overrides,
  };
}

@Component({ template: '' })
class Blank {}

function setup() {
  sessionStorage.clear();
  const messages: { level: string; key: string; params?: Record<string, unknown> }[] = [];
  const notify = (level: string) => (key: string, params?: Record<string, unknown>) =>
    messages.push({ level, key, params });
  TestBed.configureTestingModule({
    imports: [kitTransloco()],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'deviations/:id', component: Blank },
        { path: 'risk/risks/new', component: Blank },
        { path: 'risk/risks/:id', component: Blank },
        { path: 'elsewhere', component: Blank },
      ]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal(ORG).asReadonly() } },
      {
        provide: NotificationService,
        useValue: {
          success: notify('success'),
          info: notify('info'),
          warning: notify('warning'),
          error: notify('error'),
        },
      },
    ],
  });
  return {
    service: TestBed.inject(CreateFlowService),
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    messages,
  };
}

function route(params: Record<string, string>): ActivatedRoute {
  return { snapshot: { queryParamMap: convertToParamMap(params) } } as unknown as ActivatedRoute;
}

describe('create-flow helpers', () => {
  it('overrides prefill values but keeps where the record comes from', () => {
    const res = prefill();
    const out = withPrefill(res, { title: 'Factor', from: 'nope', requirement: 'x' });
    expect(out.prefill.title).toBe('Factor');
    expect(out.prefill.from).toEqual(res.prefill.from);
    expect(withPrefill(res, null)).toBe(res);
  });

  it('reads paths and sets query parameters', () => {
    expect(pathOf('/risk/risks/new?flow=x#top')).toBe('/risk/risks/new');
    expect(pathOf('/risk/risks/')).toBe('/risk/risks');
    expect(withParam('/risk/risks/1?newTreatment=1', 'flow', 'a.b')).toBe(
      '/risk/risks/1?newTreatment=1&flow=a.b',
    );
    expect(withParam('/tasks/new', 'flow', 't')).toBe('/tasks/new?flow=t');
  });

  it('decodes the flow and source from a token', () => {
    expect(decodeClaims(TOKEN)).toEqual({
      key: 'deviation.to_risk',
      st: 'deviation',
      sid: SOURCE_ID,
      ref: undefined,
    });
    expect(decodeClaims('nonsense')).toBeNull();
  });

  it('patches only empty controls and never the source reference', () => {
    const form = new FormGroup({
      title: new FormControl(''),
      description: new FormControl('Typed by the user'),
      tags: new FormControl<string[]>([]),
    });
    patchFromPrefill(form, {
      title: 'Late delivery',
      description: 'From the deviation',
      tags: ['supplier'],
      unknown: 'ignored',
      from: prefill().prefill.from,
    });
    expect(form.getRawValue()).toEqual({
      title: 'Late delivery',
      description: 'Typed by the user',
      tags: ['supplier'],
    });
    expect(form.controls.title.dirty).toBe(true);
  });
});

describe('CreateFlowService', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('starts a flow, then a form consumes and completes it', async () => {
    const { service, http, router, messages } = setup();
    const started = service.start('deviation.to_risk', 'deviation', SOURCE_ID);
    const req = http.expectOne(url('create-flows/deviation.to_risk/prefill'));
    expect(req.request.body).toEqual({ source_id: SOURCE_ID, source_ref: null });
    req.flush(prefill());
    expect(await started).toBe(true);
    expect(router.url).toBe(`/risk/risks/new?flow=${TOKEN}`);

    const flow = service.consume(route({ flow: TOKEN }), { targetType: 'risk' });
    expect(flow()?.prefill.title).toBe('Late delivery');
    expect(flow()?.source?.code).toBe('AVV-3');

    let done: unknown;
    service.complete(NEW_ID).subscribe((res) => (done = res));
    const complete = http.expectOne(url('create-flows/complete'));
    expect(complete.request.body).toEqual({ target_id: NEW_ID, token: TOKEN });
    complete.flush({
      flow_key: 'deviation.to_risk',
      link: {
        id: 'l1',
        link_type: 'relates_to',
        origin: 'flow',
        flow_key: 'deviation.to_risk',
        direction: 'outgoing',
      },
      requirement_link_id: null,
      requirement_suggestions: 3,
      source: prefill().source,
      target: { ...prefill().source!, entity_type: 'risk', entity_id: NEW_ID },
    });
    expect(done).toBeTruthy();
    expect(messages).toContainEqual({
      level: 'success',
      key: 'kit.flows.linkedToastWithSuggestions',
      params: { name: 'AVV-3', count: 3 },
    });
    // Done: completing again is a no-op.
    service.complete(NEW_ID).subscribe();
    http.expectNone(url('create-flows/complete'));
  });

  it('applies prefill overrides and reports the completed flow', async () => {
    const { service, http } = setup();
    const done: { targetId: string; targetType: string; token: string | null }[] = [];
    const sub = service.completed.subscribe((c) => done.push(c));
    let startedToken: string | null = null;
    const started = service.start('deviation.to_risk', 'deviation', SOURCE_ID, {
      prefill: { title: 'Weak backup routine', from: undefined },
      onStarted: (token) => (startedToken = token),
    });
    http.expectOne(url('create-flows/deviation.to_risk/prefill')).flush(prefill());
    await started;
    expect(startedToken).toBe(TOKEN);
    const flow = service.consume(route({ flow: TOKEN }), { targetType: 'risk' });
    expect(flow()?.prefill.title).toBe('Weak backup routine');
    expect(flow()?.source?.code).toBe('AVV-3');
    service.complete(NEW_ID).subscribe();
    http.expectOne(url('create-flows/complete')).flush({
      flow_key: 'deviation.to_risk',
      link: null,
      requirement_link_id: null,
      requirement_suggestions: 0,
      source: prefill().source,
      target: null,
    });
    expect(done).toEqual([
      expect.objectContaining({ targetId: NEW_ID, targetType: 'risk', token: TOKEN }),
    ]);
    sub.unsubscribe();
  });

  it('completes on its own when the form opens the new record', async () => {
    const { service, http, router, messages } = setup();
    const started = service.start('deviation.to_risk', 'deviation', SOURCE_ID);
    http.expectOne(url('create-flows/deviation.to_risk/prefill')).flush(prefill());
    await started;
    await router.navigateByUrl(`/risk/risks/${NEW_ID}`);
    const complete = http.expectOne(url('create-flows/complete'));
    expect(complete.request.body).toEqual({ target_id: NEW_ID, token: TOKEN });
    complete.flush({ detail: { code: 'link_exists' } }, { status: 409, statusText: 'Conflict' });
    // Already linked (the form completed it itself): nothing to tell.
    expect(messages.filter((m) => m.level === 'warning')).toEqual([]);
  });

  it('forgets the flow when the user leaves the form without saving', async () => {
    const { service, http, router } = setup();
    const started = service.start('deviation.to_risk', 'deviation', SOURCE_ID);
    http.expectOne(url('create-flows/deviation.to_risk/prefill')).flush(prefill());
    await started;
    await router.navigateByUrl('/elsewhere');
    await router.navigateByUrl(`/risk/risks/${NEW_ID}`);
    http.expectNone(url('create-flows/complete'));
    expect(service.current()).toBeNull();
  });

  it('recovers the prefill from the token after a reload', async () => {
    const { service, http } = setup();
    const flow = service.consume(route({ flow: TOKEN }), { targetType: 'risk' });
    expect(flow()).toBeNull();
    const req = http.expectOne(url('create-flows/deviation.to_risk/prefill'));
    expect(req.request.body).toEqual({ source_id: SOURCE_ID, source_ref: null });
    req.flush(prefill());
    expect(flow()?.prefill.description).toBe('Eight days late');
  });

  it('links a record created for a requirement', async () => {
    const { service, http, messages } = setup();
    const flow = service.consume(route({ fromRequirement: 'iso9001-2026:8.4.1.r1' }), {
      targetType: 'risk',
    });
    expect(flow()?.requirementRef).toBe('iso9001-2026:8.4.1.r1');
    http
      .expectOne(url('create-flows/requirement.evidence%3Arisk/prefill'))
      .flush({ detail: 'nope' }, { status: 404, statusText: 'Not Found' });
    service.complete(NEW_ID).subscribe();
    const complete = http.expectOne(url('create-flows/complete'));
    expect(complete.request.body).toEqual({
      target_id: NEW_ID,
      requirement_ref: 'iso9001-2026:8.4.1.r1',
      target_type: 'risk',
    });
    complete.flush({
      flow_key: 'requirement.evidence:risk',
      link: null,
      requirement_link_id: 'rl1',
      requirement_suggestions: 0,
      source: null,
      target: { ...prefill().source!, entity_type: 'risk', entity_id: NEW_ID },
    });
    expect(messages.at(-1)?.key).toBe('kit.flows.requirementLinkedToast');
  });

  it('explains a refused flow and stays put', async () => {
    const { service, http, router, messages } = setup();
    const started = service.start('deviation.to_risk', 'deviation', SOURCE_ID);
    http
      .expectOne(url('create-flows/deviation.to_risk/prefill'))
      .flush({ detail: { code: 'flow_not_found' } }, { status: 404, statusText: 'Not Found' });
    expect(await started).toBe(false);
    expect(router.url).toBe('/');
    expect(messages).toContainEqual({
      level: 'error',
      key: 'kit.errors.flow_not_found',
      params: undefined,
    });
  });

  it('warns when the target form does not exist yet', async () => {
    const { service, http, router, messages } = setup();
    router.resetConfig([...router.config, { path: '**', redirectTo: 'elsewhere' }]);
    const started = service.start('deviation.to_training', 'deviation', SOURCE_ID);
    http
      .expectOne(url('create-flows/deviation.to_training/prefill'))
      .flush(prefill({ key: 'deviation.to_training', target_route: '/training/assignments/new' }));
    expect(await started).toBe(false);
    expect(messages.at(-1)?.key).toBe('kit.flows.formMissing');
    expect(service.current()).toBeNull();
    await tick();
  });
});
