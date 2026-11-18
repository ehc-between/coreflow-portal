import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { PrivacyApi } from './data/privacy-api';
import { PrivacySetup, PrivacySetupStep, SETUP_STEP_KEYS } from './data/privacy.models';
import { privacyError } from './data/privacy-errors';
import { splitRoute } from './privacy-gaps';

/** The two routines a user ticks by hand (the others follow from the registers). */
const MANUAL = new Set(['requests', 'breaches']);

/**
 * "Start her": the order a beginner sets up privacy work in — the controller and DPO
 * contacts, the record of processing, processors, retention rules, DPIAs, then the
 * request and breach routines. Done steps follow from the registers; the two routines
 * are ticked by a privacy manager. Collapses to one line when everything is done.
 */
@Component({
  selector: 'app-privacy-setup',
  imports: [RouterLink, TranslocoPipe, Card, Icon, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = setup();
    <app-card>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 font-display text-card font-bold text-fg">
          <app-icon name="flag" [size]="16" />
          {{ 'privacy.setup.title' | transloco }}
        </h2>
        <span class="text-meta font-semibold text-fg-muted" data-testid="setup-progress">
          {{ 'privacy.setup.progress' | transloco: { done: s.done, total: s.total } }}
        </span>
      </div>
      <app-progress-bar
        class="mt-2 block"
        [value]="s.total ? (s.done / s.total) * 100 : 0"
        [label]="'privacy.setup.progress' | transloco: { done: s.done, total: s.total }"
      />
      @if (complete() && !expanded()) {
        <p class="mt-3 text-ui text-fg-muted">
          {{ 'privacy.setup.complete' | transloco }}
          <button
            type="button"
            class="ml-1 font-semibold text-accent hover:underline"
            (click)="expanded.set(true)"
          >
            {{ 'privacy.setup.showSteps' | transloco }}
          </button>
        </p>
      } @else {
        <p class="mt-3 mb-2 text-ui text-fg-muted">{{ 'privacy.setup.intro' | transloco }}</p>
        <ol class="flex flex-col gap-1.5" data-testid="setup-steps">
          @for (step of steps(); track step.key; let i = $index) {
            <li
              class="flex flex-col gap-2 rounded-tile border px-3 py-2 sm:flex-row sm:items-center"
              [class]="step.done ? 'border-pass/30 bg-pass-soft/50' : 'border-border'"
              [attr.data-testid]="'setup-step-' + step.key"
            >
              <span class="flex min-w-0 flex-1 items-start gap-2">
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
                <span class="min-w-0">
                  <span class="block text-ui font-semibold text-fg">
                    {{ 'privacy.setup.steps.' + step.key + '.title' | transloco }}
                    @if (step.done) {
                      <span class="sr-only">{{ 'privacy.setup.doneSr' | transloco }}</span>
                    }
                  </span>
                  <span class="block text-meta text-fg-muted">
                    {{ 'privacy.setup.steps.' + step.key + '.body' | transloco }}
                  </span>
                </span>
              </span>
              <span class="flex flex-none items-center gap-2 self-end sm:self-center">
                @if (step.manual && canManage()) {
                  <label class="inline-flex items-center gap-2 text-meta text-fg-muted">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="step.done"
                      [disabled]="busy()"
                      (change)="tick(step, $any($event.target).checked)"
                      [attr.data-testid]="'setup-tick-' + step.key"
                    />
                    {{ 'privacy.setup.tick' | transloco }}
                  </label>
                }
                @if (!step.done || !step.manual) {
                  <a
                    [routerLink]="link(step).path"
                    [queryParams]="link(step).query"
                    class="text-ui font-semibold text-accent hover:underline"
                  >
                    {{ 'privacy.setup.steps.' + step.key + '.cta' | transloco }}
                  </a>
                }
              </span>
            </li>
          }
        </ol>
      }
    </app-card>
  `,
})
export class PrivacySetupCard {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notify = inject(NotificationService);

  readonly setup = input.required<PrivacySetup>();
  readonly canManage = input(false);
  /** A routine was ticked or unticked: the parent reloads the overview. */
  readonly changed = output<void>();

  protected readonly expanded = signal(false);
  protected readonly busy = signal(false);
  protected readonly complete = computed(() => this.setup().done >= this.setup().total);

  /** Known steps only, in the backend's order. */
  protected readonly steps = computed(() =>
    this.setup().steps.filter((s) => (SETUP_STEP_KEYS as readonly string[]).includes(s.key)),
  );

  protected link(step: PrivacySetupStep) {
    return splitRoute(step.url || '/privacy');
  }

  protected tick(step: PrivacySetupStep, done: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !MANUAL.has(step.key)) {
      return;
    }
    this.busy.set(true);
    this.api.saveSettings(orgId, { checklist: { [step.key]: done } }).subscribe({
      next: () => {
        this.busy.set(false);
        this.changed.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.notify.error(privacyError(err).key);
      },
    });
  }
}
