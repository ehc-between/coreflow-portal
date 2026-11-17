import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import {
  ConnectionItem,
  ConnectionsResponse,
  LinkSuggestionItem,
} from '../../core/kit/connections.models';
import { LinkItem } from '../../core/kit/kit.models';
import { configureKit, flushEntityTypes, kitUrl, tick } from './kit.testing';
import { RelatedItems } from './related-items';

const DOC = {
  entity_type: 'document',
  entity_id: 'doc1',
  title: 'Supplier procedure',
  code: 'PR-7',
  url: '/documents/doc1',
  status: 'approved',
  module: 'documents',
  label_key: 'modules.entities.document',
};

function item(overrides: Partial<ConnectionItem> = {}): ConnectionItem {
  return {
    link_id: 'l1',
    origin: 'user',
    link_type: 'caused_by',
    direction: 'outgoing',
    flow_key: null,
    created_at: '2026-11-01T10:00:00',
    other: DOC,
    ...overrides,
  };
}

function response(
  items: ConnectionItem[],
  suggestions: LinkSuggestionItem[] = [],
): ConnectionsResponse {
  const byType = new Map<string, ConnectionItem[]>();
  for (const i of items) {
    byType.set(i.other.entity_type, [...(byType.get(i.other.entity_type) ?? []), i]);
  }
  return {
    counts: { records: items.length, requirements: 0, tasks: 0, suggestions: suggestions.length },
    groups: [...byType.entries()].map(([type, list]) => ({
      module: list[0].other.module ?? '',
      entity_type: type,
      label_key: list[0].other.label_key,
      kind: 'record' as const,
      count: list.length,
      items: list,
    })),
    suggestions,
    requirements: { confirmed: 0, suggested: 0 },
  };
}

function link(overrides: Partial<LinkItem> = {}): LinkItem {
  return {
    id: 'l1',
    link_type: 'caused_by',
    direction: 'outgoing',
    other: DOC,
    created_at: '2026-11-01T10:00:00',
    created_by: { id: 'u1', name: 'Ada' },
    ...overrides,
  };
}

async function setup(canEdit = true) {
  const { http, ask } = configureKit(RelatedItems);
  const fixture: ComponentFixture<RelatedItems> = TestBed.createComponent(RelatedItems);
  fixture.componentRef.setInput('entityType', 'deviation');
  fixture.componentRef.setInput('entityId', 'd1');
  fixture.componentRef.setInput('canEdit', canEdit);
  await render(fixture);
  return { fixture, http, ask, el: fixture.nativeElement as HTMLElement };
}

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
  await fixture.whenStable();
}

function flushConnections(http: HttpTestingController, res: ConnectionsResponse) {
  http.expectOne((r) => r.url === kitUrl('connections') && r.method === 'GET').flush(res);
}

