import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../../assets/i18n/registrer/en.json';
import nb from '../../../assets/i18n/registrer/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { PageContextService } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RegistrerApi } from './registrer-api';
import { RegistrerComplete } from './registrer-complete';
import {
  COMPLETE_FIELDS,
  ERROR_CODES,
  KIND_OPTIONS,
  NEXT_STEP_CODES,
  QUICK_FIELD_KEYS,
  TRIAGE_OPTIONS,
  buildRequest,
  contextFromPage,
  errorCode,
  isContextError,
  isRegistrerShortcut,
  missingRequired,
  pickOptions,
} from './registrer-data';
import { RegistrerDialog } from './registrer-dialog';
import { QuickCreateResponse, QuickField, QuickType, QuickTypeKey } from './registrer.models';
import { RegistrerService } from './registrer.service';

type Tree = Record<string, unknown>;
const lookup = (tree: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);

const RECORD_ID = '0b9f8c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';

const field = (key: string, kind: QuickField['kind'], extra: Partial<QuickField> = {}) =>
  ({
    key,
    kind,
    required: false,
    options: [],
    default: null,
    max_length: null,
    ...extra,
  }) as QuickField;
const TITLE = field('title', 'text', { required: true, max_length: 255 });
const DESCRIPTION = field('description', 'textarea');
const WHEN = field('occurred_at', 'datetime');
const OWNER = field('owner_user_id', 'user');
const opts = (...values: string[]) => values.map((value) => ({ value, label: null }));

function type(key: QuickTypeKey, fields: QuickField[], extra: Partial<QuickType> = {}): QuickType {
  return {
    key,
    group: 'common',
    featured: true,
    available: true,
    reason: null,
    entity_type: key,
    module: key,
    entity_label_key: null,
    fields,
    next_step: 'deviation_follow_up',
    complete_fields: ['severity'],
    ...extra,
  };
}

/** The backend catalogue for an employee: incidents yes, privacy register no. */
const TYPES: QuickType[] = [
  type('deviation', [TITLE, DESCRIPTION, WHEN, OWNER], { group: 'incident' }),
  type(
    'near_miss',
    [
      TITLE,
      field('kind', 'select', {
        required: true,
        default: 'near_miss',
        options: opts('near_miss', 'injury', 'occupational_illness'),
      }),
      DESCRIPTION,
      WHEN,
      OWNER,
    ],
    { group: 'incident', featured: false, entity_type: 'deviation', next_step: 'hse_follow_up' },
  ),
  type(
    'security_incident',
    [
      TITLE,
      field('kind', 'select', {
        required: true,
        default: 'other',
        options: opts('phishing', 'other'),
      }),
      DESCRIPTION,
      WHEN,
      OWNER,
    ],
    { group: 'incident', featured: false, entity_type: 'deviation' },
  ),
  type('data_breach', [TITLE, DESCRIPTION, WHEN, OWNER], {
    group: 'incident',
    entity_type: 'deviation',
    next_step: 'breach_reported_72h',
  }),
  type('complaint', [], { group: 'incident', available: false, reason: 'module_disabled' }),
  type('improvement', [TITLE, DESCRIPTION, OWNER], { entity_type: 'deviation' }),
  type('risk', [], { available: false, reason: 'forbidden' }),
  type('task', [TITLE, DESCRIPTION, field('due_at', 'datetime'), OWNER]),
];

