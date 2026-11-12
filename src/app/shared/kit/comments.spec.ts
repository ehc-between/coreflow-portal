import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { CommentItem } from '../../core/kit/kit.models';
import { Comments } from './comments';
import { configureKit, kitUrl, tick } from './kit.testing';

function comment(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
    id: 'c1',
    entity_type: 'deviation',
    entity_id: 'd1',
    parent_id: null,
    author: { id: 'u1', name: 'Ada Lovelace' },
    body: 'Please check @Bob Builder',
    mentions: [{ id: 'u2', name: 'Bob Builder' }],
    created_at: '2026-11-01T10:00:00',
    edited_at: null,
    can_edit: true,
    can_delete: true,
    ...overrides,
  };
}

async function setup(canComment = true) {
  const { http, ask } = configureKit(Comments);
  const fixture: ComponentFixture<Comments> = TestBed.createComponent(Comments);
  fixture.componentRef.setInput('entityType', 'deviation');
  fixture.componentRef.setInput('entityId', 'd1');
  fixture.componentRef.setInput('canComment', canComment);
  await render(fixture);
  return { fixture, http, ask, el: fixture.nativeElement as HTMLElement };
}

async function render(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick();
  fixture.detectChanges();
}

function flushList(http: HttpTestingController, items: CommentItem[]) {
  const req = http.expectOne((r) => r.url === kitUrl('comments') && r.method === 'GET');
  expect(req.request.params.get('entity_type')).toBe('deviation');
  req.flush({ items });
}

function flushCandidates(http: HttpTestingController) {
  for (const req of http.match(kitUrl('access-subjects'))) {
    req.flush({
      users: [
        { id: 'u2', name: 'Bob Builder', email: 'bob@x.no' },
        { id: 'u3', name: 'Kari Nordmann', email: 'kari@x.no' },
      ],
      departments: [],
    });
  }
}

function type(area: HTMLTextAreaElement, value: string) {
  area.value = value;
  area.setSelectionRange(value.length, value.length);
  area.dispatchEvent(new Event('input'));
}

describe('Comments', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows a teaching empty state', async () => {
    const { fixture, http, el } = await setup();
    flushList(http, []);
    flushCandidates(http);
    await render(fixture);
    expect(el.querySelector('[data-testid="comments-empty"]')?.textContent).toContain(
      'No comments yet.',
    );
  });

  it('renders threads with highlighted mentions and replies', async () => {
    const { fixture, http, el } = await setup();
    flushList(http, [
      comment(),
      comment({ id: 'c2', parent_id: 'c1', body: 'Done', mentions: [], can_edit: false }),
    ]);
    flushCandidates(http);
    await render(fixture);

    expect(el.querySelectorAll('[data-testid="comment-thread"]')).toHaveLength(1);
    expect(el.querySelectorAll('[data-testid="comment"]')).toHaveLength(2);
    const mention = el.querySelector('.bg-accent-soft');
    expect(mention?.textContent?.trim()).toBe('@Bob Builder');
  });

  it('posts a comment with the mentions picked from the menu', async () => {
    const { fixture, http, el } = await setup();
    flushList(http, []);
    flushCandidates(http);
    await render(fixture);

    const area = el.querySelector<HTMLTextAreaElement>('[data-testid="comment-input"]')!;
    type(area, 'Hello @ka');
    await render(fixture);
    const menu = el.querySelector('[data-testid="mention-menu"]');
    expect(menu?.textContent).toContain('Kari Nordmann');
    expect(menu?.textContent).not.toContain('Bob Builder');

    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await render(fixture);
    expect(area.value).toBe('Hello @Kari Nordmann ');
    expect(el.querySelector('[data-testid="mention-menu"]')).toBeNull();

    el.querySelector<HTMLElement>('[data-testid="comment-submit"] button')!.click();
    const req = http.expectOne((r) => r.url === kitUrl('comments') && r.method === 'POST');
    expect(req.request.body).toEqual({
      entity_type: 'deviation',
      entity_id: 'd1',
      body: 'Hello @Kari Nordmann',
      parent_id: null,
      mentions: ['u3'],
    });
    req.flush(comment({ id: 'c9', body: 'Hello @Kari Nordmann', mentions: [] }));
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="comment"]')).toHaveLength(1);
    expect(area.value).toBe('');
  });

  it('explains a rejected mention in place', async () => {
    const { fixture, http, el } = await setup();
    flushList(http, []);
    flushCandidates(http);
    await render(fixture);
    const area = el.querySelector<HTMLTextAreaElement>('[data-testid="comment-input"]')!;
    type(area, 'Hi');
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="comment-submit"] button')!.click();
    http
      .expectOne((r) => r.url === kitUrl('comments') && r.method === 'POST')
      .flush(
        { detail: { code: 'mention_no_access' } },
        { status: 422, statusText: 'Unprocessable' },
      );
    await render(fixture);
    expect(el.textContent).toContain('cannot see this record');
  });

  it('deletes a comment after confirmation and keeps its replies', async () => {
    const { fixture, http, el } = await setup();
    flushList(http, [comment(), comment({ id: 'c2', parent_id: 'c1', body: 'Reply' })]);
    flushCandidates(http);
    await render(fixture);

    const deleteButton = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Delete',
    )!;
    deleteButton.click();
    await render(fixture);
    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Delete comment',
    )!;
    confirm.click();
    http
      .expectOne((r) => r.url === kitUrl('comments/c1') && r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="comment"]')).toHaveLength(1);
    expect(el.textContent).toContain('Reply');
  });

  it('is read-only without comment rights and skips the people directory', async () => {
    const { fixture, http, el } = await setup(false);
    flushList(http, [comment()]);
    await render(fixture);
    expect(el.querySelector('[data-testid="comment-input"]')).toBeNull();
    expect(el.textContent).toContain('You can read this discussion');
    http.expectNone(kitUrl('access-subjects'));
  });

  it('asks the assistant to summarise the discussion', async () => {
    const { fixture, http, el, ask } = await setup();
    flushList(http, [comment()]);
    flushCandidates(http);
    await render(fixture);
    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Summarise discussion'),
    )!;
    button.click();
    expect(ask.prompts[0]).toContain('id d1');
    expect(ask.prompts[0]).toContain('Summarise the discussion');
  });
});
