import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { RevisionSummary } from '../../core/kit/kit.models';
import { configureKit, kitUrl, tick } from './kit.testing';
import { RevisionHistory } from './revision-history';

function rev(no: number, overrides: Partial<RevisionSummary> = {}): RevisionSummary {
  return {
    id: `r${no}`,
    entity_type: 'document',
    entity_id: 'doc1',
    revision_no: no,
    changed_fields: no === 1 ? ['title', 'status'] : ['status'],
    change_reason: no === 1 ? null : 'Approved after review',
    actor: { user_id: 'u1', name: 'Ada', kind: 'user' },
    created_at: `2026-11-0${no}T10:00:00`,
    ...overrides,
  };
}

async function setup() {
  const { http, ask } = configureKit(RevisionHistory);
  const fixture: ComponentFixture<RevisionHistory> = TestBed.createComponent(RevisionHistory);
  fixture.componentRef.setInput('entityType', 'document');
  fixture.componentRef.setInput('entityId', 'doc1');
  fixture.componentRef.setInput('fieldLabels', { status: 'documents.status.label' });
  await render(fixture);
  return { fixture, http, ask, el: fixture.nativeElement as HTMLElement };
}

async function render(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick();
  fixture.detectChanges();
}

function flushList(http: HttpTestingController, items: RevisionSummary[]) {
  http.expectOne((r) => r.url === kitUrl('revisions')).flush({ items });
}

const buttonWithText = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === text);

describe('RevisionHistory', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('teaches when nothing was recorded yet', async () => {
    const { fixture, http, el } = await setup();
    flushList(http, []);
    await render(fixture);
    expect(el.querySelector('[data-testid="revisions-empty"]')?.textContent).toContain(
      'documented information under control',
    );
  });

  it('lists revisions with actor, fields and reason', async () => {
    const { fixture, http, el } = await setup();
    flushList(http, [rev(3, { actor: { user_id: null, name: null, kind: 'ai' } }), rev(2), rev(1)]);
    await render(fixture);
    const rows = el.querySelectorAll('[data-testid="revision"]');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Revision 3');
    expect(rows[0].textContent).toContain('by the assistant');
    expect(rows[1].textContent).toContain('by Ada');
    expect(rows[1].textContent).toContain('Reason: Approved after review');
    expect(rows[1].textContent).toContain('Changed: Status');
    expect(rows[2].textContent).toContain('Created');
  });

  it('compares a revision with the previous one, side by side', async () => {
    const { fixture, http, el, ask } = await setup();
    flushList(http, [rev(2), rev(1)]);
    await render(fixture);
    buttonWithText(el.querySelectorAll('[data-testid="revision"]')[0], 'Show changes')!.click();
    const req = http.expectOne((r) => r.url === kitUrl('revisions/compare'));
    expect(req.request.params.get('from_id')).toBe('r1');
    expect(req.request.params.get('to_id')).toBe('r2');
    req.flush({
      from: rev(1),
      to: rev(2),
      changes: [
        { field: 'status', before: 'draft', after: 'approved' },
        { field: 'reviewed', before: null, after: true },
      ],
    });
    await render(fixture);
    const view = el.querySelector('[data-testid="revision-view"]')!;
    expect(view.textContent).toContain('Comparing revision 1 with revision 2');
    const cells = [...view.querySelectorAll('[data-testid="revision-row"]')].map((row) =>
      [...row.children].map((c) => c.textContent?.trim()),
    );
    expect(cells).toEqual([
      ['Status', 'draft', 'approved'],
      ['Reviewed', '(empty)', 'Yes'],
    ]);

    buttonWithText(view, 'Explain these changes')!.click();
    expect(ask.prompts[0]).toContain('between revision 1 and revision 2');
  });

  it('compares any two ticked revisions, oldest first', async () => {
    const { fixture, http, el } = await setup();
    flushList(http, [rev(3), rev(2), rev(1)]);
    await render(fixture);
    const boxes = el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    boxes[0].click();
    boxes[2].click();
    await render(fixture);
    expect(boxes[1].disabled).toBe(true);
    el.querySelector<HTMLElement>('[data-testid="revisions-compare"] button')!.click();
    const req = http.expectOne((r) => r.url === kitUrl('revisions/compare'));
    expect(req.request.params.get('from_id')).toBe('r1');
    expect(req.request.params.get('to_id')).toBe('r3');
    req.flush({ from: rev(1), to: rev(3), changes: [] });
    await render(fixture);
    expect(el.textContent).toContain('The two revisions have the same contents.');
  });

  it('shows the contents of the first revision', async () => {
    const { fixture, http, el } = await setup();
    flushList(http, [rev(1)]);
    await render(fixture);
    buttonWithText(el, 'Show contents')!.click();
    http
      .expectOne(kitUrl('revisions/r1'))
      .flush({ ...rev(1), snapshot: { title: 'Pump check', tags: ['a', 'b'] } });
    await render(fixture);
    const view = el.querySelector('[data-testid="revision-view"]')!;
    expect(view.textContent).toContain('Contents of revision 1');
    expect(view.textContent).toContain('Pump check');
    expect(view.textContent).toContain('a, b');
  });
});
