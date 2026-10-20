import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { RequirementLink } from '../../core/standards/standards.models';
import { RequirementChips } from './requirement-chips';

function link(i: number, over: Partial<RequirementLink> = {}): RequirementLink {
  return {
    id: `l-${i}`,
    requirement_ref: `iso27001:A.5.${i}.r1`,
    standard_key: 'iso27001',
    clause_number: `A.5.${i}`,
    entity_type: 'document',
    entity_id: 'doc-1',
    entity_label: 'Policy',
    status: 'confirmed',
    source: 'user',
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

describe('RequirementChips', () => {
  let fixture: ComponentFixture<RequirementChips>;
  let el: HTMLElement;
  let more: number;

  async function setup(links: RequirementLink[], max?: number): Promise<void> {
    TestBed.configureTestingModule({
      imports: [RequirementChips, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    fixture = TestBed.createComponent(RequirementChips);
    fixture.componentRef.setInput('links', links);
    if (max !== undefined) {
      fixture.componentRef.setInput('max', max);
    }
    more = 0;
    fixture.componentInstance.more.subscribe(() => more++);
    fixture.detectChanges();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  const chips = () =>
    Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-testid="requirement-chip"]'));

  it('renders nothing without links', async () => {
    await setup([link(1, { status: 'rejected' })]);
    expect(el.querySelector('[data-testid="requirement-chips"]')).toBeNull();
  });

  it('shows short refs linking to the requirement in its workspace, confirmed first', async () => {
    await setup([link(2, { status: 'suggested', source: 'ai' }), link(1)]);
    const [first, second] = chips();
    expect(first.textContent?.trim()).toBe('A.5.1.r1');
    expect(first.getAttribute('href')).toBe('/standards/iso27001/A.5.1?req=iso27001:A.5.1.r1');
    expect(first.getAttribute('title')).toBe('iso27001:A.5.1.r1');
    // The AI suggestion is marked (spark icon, dashed border) and comes last.
    expect(second.textContent).toContain('A.5.2.r1');
    expect(second.className).toContain('border-dashed');
    expect(second.querySelector('app-icon')).not.toBeNull();
  });

  it('collapses the overflow into "+N", which asks for the full panel', async () => {
    await setup(
      [1, 2, 3, 4, 5].map((i) => link(i)),
      3,
    );
    expect(chips()).toHaveLength(3);
    const plus = el.querySelector<HTMLButtonElement>('[data-testid="requirement-chips-more"]')!;
    expect(plus.textContent?.trim()).toBe('+2');
    plus.click();
    expect(more).toBe(1);
  });
});
