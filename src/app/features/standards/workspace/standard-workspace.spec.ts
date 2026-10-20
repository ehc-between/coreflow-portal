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
  RequirementLink,
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
  /** What the mocked API answers for the standard and its tree (tests may override). */
  let fixtureStandard: StandardSummary = STANDARD;
  let fixtureTree: ClauseNode[] = TREE;

  beforeEach(() => {
    fixtureStandard = STANDARD;
    fixtureTree = TREE;
  });

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
    await mount(number, reqRef);
  }

  /** Create the workspace (again) and answer its two loads. */
  async function mount(number?: string, reqRef?: string): Promise<void> {
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
    http.expectOne(`${ROOT}/standards`).flush([fixtureStandard]);
    http.expectOne(`${ROOT}/standards/${KEY}/tree`).flush(fixtureTree);
    el = fixture.nativeElement as HTMLElement;
    await render();
    await render();
  }

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

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

  const expandButton = (number: string) =>
    tocEntry(number)!.parentElement!.querySelector<HTMLButtonElement>('button[aria-expanded]')!;

  it('keeps the TOC where it is when entries are toggled; reveals only a new current section', async () => {
    await setup('4.2');
    const nav = el.querySelector<HTMLElement>('app-standard-toc nav')!;
    const writes: number[] = [];
    let top = 0;
    Object.defineProperty(nav, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        writes.push(value);
        top = value;
      },
    });
    // Every TOC entry reports itself far below the visible part of the list.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return (
        this.id.startsWith('toc-')
          ? { top: 900, bottom: 920, height: 20, left: 0, right: 0, width: 0 }
          : { top: 0, bottom: 300, height: 300, left: 0, right: 0, width: 0 }
      ) as DOMRect;
    });

    expandButton('A').click();
    await render();
    expandButton('4').click();
    await render();
    expect(writes).toEqual([]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    await render();
    expect(current()).toBe(tocDomId('6'));
    expect(writes.length).toBeGreaterThan(0);
  });

  it('opens only the current path in the TOC and keeps what the user expanded', async () => {
    await setup('4.2');
    expandButton('A').click();
    await render();
    expect(tocNumbers()).toEqual(['4', '4_1', '4_2', '6', 'A', 'A_5']);
    tocEntry('6')!.click();
    await render();
    // Chapter 4 closes behind the reader; Annex A stays open.
    expect(tocNumbers()).toEqual(['4', '6', 'A', 'A_5']);
  });

  it('restores the expanded requirement after Back from an evidence link', async () => {
    await setup('4.2');
    el.querySelector<HTMLButtonElement>('#sec-4_2 app-requirement-row button')!.click();
    await render();
    fixture.destroy();

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'currentNavigation').mockReturnValue({ trigger: 'popstate' } as never);
    await mount('4.2');
    expect(current()).toBe(tocDomId('4.2'));
    expect(
      el.querySelector('#sec-4_2 app-requirement-row button[aria-expanded="true"]'),
    ).not.toBeNull();
  });

  it('does not restore on a fresh visit (not back / forward)', async () => {
    await setup('4.2');
    el.querySelector<HTMLButtonElement>('#sec-4_2 app-requirement-row button')!.click();
    await render();
    fixture.destroy();
    await mount('4.2');
    expect(
      el.querySelector('#sec-4_2 app-requirement-row button[aria-expanded="true"]'),
    ).toBeNull();
  });

  it('resizes the TOC with arrows, Home and End', async () => {
    await setup();
    const handle = el.querySelector<HTMLElement>('[role="separator"]')!;
    const key = async (k: string) => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
      await render();
      return handle.getAttribute('aria-valuenow');
    };
    expect(await key('End')).toBe('520');
    expect(await key('ArrowLeft')).toBe('504');
    expect(await key('Home')).toBe('240');
  });

  it('opens the TOC as a modal drawer on small screens', async () => {
    const view = window as unknown as { matchMedia?: unknown };
    const original = view.matchMedia;
    view.matchMedia = () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    try {
      await setup();
      const aside = el.querySelector<HTMLElement>('#standard-toc')!;
      expect(aside.hasAttribute('inert')).toBe(true);
      el.querySelector<HTMLButtonElement>('header button[aria-controls="standard-toc"]')!.click();
      await render();
      expect(aside.getAttribute('role')).toBe('dialog');
      expect(aside.getAttribute('aria-modal')).toBe('true');
      expect(aside.hasAttribute('inert')).toBe(false);
      expect(aside.nextElementSibling?.hasAttribute('inert')).toBe(true);
      // j / k stay off while the drawer is open.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
      await render();
      expect(current()).toBe(tocDomId('4'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      await render();
      expect(aside.getAttribute('role')).toBeNull();
      expect(aside.hasAttribute('inert')).toBe(true);
    } finally {
      view.matchMedia = original;
    }
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

  // --- AI suggestions & mapping status ----------------------------------------

  const suggestion: RequirementLink = {
    id: 'l-1',
    requirement_ref: 'iso:4.1.r1',
    standard_key: KEY,
    clause_number: '4.1',
    entity_type: 'document',
    entity_id: 'd-1',
    entity_label: 'Quality policy',
    status: 'suggested',
    source: 'ai',
    confidence: 0.8,
    rationale: 'Mentions the policy',
    created_at: '2026-10-01T00:00:00Z',
  };

  /** TREE with an AI suggestion on 4.1's requirement. */
  function treeWithSuggestion(): ClauseNode[] {
    const [four, ...rest] = TREE;
    const [c41, c42] = four.children;
    const r41 = { ...c41.requirements[0], suggested_links: [suggestion] };
    return [{ ...four, children: [{ ...c41, requirements: [r41] }, c42] }, ...rest];
  }

  const sectionIds = () => Array.from(el.querySelectorAll('section[id^="sec-"]')).map((s) => s.id);

  it('badges a requirement with pending AI suggestions and highlights them when expanded', async () => {
    fixtureTree = treeWithSuggestion();
    await setup('4.1');
    const row = el.querySelector('#sec-4_1 app-requirement-row')!;
    expect(row.querySelector('[data-testid="ai-suggestion-badge"]')?.textContent).toContain(
      'standards.ai.suggestionBadge',
    );
    row.querySelector<HTMLButtonElement>('button')!.click();
    await render();
    const block = row.querySelector('[data-testid="ai-suggestions"]')!;
    expect(block.textContent).toContain('Quality policy');
    expect(block.textContent).toContain('standards.suggestions.confirm');
    // The AI help section sits right in the row.
    expect(row.querySelector('app-requirement-ai-help [data-testid="ai-help"]')).not.toBeNull();
  });

  it('filters the TOC and the document to requirements with AI suggestions', async () => {
    fixtureTree = treeWithSuggestion();
    await setup();
    const filter = el.querySelector<HTMLElement>('[data-testid="filter-suggestions"]')!;
    expect(filter.textContent).toContain('1');
    filter.querySelector('button')!.click();
    await render();
    expect(sectionIds()).toEqual(['sec-4', 'sec-4_1']);
    expect(tocNumbers()).toEqual(['4', '4_1']);
    expect(filter.querySelector('button')?.getAttribute('aria-checked')).toBe('true');
  });

  it('shows the empty message when no requirement has AI suggestions', async () => {
    await setup();
    el.querySelector<HTMLButtonElement>('[data-testid="filter-suggestions"] button')!.click();
    await render();
    expect(sectionIds()).toEqual([]);
    expect(el.textContent).toContain('standards.workspace.noAiSuggestions');
  });

  it('shows no mapping status when the API does not report last_mapping', async () => {
    await setup();
    expect(el.querySelector('app-mapping-status')).toBeNull();
  });

  it('never mapped: the banner maps the existing documents in one click', async () => {
    fixtureStandard = { ...STANDARD, last_mapping: null };
    await setup();
    expect(el.querySelector('[data-testid="mapping-never"]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid="mapping-never"] app-button button')!.click();
    const start = http.expectOne(`${ROOT}/standards/${KEY}/ai-map`);
    expect(start.request.body).toEqual({});
    start.flush({ job_id: 'j-9' });
    await render();
    expect(el.querySelector('app-standard-job-progress')).not.toBeNull();
    expect(el.querySelector('app-mapping-status')).toBeNull();
  });

  it('watches a running (auto-queued) mapping and then shows when it was last mapped', async () => {
    fixtureStandard = {
      ...STANDARD,
      last_mapping: { job_id: 'j-7', status: 'running', finished_at: null, suggestions_created: 0 },
    };
    await setup();
    await render();
    http.expectOne(`${ROOT}/standard-jobs/j-7`).flush({
      id: 'j-7',
      kind: 'ai_map',
      status: 'done',
      progress: 100,
      suggestions_created: 1,
      scope: 'standard',
    });
    await render();
    // Done: the workspace reloads the standard + tree.
    http.expectOne(`${ROOT}/standards`).flush([
      {
        ...STANDARD,
        last_mapping: {
          job_id: 'j-7',
          status: 'done',
          finished_at: '2026-10-19T08:00:00Z',
          suggestions_created: 1,
        },
      },
    ]);
    http.expectOne(`${ROOT}/standards/${KEY}/tree`).flush(treeWithSuggestion());
    await render();
    expect(el.querySelector('app-standard-job-progress')).toBeNull();
    const done = el.querySelector('[data-testid="mapping-done"]')!;
    expect(done.textContent).toContain('standards.mapping.lastMapped');
    // "Show requirements with suggestions" turns the filter on.
    done.querySelector<HTMLButtonElement>('[data-testid="mapping-show-suggestions"]')!.click();
    await render();
    expect(sectionIds()).toEqual(['sec-4', 'sec-4_1']);
  });
});
