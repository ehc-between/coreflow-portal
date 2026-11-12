import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import en from '../../../assets/i18n/en.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import documentsEn from '../../../assets/i18n/documents/en.json';
import { AuthService } from '../../core/auth/auth.service';
import { KIT_BASE, KIT_ORG, kitUrl, tick } from '../../shared/kit/kit.testing';
import { AudienceEditor } from './campaigns/audience-editor';
import { DiffBlock, RegisterItem } from './data/document-control.models';
import { DiffView } from './history/diff-view';
import { DocumentRegisterPage } from './register/document-register';

/** Transloco with the global, kit and documents-scope English files. */
function transloco() {
  return TranslocoTestingModule.forRoot({
    langs: { en, 'kit/en': kitEn, 'documents/en': documentsEn },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });
}

const fakeAuth = {
  user: signal({ id: 'me', email: 'me@example.com', full_name: 'Me' }).asReadonly(),
  isAuthenticated: signal(false).asReadonly(),
};

/** TestBed for a documents component: http testing, org, router, auth and assistant stubs. */
function configure(component: unknown, permissions: readonly string[] = []) {
  TestBed.configureTestingModule({
    imports: [component as never, transloco()],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: KIT_BASE } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(KIT_ORG).asReadonly(),
          currentOrg: signal({ id: KIT_ORG, name: 'Org', roles: [], permissions }).asReadonly(),
        },
      },
      { provide: AskPanelService, useValue: { showWith: () => undefined } },
      { provide: AuthService, useValue: fakeAuth },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('AudienceEditor', () => {
  beforeEach(() => {
    configure(AudienceEditor);
  });

  it('adds a role and everyone, and removes entries', async () => {
    const fixture = TestBed.createComponent(AudienceEditor);
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const type = el.querySelector<HTMLSelectElement>('[data-testid="audience-type"]')!;
    type.value = 'role';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const value = el.querySelector<HTMLSelectElement>('[data-testid="audience-value"]')!;
    value.value = 'member';
    value.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="audience-add"] button')!.click();
    expect(emitted.at(-1)).toEqual([{ type: 'role', value: 'member' }]);

    fixture.componentRef.setInput('value', [{ type: 'role', value: 'member' }]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Role:');

    type.value = 'all';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="audience-add"] button')!.click();
    expect(emitted.at(-1)).toEqual([{ type: 'all' }]);
  });

  it('hides the controls when read-only', async () => {
    const fixture = TestBed.createComponent(AudienceEditor);
    fixture.componentRef.setInput('readOnly', true);
    fixture.componentRef.setInput('value', [{ type: 'all' }]);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="audience-add"]')).toBeNull();
    expect(el.textContent).toContain('Everyone who can read the document');
  });
});

describe('DiffView', () => {
  beforeEach(() => {
    configure(DiffView);
  });

  it('marks inserted, deleted and changed text and expands unchanged runs', async () => {
    const blocks: DiffBlock[] = [
      { op: 'equal', before: ['a', 'b', 'c', 'd', 'e'], after: ['a', 'b', 'c', 'd', 'e'] },
      { op: 'insert', before: [], after: ['New paragraph'] },
      {
        op: 'replace',
        before: ['Old words'],
        after: ['New words'],
        segments: [
          { op: 'delete', text: 'Old' },
          { op: 'insert', text: 'New' },
          { op: 'equal', text: ' words' },
        ],
      },
    ];
    const fixture = TestBed.createComponent(DiffView);
    fixture.componentRef.setInput('blocks', blocks);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('ins')?.textContent).toContain('New paragraph');
    expect(el.querySelectorAll('del').length).toBe(1);
    expect(el.textContent).toContain('3 unchanged paragraphs');

    el.querySelector<HTMLButtonElement>('li button')!.click();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('unchanged paragraphs');
    expect(el.querySelectorAll('li').length).toBe(7);
  });
});

describe('DocumentRegisterPage', () => {
  const row = (over: Partial<RegisterItem>): RegisterItem => ({
    kind: 'document',
    id: 'd1',
    code: 'PR-001',
    title: 'Handling complaints',
    type: 'procedure',
    type_name: 'Procedure',
    status: 'approved',
    revision: '2',
    approved_at: '2026-10-01T10:00:00',
    owner: { id: 'u1', name: 'Kari' },
    next_review_at: '2027-10-01',
    review_overdue: false,
    acknowledgement_required: true,
    open_campaigns: 1,
    retention_rule: null,
    retention_until: null,
    publisher: null,
    updated_at: '2026-10-01T10:00:00',
    url: '/documents/d1',
    ...over,
  });

  it('loads the master list with external documents and renders rows', async () => {
    const http = configure(DocumentRegisterPage, ['documents:read']);
    const fixture = TestBed.createComponent(DocumentRegisterPage);
    fixture.detectChanges();
    await tick();

    const req = http.expectOne((r) => r.url === kitUrl('document-register'));
    expect(req.request.params.get('include_external')).toBe('true');
    expect(req.request.params.get('sort')).toBe('code');
    req.flush({
      items: [
        row({}),
        row({
          kind: 'external_document',
          id: 'x1',
          code: null,
          title: 'ISO 9001:2015',
          status: 'current',
          publisher: 'ISO',
          url: '/documents/external/x1',
          open_campaigns: 0,
          acknowledgement_required: false,
        }),
      ],
      total: 2,
    });
    for (const types of http.match((r) => r.url === kitUrl('document-types'))) {
      types.flush([]);
    }
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    const rows = el.querySelectorAll('[data-testid="register-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('PR-001');
    expect(rows[0].textContent).toContain('Open campaigns: 1');
    expect(rows[1].textContent).toContain('External');
    expect(rows[1].querySelector('a')?.getAttribute('href')).toBe('/documents/external/x1');
  });
});
