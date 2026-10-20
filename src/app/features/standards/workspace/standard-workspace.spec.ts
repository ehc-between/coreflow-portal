import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { computeRollup } from '../../../core/standards/standards-data';
import {
  ClauseNode,
  Requirement,
  RequirementDetail,
  RequirementStatus,
  StandardSummary,
} from '../../../core/standards/standards.models';
import { StandardWorkspace } from './standard-workspace';
import { tocDomId, workspaceMatcher } from './workspace-data';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const KEY = 'iso';
const tick = () => new Promise((resolve) => setTimeout(resolve));

@Component({ template: '' })
class PageStub {}

function req(ref: string, status: RequirementStatus): Requirement {
  return {
    ref,
    text: { en: `Requirement ${ref}`, nb: `Krav ${ref}` },
    evidence_examples: null,
    status,
    applicable: true,
    justification: null,
    confirmed_links: [],
    suggested_links: [],
    status_override: null,
    note: null,
  };
}

function node(number: string, over: Partial<ClauseNode> = {}): ClauseNode {
  const base: ClauseNode = {
    number,
    title: { en: `Clause ${number}`, nb: `Klausul ${number}` },
    kind: 'clause',
    theme: null,
    summary: { en: `About ${number}`, nb: `Om ${number}` },
    guidance: null,
    rollup: { applicable: 0, covered: 0, partial: 0, not_started: 0, pct: 0 },
    children: [],
    requirements: [],
    ...over,
  };
  return { ...base, rollup: computeRollup(base) };
}

const TREE: ClauseNode[] = [
  node('4', {
    children: [
      node('4.1', { requirements: [req('iso:4.1.r1', 'covered')] }),
      node('4.2', { requirements: [req('iso:4.2.r1', 'partial')] }),
    ],
  }),
  node('6', { requirements: [req('iso:6.r1', 'covered')] }),
  node('A', {
    children: [
      node('A.5', {
        theme: 'organizational',
        children: [
          node('A.5.1', {
            kind: 'annex_control',
            theme: 'organizational',
            requirements: [req('iso:A.5.1.r1', 'not_started')],
          }),
        ],
      }),
    ],
  }),
];

const STANDARD: StandardSummary = {
  key: KEY,
  name: 'ISO Test',
  edition: '2022',
  enabled: true,
  org_standard_id: null,
  has_licensed_text: false,
  completeness: {
    applicable: 4,
    covered: 2,
    partial: 1,
    not_started: 1,
    not_applicable: 0,
    pct: 50,
  },
};

