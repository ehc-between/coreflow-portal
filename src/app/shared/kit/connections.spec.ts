import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ConnectionGraph, ConnectionsResponse, GraphNode } from '../../core/kit/connections.models';
import { ConnectionCountsService } from '../../core/kit/connection-counts.service';
import { ConnectionMap, ROW_STEP, layoutGraph, rowCentre } from './connection-map';
import { ConnectionCount } from './connection-count';
import { ConnectionsPanel } from './connections-panel';
import { fromLinks, normalize } from './connections-store';
import { flowLabelKey, flowSourceType, originKey, suggestionReasonKey } from './kit-format';
import { configureKit, flushEntityTypes, kitUrl, tick } from './kit.testing';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
  await fixture.whenStable();
}

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  const [entity_type, entity_id] = id.split(':');
  return {
    id,
    kind: 'record',
    depth: 1,
    entity_type,
    entity_id,
    title: `Title ${entity_id}`,
    code: entity_id.toUpperCase(),
    url: `/x/${entity_id}`,
    status: null,
    module: null,
    label_key: null,
    ...overrides,
  };
}

const GRAPH: ConnectionGraph = {
  nodes: [
    node('deviation:d1', { depth: 0, title: 'Late delivery', code: 'AVV-3' }),
    node('standard_requirement:q1', {
      kind: 'requirement',
      framework: 'iso9001',
      code: '8.4.1',
      title: 'External providers',
      ref: 'iso9001-2026:8.4.1.r1',
    }),
    node('standard_requirement:q2', {
      kind: 'requirement',
      framework: 'iso9001',
      code: '8.4.1',
      title: 'External providers',
      ref: 'iso9001-2026:8.4.1.r2',
    }),
    node('user:u1', { kind: 'person', title: 'Emma', code: null, url: null }),
    node('risk:r1'),
    node('task:t1', { kind: 'task' }),
    node('supplier:s1', { depth: 2 }),
    node('user:u2', { kind: 'person', title: 'Lars', code: null, url: null }),
  ],
  edges: [
    {
      from: 'deviation:d1',
      to: 'standard_requirement:q1',
      link_type: 'evidence_for',
      origin: 'requirement_suggested',
    },
    {
      from: 'deviation:d1',
      to: 'standard_requirement:q2',
      link_type: 'evidence_for',
      origin: 'requirement_confirmed',
    },
    { from: 'deviation:d1', to: 'user:u1', link_type: 'owned_by', origin: 'structural' },
    { from: 'deviation:d1', to: 'risk:r1', link_type: 'relates_to', origin: 'flow' },
    { from: 'task:t1', to: 'deviation:d1', link_type: 'relates_to', origin: 'structural' },
    { from: 'risk:r1', to: 'supplier:s1', link_type: 'relates_to', origin: 'user' },
    { from: 'risk:r1', to: 'user:u2', link_type: 'owned_by', origin: 'structural' },
  ],
};

describe('kit-format (connections)', () => {
  it('names reasons, origins and flows', () => {
    expect(suggestionReasonKey('same_control')).toBe('kit.connections.reasons.same_control');
    expect(suggestionReasonKey('brand_new_rule')).toBe('kit.connections.reasons.other');
    expect(originKey('user')).toBeNull();
    expect(originKey('auto')).toBe('kit.connections.origin.auto');
    expect(flowLabelKey('flows.deviation.to_risk', 'deviation.to_risk')).toBe(
      'kit.flows.deviation.to_risk',
    );
    expect(flowLabelKey('flows.requirement.evidence', 'requirement.evidence:risk')).toBe(
      'kit.flows.requirement.evidence',
    );
    expect(flowSourceType('obligation.to_policy')).toBe('compliance_obligation');
    expect(flowSourceType('audit_finding.to_risk')).toBe('audit_finding');
  });

  it('tolerates partial connection bodies and old link lists', () => {
    const res = normalize({ groups: [] } as unknown as ConnectionsResponse);
    expect(res.counts).toEqual({ records: 0, requirements: 0, tasks: 0, suggestions: 0 });
    expect(res.suggestions).toEqual([]);
    const other = {
      entity_type: 'task',
      entity_id: 't1',
      title: 'Follow up',
      code: null,
      url: null,
      status: null,
      module: 'tasks',
      label_key: null,
    };
    const links = fromLinks({
      items: [
        {
          id: 'l1',
          link_type: 'relates_to',
          direction: 'outgoing',
          other,
          created_at: '',
          created_by: null,
        },
        {
          id: 'l2',
          link_type: 'caused_by',
          direction: 'incoming',
          other: { ...other, entity_type: 'risk', entity_id: 'r1' },
          created_at: '',
          created_by: null,
        },
      ],
    });
    expect(links.groups.map((g) => g.entity_type)).toEqual(['risk', 'task']);
    expect(links.counts).toEqual({ records: 1, requirements: 0, tasks: 1, suggestions: 0 });
  });
});