describe('Registrer data', () => {
  it('reads the record or requirement the page shows as the link target', () => {
    expect(
      contextFromPage({
        module: 'risk',
        entityType: 'risk',
        entityId: RECORD_ID,
        view: 'detail',
        title: 'R-1',
      }),
    ).toEqual({ context: { entity_type: 'risk', entity_id: RECORD_ID }, title: 'R-1' });
    expect(
      contextFromPage({
        module: 'standards',
        entityType: 'standard_requirement',
        view: 'detail',
        title: 'ISO 27001 · 5.24',
        requirements: ['iso27001:5.24'],
      }),
    ).toEqual({ context: { requirement_ref: 'iso27001:5.24' }, title: 'ISO 27001 · 5.24' });
    // Lists, a standard as a whole, and ids that are not records give no context.
    expect(contextFromPage({ module: 'risk', entityType: 'risk', view: 'list' })).toBeNull();
    expect(
      contextFromPage({
        module: 'standards',
        entityType: 'standard',
        entityId: RECORD_ID,
        view: 'detail',
      }),
    ).toBeNull();
    expect(
      contextFromPage({ module: 'risk', entityType: 'risk', entityId: 'new', view: 'detail' }),
    ).toBeNull();
    expect(contextFromPage(null)).toBeNull();
  });

  it('offers only the types the caller may use, incidents as plain-language answers', () => {
    const { triage, common } = pickOptions(TYPES);
    expect(triage.map((o) => o.key)).toEqual([
      'wentWrong',
      'nearMiss',
      'injury',
      'phishing',
      'security',
      'breach',
    ]);
    expect(common.map((t) => t.key)).toEqual(['improvement', 'task']);
  });

  it('sends only the type fields, trimmed, with the context', () => {
    const near = TYPES[1];
    const body = buildRequest(
      near,
      {
        title: '  Glatt gulv ved lageret ',
        kind: 'near_miss',
        description: '',
        occurred_at: '2026-11-18T09:30',
        customer_name: 'ignored: not a near-miss field',
      },
      { entity_type: 'risk', entity_id: RECORD_ID },
    );
    expect(body).toEqual({
      type: 'near_miss',
      title: 'Glatt gulv ved lageret',
      kind: 'near_miss',
      occurred_at: new Date('2026-11-18T09:30').toISOString(),
      context: { entity_type: 'risk', entity_id: RECORD_ID },
    });
    expect(missingRequired(near, { title: ' ', kind: 'near_miss' })).toEqual(['title']);
  });

  it('keeps every quick form at 3-5 fields', () => {
    for (const t of TYPES.filter((item) => item.available)) {
      expect(t.fields.length).toBeGreaterThanOrEqual(3);
      expect(t.fields.length).toBeLessThanOrEqual(5);
    }
  });

  it('maps errors to messages and spots context problems', () => {
    expect(errorCode({ status: 403 })).toEqual({ code: 'forbidden', field: null });
    expect(
      errorCode({ status: 422, error: { detail: { code: 'field_required', field: 'title' } } }),
    ).toEqual({ code: 'field_required', field: 'title' });
    expect(errorCode({ status: 500 })).toEqual({ code: 'generic', field: null });
    expect(isContextError({ status: 422, error: { detail: { code: 'not_linkable' } } })).toBe(true);
    expect(isContextError({ status: 404, error: { detail: { code: 'module_disabled' } } })).toBe(
      false,
    );
    expect(isContextError({ status: 422, error: { detail: { code: 'field_required' } } })).toBe(
      false,
    );
  });

  it('opens on a bare N outside text fields and dialogs', () => {
    const key = (init: KeyboardEventInit, target?: HTMLElement) => {
      const event = new KeyboardEvent('keydown', init);
      if (target) {
        Object.defineProperty(event, 'target', { value: target });
      }
      return event;
    };
    expect(isRegistrerShortcut(key({ key: 'n' }))).toBe(true);
    expect(isRegistrerShortcut(key({ key: 'N', shiftKey: true }))).toBe(true);
    expect(isRegistrerShortcut(key({ key: 'n', ctrlKey: true }))).toBe(false);
    expect(isRegistrerShortcut(key({ key: 'n' }, document.createElement('input')))).toBe(false);
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    expect(isRegistrerShortcut(key({ key: 'n' }))).toBe(false);
    modal.remove();
  });
});