describe('StandardWorkspace', () => {
  let fixture: ComponentFixture<StandardWorkspace>;
  let http: HttpTestingController;
  let el: HTMLElement;

  async function render(): Promise<void> {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function setup(number?: string, reqRef?: string): Promise<void> {
    TestBed.configureTestingModule({
      imports: [StandardWorkspace, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'standards', children: [{ matcher: workspaceMatcher, component: PageStub }] },
        ]),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: BASE, i18n: { availableLanguages: ['en', 'nb'] } },
        },
        { provide: AuthService, useValue: { orgs: signal({}).asReadonly() } },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal(ORG).asReadonly(),
            currentOrg: signal({
              id: ORG,
              name: 'Org',
              roles: [],
              permissions: ['standards:read', 'standards:manage'],
            }).asReadonly(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(StandardWorkspace);
    fixture.componentRef.setInput('key', KEY);
    if (number) {
      fixture.componentRef.setInput('number', number);
    }
    if (reqRef) {
      fixture.componentRef.setInput('req', reqRef);
    }
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
    http.expectOne(`${ROOT}/standards`).flush([STANDARD]);
    http.expectOne(`${ROOT}/standards/${KEY}/tree`).flush(TREE);
    el = fixture.nativeElement as HTMLElement;
    await render();
    await render();
  }

  afterEach(() => http.verify());

  const tocEntry = (number: string) => el.querySelector<HTMLAnchorElement>(`#${tocDomId(number)}`);
  const current = () => el.querySelector('nav [aria-current="location"]')?.id ?? null;
  const tocNumbers = () =>
    Array.from(el.querySelectorAll('nav a[id^="toc-"]')).map((a) => a.id.replace('toc-', ''));

  it('renders the whole standard as a TOC and opens a deep link at its section', async () => {
    await setup('4.2');
    // Path to 4.2 auto-expanded; the other chapters stay collapsed.
    expect(tocNumbers()).toEqual(['4', '4_1', '4_2', '6', 'A']);
    expect(current()).toBe(tocDomId('4.2'));
    // Chapter coverage % on the top-level entry (1 of 2 covered).
    expect(tocEntry('4')?.textContent).toContain('50%');
    // Every section of the document is rendered in order (no IntersectionObserver in tests).
    const sections = Array.from(el.querySelectorAll('section[id^="sec-"]')).map((s) => s.id);
    expect(sections).toEqual([
      'sec-4',
      'sec-4_1',
      'sec-4_2',
      'sec-6',
      'sec-A',
      'sec-A_5',
      'sec-A_5_1',
    ]);
    // Breadcrumb: chapter › clause.
    const crumbs = el.querySelector('header nav ol')?.textContent?.replace(/\s+/g, ' ');
    expect(crumbs).toContain('4 Clause 4');
    expect(crumbs).toContain('4.2 Clause 4.2');
  });

  it('navigates from the TOC: highlights the entry and pushes the section URL', async () => {
    await setup();
    tocEntry('6')!.click();
    await render();
    expect(current()).toBe(tocDomId('6'));
    expect(TestBed.inject(Router).url).toBe(`/standards/${KEY}/6`);
  });

  it('moves to the next / previous section with j / k (document order into Annex A)', async () => {
    await setup('6');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    await render();
    expect(current()).toBe(tocDomId('A'));
    expect(TestBed.inject(Router).url).toBe(`/standards/${KEY}/A`);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    await render();
    expect(current()).toBe(tocDomId('6'));
  });

  it('follows the URL when it changes from outside (back / forward)', async () => {
    await setup('4.1');
    fixture.componentRef.setInput('number', 'A.5.1');
    await render();
    expect(current()).toBe(tocDomId('A.5.1'));
    // The path to the control is expanded in the TOC.
    expect(tocNumbers()).toEqual(expect.arrayContaining(['A', 'A_5', 'A_5_1']));
  });

  it('expands and highlights a deep-linked requirement (?req=)', async () => {
    await setup('A.5.1', 'iso:A.5.1.r1');
    expect(current()).toBe(tocDomId('A.5.1'));
    const row = el.querySelector('#sec-A_5_1 app-requirement-row');
    expect(row?.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(row?.querySelector('.ring-2')).not.toBeNull();
    expect(row?.querySelector('app-requirement-card')).not.toBeNull();
  });

  it('filters the TOC and the document to gaps', async () => {
    await setup();
    el.querySelector<HTMLButtonElement>('button[role="switch"]')!.click();
    await render();
    const sections = Array.from(el.querySelectorAll('section[id^="sec-"]')).map((s) => s.id);
    expect(sections).toEqual(['sec-4', 'sec-4_2', 'sec-A', 'sec-A_5', 'sec-A_5_1']);
    expect(tocNumbers()).not.toContain('6');
  });

  it('saves an assessment inline and updates the TOC roll-up immediately', async () => {
    await setup('4.2');
    const row = el.querySelector<HTMLButtonElement>('#sec-4_2 app-requirement-row button')!;
    row.click();
    await render();
    const assess = Array.from(el.querySelectorAll<HTMLButtonElement>('#sec-4_2 button')).find((b) =>
      b.textContent?.includes('standards.requirement.assess'),
    )!;
    assess.click();
    await render();
    const select = el.querySelector<HTMLSelectElement>('#sec-4_2 select')!;
    select.value = 'covered';
    select.dispatchEvent(new Event('change'));
    await render();
    const save = Array.from(
      el.querySelectorAll<HTMLButtonElement>('#sec-4_2 app-button button'),
    ).find((b) => b.textContent?.includes('standards.requirement.save'))!;
    save.click();

    const patch = http.expectOne((r) => r.method === 'PATCH');
    expect(patch.request.url).toBe(`${ROOT}/standard-requirements/iso%3A4.2.r1`);
    expect(patch.request.body).toMatchObject({ applicable: true, status_override: 'covered' });
    const saved: RequirementDetail = {
      ...req('iso:4.2.r1', 'covered'),
      status_override: 'covered',
      links: [],
    };
    patch.flush(saved);
    await render();

    expect(tocEntry('4')?.textContent).toContain('100%');
    expect(tocEntry('4.2')?.querySelector('.bg-pass')).not.toBeNull();
    expect(el.querySelector('#sec-4_2 app-requirement-row')?.textContent).toContain(
      'standards.status.covered',
    );
  });
});
