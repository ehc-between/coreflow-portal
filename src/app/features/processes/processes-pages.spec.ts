import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PageContextService } from '../../core/ai/page-context';
import {
  makeProcess,
  makeProcessOut,
  makeTurtle,
  processesTestingProviders,
  processesTransloco,
} from './data/processes.testing';
import { ProcessDetailPage } from './detail/process-detail';
import { ProcessFormPage } from './form/process-form-page';
import { ProcessMapCanvas } from './map/process-map-canvas';
import { ProcessMapEditor } from './map/process-map-editor';
import { DEFAULT_FILTERS, ProcessesList, parseFilters, toQuery } from './processes-list';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount<T>(
  component: Type<T>,
  api: Record<string, unknown>,
  inputs: Record<string, unknown> = {},
  permissions?: readonly string[],
) {
  const doubles = processesTestingProviders(api, permissions);
  TestBed.configureTestingModule({
    imports: [component, processesTransloco()],
    providers: doubles.providers,
  });
  const fixture = TestBed.createComponent(component);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  return { fixture, el, button, ...doubles };
}

describe('processes list', () => {
  it('parses filters defensively and builds the list query', () => {
    expect(parseFilters({ status: 'bogus', sort: '-code', reviewDue: 'true' })).toEqual({
      ...DEFAULT_FILTERS,
      sort: '-code',
      reviewDue: 'true',
    });
    expect(toQuery(' q ', { ...DEFAULT_FILTERS, status: 'active', owner: 'me' }, 25)).toEqual({
      q: 'q',
      status: ['active'],
      category: undefined,
      owner: 'me',
      review_due: undefined,
      sort: 'code',
      limit: 25,
      offset: 25,
    });
  });

  it('renders the register rows and registers page context', async () => {
    const list = vi.fn(() => of({ items: [makeProcessOut()], total: 1 }));
    const { el, fixture } = mount(ProcessesList, { list });
    await tick();
    fixture.detectChanges();
    expect(list).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ sort: 'code', offset: 0 }),
    );
    expect(el.querySelector('[data-testid="process-rows"]')?.textContent).toContain('Purchasing');
    expect(TestBed.inject(PageContextService).current()).toMatchObject({
      module: 'processes',
      view: 'list',
    });
  });

  it('teaches with an empty state when the register is empty', async () => {
    const { el, fixture } = mount(ProcessesList, { list: () => of({ items: [], total: 0 }) });
    await tick();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="process-rows"]')).toBeNull();
    expect(el.querySelector('app-teaching-empty')).not.toBeNull();
  });

  it('reloads when a filter changes', async () => {
    const list = vi.fn(() => of({ items: [makeProcessOut()], total: 1 }));
    const { el, fixture } = mount(ProcessesList, { list });
    await tick();
    const select = el.querySelector<HTMLSelectElement>('[data-testid="filter-status"]')!;
    select.value = 'retired';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await tick();
    expect(list).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({ status: ['retired'] }),
    );
  });
});

describe('process map canvas', () => {
  it('draws lanes, steps and connections and emits selections', () => {
    TestBed.configureTestingModule({
      imports: [ProcessMapCanvas, processesTransloco()],
      providers: processesTestingProviders({}).providers,
    });
    const fixture = TestBed.createComponent(ProcessMapCanvas);
    fixture.componentRef.setInput('map', makeProcess().map);
    fixture.componentRef.setInput('editable', true);
    const selected: string[] = [];
    const moves: unknown[] = [];
    fixture.componentInstance.nodeSelected.subscribe((id) => selected.push(id));
    fixture.componentInstance.nodeMove.subscribe((m) => moves.push(m));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid="map-lane"]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="map-edge-e1"]')).not.toBeNull();
    const node = el.querySelector<SVGGElement>('[data-testid="map-node-n2"]')!;
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(selected).toEqual(['n2']);
    expect(moves).toEqual([{ id: 'n2', x: 230, y: 48 }]);
  });
});

describe('process map editor', () => {
  function editor(process = makeProcess()) {
    const api = {
      get: vi.fn(() => of(process)),
      list: vi.fn(() => of({ items: [], total: 0 })),
      saveMap: vi.fn(() => of({ ...process, map_version: 2 })),
    };
    return { api, ...mount(ProcessMapEditor, api, { id: process.id }) };
  }

  it('adds a connected step, undoes it and saves the map', async () => {
    const { el, fixture, api, toasts } = editor();
    await tick();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid^="map-node-"]')).toHaveLength(2);
    const save = el.querySelector<HTMLElement>('[data-testid="map-save"] button')!;
    expect(save.hasAttribute('disabled')).toBe(true);

    // Select "Order", then add a task: it is placed after it and connected.
    el.querySelector('[data-testid="map-node-n2"]')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="add-end"]')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid^="map-node-"]')).toHaveLength(3);
    expect(el.querySelectorAll('[data-testid^="map-edge-"]')).toHaveLength(2);

    el.querySelector<HTMLElement>('[data-testid="undo"] button')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid^="map-node-"]')).toHaveLength(2);
    el.querySelector<HTMLElement>('[data-testid="redo"] button')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid^="map-node-"]')).toHaveLength(3);

    el.querySelector<HTMLElement>('[data-testid="map-save"] button')!.click();
    fixture.detectChanges();
    const [, id, map] = api.saveMap.mock.calls[0] as unknown as [
      string,
      string,
      { nodes: unknown[] },
    ];
    expect(id).toBe('p-1');
    expect(map.nodes).toHaveLength(3);
    expect(toasts.success).toHaveBeenCalledWith('processes.notices.mapSaved', { version: 2 });
    expect(fixture.componentInstance.canLeave()).toBe(true);
  });

  it('applies a generated map to an empty canvas', async () => {
    const { fixture, el } = editor(makeProcess({ map: { lanes: [], nodes: [], edges: [] } }));
    await tick();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="map-empty"]')).not.toBeNull();
    (fixture.componentInstance as unknown as { onGenerated(d: unknown): void }).onGenerated({
      lanes: [{ id: 'l1', label: 'Team' }],
      nodes: [{ id: 'a', type: 'start', label: 'Go', lane_id: 'l1', x: 40, y: 40 }],
      edges: [],
    });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="map-node-a"]')).not.toBeNull();
  });

  it('opens read-only when the process cannot be edited', async () => {
    const { el, fixture } = editor(makeProcess({ can_edit: false }));
    await tick();
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('[data-testid="add-task"]')!.disabled).toBe(true);
  });
});

