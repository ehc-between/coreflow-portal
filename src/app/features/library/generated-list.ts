import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { GeneratedOutput } from '../../core/outputs/outputs.models';
import { GeneratedRow } from '../../shared/outputs/generated-row';
import { ReportsNav } from '../reports/components/reports-nav';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Switch } from '../../shared/ui/switch/switch';

const PAGE = 50;

type State = 'loading' | 'error' | 'loaded';

/**
 * `/library/saved` — the archive: every generated file the caller may read, newest
 * first. Each version is stored unchanged; "Bare gjeldende" hides versions that a
 * newer final version replaced.
 */
@Component({
  selector: 'app-generated-list-page',
  imports: [
    TranslocoPipe,
    Button,
    EmptyState,
    ErrorState,
    GeneratedRow,
    ReportsNav,
    LoadingState,
    PageHeader,
    Switch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="outputs.saved.title"
        descriptionKey="outputs.saved.description"
        [breadcrumbs]="[
          { labelKey: 'reports.hub.title', link: '/reports' },
          { labelKey: 'outputs.saved.title' },
        ]"
      />
      <app-reports-nav />

      <div class="mb-4 max-w-sm">
        <app-switch
          [checked]="currentOnly()"
          (checkedChange)="currentOnly.set($event)"
          data-testid="saved-current-only"
        >
          {{ 'outputs.saved.currentOnly' | transloco }}
        </app-switch>
      </div>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (items().length === 0) {
            <app-empty-state
              icon="documents"
              titleKey="outputs.saved.emptyTitle"
              bodyKey="outputs.saved.emptyBody"
              ctaKey="outputs.saved.emptyCta"
              ctaLink="/reports"
            />
          } @else {
            <p class="mb-2 text-meta text-fg-muted" data-testid="saved-total">
              {{ 'outputs.saved.total' | transloco: { count: total() } }}
            </p>
            <ul
              class="divide-y divide-border rounded-card border border-border bg-surface"
              data-testid="saved-list"
            >
              @for (file of items(); track file.id) {
                <li><app-generated-row [file]="file" /></li>
              }
            </ul>
            @if (items().length < total()) {
              <div class="mt-4 flex justify-center">
                <app-button
                  variant="secondary"
                  [loading]="loadingMore()"
                  (click)="more()"
                  data-testid="saved-more"
                >
                  {{ 'outputs.saved.more' | transloco }}
                </app-button>
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export class GeneratedListPage {
  private readonly api = inject(OutputsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly state = signal<State>('loading');
  protected readonly items = signal<readonly GeneratedOutput[]>([]);
  protected readonly total = signal(0);
  protected readonly currentOnly = signal(false);
  protected readonly loadingMore = signal(false);
  private readonly reloads = signal(0);

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const current = this.currentOnly();
      this.reloads();
      if (!orgId) {
        return;
      }
      untracked(() => {
        this.state.set('loading');
        this.api.generated(orgId, { current, limit: PAGE, offset: 0 }).subscribe({
          next: (list) => {
            this.items.set(list.items);
            this.total.set(list.total);
            this.state.set('loaded');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  protected more(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.loadingMore.set(true);
    this.api
      .generated(orgId, { current: this.currentOnly(), limit: PAGE, offset: this.items().length })
      .subscribe({
        next: (list) => {
          this.items.update((items) => [...items, ...list.items]);
          this.total.set(list.total);
          this.loadingMore.set(false);
        },
        error: () => this.loadingMore.set(false),
      });
  }
}