describe('RelatedItems', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    flushEntityTypes(http);
    http.verify();
  });

  it('teaches when nothing is connected', async () => {
    const { fixture, http, el } = await setup();
    flushConnections(http, response([]));
    await render(fixture);
    expect(el.querySelector('[data-testid="related-empty"]')?.textContent).toContain(
      'Auditors follow these links',
    );
  });

  it('groups connections by record type with relationship and origin', async () => {
    const { fixture, http, el } = await setup(false);
    flushConnections(
      http,
      response([
        item(),
        item({
          link_id: null,
          origin: 'structural',
          link_type: 'relates_to',
          other: { ...DOC, entity_id: 'doc2', title: 'Template', code: 'T-1' },
        }),
        item({
          link_id: 'l3',
          origin: 'flow',
          flow_key: 'deviation.to_risk',
          link_type: 'relates_to',
          other: {
            ...DOC,
            entity_type: 'risk',
            entity_id: 'r1',
            title: 'Late supplier',
            code: 'RSK-1',
            module: 'risk',
            label_key: null,
            url: '/risk/risks/r1',
          },
        }),
      ]),
    );
    await render(fixture);
    const headings = [...el.querySelectorAll('[data-testid="related-group"] h3')].map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Document · 2', 'Risk · 1']);
    expect(el.textContent).toContain('PR-7');
    expect(el.textContent).toContain('Approved');
    expect(el.querySelector('a[href="/documents/doc1"]')).not.toBeNull();
    const relations = [...el.querySelectorAll('[data-testid="link-relation"]')].map((r) =>
      r.textContent?.trim(),
    );
    expect(relations).toEqual(['Caused by']);
    const badges = [...el.querySelectorAll('[data-testid="origin-badge"]')].map((b) =>
      b.textContent?.split('.')[0].trim(),
    );
    expect(badges).toEqual(['Via field', 'Created from here']);
    // Read-only: no add / remove controls.
    expect(el.querySelector('[data-testid="related-add"]')).toBeNull();
    expect(el.querySelector('[aria-label^="Remove the link"]')).toBeNull();
  });

  it('never offers to remove a field relation', async () => {
    const { fixture, http, el } = await setup();
    flushConnections(http, response([item({ link_id: null, origin: 'structural' })]));
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="link"]')).toHaveLength(1);
    expect(el.querySelector('[aria-label^="Remove the link"]')).toBeNull();
  });

  it('removes a link after confirmation', async () => {
    const { fixture, http, el } = await setup();
    flushConnections(http, response([item()]));
    await render(fixture);
    el.querySelector<HTMLElement>('[aria-label="Remove the link to Supplier procedure"]')!.click();
    await render(fixture);
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Remove link')!
      .click();
    http
      .expectOne((r) => r.url === kitUrl('links/l1') && r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="link"]')).toHaveLength(0);
  });

  it('accepts and dismisses suggested links', async () => {
    const { fixture, http, el } = await setup();
    const suggestion = (id: string, title: string): LinkSuggestionItem => ({
      id,
      reason: 'same_control',
      confidence: 0.9,
      link_type: 'relates_to',
      direction: 'outgoing',
      other: { ...DOC, entity_id: id, title },
    });
    flushConnections(
      http,
      response([], [suggestion('s1', 'SoA A.8.13'), suggestion('s2', 'Other')]),
    );
    await render(fixture);
    expect(el.querySelector('[data-testid="related-suggestions"]')?.textContent).toContain(
      'Cites the same control',
    );

    el.querySelectorAll<HTMLElement>('[data-testid="suggestion"]')[1]
      .querySelectorAll<HTMLElement>('app-button button')[1]
      .click();
    http
      .expectOne((r) => r.url === kitUrl('link-suggestions/s2/dismiss'))
      .flush({ id: 's2', status: 'dismissed', link_id: null });
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="suggestion"]')).toHaveLength(1);

    el.querySelector<HTMLElement>('[data-testid="suggestion"] app-button button')!.click();
    http
      .expectOne((r) => r.url === kitUrl('link-suggestions/s1/accept') && r.method === 'POST')
      .flush({ id: 's1', status: 'accepted', link_id: 'l9' });
    // Accepting reloads, so the new link lands in its group.
    flushConnections(http, response([item({ link_id: 'l9', origin: 'auto' })]));
    await render(fixture);
    expect(el.querySelector('[data-testid="related-suggestions"]')).toBeNull();
    expect(el.querySelectorAll('[data-testid="link"]')).toHaveLength(1);
    expect(el.textContent).toContain('Automatic');
  });

  it('falls back to plain links on a server without connections', async () => {
    const { fixture, http, el } = await setup(false);
    http
      .expectOne((r) => r.url === kitUrl('connections'))
      .flush({ detail: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    http.expectOne((r) => r.url === kitUrl('links')).flush({ items: [link()] });
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="link"]')).toHaveLength(1);
    expect(el.textContent).toContain('Caused by');
  });

  it('searches and links a record from the picker', async () => {
    const { fixture, http, el } = await setup();
    flushConnections(http, response([]));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="related-add"] button')!.click();
    await render(fixture);
    flushEntityTypes(http);
    await render(fixture);

    const linkType = document.querySelector<HTMLSelectElement>('[data-testid="picker-link-type"]')!;
    linkType.value = 'caused_by';
    linkType.dispatchEvent(new Event('change'));
    const query = document.querySelector<HTMLInputElement>('[data-testid="picker-query"]')!;
    query.value = 'supplier';
    query.dispatchEvent(new Event('input'));
    await render(fixture, 300);

    const search = http.expectOne((r) => r.url === kitUrl('search'));
    expect(search.request.params.get('q')).toBe('supplier');
    expect(search.request.params.get('types')).toBe('document,deviation');
    search.flush({
      items: [
        { entity_type: 'deviation', entity_id: 'd1', title: 'Itself' },
        { entity_type: 'document', entity_id: 'doc1', title: 'Supplier procedure', code: 'PR-7' },
      ],
    });
    await render(fixture);
    const results = document.querySelector('[data-testid="picker-results"]')!;
    expect(results.textContent).not.toContain('Itself');
    results.querySelector<HTMLElement>('app-button button')!.click();

    const create = http.expectOne((r) => r.url === kitUrl('links') && r.method === 'POST');
    expect(create.request.body).toEqual({
      source_type: 'deviation',
      source_id: 'd1',
      target_type: 'document',
      target_id: 'doc1',
      link_type: 'caused_by',
    });
    create.flush(link());
    await render(fixture);
    // The new link is placed in its group after a refresh.
    flushConnections(http, response([item()]));
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="link"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="picker-results"]')).toBeNull();
  });

  it('explains a duplicate link in the picker', async () => {
    const { fixture, http, el } = await setup();
    flushConnections(http, response([]));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="related-add"] button')!.click();
    await render(fixture);
    flushEntityTypes(http);
    const query = document.querySelector<HTMLInputElement>('[data-testid="picker-query"]')!;
    query.value = 'pr';
    query.dispatchEvent(new Event('input'));
    await render(fixture, 300);
    http
      .expectOne((r) => r.url === kitUrl('search'))
      .flush({ items: [{ entity_type: 'document', entity_id: 'doc1', title: 'Doc' }] });
    await render(fixture);
    document
      .querySelector<HTMLElement>('[data-testid="picker-results"] app-button button')!
      .click();
    http
      .expectOne((r) => r.url === kitUrl('links') && r.method === 'POST')
      .flush({ detail: { code: 'link_exists' } }, { status: 409, statusText: 'Conflict' });
    await render(fixture);
    expect(document.body.textContent).toContain('already linked this way');
  });

  it('says so when search is not available on the server', async () => {
    const { fixture, http, el } = await setup();
    flushConnections(http, response([]));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="related-add"] button')!.click();
    await render(fixture);
    flushEntityTypes(http);
    const query = document.querySelector<HTMLInputElement>('[data-testid="picker-query"]')!;
    query.value = 'pump';
    query.dispatchEvent(new Event('input'));
    await render(fixture, 300);
    http
      .expectOne((r) => r.url === kitUrl('search'))
      .flush({ detail: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    await render(fixture);
    expect(document.body.textContent).toContain('Record search is not available yet.');
  });
});
