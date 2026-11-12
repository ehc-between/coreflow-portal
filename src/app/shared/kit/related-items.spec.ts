import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { LinkItem } from '../../core/kit/kit.models';
import { configureKit, flushEntityTypes, kitUrl, tick } from './kit.testing';
import { RelatedItems } from './related-items';

function link(overrides: Partial<LinkItem> = {}): LinkItem {
  return {
    id: 'l1',
    link_type: 'caused_by',
    direction: 'outgoing',
    other: {
      entity_type: 'document',
      entity_id: 'doc1',
      title: 'Supplier procedure',
      code: 'PR-7',
      url: '/documents/doc1',
      status: 'approved',
      module: 'documents',
      label_key: 'modules.entities.document',
    },
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

function flushLinks(http: HttpTestingController, items: LinkItem[]) {
  http.expectOne((r) => r.url === kitUrl('links') && r.method === 'GET').flush({ items });
}

describe('RelatedItems', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    flushEntityTypes(http);
    http.verify();
  });

  it('teaches when there are no links', async () => {
    const { fixture, http, el } = await setup();
    flushLinks(http, []);
    await render(fixture);
    expect(el.querySelector('[data-testid="related-empty"]')?.textContent).toContain(
      'Auditors follow these links',
    );
  });

  it('groups links by their wording seen from this record', async () => {
    const { fixture, http, el } = await setup(false);
    flushLinks(http, [
      link(),
      link({ id: 'l2', link_type: 'caused_by', direction: 'incoming' }),
      link({ id: 'l3', link_type: 'relates_to' }),
    ]);
    await render(fixture);
    const headings = [...el.querySelectorAll('h3')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Caused by', 'Causes', 'Related to']);
    expect(el.textContent).toContain('PR-7');
    expect(el.textContent).toContain('Approved');
    expect(el.querySelector('a[href="/documents/doc1"]')).not.toBeNull();
    // Read-only: no add / remove controls.
    expect(el.querySelector('[data-testid="related-add"]')).toBeNull();
    expect(el.querySelector('[aria-label^="Remove the link"]')).toBeNull();
  });

  it('removes a link after confirmation', async () => {
    const { fixture, http, el } = await setup();
    flushLinks(http, [link()]);
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

  it('searches and links a record from the picker', async () => {
    const { fixture, http, el } = await setup();
    flushLinks(http, []);
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
    expect(el.querySelectorAll('[data-testid="link"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="picker-results"]')).toBeNull();
  });

  it('explains a duplicate link in the picker', async () => {
    const { fixture, http, el } = await setup();
    flushLinks(http, []);
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
    flushLinks(http, []);
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
