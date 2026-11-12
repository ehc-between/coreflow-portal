import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { configureKit, flushEntityTypes, kitUrl, tick } from './kit.testing';
import { RecordDetailLayout, RecordTab } from './record-detail-layout';
import { RecordListPage } from './record-list-page';
import { SavedView, SavedViewsService, savedViewsKey } from './saved-views.service';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

@Component({
  imports: [RecordDetailLayout],
  template: `
    <app-record-detail-layout
      entityType="deviation"
      entityId="d1"
      titleKey="kit.detail.tab.details"
      [tabs]="tabs()"
      [canEdit]="true"
    >
      <button actions type="button">Edit</button>
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
}

describe('RecordDetailLayout', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    flushEntityTypes(http);
    http.verify();
  });

  it('shows the details slot first and opens kit tabs on demand', async () => {
    const { http } = configureKit(DetailHost);
    const fixture = TestBed.createComponent(DetailHost);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const tabs = el.querySelectorAll<HTMLElement>('[role="tab"]');
    expect([...tabs].map((t) => t.textContent?.trim())).toEqual([
      'Details',
      'Related',
      'Activity',
      'Comments',
      'Attachments',
      'Revisions',
      'Tasks',
    ]);
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Details');
    expect(el.querySelector('[data-testid="details-slot"]')?.closest('[hidden]')).toBeNull();
    expect(el.querySelector('[data-testid="tasks-slot"]')?.closest('[hidden]')).not.toBeNull();
    // No kit component is loaded until its tab is opened.
    http.expectNone((r) => r.url === kitUrl('links'));

    el.querySelector<HTMLElement>('[data-testid="tab-related"]')!.click();
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('links')).flush({ items: [] });
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(TestBed.inject(Router).url).toBe('/?tab=related');

    // Arrow keys move between tabs.
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('timeline')).flush({ items: [], next_before: null });
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');

    tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await render(fixture);
    expect(el.querySelector('[data-testid="tasks-slot"]')?.closest('[hidden]')).toBeNull();

    el.querySelector<HTMLElement>('[data-testid="tab-revisions"]')!.click();
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('revisions')).flush({ items: [] });

    el.querySelector<HTMLElement>('[data-testid="tab-comments"]')!.click();
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('comments')).flush({ items: [] });
    http.expectOne(kitUrl('access-subjects')).flush({ users: [], departments: [] });

    el.querySelector<HTMLElement>('[data-testid="tab-attachments"]')!.click();
    await render(fixture);
    const att = http.expectOne((r) => r.url === kitUrl('attachments'));
    expect(att.request.params.get('entity_type')).toBe('deviation');
    att.flush([]);
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
