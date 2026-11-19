import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { configureKit, flushEntityTypes, kitUrl, tick } from './kit.testing';
import { WatchButton } from '../activity/watch-button';
import { RecordDetailLayout, RecordTab, splitRecordTabs } from './record-detail-layout';
import { RecordMissingItem, RecordPageContext } from './record-page-context';
import { RecordListPage } from './record-list-page';
import { SavedView, SavedViewsService, savedViewsKey } from './saved-views.service';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

@Component({
  imports: [RecordDetailLayout, WatchButton],
  template: `
    <app-record-detail-layout
      entityType="deviation"
      entityId="d1"
      titleKey="kit.detail.tab.details"
      [tabs]="tabs()"
      [canEdit]="true"
      [missing]="missing()"
    >
      <button actions type="button">Edit</button>
      <app-watch-button secondary entityType="deviation" entityId="d1" />
      <button overflow type="button" data-testid="page-delete">Delete</button>
      <nav nav data-testid="module-nav">Module tabs</nav>
      <p data-testid="details-slot">The details</p>
      <p tasks data-testid="tasks-slot">The tasks</p>
      <p aside data-testid="aside-slot">Side</p>
    </app-record-detail-layout>
  `,
})
class DetailHost {
  readonly tabs = signal<readonly RecordTab[]>([
    'details',
    'related',
    'activity',
    'comments',
    'attachments',
    'revisions',
    'tasks',
  ]);
  readonly missing = signal<readonly RecordMissingItem[]>([]);
}

/** Stands in for the help strip and requirements panel: hands controls to the page. */
@Component({
  selector: 'app-fake-page-part',
  template: '',
})
class FakePagePart {
  readonly page = inject(RecordPageContext);
  readonly opened: string[] = [];
}

@Component({
  imports: [RecordDetailLayout, FakePagePart],
  template: `
    <app-record-detail-layout
      entityType="deviation"
      entityId="d1"
      titleKey="kit.detail.tab.details"
      [canEdit]="true"
      [createFlows]="false"
      [watch]="false"
      [missing]="[{ key: 'owner', labelKey: 'kit.detail.tab.details', link: '/owner' }]"
    >
      <p>The details</p>
      <app-fake-page-part />
    </app-record-detail-layout>
  `,
})
class ContextHost {}

function connections(n: number, suggestions = 0) {
  return {
    counts: { records: n, requirements: 2, tasks: 0, suggestions },
    groups: [
      {
        module: 'risk',
        entity_type: 'risk',
        label_key: null,
        kind: 'record',
        count: n,
        items: Array.from({ length: n }, (_, i) => ({
          link_id: `l${i}`,
          origin: 'user',
          link_type: 'relates_to',
          direction: 'outgoing',
          flow_key: null,
          created_at: null,
          other: {
            entity_type: 'risk',
            entity_id: `r${i}`,
            title: `Risk ${i}`,
            code: `RSK-${i}`,
            url: `/risk/risks/r${i}`,
            status: 'open',
            module: 'risk',
            label_key: null,
          },
        })),
      },
    ],
    suggestions: Array.from({ length: suggestions }, (_, i) => ({
      id: `s${i}`,
      link_type: 'relates_to',
      reason: 'other',
      confidence: 0.5,
      other: {
        entity_type: 'risk',
        entity_id: `sr${i}`,
        title: `Suggested ${i}`,
        code: null,
        url: null,
        status: null,
        module: 'risk',
        label_key: null,
      },
    })),
    requirements: { confirmed: 2, suggested: 0 },
  };
}

describe('splitRecordTabs', () => {
  it('keeps details, related and activity in the row and the rest under "Mer"', () => {
    expect(
      splitRecordTabs(['details', 'related', 'activity', 'comments', 'attachments', 'revisions']),
    ).toEqual({
      row: ['details', 'related', 'activity'],
      more: ['comments', 'attachments', 'revisions'],
    });
    // A single leftover tab stays in the row (four tabs, no menu).
    expect(splitRecordTabs(['details', 'related', 'activity', 'tasks'])).toEqual({
      row: ['details', 'related', 'activity', 'tasks'],
      more: [],
    });
    // Fewer standard tabs: the next ones fill the row, in the page's order.
    expect(splitRecordTabs(['details', 'tasks', 'comments', 'attachments', 'revisions'])).toEqual({
      row: ['details', 'tasks', 'comments'],
      more: ['attachments', 'revisions'],
    });
  });
});