describe('layoutGraph', () => {
  it('puts requirements left, the record and its people in the middle, neighbours right', () => {
    const layout = layoutGraph(GRAPH)!;
    const ids = (col: keyof typeof layout.columns) => layout.columns[col].map((p) => p.node.id);
    expect(ids('requirements')).toEqual(['standard_requirement:q1', 'standard_requirement:q2']);
    expect(ids('record')).toEqual(['deviation:d1', 'user:u1']);
    expect(ids('related')).toEqual(['risk:r1', 'task:t1']);
    expect(ids('further')).toEqual(['supplier:s1', 'user:u2']);
    expect(layout.height).toBe(2 * ROW_STEP - (ROW_STEP - 44));
  });

  it('centres short columns', () => {
    expect(rowCentre(0, 1, 96)).toBe(48);
    expect(rowCentre(1, 2, 96)).toBe(ROW_STEP + 22);
  });

  it('returns null without a root', () => {
    expect(layoutGraph({ nodes: [], edges: [] })).toBeNull();
  });
});

@Component({
  imports: [ConnectionMap],
  template: `<app-connection-map
    [open]="open()"
    entityType="deviation"
    entityId="d1"
    (closed)="open.set(false)"
  />`,
})
class MapHost {
  readonly open = signal(true);
}

describe('ConnectionMap', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    flushEntityTypes(http);
    http.verify();
  });

  it('draws the map, switches depth and closes on Escape', async () => {
    const { http } = configureKit(MapHost);
    const fixture = TestBed.createComponent(MapHost);
    await render(fixture);
    const req = http.expectOne((r) => r.url === kitUrl('connections/graph'));
    expect(req.request.params.get('depth')).toBe('1');
    expect(req.request.params.get('lang')).toBe('en');
    req.flush(GRAPH);
    await render(fixture);
    const map = document.querySelector('[data-testid="connection-map"]')!;
    expect(map.textContent).toContain('Requirements it documents');
    expect(map.textContent).toContain('ISO 9001');
    expect(map.textContent).toContain('Two steps away');
    // Desktop nodes plus the phone list.
    expect(map.querySelectorAll('[data-testid="map-node"]').length).toBe(8);
    // Two requirements under one clause never read the same.
    expect(map.textContent).toContain('8.4.1 (requirement 1)');
    expect(map.textContent).toContain('8.4.1 (requirement 2)');
    expect(map.querySelectorAll('path').length).toBeGreaterThanOrEqual(4);
    expect(map.querySelector('path[stroke-dasharray]')).not.toBeNull();

    // Arrow keys move between the boxes of a column.
    const risk = [...map.querySelectorAll<HTMLElement>('[data-testid="map-node"]')].find((n) =>
      n.textContent?.includes('R1'),
    )!;
    risk.focus();
    risk.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent).toContain('T1');

    map.querySelector<HTMLInputElement>('[data-testid="map-depth"]')!.click();
    await render(fixture);
    const deeper = http.expectOne((r) => r.url === kitUrl('connections/graph'));
    expect(deeper.request.params.get('depth')).toBe('2');
    deeper.flush(GRAPH);
    await render(fixture);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await render(fixture);
    expect(document.querySelector('[data-testid="connection-map"]')).toBeNull();
  });

  it('says when nothing is connected', async () => {
    const { http } = configureKit(MapHost);
    const fixture = TestBed.createComponent(MapHost);
    await render(fixture);
    http
      .expectOne((r) => r.url === kitUrl('connections/graph'))
      .flush({ nodes: [GRAPH.nodes[0]], edges: [] });
    await render(fixture);
    expect(document.querySelector('[data-testid="map-empty"]')?.textContent).toContain(
      'not connected to anything yet',
    );
  });
});

function panelResponse(): ConnectionsResponse {
  const other = {
    entity_type: 'risk',
    entity_id: 'r1',
    title: 'Loss of a key supplier',
    code: 'RSK-3',
    url: '/risk/risks/r1',
    status: 'open',
    module: 'risk',
    label_key: null,
  };
  return {
    counts: { records: 7, requirements: 3, tasks: 1, suggestions: 1 },
    groups: [
      {
        module: 'risk',
        entity_type: 'risk',
        label_key: null,
        kind: 'record',
        count: 7,
        items: Array.from({ length: 7 }, (_, i) => ({
          link_id: `l${i}`,
          origin: i === 0 ? 'auto' : 'user',
          link_type: i === 1 ? 'mitigates' : 'relates_to',
          direction: 'outgoing' as const,
          flow_key: null,
          created_at: null,
          other: { ...other, entity_id: `r${i}`, code: `RSK-${i}` },
        })),
      },
    ],
    suggestions: [
      {
        id: 's1',
        reason: 'asset_named',
        confidence: 0.7,
        link_type: 'relates_to',
        direction: 'outgoing',
        other: {
          ...other,
          entity_type: 'asset',
          entity_id: 'a1',
          title: 'Backup server',
          code: 'AST-1',
        },
      },
    ],
    requirements: { confirmed: 3, suggested: 2 },
  };
}

