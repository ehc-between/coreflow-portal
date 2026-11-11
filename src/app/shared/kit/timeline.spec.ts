import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TimelineItem } from '../../core/kit/kit.models';
import { configureKit, flushEntityTypes, kitUrl, tick } from './kit.testing';
import { Timeline } from './timeline';

function event(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'e1',
    source: 'event',
    kind: 'comment.created',
    label_key: 'kit:timeline.commentCreated',
    created_at: '2026-11-01T10:00:00',
    actor: { user_id: 'u1', name: 'Ada', kind: 'user' },
    params: { comment_id: 'c1', actor_name: 'Ada' },
    summary: null,
    changes: null,
    ...overrides,
  };
}

async function setup(permissions: string[] = []) {
  const { http } = configureKit(Timeline, { permissions });
  const fixture: ComponentFixture<Timeline> = TestBed.createComponent(Timeline);
  fixture.componentRef.setInput('entityType', 'deviation');
  fixture.componentRef.setInput('entityId', 'd1');
  await render(fixture);
  flushEntityTypes(http);
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

async function render(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick();
  fixture.detectChanges();
}

const texts = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-testid="timeline-item"] p')].map((p) => p.textContent?.trim());

describe('Timeline', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders kit events with their scoped texts and type labels', async () => {
    const { fixture, http, el } = await setup();
    const req = http.expectOne((r) => r.url === kitUrl('timeline'));
    expect(req.request.params.has('include_audit')).toBe(false);
    req.flush({
      items: [
        event(),
        event({
          id: 'e2',
          kind: 'link.created',
          label_key: 'kit:timeline.linkCreated',
          params: {
            link_type: 'caused_by',
            direction: 'outgoing',
            other_type: 'document',
            other_id: 'x',
            actor_name: null,
          },
          actor: { user_id: null, name: null, kind: 'system' },
        }),
        event({ id: 'e3', kind: 'deviation.reopened', label_key: null, params: {} }),
      ],
      next_before: null,
    });
    await render(fixture);
    expect(texts(el)).toEqual([
      'Ada commented',
      'CoreFlow linked a Document (Caused by)',
      'Ada: Deviation reopened',
    ]);
    expect(el.querySelector('[data-testid="timeline-more"]')).toBeNull();
    expect(el.querySelector('[data-testid="timeline-audit"]')).toBeNull();
  });

  it('pages back with the cursor', async () => {
    const { fixture, http, el } = await setup();
    http
      .expectOne((r) => r.url === kitUrl('timeline'))
      .flush({ items: [event()], next_before: '2026-11-01T10:00:00' });
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="timeline-more"] button')!.click();
    const next = http.expectOne((r) => r.url === kitUrl('timeline'));
    expect(next.request.params.get('before')).toBe('2026-11-01T10:00:00');
    next.flush({ items: [event({ id: 'e0' })], next_before: null });
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="timeline-item"]')).toHaveLength(2);
    expect(el.querySelector('[data-testid="timeline-more"]')).toBeNull();
  });

  it('lets audit readers include audit rows, with their changes', async () => {
    const { fixture, http, el } = await setup(['audit:read']);
    http.expectOne((r) => r.url === kitUrl('timeline')).flush({ items: [], next_before: null });
    await render(fixture);
    expect(el.querySelector('[data-testid="timeline-empty"]')).not.toBeNull();

    el.querySelector<HTMLInputElement>('[data-testid="timeline-audit"]')!.click();
    await render(fixture);
    const req = http.expectOne((r) => r.url === kitUrl('timeline'));
    expect(req.request.params.get('include_audit')).toBe('true');
    req.flush({
      items: [
        event({
          id: 'a1',
          source: 'audit',
          kind: 'deviation.updated',
          label_key: null,
          params: {},
          summary: 'Updated deviation',
          changes: [{ field: 'severity', before: 'low', after: null }],
        }),
      ],
      next_before: null,
    });
    await render(fixture);
    expect(texts(el)[0]).toBe('Ada: Updated deviation');
    expect(el.textContent).toContain('Severity: low → (empty)');
  });

  it('loads a module scope on demand for its labels', async () => {
    const { fixture, http, el } = await setup();
    http
      .expectOne((r) => r.url === kitUrl('timeline'))
      .flush({
        items: [event({ kind: 'risk.owner_changed', label_key: 'risk:timeline.ownerChanged' })],
        next_before: null,
      });
    await render(fixture);
    // The testing loader has no `risk` scope: the generic wording is used.
    expect(texts(el)[0]).toBe('Ada: Risk owner changed');
  });
});