describe('Registrer i18n', () => {
  it('keeps en/nb at parity', () => expectKeyParity(en, nb));

  it('has a label for every type, answer, field, option, next step and missing field', () => {
    const keys = [
      ...TRIAGE_OPTIONS.flatMap((o) => [`triage.${o.key}.label`, `triage.${o.key}.term`]),
      ...(Object.keys(TYPE_KEYS) as string[]).map((k) => `types.${k}`),
      ...QUICK_FIELD_KEYS.map((k) => `fields.${k}`),
      ...KIND_OPTIONS.map((k) => `options.kind.${k}`),
      ...NEXT_STEP_CODES.map((k) => `next.${k}`),
      ...COMPLETE_FIELDS.map((k) => `complete.fields.${k}`),
      ...ERROR_CODES.map((k) => `errors.${k}`),
      'errors.generic',
      'kindQuestion.near_miss',
      'kindQuestion.security_incident',
      'kindQuestion.customer_feedback',
    ];
    for (const lang of [en, nb]) {
      const missing = keys.filter((k) => typeof lookup(lang, k) !== 'string');
      expect(missing).toEqual([]);
    }
  });
});

const TYPE_KEYS: Record<QuickTypeKey, true> = {
  deviation: true,
  near_miss: true,
  security_incident: true,
  data_breach: true,
  complaint: true,
  improvement: true,
  customer_feedback: true,
  risk: true,
  task: true,
  document: true,
  supplier: true,
};

function created(overrides: Partial<QuickCreateResponse> = {}): QuickCreateResponse {
  return {
    type: 'near_miss',
    entity_type: 'deviation',
    record: {
      entity_type: 'deviation',
      entity_id: RECORD_ID,
      title: 'Glatt gulv',
      code: 'AVV-12',
      url: `/deviations/${RECORD_ID}`,
      status: 'registered',
      module: 'deviations',
      label_key: null,
    },
    next_step: { code: 'hse_follow_up', deadline_at: null, due_on: null },
    complete_fields: ['location', 'immediate_action'],
    context_link: null,
    ...overrides,
  };
}

function setup(pageContext: Parameters<PageContextService['set']>[1] = null) {
  const api = {
    listTypes: vi.fn(() => of({ items: TYPES })),
    create: vi.fn(() => of(created())),
    listPeople: vi.fn(() => of({ users: [{ id: 'u-2', name: 'Ola' }] })),
  };
  TestBed.configureTestingModule({
    imports: [
      RegistrerDialog,
      RegistrerComplete,
      TranslocoTestingModule.forRoot({
        langs: { en: {}, 'registrer/en': en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', children: [] }]),
      { provide: RegistrerApi, useValue: api },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal('org-1').asReadonly() } },
      { provide: AuthService, useValue: { user: signal({ id: 'u-1' }) } },
      { provide: LanguageService, useValue: { active: signal('en') } },
    ],
  });
  if (pageContext) {
    TestBed.inject(PageContextService).set({}, pageContext);
  }
  const fixture = TestBed.createComponent(RegistrerDialog);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const service = TestBed.inject(RegistrerService);
  const router = TestBed.inject(Router);
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel);
  return { fixture, el, api, service, router, render, q };
}