describe('ConnectionsPanel', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    flushEntityTypes(http);
    http.verify();
  });

  async function setup(canEdit: boolean) {
    const kit = configureKit(ConnectionsPanel);
    const fixture = TestBed.createComponent(ConnectionsPanel);
    fixture.componentRef.setInput('entityType', 'deviation');
    fixture.componentRef.setInput('entityId', 'd1');
    fixture.componentRef.setInput('canEdit', canEdit);
    await render(fixture);
    return { ...kit, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('summarises, shows the first five and how they came about', async () => {
    const { http, fixture, el } = await setup(false);
    http.expectOne((r) => r.url === kitUrl('connections')).flush(panelResponse());
    await render(fixture);
    expect(el.querySelector('[data-testid="connections-summary"]')?.textContent?.trim()).toBe(
      '7 records · 3 requirements · 2 suggested requirements · 1 task',
    );
    expect(el.querySelectorAll('[data-testid="connection-row"]')).toHaveLength(5);
    expect(el.textContent).toContain('Automatic');
    expect(el.textContent).toContain('Mitigates');
    expect(el.querySelector('[data-testid="connections-show-all"]')?.textContent).toContain('8');
    // Read-only: no suggestions to decide, no link button.
    expect(el.querySelector('[data-testid="connections-suggestions"]')).toBeNull();
    expect(el.querySelector('[data-testid="connections-link"]')).toBeNull();
  });

  it('lets editors link a suggestion and asks the assistant about the record', async () => {
    const { http, fixture, el, ask } = await setup(true);
    http.expectOne((r) => r.url === kitUrl('connections')).flush(panelResponse());
    await render(fixture);
    const box = el.querySelector('[data-testid="connections-suggestions"]')!;
    expect(box.textContent).toContain('Names this asset');
    box.querySelector<HTMLElement>('button')!.click();
    http
      .expectOne((r) => r.url === kitUrl('link-suggestions/s1/accept'))
      .flush({ id: 's1', status: 'accepted', link_id: 'l9' });
    http
      .expectOne((r) => r.url === kitUrl('connections'))
      .flush({ ...panelResponse(), suggestions: [] });
    await render(fixture);
    expect(el.querySelector('[data-testid="connections-suggestions"]')).toBeNull();

    el.querySelector<HTMLElement>('[data-testid="connections-ask"]')?.click();
    expect(ask.prompts.at(-1)).toContain('record type deviation, id d1');
  });

  it('teaches when the record is not connected yet', async () => {
    const { http, fixture, el } = await setup(true);
    http
      .expectOne((r) => r.url === kitUrl('connections'))
      .flush({
        counts: { records: 0, requirements: 0, tasks: 0, suggestions: 0 },
        groups: [],
        suggestions: [],
        requirements: { confirmed: 0, suggested: 0 },
      });
    await render(fixture);
    expect(el.querySelector('[data-testid="connections-empty"]')?.textContent).toContain(
      'Link the documents, risks or deviations',
    );
    expect(el.querySelector('[data-testid="connections-show-all"]')).toBeNull();
  });
});

@Component({
  imports: [ConnectionCount],
  template: `@for (id of ids; track id) {
    <app-connection-count [count]="counts()[id]" />
  }`,
})
class CountHost {
  readonly ids = ['r1', 'r2'];
  readonly counts = TestBed.inject(ConnectionCountsService).load('risk', this.ids);
}

describe('ConnectionCountsService', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('batches the ids of a list and caches the result', async () => {
    const { http } = configureKit(CountHost);
    const fixture = TestBed.createComponent(CountHost);
    const req = http.expectOne((r) => r.url === kitUrl('connections/counts'));
    expect(req.request.params.get('ids')).toBe('r1,r2');
    req.flush({ items: { r1: 4 } });
    await render(fixture);
    const chips = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="connection-count"]',
      ),
    ];
    expect(chips.map((c) => c.getAttribute('title'))).toEqual([
      'Connected to 4 records',
      'Connected to 0 records',
    ]);
    // Cached: asking again does not call the server.
    TestBed.inject(ConnectionCountsService).load('risk', ['r1']);
    http.expectNone((r) => r.url === kitUrl('connections/counts'));
  });
});
