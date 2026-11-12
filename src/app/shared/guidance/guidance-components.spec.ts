import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AiAvailability } from '../../core/ai/ai-availability';
import { GuidanceFile } from '../../core/guidance/guidance.models';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { TutorService } from '../../core/guidance/tutor.service';
import { LanguageService } from '../../core/i18n/language.service';
import { FieldHelp } from './field-help';
import { GuideIntro } from './guide-intro';
import { TeachMe } from './teach-me';
import { TeachingEmpty } from './teaching-empty';
import { Term } from './term';
import { WhyItMatters } from './why-it-matters';

const FILES: Record<string, GuidanceFile> = {
  risk: {
    pages: {
      list: {
        intro: { title: 'Risk intro', body: 'Intro body', steps: ['Step one', 'Step two'] },
        why: { body: 'Why body', clauses: ['hs:6.1', 'custom-ref'] },
        empty: { title: 'No risks', body: 'Start here', cta: 'Add a risk' },
        fields: { likelihood: { help: 'How likely', example: 'Once a year' } },
      },
    },
  },
  glossary: { glossary: { nonconformity: { term: 'Nonconformity', definition: 'A miss' } } },
};

@Component({
  imports: [GuideIntro, WhyItMatters, FieldHelp, TeachingEmpty, Term, TeachMe],
  template: `
    <app-guide-intro scope="risk" page="list" />
    <app-why-it-matters scope="risk" page="list" />
    <app-field-help scope="risk" page="list" field="likelihood" />
    <app-teaching-empty scope="risk" page="list" (action)="actions = actions + 1" />
    <app-teaching-empty scope="risk" page="missing"
      ><p id="fallback">Fallback</p></app-teaching-empty
    >
    <p>
      A <app-term key="nonconformity">nonconformity</app-term> and
      <app-term key="nope">plain</app-term>
    </p>
    <app-teach-me topic="risk.list" subject="Risks" />
  `,
})
class Host {
  actions = 0;
}

function setup(level: 'beginner' | 'standard' | 'expert') {
  const fake = provideFakeGuidance(FILES, level);
  const tutor = { teach: vi.fn(), explainClause: vi.fn() };
  const ai = { unavailable: signal(false) };
  TestBed.configureTestingModule({
    imports: [Host, TranslocoTestingModule.forRoot({ langs: { en: {}, 'guidance/en': {} } })],
    providers: [
      provideZonelessChangeDetection(),
      ...fake.providers,
      { provide: TutorService, useValue: tutor },
      { provide: AiAvailability, useValue: ai },
      { provide: LanguageService, useValue: { translate: (key: string) => key } },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T>(sel);
  return { fixture, el, q, tutor, ai, level: fake.level, render: () => fixture.detectChanges() };
}

describe('guidance components', () => {
  it('shows the full intro and inline field help to beginners', () => {
    const { el, q } = setup('beginner');
    expect(q('[data-testid="guide-intro"]')?.textContent).toContain('Intro body');
    expect(el.textContent).toContain('Step two');
    expect(q('[data-testid="field-help-inline"]')?.textContent).toContain('How likely');
    expect(q('[data-testid="field-help-toggle"]')).toBeNull();
  });

  it('collapses the intro to one line for standard users and toggles it', () => {
    const { q, render } = setup('standard');
    const toggle = q<HTMLButtonElement>('[data-testid="guide-intro-toggle"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(q('[data-testid="guide-intro"]')?.textContent).not.toContain('Intro body');
    toggle.click();
    render();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(q('[data-testid="guide-intro"]')?.textContent).toContain('Intro body');
  });

  it('hides the intro behind an info button for experts and follows level changes', () => {
    const { q, render, level } = setup('expert');
    expect(q('[data-testid="guide-intro"]')).toBeNull();
    expect(q('[data-testid="guide-intro-toggle"]')?.textContent?.trim()).toBe('i');
    expect(q('[data-testid="why-it-matters"]')?.textContent).not.toContain('Why body');
    level.set('beginner');
    render();
    expect(q('[data-testid="guide-intro"]')?.textContent).toContain('Intro body');
    expect(q('[data-testid="why-it-matters"]')?.textContent).toContain('Why body');
  });

  it('opens the field-help popover and closes it with Escape', () => {
    const { q, render } = setup('standard');
    q<HTMLButtonElement>('[data-testid="field-help-toggle"]')!.click();
    render();
    expect(q('[data-testid="field-help-popover"]')?.textContent).toContain('How likely');
    q('app-field-help')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    render();
    expect(q('[data-testid="field-help-popover"]')).toBeNull();
  });

  it('renders clause chips that open the tutor', () => {
    const { el, tutor } = setup('standard');
    const chips = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-testid="clause-chip"]'));
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['guidance.clause', 'custom-ref']);
    chips[0].click();
    expect(tutor.explainClause).toHaveBeenCalledWith('hs:6.1');
  });

  it('teaches an empty state with a CTA and falls back to projected content', () => {
    const { q, fixture } = setup('beginner');
    const empty = q('[data-testid="teaching-empty"]')!;
    expect(empty.textContent).toContain('No risks');
    empty.querySelector<HTMLButtonElement>('app-button button')!.click();
    expect(fixture.componentInstance.actions).toBe(1);
    expect(q('#fallback')?.textContent).toBe('Fallback');
  });

  it('shows glossary definitions on focus and plain text for unknown terms', () => {
    const { el, render } = setup('standard');
    const terms = el.querySelectorAll<HTMLElement>('[data-testid="term"]');
    expect(terms[0].getAttribute('tabindex')).toBe('0');
    expect(terms[1].getAttribute('tabindex')).toBeNull();
    const tooltip = el.querySelector('[data-testid="term-tooltip"]')!;
    expect(tooltip.classList).toContain('hidden');
    terms[0].dispatchEvent(new FocusEvent('focus'));
    render();
    expect(tooltip.classList).not.toContain('hidden');
    expect(tooltip.textContent).toContain('A miss');
  });

  it('teach-me opens the tutor and hides while AI is unavailable', () => {
    const { el, tutor, ai, render } = setup('standard');
    const buttons = () =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('app-teach-me [data-testid="teach-me"]'));
    buttons().at(-1)!.click();
    expect(tutor.teach).toHaveBeenCalledWith('risk.list', 'Risks');
    ai.unavailable.set(true);
    render();
    expect(buttons()).toHaveLength(0);
  });
});
