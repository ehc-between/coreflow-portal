import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { PrivacySetup, PrivacySetupStep } from './data/privacy.models';
import { splitRoute } from './privacy-gaps';

/** The four steps of the beginner path, in order (U32). */
export const PATH_STEP_KEYS = ['ropa', 'processors', 'dpia', 'documents'] as const;

/**
 * U32 "Få orden på personvernet": four steps a beginner takes (map what you process →
 * processors and agreements → assess risk (DPIA) → make the documents). Each step is done
 * from the data (backend `overview.path`); the next undone step carries the button. Shows
 * steps done, never a percentage. Collapses to one line when all four are done.
 */
@Component({
  selector: 'app-privacy-path',
  imports: [RouterLink, TranslocoPipe, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = path();
    <app-card>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 font-display text-card font-bold text-fg">
          <app-icon name="flag" [size]="16" />
          {{ 'privacy.path.title' | transloco }}
        </h2>
        <span class="text-meta font-semibold text-fg-muted" data-testid="path-progress">
          {{ 'privacy.path.progress' | transloco: { done: p.done, total: p.total } }}
        </span>
      </div>
      @if (complete() && !expanded()) {
        <p class="mt-3 text-ui text-fg-muted" data-testid="path-complete">
          {{ 'privacy.path.complete' | transloco }}
          <button
            type="button"
            class="ml-1 font-semibold text-accent hover:underline"
            (click)="expanded.set(true)"
          >
            {{ 'privacy.setup.showSteps' | transloco }}
          </button>
        </p>
      } @else {
        <ol class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2" data-testid="path-steps">
          @for (step of steps(); track step.key; let i = $index) {
            <li
              class="flex items-start gap-2 rounded-tile border px-3 py-2"
              [class]="
                step.done
                  ? 'border-pass/30 bg-pass-soft/50'
                  : step.key === next()
                    ? 'border-accent'
                    : 'border-border'
              "
              [attr.data-testid]="'path-step-' + step.key"
            >
              <span
                class="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-micro font-bold"
                [class]="step.done ? 'bg-pass text-white' : 'bg-surface-2 text-fg-muted'"
                aria-hidden="true"
              >
                @if (step.done) {
                  <app-icon name="check" [size]="12" />
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-ui font-semibold text-fg">
                  {{ 'privacy.path.steps.' + step.key + '.title' | transloco }}
                  @if (step.done) {
                    <span class="sr-only">{{ 'privacy.setup.doneSr' | transloco }}</span>
                  }
                </span>
                <span class="block text-meta text-fg-muted">
                  {{ 'privacy.path.steps.' + step.key + '.body' | transloco }}
                </span>
                <a
                  [routerLink]="link(step).path"
                  [queryParams]="link(step).query"
                  class="mt-1 inline-block text-ui font-semibold text-accent hover:underline"
                  [attr.data-testid]="'path-cta-' + step.key"
                >
                  {{ 'privacy.path.steps.' + step.key + '.cta' | transloco }} →
                </a>
              </span>
            </li>
          }
        </ol>
      }
    </app-card>
  `,
})
export class PrivacyPath {
  readonly path = input.required<PrivacySetup>();

  protected readonly expanded = signal(false);
  protected readonly complete = computed(() => this.path().done >= this.path().total);
  /** Known steps only, in the backend's order. */
  protected readonly steps = computed(() =>
    this.path().steps.filter((s) => (PATH_STEP_KEYS as readonly string[]).includes(s.key)),
  );
  /** The first step not done yet: it is outlined as the next thing to do. */
  protected readonly next = computed(() => this.steps().find((s) => !s.done)?.key ?? null);

  protected link(step: PrivacySetupStep) {
    return splitRoute(step.url || '/privacy');
  }
}
