import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import {
  FrameworkView,
  ReadinessParts,
  readinessParts,
} from '../../../core/standards/frameworks-data';
import { StandardsApi } from '../../../core/standards/standards-api';
import { pctColor } from '../../../core/standards/standards-data';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressRing } from '../../../shared/ui/progress-ring/progress-ring';
import { AskPanelService } from '../../ask/ask-panel.service';
import { StandardsGuide } from '../guide/standards-guide';
import { StandardsLesson } from '../guide/standards-lesson';
import { loadFrameworks } from './frameworks-load';
import { ReadinessBar } from './readiness-bar';

interface ReadinessRow {
  readonly view: FrameworkView;
  readonly score: number;
  readonly applicable: number;
  readonly parts: ReadinessParts | null;
}

/**
 * Readiness per enabled framework (`/standards/readiness`): the score ring,
 * the breakdown into covered-recent / covered-older / partial / not started,
 * a link into the standard, and a "Summarise" button that asks the assistant
 * what to do next. Teaches how the score works (guide + micro-lesson); an empty
 * org gets a teaching empty state pointing at the overview.
 */
@Component({
  selector: 'app-readiness-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    Icon,
    ProgressRing,
    ReadinessBar,
    StandardsGuide,
    StandardsLesson,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/standards"
        class="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-muted hover:text-accent"
      >
        <app-icon name="back" [size]="14" />
        {{ 'standards.readiness.back' | transloco }}
      </a>
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'standards.readiness.title' | transloco }}
        </h1>
        <p class="mt-1.5 text-[14px] text-fg-muted">
          {{ 'standards.readiness.subtitle' | transloco }}
        </p>
      </div>

      <app-standards-guide page="readiness" [clauses]="guideClauses" />

      @if (loading()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      } @else if (loadError()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted" role="alert">
            {{ 'standards.readiness.loadError' | transloco }}
          </div>
        </app-card>
      } @else if (rows().length === 0) {
        <app-card>
          <div class="flex flex-col items-center gap-2 py-10 text-center">
            <span class="flex text-fg-subtle"><app-icon name="iso" [size]="28" /></span>
            <p class="text-[14px] font-semibold text-fg">
              {{ 'standards.readiness.empty.title' | transloco }}
            </p>
            <p class="max-w-md text-[13px] text-fg-muted">
              {{ 'standards.readiness.empty.body' | transloco }}
            </p>
            <a
              routerLink="/standards"
              class="mt-2 inline-flex h-9 items-center rounded-tile bg-accent px-4 text-[13.5px] font-semibold text-white hover:bg-accent-2"
            >
              {{ 'standards.readiness.empty.cta' | transloco }}
            </a>
          </div>
        </app-card>
      } @else {
        <p class="mb-3 text-[12.5px] text-fg-muted">
          {{ 'standards.readiness.weights' | transloco }}
        </p>
        <ul class="flex flex-col gap-4">
          @for (row of rows(); track row.view.standardKey) {
            <li>
              <app-card>
                <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <app-progress-ring
                    [value]="row.score"
                    [size]="72"
                    [color]="pctColor(row.score)"
                    [label]="'standards.readiness.score' | transloco"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg">
                        {{ row.view.name }}
                      </h2>
                      <app-badge [tone]="row.view.kind === 'regulation' ? 'info' : 'neutral'">
                        {{ 'standards.frameworks.kind.' + row.view.kind | transloco }}
                      </app-badge>
                    </div>
                    <p class="mt-0.5 text-[12.5px] text-fg-subtle">
                      {{ 'standards.readiness.applicable' | transloco: { count: row.applicable } }}
                    </p>
                    @if (row.parts; as parts) {
                      <div class="mt-3">
                        <app-readiness-bar
                          [parts]="parts"
                          [label]="
                            ('standards.readiness.breakdown' | transloco) + ': ' + row.view.name
                          "
                        />
                      </div>
                    }
                  </div>
                  <div class="flex flex-none flex-wrap gap-2 sm:flex-col sm:items-end">
                    <a
                      [routerLink]="['/standards', row.view.standardKey]"
                      class="inline-flex h-8 items-center justify-center gap-2 rounded-tile border border-border bg-surface px-3 text-[13px] font-semibold text-fg transition-colors hover:border-border-strong hover:bg-surface-2"
                    >
                      {{ 'standards.readiness.open' | transloco }}
                      <app-icon name="arrow" [size]="14" />
                    </a>
                    @if (!aiUnavailable()) {
                      <app-button variant="ghost" size="sm" (click)="summarise(row)">
                        <app-icon name="spark" [size]="14" />
                        {{ 'standards.readiness.summarise' | transloco }}
                      </app-button>
                    }
                  </div>
                </div>
              </app-card>
            </li>
          }
        </ul>
      }

      <div class="mt-6">
        <app-standards-lesson lessonKey="readiness" />
      </div>
    </div>
  `,
})
export class ReadinessPage {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);
  protected readonly aiUnavailable = inject(AiAvailability).unavailable;

  /** HS clauses on monitoring and management review: where readiness feeds in. */
  protected readonly guideClauses = ['ISO HS 9.1', 'ISO HS 9.3'];
  protected readonly pctColor = pctColor;

  private readonly views = signal<readonly FrameworkView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  protected readonly rows = computed<readonly ReadinessRow[]>(() =>
    this.views()
      .filter((v) => v.enabled)
      .map((view) => ({
        view,
        score: view.readiness ?? view.standard?.completeness.pct ?? 0,
        applicable: view.breakdown?.applicable ?? view.standard?.completeness.applicable ?? 0,
        parts: view.breakdown ? readinessParts(view.breakdown) : null,
      })),
  );

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected summarise(row: ReadinessRow): void {
    const parts = row.parts ?? { fresh: 0, stale: 0, partial: 0, missing: row.applicable };
    this.ask.showWith(
      this.transloco.translate('standards.readiness.summarisePrompt', {
        name: row.view.name,
        score: row.score,
        applicable: row.applicable,
        ...parts,
      }),
    );
  }

  private load(orgId: string | null): void {
    this.sub?.unsubscribe();
    this.views.set([]);
    this.loadError.set(false);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.sub = loadFrameworks(this.api, orgId).subscribe({
      next: ({ views }) => {
        this.views.set(views);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }
}
