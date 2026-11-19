import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AiAvailability } from '../../core/ai/ai-availability';
import { GuidanceFile, GuidanceLevel } from '../../core/guidance/guidance.models';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { TutorService } from '../../core/guidance/tutor.service';
import { LanguageService } from '../../core/i18n/language.service';
import { HelpStrip } from '../ui/help-strip/help-strip';
import { GuidanceText } from './guidance-text';

const FILES: Record<string, GuidanceFile> = {
  risk: {
    pages: {
      list: {
        intro: {
          title: 'Risikoregisteret',
          body: 'Rødt er over [[risk-appetite|risikoappetitten]]. Mer tekst her.',
          steps: ['Sjekk [[risk-appetite|risikoappetitten]] og **[[ict|IKT]]**.'],
        },
      },
    },
  },
  glossary: {
    glossary: {
      'risk-appetite': {
        term: 'Risikoappetitt',
        definition: 'Hvor mye risiko virksomheten godtar.',
        beginner: 'grensen for hva dere godtar',
      },
      ict: { term: 'IKT', definition: 'Datasystemer.', beginner: 'IT-systemer og nettverk' },
    },
  },
};

@Component({
  imports: [GuidanceText],
  template: `
    <app-guidance-text id="block" [text]="body()" />
    <app-guidance-text id="inline" [text]="step" [inline]="true" [seen]="['risk-appetite']" />
    <app-guidance-text
      id="plain"
      text="Ingen **ord** her.

- én
- to"
    />
  `,
})
class Host {
  readonly body = signal(
    'Rødt er over [[risk-appetite|risikoappetitten]].\n\nSå **mindre [[ict|IKT]]**.',
  );
  readonly step = 'Se [[risk-appetite|risikoappetitten]] og [[ict|IKT]].';
}

function setup(level: GuidanceLevel, host: typeof Host | typeof StripHost = Host) {
  const fake = provideFakeGuidance(FILES, level);
  TestBed.configureTestingModule({
    imports: [host, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      ...fake.providers,
      { provide: TutorService, useValue: { teach: vi.fn(), explainClause: vi.fn() } },
      { provide: AiAvailability, useValue: { unavailable: signal(true) } },
      { provide: LanguageService, useValue: { translate: (key: string) => key } },
    ],
  });
  const fixture = TestBed.createComponent(host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  /** Visible text: without the (hidden) term tooltips. */
  const text = (sel: string) => {
    const copy = el.querySelector(sel)?.cloneNode(true) as HTMLElement | undefined;
    copy?.querySelectorAll('[role="tooltip"]').forEach((t) => t.remove());
    return copy?.textContent?.replace(/\s+/g, ' ').trim();
  };
  return { fixture, el, text, level: fake.level };
}

@Component({
  imports: [HelpStrip],
  template: `<app-help-strip scope="risk" page="list" />`,
})
class StripHost {}

describe('GuidanceText (simplify U39)', () => {
  it('renders terms as <app-term> with the words as written for standard users', () => {
    const { el, text } = setup('standard');
    expect(text('#block p:first-child')).toBe('Rødt er over risikoappetitten.');
    expect(text('#block p:last-child')).toBe('Så mindre IKT.');
    const terms = el.querySelectorAll('#block [data-testid="term"]');
    expect(terms.length).toBe(2);
    // The definition is one hover away.
    expect(el.querySelector('#block [data-testid="term-tooltip"]')?.textContent).toContain(
      'Hvor mye risiko virksomheten godtar.',
    );
    expect(el.querySelectorAll('#block p').length).toBe(2);
    // Bold around a term keeps the term bold.
    expect(text('#block strong app-term')).toBe('IKT');
  });

  it('shows beginners the plain words first, once per term', () => {
    const { text, level, fixture } = setup('beginner');
    expect(text('#block p:first-child')).toBe(
      'Rødt er over grensen for hva dere godtar (risikoappetitten).',
    );
    expect(text('#block p:last-child')).toBe('Så mindre IKT (IT-systemer og nettverk).');
    // "seen" terms were explained above, so only IKT is expanded inline.
    expect(text('#inline')).toBe('Se risikoappetitten og IT-systemer og nettverk (IKT).');
    level.set('standard');
    fixture.detectChanges();
    expect(text('#inline')).toBe('Se risikoappetitten og IKT.');
  });

  it('renders text without terms as plain markdown', () => {
    const { el } = setup('beginner');
    expect(el.querySelector('#plain strong')?.textContent).toBe('ord');
    expect(el.querySelectorAll('#plain li').length).toBe(2);
  });

  it('the help strip explains terms in its lead and panel, without raw tokens', () => {
    const { el } = setup('beginner', StripHost);
    const lead = el.querySelector('[data-testid="help-strip-lead"]')?.textContent ?? '';
    expect(lead.replace(/\s+/g, ' ').trim()).toBe(
      'Rødt er over grensen for hva dere godtar (risikoappetitten).',
    );
    expect(lead).not.toContain('[[');
    // The one-line lead has no hover (a tooltip would be clipped).
    expect(el.querySelector('[data-testid="help-strip-lead"] [data-testid="term"]')).toBeNull();
  });
});
