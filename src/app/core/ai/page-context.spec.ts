import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  PageContextService,
  fallbackContext,
  providePageContext,
  toPageContextDto,
} from './page-context';

const ID = '6a4a1d8e-6a51-4c0e-a4f5-2b0f61b9a8a2';

@Component({ selector: 'app-test-page', template: '' })
class TestPage {
  readonly title = signal<string | null>(null);
  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk',
      entityId: ID,
      view: 'detail',
      title: this.title(),
    }));
  }
}

describe('PageContextService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('the most recent owner wins; clearing falls back to the previous one', () => {
    const svc = TestBed.inject(PageContextService);
    const list = {};
    const pane = {};
    svc.set(list, { module: 'risk', view: 'list' });
    svc.set(pane, { module: 'risk', entityType: 'risk', entityId: ID, view: 'detail' });
    expect(svc.current()?.view).toBe('detail');

    svc.clear(pane);
    expect(svc.current()?.view).toBe('list');

    svc.clear(list);
    expect(svc.current()).toBeNull();
  });

  it('merges the live selection and clears it with the owner', () => {
    const svc = TestBed.inject(PageContextService);
    const owner = {};
    svc.set(owner, { module: 'risk', view: 'list' });
    svc.setSelection({ ids: [ID] });
    expect(svc.current()?.selection).toEqual({ ids: [ID] });

    svc.clear(owner);
    svc.set(owner, { module: 'risk', view: 'list' });
    expect(svc.current()?.selection ?? null).toBeNull();
  });

  it('providePageContext tracks the signals and clears on destroy', () => {
    const fixture = TestBed.createComponent(TestPage);
    TestBed.tick();
    const svc = TestBed.inject(PageContextService);
    expect(svc.current()).toMatchObject({ module: 'risk', entityId: ID, title: null });

    fixture.componentInstance.title.set('Supplier failure');
    TestBed.tick();
    expect(svc.current()?.title).toBe('Supplier failure');

    fixture.destroy();
    expect(svc.current()).toBeNull();
  });
});

describe('toPageContextDto', () => {
  it('maps to snake_case, adds the route and drops non-UUID ids', () => {
    const dto = toPageContextDto(
      {
        module: 'documents',
        entityType: 'document',
        entityId: 'not-a-uuid',
        view: 'detail',
        title: '  Quality manual  ',
        selection: { field: 'owner', ids: [ID, 'nope'] },
      },
      '/documents/x#top',
    );
    expect(dto).toEqual({
      module: 'documents',
      entity_type: 'document',
      entity_id: null,
      view: 'detail',
      route: '/documents/x',
      title: 'Quality manual',
      selection: { text: null, field: 'owner', ids: [ID] },
    });
  });

  it('clips long values to the server limits', () => {
    const dto = toPageContextDto(
      {
        module: 'risk',
        view: 'list',
        title: 'x'.repeat(500),
        selection: { text: 'y'.repeat(3000) },
      },
      '/risk',
    );
    expect(dto?.title?.length).toBe(200);
    expect(dto?.selection?.text?.length).toBe(2000);
  });

  it('derives a context from the URL when no page registered one', () => {
    expect(toPageContextDto(null, '/management-review/abc')).toMatchObject({
      module: 'management_review',
      view: 'other',
      route: '/management-review/abc',
    });
    expect(fallbackContext('/settings/modules')).toEqual({ module: null, view: 'settings' });
    expect(fallbackContext('/dashboard')).toEqual({ module: null, view: 'dashboard' });
    expect(toPageContextDto(null, '/')).toBeNull();
  });
});
