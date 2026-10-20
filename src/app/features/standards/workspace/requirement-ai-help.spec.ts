import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { AuthService } from '../../../core/auth/auth.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { GuidanceEvent, Requirement } from '../../../core/standards/standards.models';
import { Guidance, RequirementAiHelp, applyGuidanceEvent } from './requirement-ai-help';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const REF = 'iso:5.2.r1';
const tick = () => new Promise((resolve) => setTimeout(resolve));

const REQUIREMENT: Requirement = {
  ref: REF,
  text: { en: 'Quality policy', nb: 'Kvalitetspolicy' },
  evidence_examples: null,
  status: 'not_started',
  applicable: true,
  justification: null,
  confirmed_links: [],
  suggested_links: [],
  status_override: null,
  note: null,
};

describe('applyGuidanceEvent', () => {
  const empty: Guidance = { text: '', sources: [], status: 'streaming' };

  it('appends deltas, keeps sources and finishes', () => {
    const events: GuidanceEvent[] = [
      { type: 'delta', text: 'Write ' },
      { type: 'sources', sources: [{ id: 'd1', title: 'Policy' }] },
      { type: 'delta', text: 'a policy.' },
      { type: 'done' },
    ];
    expect(events.reduce(applyGuidanceEvent, empty)).toEqual({
      text: 'Write a policy.',
      sources: [{ id: 'd1', title: 'Policy' }],
      status: 'done',
    });
  });

  it('marks an error but keeps what streamed so far', () => {
    const g = [
      { type: 'delta', text: 'Partial' } as GuidanceEvent,
      { type: 'error', message: 'x' } as GuidanceEvent,
    ].reduce(applyGuidanceEvent, empty);
    expect(g).toEqual({ text: 'Partial', sources: [], status: 'error' });
  });
});

