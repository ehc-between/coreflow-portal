import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { GuidanceFile } from '../../../core/guidance/guidance.models';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { TutorService } from '../../../core/guidance/tutor.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { ContinuityLearnMore } from './continuity-page';

const lesson = (title: string, minutes: number) => ({
  title,
  minutes,
  sections: [{ heading: 'One', body: 'Body' }],
});

const FILES: Record<string, GuidanceFile> = {
  continuity: {
    pages: { biaDetail: { intro: { title: 'BIA intro', body: 'Intro body.' } } },
    lessons: {
      'running-a-bia': lesson('Running a BIA', 6),
      'recovery-targets': lesson('Recovery targets', 4),
      'writing-a-plan': lesson('Writing a plan', 5),
    },
  },
};

@Component({
  imports: [HelpStrip, ContinuityLearnMore],
  template: `
    @if (strip()) {
      <app-help-strip scope="continuity" page="biaDetail" lesson="running-a-bia" />
    }
    <app-continuity-learn-more
      [lessons]="['recovery-targets', 'writing-a-plan', 'running-a-bia']"
    />
  `,
})
class Page {
  readonly strip = signal(true);
}

function setup() {
  const fake = provideFakeGuidance(FILES, 'beginner');
  TestBed.configureTestingModule({
    imports: [Page, TranslocoTestingModule.forRoot({ langs: { en: {}, 'guidance/en': {} } })],
    providers: [
      provideZonelessChangeDetection(),
      ...fake.providers,
      { provide: TutorService, useValue: { teach: vi.fn(), explainClause: vi.fn() } },
      { provide: AiAvailability, useValue: { unavailable: signal(false) } },
      { provide: LanguageService, useValue: { translate: (key: string) => key } },
    ],
  });
  const fixture = TestBed.createComponent(Page);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Continuity "Lær mer" card (U38: one help entry point)', () => {
  it('hands its lessons to the "?" panel while the page has a help strip', async () => {
    const { fixture, el } = setup();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="learn-more"]')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="help-strip-toggle"]')!.click();
    await fixture.whenStable();
    const more = [...el.querySelectorAll('[data-testid="help-strip-more-lesson"]')].map((b) =>
      b.textContent?.trim(),
    );
    // The strip's own lesson is not repeated in the list.
    expect(more).toHaveLength(2);
    expect(more[0]).toContain('Recovery targets');
    expect(more[1]).toContain('Writing a plan');

    el.querySelectorAll<HTMLButtonElement>('[data-testid="help-strip-more-lesson"]')[1].click();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="help-strip-back"]')).not.toBeNull();
  });

  it('shows the card in place on a page without a help strip', async () => {
    const { fixture, el } = setup();
    fixture.componentInstance.strip.set(false);
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="learn-more"]')).not.toBeNull();
  });
});
