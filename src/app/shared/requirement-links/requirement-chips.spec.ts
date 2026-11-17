import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { RequirementLabel, RequirementLink } from '../../core/standards/standards.models';
import { RequirementChip } from './requirement-chip';
import { RequirementChips } from './requirement-chips';

function label(over: Partial<RequirementLabel> = {}): RequirementLabel {
  return {
    ref: 'iso9001-2026:8.4.1.r2',
    short: 'ISO 9001',
    number: '8.4.1',
    title: 'Kontroll med eksterne leverandører',
    text: 'Leverandører vurderes før bruk.',
    standard_key: 'iso9001-2026',
    framework: 'iso9001',
    req_index: 2,
    req_count: 3,
    ...over,
  };
}

function link(i: number, over: Partial<RequirementLink> = {}): RequirementLink {
  return {
    id: `l-${i}`,
    requirement_ref: `iso27001-2022:A.5.${i}.r1`,
    standard_key: 'iso27001-2022',
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

const STANDARDS_EN = {
  reqs: { position: '(requirement {{index}} of {{count}})', suggestion: 'Suggestion' },
};

describe('RequirementChip', () => {
  async function render(l: RequirementLabel, status: 'confirmed' | 'suggested' = 'confirmed') {
    TestBed.configureTestingModule({
      imports: [
        RequirementChip,
        TranslocoTestingModule.forRoot({
          langs: { en: {}, 'standards/en': STANDARDS_EN },
          preloadLangs: true,
          translocoConfig: { defaultLang: 'en', availableLangs: ['en'] },
        }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(RequirementChip);
    fixture.componentRef.setInput('label', l);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('[data-testid="requirement-chip"]') as HTMLElement;
  }

  it('reads "<short> · <number>" with the clause position, never the raw .rN ref', async () => {
    const chip = await render(label());
    const text = chip.textContent?.replace(/\s+/g, ' ').trim();
    expect(text).toContain('ISO 9001 · 8.4.1');
    expect(text).toContain('(requirement 2 of 3)');
    expect(text).not.toContain('.r2');
    // Tooltip: the clause title (and requirement text) in the UI language.
    expect(chip.getAttribute('title')).toBe(
      'Kontroll med eksterne leverandører — Leverandører vurderes før bruk.',
    );
    expect(chip.getAttribute('href')).toBe(
      '/standards/iso9001-2026/8.4.1?req=iso9001-2026:8.4.1.r2',
    );
  });

  it('leaves out the position for single-requirement clauses', async () => {
    const chip = await render(label({ req_index: 1, req_count: 1 }));
    expect(chip.textContent?.replace(/\s+/g, ' ').trim()).toBe('ISO 9001 · 8.4.1');
  });

  it('marks suggestions with a dashed border and the word "Suggestion"', async () => {
    const chip = await render(label({ req_count: 1 }), 'suggested');
    expect(chip.className).toContain('border-dashed');
    expect(chip.textContent).toContain('Suggestion');
    expect(chip.dataset['status']).toBe('suggested');
  });
});

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
    Array.from(el.querySelectorAll<HTMLElement>('[data-testid="requirement-chip"]'));

  it('renders nothing without links', async () => {
    await setup([link(1, { status: 'rejected' })]);
    expect(el.querySelector('[data-testid="requirement-chips"]')).toBeNull();
  });

  it('uses the backend label, confirmed before suggested, linking to the requirement', async () => {
    await setup([
      link(2, { status: 'suggested' }),
      link(1, { label: label({ number: 'A.5.1', short: 'ISO 27001', req_count: 1 }) }),
    ]);
    const all = chips();
    expect(all).toHaveLength(2);
    expect(all[0].textContent).toContain('ISO 27001 · A.5.1');
    expect(all[0].dataset['status']).toBe('confirmed');
    // Without a backend label: the standard's short name and the clause number.
    expect(all[1].textContent).toContain('ISO 27001 · A.5.2');
    expect(all[1].dataset['status']).toBe('suggested');
    expect(all[1].getAttribute('href')).toContain('/standards/iso27001-2022/A.5.2');
  });

  it('overflows into a "+N" chip that asks the host for the full panel', async () => {
    await setup(
      [1, 2, 3, 4].map((i) => link(i)),
      2,
    );
    expect(chips()).toHaveLength(2);
    const plus = el.querySelector<HTMLButtonElement>('[data-testid="requirement-chips-more"]')!;
    expect(plus.textContent?.trim()).toBe('+2');
    plus.click();
    expect(more).toBe(1);
  });
});