describe('RequirementAiHelp', () => {
  let fixture: ComponentFixture<RequirementAiHelp>;
  let http: HttpTestingController;
  let el: HTMLElement;
  let emit: (event: GuidanceEvent) => void;
  let streamGuidance: ReturnType<typeof vi.spyOn>;
  let changed: number;

  async function render(): Promise<void> {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function setup(permissions: string[]): Promise<void> {
    TestBed.configureTestingModule({
      imports: [RequirementAiHelp, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: BASE, i18n: { availableLanguages: ['en', 'nb'] } },
        },
        { provide: AuthService, useValue: { accessToken: signal(null).asReadonly() } },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal(ORG).asReadonly(),
            currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
          },
        },
      ],
    });
    streamGuidance = vi
      .spyOn(TestBed.inject(StandardsApi), 'streamGuidance')
      .mockImplementation((_org, _ref, _lang, onEvent) => {
        emit = onEvent;
        return { cancel: vi.fn() };
      });
    fixture = TestBed.createComponent(RequirementAiHelp);
    fixture.componentRef.setInput('requirement', REQUIREMENT);
    fixture.componentRef.setInput('standardKey', 'iso');
    changed = 0;
    fixture.componentInstance.suggestionsChanged.subscribe(() => changed++);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement as HTMLElement;
    await render();
  }

  afterEach(() => http.verify());

  const button = (id: string) =>
    el.querySelector<HTMLButtonElement>(
      `[data-testid="${id}"] button, button[data-testid="${id}"]`,
    );

  it('streams guidance as rendered markdown with source links; regenerates and collapses', async () => {
    await setup(['standards:read']);
    button('ai-guide')!.click();
    await render();
    expect(streamGuidance).toHaveBeenCalledWith(ORG, REF, 'en', expect.any(Function));
    expect(el.textContent).toContain('standards.ai.thinking');

    emit({ type: 'delta', text: 'Write a **quality policy**:\n\n- sign' });
    emit({ type: 'delta', text: 'ed by management' });
    emit({ type: 'sources', sources: [{ id: 'd1', title: 'Policy', doc_code: 'P-1' }] });
    await render();
    const text = el.querySelector('[data-testid="guidance-text"]')!;
    expect(text.querySelector('strong')?.textContent).toBe('quality policy');
    expect(text.querySelector('li')?.textContent).toBe('signed by management');
    // Clearly labelled as an AI suggestion.
    expect(el.textContent).toContain('standards.ai.suggestionLabel');
    // Still streaming: no regenerate yet.
    expect(el.querySelector('[data-testid="guidance-regenerate"]')).toBeNull();

    emit({ type: 'done' });
    await render();
    const source = el.querySelector<HTMLAnchorElement>('[data-testid="guidance-sources"] a')!;
    expect(source.getAttribute('href')).toBe('/documents/d1');
    expect(source.textContent).toContain('P-1');

    el.querySelector<HTMLButtonElement>('[data-testid="guidance-toggle"]')!.click();
    await render();
    expect(el.querySelector('[data-testid="guidance-text"]')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="guidance-regenerate"]')!.click();
    await render();
    expect(streamGuidance).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[data-testid="guidance-text"]')).toBeNull();
    expect(el.textContent).toContain('standards.ai.thinking');
  });

  it('shows an error when the stream fails, keeping the partial text', async () => {
    await setup(['standards:read']);
    button('ai-guide')!.click();
    emit({ type: 'delta', text: 'Start here' });
    emit({ type: 'error', message: '' });
    await render();
    expect(el.textContent).toContain('Start here');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('standards.ai.guidanceError');
  });

  it('offers only guidance to readers (no suggest / draft actions)', async () => {
    await setup(['standards:read']);
    expect(button('ai-guide')).not.toBeNull();
    expect(button('ai-suggest')).toBeNull();
    expect(button('ai-draft')).toBeNull();
  });

  it('suggests evidence for the requirement with inline progress, then asks for a refresh', async () => {
    await setup(['standards:read', 'standards:manage']);
    button('ai-suggest')!.click();
    const start = http.expectOne(`${ROOT}/standards/iso/ai-map`);
    expect(start.request.body).toEqual({ requirement_ref: REF });
    start.flush({ job_id: 'j-1' });
    await render();
    await render();
    http.expectOne(`${ROOT}/standard-jobs/j-1`).flush({
      id: 'j-1',
      kind: 'ai_map',
      status: 'running',
      progress: 40,
      suggestions_created: 0,
      scope: 'requirement',
    });
    await render();
    expect(el.textContent).toContain('standards.ai.suggesting');
    expect(changed).toBe(0);
  });

  it('asks the workspace to refresh once the requirement mapping is done', async () => {
    await setup(['standards:read', 'standards:manage']);
    button('ai-suggest')!.click();
    http.expectOne(`${ROOT}/standards/iso/ai-map`).flush({ job_id: 'j-1' });
    await render();
    await render();
    http.expectOne(`${ROOT}/standard-jobs/j-1`).flush({
      id: 'j-1',
      kind: 'ai_map',
      status: 'done',
      progress: 100,
      suggestions_created: 2,
      scope: 'requirement',
    });
    await render();
    expect(changed).toBe(1);
    expect(el.textContent).toContain('standards.job.mapDone');
  });

  it('drafts a document and links to the proposal in Review', async () => {
    await setup(['standards:read', 'standards:manage', 'documents:draft']);
    button('ai-draft')!.click();
    const start = http.expectOne(`${ROOT}/standard-requirements/iso%3A5.2.r1/ai-draft`);
    expect(start.request.body).toEqual({ lang: 'en' });
    start.flush({ job_id: 'j-2' });
    await render();
    await render();
    http.expectOne(`${ROOT}/standard-jobs/j-2`).flush({
      id: 'j-2',
      kind: 'ai_draft',
      status: 'done',
      progress: 100,
      suggestions_created: 0,
      proposal_id: 'p-9',
    });
    await render();
    expect(el.textContent).toContain('standards.ai.draftReady');
    expect(el.querySelector('[data-testid="draft-link"]')?.getAttribute('href')).toBe(
      '/review/p-9',
    );
  });

  it('needs documents:draft as well as standards:manage to offer a draft', async () => {
    await setup(['standards:read', 'standards:manage']);
    expect(button('ai-suggest')).not.toBeNull();
    expect(button('ai-draft')).toBeNull();
  });

  it('hides the AI actions behind a neutral hint once AI turns out not to be configured', async () => {
    await setup(['standards:read', 'standards:manage', 'documents:draft']);
    button('ai-suggest')!.click();
    http
      .expectOne(`${ROOT}/standards/iso/ai-map`)
      .flush({ detail: 'off' }, { status: 503, statusText: 'Service Unavailable' });
    await render();
    expect(el.querySelector('[data-testid="ai-off"]')?.textContent).toContain(
      'standards.ai.notConfigured',
    );
    expect(button('ai-guide')).toBeNull();
    expect(button('ai-suggest')).toBeNull();
    expect(button('ai-draft')).toBeNull();
    expect(TestBed.inject(AiAvailability).unavailable()).toBe(true);
  });

  it('treats a not-configured guidance stream the same way', async () => {
    await setup(['standards:read']);
    button('ai-guide')!.click();
    emit({ type: 'not-configured' });
    await render();
    expect(el.querySelector('[data-testid="ai-off"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="guidance"]')).toBeNull();
  });
});