describe('RecordDetailLayout', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    flushEntityTypes(http);
    http.verify();
  });

  it('shows one tab row (Details · Related · Activity · More) and opens kit tabs on demand', async () => {
    const { http } = configureKit(DetailHost);
    const fixture = TestBed.createComponent(DetailHost);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const tabs = el.querySelectorAll<HTMLElement>('[role="tab"]');
    expect([...tabs].map((t) => t.textContent?.trim())).toEqual(['Details', 'Related', 'Activity']);
    const more = el.querySelector<HTMLElement>('[data-testid="tab-more"]')!;
    expect(more.querySelector('[data-testid="overflow-trigger"]')?.textContent?.trim()).toBe(
      'More',
    );
    expect(
      [...more.querySelectorAll('[role="menuitem"]')].map((t) => t.textContent?.trim()),
    ).toEqual(['Comments', 'Attachments', 'History', 'Tasks']);
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Details');
    expect(el.querySelector('[data-testid="details-slot"]')?.closest('[hidden]')).toBeNull();
    expect(el.querySelector('[data-testid="tasks-slot"]')?.closest('[hidden]')).not.toBeNull();
    // No module sub-navigation on a record page.
    expect(el.querySelector('[data-testid="module-nav"]')).toBeNull();
    // The connections (aside panel + Related count) load once; other kit tabs on demand.
    http.expectOne((r) => r.url === kitUrl('connections')).flush(connections(3));
    http.expectOne((r) => r.url === kitUrl('create-flows')).flush({ items: [] });
    // One follow state: the menu's, not the page's own button.
    http
      .expectOne((r) => r.url === kitUrl('watchers'))
      .flush({ watching: false, count: 0, users: [] });
    http.expectNone((r) => r.url === kitUrl('timeline'));
    await render(fixture);
    expect(el.querySelector('[data-testid="watch-button"]')).toBeNull();
    expect(el.querySelector('[data-testid="watch-menu-item"]')?.textContent).toContain('Follow');
    expect(el.querySelector('[data-testid="tab-count-related"]')?.textContent?.trim()).toBe('3');
    const panel = el.querySelector('[data-testid="connections-panel"]')!;
    expect(panel.textContent).toContain('3 records');
    // Compact panel: map and "ask" live in the header's "Mer" menu.
    expect(panel.querySelector('[data-testid="connections-map"]')).toBeNull();
    expect(panel.querySelector('[data-testid="connections-ask"]')).toBeNull();
    const header = el.querySelector('[data-testid="page-actions"]')!;
    expect(header.querySelector('[data-testid="record-show-map"]')).not.toBeNull();
    expect(header.querySelector('[data-testid="record-ask"]')).not.toBeNull();
    expect(header.querySelector('[data-testid="page-delete"]')).not.toBeNull();
    // Nothing waits for a decision: no "Hva mangler" box.
    expect(el.querySelector('[data-testid="record-missing"]')).toBeNull();

    el.querySelector<HTMLElement>('[data-testid="tab-related"]')!.click();
    await render(fixture);
    // The Related tab reads the same store: no second request.
    http.expectNone((r) => r.url === kitUrl('connections'));
    expect(el.querySelectorAll('[data-testid="link"]')).toHaveLength(3);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(TestBed.inject(Router).url).toBe('/?tab=related');

    // Arrow keys move between the row's tabs.
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('timeline')).flush({ items: [], next_before: null });
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');

    // Tabs under "Mer": the trigger shows the open one.
    more.querySelector<HTMLElement>('[data-testid="tab-tasks"]')!.click();
    await render(fixture);
    expect(el.querySelector('[data-testid="tasks-slot"]')?.closest('[hidden]')).toBeNull();
    expect(more.querySelector('[data-testid="overflow-trigger"]')?.textContent?.trim()).toBe(
      'Tasks',
    );
    expect(TestBed.inject(Router).url).toBe('/?tab=tasks');

    more.querySelector<HTMLElement>('[data-testid="tab-revisions"]')!.click();
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('revisions')).flush({ items: [] });

    more.querySelector<HTMLElement>('[data-testid="tab-comments"]')!.click();
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('comments')).flush({ items: [] });
    http.expectOne(kitUrl('access-subjects')).flush({ users: [], departments: [] });

    more.querySelector<HTMLElement>('[data-testid="tab-attachments"]')!.click();
    await render(fixture);
    const att = http.expectOne((r) => r.url === kitUrl('attachments'));
    expect(att.request.params.get('entity_type')).toBe('deviation');
    att.flush([]);
  });

  it('offers create-from-here flows in "Mer" and opens the Related tab from the panel', async () => {
    const { http, ask } = configureKit(DetailHost);
    const fixture = TestBed.createComponent(DetailHost);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    http.expectOne((r) => r.url === kitUrl('connections')).flush(connections(1));
    http.expectOne((r) => r.url === kitUrl('watchers')).flush({}, { status: 404, statusText: '' });
    const flows = http.expectOne((r) => r.url === kitUrl('create-flows'));
    expect(flows.request.params.get('entity_id')).toBe('d1');
    flows.flush({
      items: [
        {
          key: 'deviation.to_risk',
          label_key: 'flows.deviation.to_risk',
          target_type: 'risk',
          target_module: 'risk',
          target_label_key: null,
          target_route: '/risk/risks/new',
          link_type: 'relates_to',
          enabled: true,
        },
      ],
    });
    await render(fixture);
    const header = el.querySelector('[data-testid="page-actions"]')!;
    // No separate "Create from this" button: the flows are items of the header's "Mer".
    expect(header.querySelector('[data-testid="create-from-here"]')).toBeNull();
    expect(header.querySelector('[data-testid="create-from-here-heading"]')?.textContent).toContain(
      'Create from this',
    );
    expect(header.querySelector('[data-flow="deviation.to_risk"]')?.textContent?.trim()).toBe(
      'Risk from this deviation',
    );
    // Following is not offered for this type: no menu item.
    expect(el.querySelector('[data-testid="watch-menu-item"]')).toBeNull();

    header.querySelector<HTMLElement>('[data-testid="record-ask"]')!.click();
    expect(ask.prompts).toHaveLength(1);
    expect(ask.prompts[0]).toContain('d1');

    el.querySelector<HTMLElement>('[data-testid="connections-show-all"]')!.click();
    await render(fixture);
    expect(TestBed.inject(Router).url).toBe('/?tab=related');
    expect(el.querySelectorAll('[data-testid="link"]')).toHaveLength(1);
  });

  it('lists what is missing and puts the page help behind the header "?"', async () => {
    const { http } = configureKit(ContextHost);
    const fixture = TestBed.createComponent(ContextHost);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    http.expectOne((r) => r.url === kitUrl('connections')).flush(connections(1, 2));
    await render(fixture);

    const part = fixture.debugElement.query(By.directive(FakePagePart))
      .componentInstance as FakePagePart;
    expect(part.page.entityType()).toBe('deviation');
    expect(part.page.isRecord('deviation', 'd1')).toBe(true);
    expect(el.querySelector('[data-testid="record-help"]')).toBeNull();

    let reviewed = 0;
    let suggested = 0;
    part.page.help.set(() => part.opened.push('help'));
    part.page.requirements.set({
      pending: 2,
      suggestMore: () => suggested++,
      review: () => reviewed++,
    });
    await render(fixture);

    const items = el.querySelectorAll<HTMLElement>('[data-testid="record-missing-item"]');
    expect([...items].map((i) => i.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Details →',
      'Confirm 2 suggested requirements →',
      'Review 2 suggested links →',
    ]);
    expect(el.querySelector('[data-testid="record-missing-count"]')?.textContent?.trim()).toBe('3');
    expect(items[0].querySelector('a')?.getAttribute('href')).toBe('/owner');
    items[1].querySelector<HTMLElement>('button')!.click();
    expect(reviewed).toBe(1);
    items[2].querySelector<HTMLElement>('button')!.click();
    await render(fixture);
    expect(TestBed.inject(Router).url).toBe('/?tab=related');

    el.querySelector<HTMLElement>('[data-testid="record-find-requirements"]')!.click();
    expect(suggested).toBe(1);
    el.querySelector<HTMLElement>('[data-testid="record-help"]')!.click();
    expect(part.opened).toEqual(['help']);
  });
});

