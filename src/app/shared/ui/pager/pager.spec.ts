import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Pager } from './pager';

async function setup(inputs: {
  offset: number;
  count: number;
  total: number | null;
  pageSize?: number;
}) {
  TestBed.configureTestingModule({
    imports: [Pager, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Pager);
  fixture.componentRef.setInput('offset', inputs.offset);
  fixture.componentRef.setInput('count', inputs.count);
  fixture.componentRef.setInput('total', inputs.total);
  fixture.componentRef.setInput('pageSize', inputs.pageSize ?? 10);
  const pages: number[] = [];
  fixture.componentInstance.pageChange.subscribe((offset) => pages.push(offset));
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const [prev, next] = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
  return { root, prev, next, pages };
}

describe('Pager', () => {
  it('hides when everything fits on one page', async () => {
    const { root } = await setup({ offset: 0, count: 4, total: 4 });
    expect(root.querySelector('nav')).toBeNull();
  });

  it('pages forward and back by the page size', async () => {
    const { prev, next, pages } = await setup({ offset: 10, count: 10, total: 25 });
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(false);
    next.click();
    prev.click();
    expect(pages).toEqual([20, 0]);
  });

  it('disables Next on the last page', async () => {
    const { next } = await setup({ offset: 20, count: 5, total: 25 });
    expect(next.disabled).toBe(true);
  });

  it('keeps Next enabled while full pages come back and the total is unknown', async () => {
    const full = await setup({ offset: 0, count: 10, total: null });
    expect(full.next.disabled).toBe(false);
  });
});
