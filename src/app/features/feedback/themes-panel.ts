import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { Badge } from '../../shared/ui/badge/badge';
import { feedbackSentimentKey, sentimentTone } from './data/feedback-display';
import { ThemesResult } from './data/feedback.models';

/** Coerce the assist's JSON into a `ThemesResult` (missing parts become empty). */
export function asThemes(raw: unknown): ThemesResult | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Partial<ThemesResult>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  return {
    summary: typeof r.summary === 'string' ? r.summary : '',
    themes: Array.isArray(r.themes)
      ? r.themes
          .filter((t) => t && typeof t.title === 'string')
          .map((t) => ({
            title: t.title,
            description: typeof t.description === 'string' ? t.description : '',
            sentiment: t.sentiment ?? null,
            count: typeof t.count === 'number' ? t.count : 0,
            example_codes: strings(t.example_codes),
          }))
      : [],
    trends: strings(r.trends),
    recommendations: strings(r.recommendations),
  };
}

/**
 * The "themes and trends" AI button (assist `feedback.themes`) and its result:
 * a summary, the recurring themes with sentiment and examples, trends and
 * recommendations. Runs over the register for a period, or over one survey when
 * `entityType="survey"`. The result is marked as generated and never saved.
 */
@Component({
  selector: 'app-feedback-themes',
  imports: [TranslocoPipe, AiAssistButton, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 [id]="headingId" class="font-display text-[15px] font-bold text-fg">
          {{ 'feedback.themes.title' | transloco }}
        </h2>
        <app-ai-assist-button
          assist="feedback.themes"
          labelKey="feedback.themes.run"
          [input]="assistInput()"
          [entityType]="entityType()"
          [entityId]="entityId()"
          [disabled]="disabled()"
          (result)="result.set(asThemes($event))"
        />
      </div>
      <p class="text-[12.5px] text-fg-muted">{{ 'feedback.themes.intro' | transloco }}</p>

      @if (result(); as r) {
        <div class="mt-3 flex flex-col gap-3" aria-live="polite" data-testid="themes-result">
          <p class="text-[11.5px] font-semibold tracking-wide text-fg-subtle uppercase">
            {{ 'feedback.themes.generated' | transloco }}
          </p>
          @if (r.summary) {
            <p class="text-[13.5px] whitespace-pre-line text-fg">{{ r.summary }}</p>
          }
          @if (r.themes.length) {
            <ul class="flex flex-col gap-2">
              @for (t of r.themes; track $index) {
                <li class="rounded-tile border border-border p-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[13.5px] font-semibold text-fg">{{ t.title }}</span>
                    @if (t.sentiment) {
                      <app-badge [tone]="sentimentTone(t.sentiment)">{{
                        sentimentKey(t.sentiment) | transloco
                      }}</app-badge>
                    }
                    @if (t.count) {
                      <span class="text-[12px] text-fg-subtle">{{
                        'feedback.themes.count' | transloco: { count: t.count }
                      }}</span>
                    }
                  </div>
                  @if (t.description) {
                    <p class="mt-1 text-[13px] text-fg-muted">{{ t.description }}</p>
                  }
                  @if (t.example_codes.length) {
                    <p class="mt-1 font-mono text-[12px] text-fg-subtle">
                      {{ t.example_codes.join(', ') }}
                    </p>
                  }
                </li>
              }
            </ul>
          }
          @if (r.trends.length) {
            <div>
              <h3 class="mb-1 text-[13px] font-semibold text-fg">
                {{ 'feedback.themes.trends' | transloco }}
              </h3>
              <ul class="list-disc pl-5 text-[13px] text-fg">
                @for (t of r.trends; track $index) {
                  <li>{{ t }}</li>
                }
              </ul>
            </div>
          }
          @if (r.recommendations.length) {
            <div>
              <h3 class="mb-1 text-[13px] font-semibold text-fg">
                {{ 'feedback.themes.recommendations' | transloco }}
              </h3>
              <ul class="list-disc pl-5 text-[13px] text-fg">
                @for (t of r.recommendations; track $index) {
                  <li>{{ t }}</li>
                }
              </ul>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class FeedbackThemes {
  readonly assistInput = input<Readonly<Record<string, unknown>>>({});
  readonly entityType = input<string | null>(null);
  readonly entityId = input<string | null>(null);
  readonly disabled = input(false);

  private static nextId = 0;
  protected readonly headingId = `cf-fb-themes-${FeedbackThemes.nextId++}`;
  protected readonly result = signal<ThemesResult | null>(null);
  protected readonly asThemes = asThemes;
  protected readonly sentimentKey = feedbackSentimentKey;
  protected readonly sentimentTone = sentimentTone;
}