describe('process form', () => {
  it('creates a process and navigates to it', async () => {
    const create = vi.fn(() => of(makeProcess({ id: 'p-9', code: 'PR-009' })));
    const { el, fixture, toasts } = mount(ProcessFormPage, {
      create,
      list: () => of({ items: [], total: 0 }),
    });
    await tick();
    const submit = () =>
      el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    submit();
    fixture.detectChanges();
    expect(create).not.toHaveBeenCalled();
    expect(el.textContent).toContain('processes.form.errors.titleRequired');

    const title = el.querySelector<HTMLInputElement>('[data-testid="field-title"]')!;
    title.value = 'Sales';
    title.dispatchEvent(new Event('input'));
    el.querySelector<HTMLInputElement>('[data-testid="list-add-inputs"]')!.value = 'Lead';
    const add = el.querySelector<HTMLInputElement>('[data-testid="list-add-inputs"]')!;
    add.dispatchEvent(new Event('input'));
    add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    submit();
    fixture.detectChanges();
    expect(create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ title: 'Sales', inputs: ['Lead'], owner_user_id: null }),
    );
    expect(toasts.success).toHaveBeenCalledWith('processes.notices.created', { code: 'PR-009' });
  });

  it('shows a coded error when the code is taken', async () => {
    const error = new HttpErrorResponse({ status: 409, error: { detail: { code: 'code_taken' } } });
    const { el, fixture, toasts } = mount(ProcessFormPage, {
      create: () => throwError(() => error),
      list: () => of({ items: [], total: 0 }),
    });
    await tick();
    const title = el.querySelector<HTMLInputElement>('[data-testid="field-title"]')!;
    title.value = 'Sales';
    title.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(toasts.error).toHaveBeenCalledWith('processes.errors.code_taken');
  });
});

describe('process detail', () => {
  function detail(process = makeProcess(), permissions?: readonly string[]) {
    const api = {
      get: vi.fn(() => of(process)),
      turtle: vi.fn(() => of(makeTurtle())),
      list: vi.fn(() => of({ items: [], total: 0 })),
      changeStatus: vi.fn(() => of({ ...process, status: 'retired' as const })),
      recordReview: vi.fn(() => of({ ...process, last_reviewed_at: '2026-11-12T00:00:00' })),
    };
    return { api, ...mount(ProcessDetailPage, api, { id: process.id }, permissions) };
  }

  it('renders the process, its map and turtle, and registers page context', async () => {
    const { el, fixture } = detail();
    await tick();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="process-title"]')?.textContent).toContain('Purchasing');
    expect(el.querySelector('[data-testid="map-node-n2"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="turtle"]')?.textContent).toContain('Purchase request');
    expect(TestBed.inject(PageContextService).current()).toMatchObject({
      module: 'processes',
      entityType: 'process',
      entityId: 'p-1',
      view: 'detail',
    });
  });

  it('records a review', async () => {
    const { el, fixture, api, toasts, button } = detail();
    await tick();
    fixture.detectChanges();
    button('processes.review.record')!.click();
    fixture.detectChanges();
    const notes = document.querySelector<HTMLTextAreaElement>('[data-testid="review-notes"]')!;
    notes.value = 'Still fine';
    notes.dispatchEvent(new Event('input'));
    notes.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(api.recordReview).toHaveBeenCalledWith('org-1', 'p-1', {
      notes: 'Still fine',
      next_review_at: null,
    });
    expect(toasts.success).toHaveBeenCalledWith('processes.notices.reviewed');
    expect(el).toBeTruthy();
  });

  it('hides edit and manage actions without the rights', async () => {
    const { el, fixture } = detail(makeProcess({ can_edit: false, can_manage: false }));
    await tick();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="open-review"]')).toBeNull();
    expect(el.querySelector('[data-testid="status-retired"]')).toBeNull();
    expect(el.textContent).not.toContain('processes.actions.delete');
  });

  it('asks the assistant for a summary', async () => {
    const { fixture, ask, button } = detail();
    await tick();
    fixture.detectChanges();
    button('processes.ai.summarise')!.click();
    expect(ask.prompts).toHaveLength(1);
    expect(ask.prompts[0]).toContain('processes.ai.summarisePrompt');
  });
});