describe('Registrer dialog', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('reports a near miss in three clicks: Registrer, the answer, Registrer', async () => {
    const { api, service, router, render, q, el } = setup({
      module: 'risk',
      entityType: 'risk',
      entityId: RECORD_ID,
      view: 'detail',
      title: 'Fall fra høyde',
    });
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    service.show(); // click 1: the Registrer button / N
    await render();
    expect(q('[data-testid="registrer-type-risk"]')).toBeNull(); // forbidden for this caller
    q<HTMLButtonElement>('[data-testid="registrer-triage-nearMiss"]')!.click(); // click 2
    await render();
    const form = q('[data-testid="registrer-form"]')!;
    expect(form.querySelectorAll('input, select, textarea').length).toBeLessThanOrEqual(5);
    expect(q<HTMLSelectElement>('#registrer-f-kind')!.value).toBe('near_miss');
    expect(q('[data-testid="registrer-context"]')!.textContent).toContain('Fall fra høyde');
    expect(q('[data-testid="registrer-next"]')).not.toBeNull();
    const title = q<HTMLInputElement>('#registrer-f-title')!;
    title.value = 'Glatt gulv ved lageret';
    title.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>('[data-testid="registrer-submit"] button')!.click(); // click 3
    await render();
    expect(api.create).toHaveBeenCalledWith('org-1', {
      type: 'near_miss',
      title: 'Glatt gulv ved lageret',
      kind: 'near_miss',
      context: { entity_type: 'risk', entity_id: RECORD_ID },
    });
    expect(navigate).toHaveBeenCalledWith([`/deviations/${RECORD_ID}`], { queryParams: {} });
    expect(service.open()).toBe(false);
    expect(service.created()?.path).toBe(`/deviations/${RECORD_ID}`);
    expect(el.querySelector('[data-testid="registrer-dialog"]')).toBeNull();
  });

  it('presets phishing and registers again without the link when it cannot be made', async () => {
    const { api, service, render, q, router } = setup({
      module: 'risk',
      entityType: 'risk',
      entityId: RECORD_ID,
      view: 'detail',
    });
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    api.create
      .mockReturnValueOnce(
        throwError(() => ({ status: 422, error: { detail: { code: 'not_linkable' } } })),
      )
      .mockReturnValueOnce(of(created({ type: 'security_incident' })));
    service.show();
    await render();
    q<HTMLButtonElement>('[data-testid="registrer-triage-phishing"]')!.click();
    await render();
    expect(q<HTMLSelectElement>('#registrer-f-kind')!.value).toBe('phishing');
    const title = q<HTMLInputElement>('#registrer-f-title')!;
    title.value = 'Falsk faktura på e-post';
    title.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>('[data-testid="registrer-submit"] button')!.click();
    await render();
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(api.create.mock.calls[1]).toEqual([
      'org-1',
      { type: 'security_incident', title: 'Falsk faktura på e-post', kind: 'phishing' },
    ]);
    expect(service.open()).toBe(false);
  });

  it('asks for the title before sending, and confirms in place when the record cannot be opened', async () => {
    const { api, service, render, q } = setup();
    api.create.mockReturnValueOnce(
      of(
        created({
          type: 'data_breach',
          record: { ...created().record, url: null, title: '' },
          next_step: { code: 'breach_reported_72h', deadline_at: null, due_on: null },
        }),
      ),
    );
    service.show({ type: 'data_breach' });
    await render();
    expect(q('[data-testid="registrer-back"]')).toBeNull(); // opened straight into the form
    expect(q('[data-testid="registrer-context"]')).toBeNull();
    q<HTMLButtonElement>('[data-testid="registrer-submit"] button')!.click();
    await render();
    expect(api.create).not.toHaveBeenCalled();
    expect(q('[data-testid="registrer-error"]')).not.toBeNull();
    const title = q<HTMLInputElement>('#registrer-f-title')!;
    title.value = 'Lønnsliste sendt til feil person';
    title.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>('[data-testid="registrer-submit"] button')!.click();
    await render();
    expect(q('[data-testid="registrer-done"]')).not.toBeNull();
    expect(service.open()).toBe(true);
  });
});

describe('Fullfør posten', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows on the new record only, with the deadline and what is left to fill in', async () => {
    const { service, router } = setup();
    service.registered({
      response: created({
        type: 'data_breach',
        next_step: { code: 'breach_72h', deadline_at: '2026-11-21T09:00:00', due_on: null },
        complete_fields: ['breach_types', 'data_categories'],
      }),
      path: `/privacy/breaches/${RECORD_ID}`,
    });
    const fixture = TestBed.createComponent(RegistrerComplete);
    const el = fixture.nativeElement as HTMLElement;
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="registrer-complete"]')).toBeNull();
    await router.navigateByUrl(`/privacy/breaches/${RECORD_ID}?tab=details`);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="registrer-complete-fields"]')!.children.length).toBe(2);
    expect(el.querySelector('[data-testid="registrer-complete-next"]')!.textContent).toContain(
      '2026',
    );
    el.querySelector<HTMLButtonElement>('[data-testid="registrer-complete-dismiss"]')!.click();
    fixture.detectChanges();
    expect(service.created()).toBeNull();
  });
});
