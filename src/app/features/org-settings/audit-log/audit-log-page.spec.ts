import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, convertToParamMap } from '@angular/router';
import en from '../../../../assets/i18n/en.json';
import nb from '../../../../assets/i18n/nb.json';
import { AuditEvent, AuditFacets } from '../../../core/org/audit-log-api';
import { configureKit, kitUrl, tick } from '../../../shared/kit/kit.testing';
import {
  AuditLogPage,
  EMPTY_AUDIT_FILTERS,
  actionVerbKey,
  auditStateFromParams,
  auditStateToParams,
  moduleLabelKey,
  moreFiltersCount,
} from './audit-log-page';

const FACETS: AuditFacets = {
  entity_types: [{ entity_type: 'generated_output', label_key: null, count: 3 }],
  actors: [{ user_id: 'u1', name: 'Kari Nordmann', count: 5 }],
  action_groups: [{ prefix: 'generated_output.', count: 3 }],
  actor_kinds: [{ actor_kind: 'user', count: 5 }],
  modules: [
    { module: 'platform', name_key: null, count: 2 },
    { module: 'privacy', name_key: 'modules.names.privacy', count: 3 },
  ],
  outputs: [{ output_key: 'privacy.ropa', count: 3 }],
  categories: [{ category: 'outputs', count: 3 }],
};

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'e1',
    org_id: 'org-1',
    actor_user_id: 'u1',
    actor_name: 'Kari Nordmann',
    actor_kind: 'user',
    entity_type: 'generated_output',
    entity_id: 'g1',
    entity_label_key: null,
    entity: { code: null, title: 'Record of processing activities', url: null },
    action: 'generated_output.created',
    summary: 'Output privacy.ropa v1 generated as pdf',
    before: null,
    after: { output_key: 'privacy.ropa' },
    ip: null,
    user_agent: null,
    request_id: null,
    created_at: '2026-11-01T10:00:00Z',
    module: 'privacy',
    output_key: 'privacy.ropa',
    is_output: true,
    ...overrides,
  };
}

const lookup = (tree: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], tree);

describe('audit log filters', () => {
  it('reads every filter from the URL and keeps only the outputs category', () => {
    const state = auditStateFromParams(
      convertToParamMap({ module: 'privacy', category: 'outputs', output_key: 'privacy.ropa' }),
    );
    expect(state.module).toBe('privacy');
    expect(state.category).toBe('outputs');
    expect(state.output_key).toBe('privacy.ropa');
    expect(auditStateFromParams(convertToParamMap({ category: 'other' })).category).toBe('');
  });

  it('drops blank values from the query', () => {
    expect(auditStateToParams({ ...EMPTY_AUDIT_FILTERS, module: 'risk', q: ' ' })).toEqual({
      module: 'risk',
    });
  });

  it('counts the filters under "Flere filtre" for each view', () => {
    const state = { ...EMPTY_AUDIT_FILTERS, action: 'risk.', output_key: 'privacy.ropa' };
    // Full log: action is visible, the document filter is folded away.
    expect(moreFiltersCount(state)).toBe(1);
    // Documents view: the document filter is visible, action is folded away.
    expect(moreFiltersCount({ ...state, category: 'outputs' })).toBe(1);
    expect(moreFiltersCount({ ...state, from: '2026-01-01' })).toBe(2);
  });

  it('names document actions and the platform bucket in both languages', () => {
    expect(actionVerbKey('generated_output.created')).toBe('outputCreated');
    expect(actionVerbKey('risk.exported')).toBe('exported');
    expect(actionVerbKey('risk.weird_thing')).toBeNull();
    for (const tree of [en, nb]) {
      for (const verb of ['outputCreated', 'downloaded', 'shareCreated', 'shareRevoked']) {
        expect(typeof lookup(tree, `settings.audit.verbs.${verb}`), verb).toBe('string');
      }
      expect(typeof lookup(tree, moduleLabelKey('platform', null))).toBe('string');
      expect(typeof lookup(tree, 'settings.audit.types.generated_output')).toBe('string');
    }
  });
});

describe('AuditLogPage', () => {
  let http: HttpTestingController;

  const listCalls = (): TestRequest[] => http.match((r) => r.url === kitUrl('audit-events'));

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await tick(0);
      http.match((r) => !r.url.startsWith(kitUrl('audit-events')));
    }
  }

  beforeEach(() => {
    ({ http } = configureKit(AuditLogPage, { permissions: ['audit:read'] }));
  });

  async function render(url = '/') {
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(AuditLogPage);
    fixture.detectChanges();
    await settle();
    http.expectOne(kitUrl('audit-events/facets')).flush(FACETS);
    return fixture;
  }

  it('labels module options with their names and puts the platform bucket last', async () => {
    const fixture = await render();
    listCalls()[0].flush({ items: [event()], total: 1 });
    await fixture.whenStable();
    fixture.detectChanges();
    const options = [
      ...fixture.nativeElement.querySelectorAll('[data-testid="audit-module"] option'),
    ].map((o: HTMLOptionElement) => o.textContent?.trim());
    expect(options).toEqual(['All modules', 'Privacy (3)', 'Platform and settings (2)']);
    const row = fixture.nativeElement.querySelector('[data-testid="audit-row"]');
    expect(row.textContent).toContain('Document made');
    expect(row.textContent).toContain('Privacy');
    expect(row.textContent).toContain('Record of processing activities');
  });

  it('sends the documents view and the document filter from the URL to the API', async () => {
    const fixture = await render('/?category=outputs&output_key=privacy.ropa');
    const [req] = listCalls();
    expect(req.request.params.get('category')).toBe('outputs');
    expect(req.request.params.get('output_key')).toBe('privacy.ropa');
    req.flush({ items: [event()], total: 1 });
    await fixture.whenStable();
    fixture.detectChanges();
    const output = fixture.nativeElement.querySelector(
      '[data-testid="audit-output"]',
    ) as HTMLSelectElement;
    expect(output.value).toBe('privacy.ropa');
    expect(
      fixture.nativeElement.querySelector('[data-testid="audit-total"]').textContent,
    ).toContain('1 documents');
  });

  it('switching to the documents view filters the list and the export', async () => {
    const fixture = await render();
    listCalls()[0].flush({ items: [], total: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('[data-testid="audit-view-outputs"]') as HTMLElement
    ).click();
    await settle();
    const [req] = listCalls();
    expect(req.request.params.get('category')).toBe('outputs');
    req.flush({ items: [event()], total: 1 });
    await fixture.whenStable();
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('[data-testid="audit-export"] button') as HTMLElement
    ).click();
    const exportReq = http.expectOne((r) => r.url === kitUrl('audit-events/export'));
    expect(exportReq.request.params.get('category')).toBe('outputs');
  });
});
