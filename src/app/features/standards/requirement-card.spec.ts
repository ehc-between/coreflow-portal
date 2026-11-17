import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { SearchItem } from '../../core/search/search.models';
import {
  EvidenceLink,
  RequirementDetail,
  RequirementEvidence,
} from '../../core/standards/standards.models';
import { groupHits } from './evidence-picker';
import { RequirementCard, evidenceByModule } from './requirement-card';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}`;
const REF = 'iso27001-2022:A.8.13.r1';
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function evidenceLink(id: string, module: string, over: Partial<EvidenceLink> = {}): EvidenceLink {
  return {
    id,
    status: 'confirmed',
    origin: 'manual',
    origin_field: null,
    confidence: null,
    rationale: null,
    entity: {
      entity_type: module === 'risk' ? 'risk' : 'document',
      entity_id: `${id}-rec`,
      title: `Record ${id}`,
      code: id.toUpperCase(),
      url: `/${module}/${id}`,
      status: null,
      module,
      label_key: null,
    },
    ...over,
  };
}

function evidence(over: Partial<RequirementEvidence> = {}): RequirementEvidence {
  return {
    requirement: {
      ref: REF,
      label: null,
      text: { en: 'Backups exist' },
      evidence_examples: null,
      clause_number: 'A.8.13',
      clause_title: { en: 'Information backup', nb: 'Sikkerhetskopiering' },
      standard_key: 'iso27001-2022',
      framework: 'iso27001',
      applicable: true,
      justification: null,
    },
    status: 'covered',
    links: [
      evidenceLink('d1', 'documents'),
      evidenceLink('r1', 'risk', { origin: 'field', origin_field: 'control_refs' }),
      evidenceLink('r2', 'risk'),
      evidenceLink('s1', 'risk', { status: 'suggested', origin: 'ai', confidence: 0.8 }),
    ],
    by_module: [
      { module: 'risk', count: 2 },
      { module: 'documents', count: 1 },
    ],
    can_be_evidenced_by: [
      {
        module: 'continuity',
        entity_type: 'continuity_plan',
        label_key: 'modules.entities.continuity_plan',
        create_url: `/continuity/plans/new?fromRequirement=${REF}`,
        enabled: true,
        can_create: true,
      },
      {
        module: 'risk',
        entity_type: 'risk_treatment',
        label_key: 'modules.entities.risk_treatment',
        create_url: null,
        enabled: true,
        can_create: false,
      },
      {
        module: 'hse',
        entity_type: 'sja',
        label_key: 'modules.entities.sja',
        create_url: '/hse/sja/new',
        enabled: false,
      },
    ],
    mappings: [],
    ...over,
  };
}

const REQUIREMENT: RequirementDetail = {
  ref: REF,
  text: { en: 'Backups exist', nb: 'Sikkerhetskopier finnes' },
  evidence_examples: null,
  status: 'covered',
  applicable: true,
  justification: null,
  confirmed_links: [],
  suggested_links: [],
  status_override: null,
  note: null,
  links: [],
};

describe('evidenceByModule', () => {
  it('groups confirmed links by module in the order of by_module', () => {
    const groups = evidenceByModule(evidence());
    expect(groups.map((g) => [g.module, g.links.map((l) => l.id)])).toEqual([
      ['risk', ['r1', 'r2']],
      ['documents', ['d1']],
    ]);
    expect(evidenceByModule(null)).toEqual([]);
  });

  it('groups picker hits by module', () => {
    const hit = (id: string, module: string) => ({ entity_id: id, module }) as SearchItem;
    expect(
      groupHits([hit('a', 'risk'), hit('b', 'documents'), hit('c', 'risk')]).map((g) => g.key),
    ).toEqual(['risk', 'documents']);
  });
});

describe('RequirementCard', () => {
  async function setup(permissions: string[]) {
    TestBed.configureTestingModule({
      imports: [RequirementCard, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: BASE, i18n: { availableLanguages: ['en'] } },
        },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal(ORG).asReadonly(),
            currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(RequirementCard);
    fixture.componentRef.setInput('requirement', REQUIREMENT);
    fixture.componentRef.setInput('canManage', permissions.includes('standards:manage'));
    fixture.componentRef.setInput('embedded', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http
      .match((r) => r.url.endsWith('/entity-types'))
      .forEach((r) => r.flush({ items: [], link_types: [] }));
    const el = fixture.nativeElement as HTMLElement;
    const render = async (ms = 0) => {
      await tick(ms);
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, http, el, render };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows evidence from every module, suggestions, and what could document the requirement', async () => {
    const { http, el, render } = await setup(['standards:read', 'standards:manage']);
    http
      .expectOne(`${ROOT}/standard-requirements/iso27001-2022%3AA.8.13.r1/evidence?lang=en`)
      .flush(evidence());
    await render();
    const modules = el.querySelectorAll('[data-testid="evidence-module"]');
    expect(modules).toHaveLength(2);
    expect(modules[0].querySelectorAll('app-entity-chip')).toHaveLength(2);
    // A field link cannot be removed here; a manual one can.
    expect(modules[0].querySelectorAll('button[aria-label]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="ai-suggestions"]')?.textContent).toContain(
      'standards.reqs.card.suggestions',
    );
    // Enabled types first; "Opprett" only with a create page and permission.
    const types = el.querySelectorAll('[data-testid="evidencing-type"]');
    expect(types).toHaveLength(3);
    expect(types[0].querySelector('[data-testid="create-evidence"]')?.getAttribute('href')).toBe(
      `/continuity/plans/new?fromRequirement=${REF}`,
    );
    expect(types[1].querySelector('[data-testid="create-evidence"]')).toBeNull();
    expect(types[1].querySelector('[data-testid="link-existing"]')).not.toBeNull();
    expect(types[2].textContent).toContain('standards.support.moduleOff');
    expect(types[2].querySelector('[data-testid="link-existing"]')).toBeNull();
  });

  it('opens the record form from "Opprett" in the app', async () => {
    const { http, el, render } = await setup(['standards:read']);
    http.expectOne((r) => r.url.endsWith('/evidence')).flush(evidence());
    await render();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    el.querySelector<HTMLAnchorElement>('[data-testid="create-evidence"]')!.click();
    expect(spy).toHaveBeenCalledWith(`/continuity/plans/new?fromRequirement=${REF}`);
    // Read-only: no link / remove actions.
    expect(el.querySelector('[data-testid="link-existing"]')).toBeNull();
    expect(el.querySelector('[data-testid="add-evidence"]')).toBeNull();
  });

  it('links an existing record of one type from "Koble eksisterende" and reloads', async () => {
    const { http, el, render, fixture } = await setup(['standards:read', 'standards:manage']);
    http.expectOne((r) => r.url.endsWith('/evidence')).flush(evidence());
    await render();
    let changed = 0;
    fixture.componentInstance.linksChanged.subscribe(() => changed++);
    el.querySelectorAll<HTMLButtonElement>('[data-testid="link-existing"]')[0].click();
    await render();
    const picker = el.querySelector('[data-testid="evidence-picker"]')!;
    const active = picker.querySelector('[aria-pressed="true"]');
    expect(active?.textContent).not.toContain('standards.reqs.evidence.allTypes');
    const box = picker.querySelector<HTMLInputElement>('[data-testid="evidence-query"]')!;
    box.value = 'order';
    box.dispatchEvent(new Event('input'));
    await render(300);
    const search = http.expectOne((r) => r.url === `${ROOT}/search`);
    expect(search.request.params.get('types')).toBe('continuity_plan');
    search.flush({
      items: [
        {
          entity_type: 'continuity_plan',
          entity_id: 'p-1',
          title: 'Order plan',
          code: 'BCP-1',
          snippet: null,
          url: '/continuity/plans/p-1',
          rank: 1,
          updated_at: null,
          module: 'continuity',
          label_key: 'modules.entities.continuity_plan',
        },
        {
          entity_type: 'standard_requirement',
          entity_id: 'x',
          title: 'Not evidence',
          code: null,
          snippet: null,
          url: null,
          rank: 1,
          updated_at: null,
          module: 'standards',
          label_key: 'x',
        },
      ],
      counts: {},
    });
    await render();
    const results = el.querySelectorAll<HTMLButtonElement>('[data-testid="evidence-result"]');
    expect(results).toHaveLength(1);
    results[0].click();
    await render();
    const create = http.expectOne(
      (r) => r.url === `${ROOT}/requirement-links` && r.method === 'POST',
    );
    expect(create.request.body).toEqual({
      requirement_ref: REF,
      entity_type: 'continuity_plan',
      entity_id: 'p-1',
    });
    create.flush({});
    await render();
    http.expectOne((r) => r.url.endsWith('/evidence')).flush(evidence());
    await render();
    expect(changed).toBe(1);
  });
});