@Component({
  imports: [RecordListPage],
  template: `
    <app-record-list-page
      titleKey="kit.related.title"
      scope="risk"
      [filters]="{ status: status() }"
      [empty]="empty()"
      (search)="searches.push($event)"
      (viewApplied)="applied.push($event)"
    >
      <button toolbar type="button">New</button>
      <select filters aria-label="Status"></select>
      <table data-testid="list-body"></table>
      <p empty data-testid="list-empty">Nothing</p>
    </app-record-list-page>
  `,
})
class ListHost {
  readonly status = signal('open');
  readonly empty = signal(false);
  readonly searches: string[] = [];
  readonly applied: SavedView[] = [];
}

describe('RecordListPage', () => {
  beforeEach(() => localStorage.removeItem(savedViewsKey('risk', 'list')));

  it('emits debounced searches and swaps in the empty slot', async () => {
    configureKit(ListHost);
    const fixture = TestBed.createComponent(ListHost);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="list-title"]')?.textContent?.trim()).toBe(
      'Related records',
    );
    expect(el.querySelector('[data-testid="list-body"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="list-empty"]')).toBeNull();

    const input = el.querySelector<HTMLInputElement>('[data-testid="list-search"]')!;
    input.value = 'p';
    input.dispatchEvent(new Event('input'));
    input.value = 'pump';
    input.dispatchEvent(new Event('input'));
    await render(fixture, 300);
    expect(fixture.componentInstance.searches).toEqual(['pump']);

    fixture.componentInstance.empty.set(true);
    await render(fixture);
    expect(el.querySelector('[data-testid="list-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="list-body"]')).toBeNull();
  });

  it('saves, applies and deletes views in localStorage', async () => {
    configureKit(ListHost);
    const fixture = TestBed.createComponent(ListHost);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('[data-testid="list-search"]')!;
    input.value = 'pump';
    input.dispatchEvent(new Event('input'));
    await render(fixture, 300);

    el.querySelector<HTMLElement>('[data-testid="views-button"]')!.click();
    await render(fixture);
    expect(el.textContent).toContain('No saved views yet.');
    el.querySelector<HTMLElement>('[data-testid="views-save"]')!.click();
    await render(fixture);
    const name = document.querySelector<HTMLTextAreaElement>('app-prompt-dialog textarea')!;
    name.value = 'Open pumps';
    name.dispatchEvent(new Event('input'));
    await render(fixture);
    [...document.querySelectorAll<HTMLElement>('button')]
      .find((b) => b.textContent?.trim() === 'Save view')!
      .click();
    await render(fixture);

    const stored = JSON.parse(localStorage.getItem('coreflow.views.risk.list') ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      name: 'Open pumps',
      query: 'pump',
      filters: { status: 'open' },
    });
    expect(el.textContent).toContain('View: Open pumps');

    input.value = '';
    input.dispatchEvent(new Event('input'));
    await render(fixture, 300);
    expect(el.textContent).not.toContain('View: Open pumps');

    el.querySelector<HTMLElement>('[data-testid="views-button"]')!.click();
    await render(fixture);
    el.querySelector<HTMLElement>('[aria-label="Apply view Open pumps"]')!.click();
    await render(fixture, 300);
    const host = fixture.componentInstance;
    expect(host.applied.map((v) => v.filters)).toEqual([{ status: 'open' }]);
    expect(host.searches.at(-1)).toBe('pump');
    expect(host.searches.filter((s) => s === 'pump')).toHaveLength(2);
    expect(input.value).toBe('pump');

    el.querySelector<HTMLElement>('[data-testid="views-button"]')!.click();
    await render(fixture);
    el.querySelector<HTMLElement>('[aria-label="Delete view Open pumps"]')!.click();
    await render(fixture);
    expect(TestBed.inject(SavedViewsService).list('risk', 'list')).toHaveLength(0);
  });
});

describe('SavedViewsService', () => {
  beforeEach(() => localStorage.removeItem(savedViewsKey('docs', 'list')));

  it('replaces a view with the same name and ignores corrupt storage', () => {
    const svc = new SavedViewsService();
    const views = svc.views('docs', 'list');
    svc.save('docs', 'list', { name: 'Mine', query: 'a', filters: {} });
    svc.save('docs', 'list', { name: 'mine ', query: 'b', filters: { x: '1' } });
    expect(views().map((v) => [v.name, v.query])).toEqual([['mine', 'b']]);

    localStorage.setItem(savedViewsKey('docs', 'list'), '{not json');
    expect(svc.list('docs', 'list')).toEqual([]);
  });
});
