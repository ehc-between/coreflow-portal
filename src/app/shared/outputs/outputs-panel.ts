import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { Output } from '../../core/outputs/outputs.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { EmptyState } from '../ui/empty-state/empty-state';
import { ErrorState } from '../ui/error-state/error-state';
import { LoadingState } from '../ui/loading-state/loading-state';
import { StandardChoice } from './generate-dialog';
import { OutputCard } from './output-card';
import { OUTPUTS_SCOPE, groupByAudience, localized } from './output-display';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly items: readonly Output[] };

/**
 * "Dokumenter og rapporter": the outputs the caller can make, as output cards. The
 * same block on the library, a module page, a standard page or a record page; the
 * inputs narrow it (module, standard, record). `grouped` splits it into audience
 * sections ("Til revisor", "Til Datatilsynet"…), as on the library.
 *
 *   <app-outputs-panel module="privacy" />
 *   <app-outputs-panel [standardKey]="key" />
 *   <app-outputs-panel entityType="privacy_breach" [entityId]="id" />
 */
@Component({
  selector: 'app-outputs-panel',
  imports: [TranslocoPipe, EmptyState, ErrorState, LoadingState, OutputCard],
  viewProviders: [provideSharedScope(OUTPUTS_SCOPE)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @switch (state().status) {
      @case ('loading') {
        <app-loading-state [rows]="3" />
      }
      @case ('error') {
        <app-error-state (retry)="reload()" />
      }
      @case ('loaded') {
        @if (visible().length === 0) {
          <app-empty-state
            icon="documents"
            [compact]="true"
            [titleKey]="query() ? 'outputs.panel.noMatchTitle' : 'outputs.panel.emptyTitle'"
            [bodyKey]="query() ? 'outputs.panel.noMatchBody' : 'outputs.panel.emptyBody'"
          />
        } @else if (grouped()) {
          <div class="flex flex-col gap-6" data-testid="outputs-groups">
            @for (group of groups(); track group.audience) {
              <section [attr.data-testid]="'outputs-group-' + group.audience">
                <h2 class="mb-2.5 font-display text-section font-bold text-fg">
                  {{ 'outputs.groups.' + group.audience | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  @for (o of group.items; track o.key) {
                    <app-output-card
                      [output]="o"
                      [standardKey]="standardKey()"
                      [entityId]="entityId()"
                      [standards]="standards()"
                      (generated)="reload()"
                    />
                  }
                </div>
              </section>
            }
          </div>
        } @else {
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="outputs-list">
            @for (o of visible(); track o.key) {
              <app-output-card
                [output]="o"
                [standardKey]="standardKey()"
                [entityId]="entityId()"
                [standards]="standards()"
                (generated)="reload()"
              />
            }
          </div>
        }
      }
    }
  `,
})
export class OutputsPanel {
  private readonly api = inject(OutputsApi);
  private readonly language = inject(LanguageService);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly module = input<string | null>(null);
  readonly standardKey = input<string | null>(null);
  readonly entityType = input<string | null>(null);
  readonly entityId = input<string | null>(null);
  readonly audience = input<string | null>(null);
  readonly kind = input<string | null>(null);
  /** Kinds left out (the library hides register exports until the user narrows it). */
  readonly excludeKinds = input<readonly string[]>([]);
  /** Free-text filter on title and description (client side). */
  readonly query = input('');
  /** Split into audience sections (the library). */
  readonly grouped = input(false);
  readonly standards = input<readonly StandardChoice[]>([]);

  protected readonly state = signal<State>({ status: 'loading' });
  private readonly reloads = signal(0);
  private sub: Subscription | null = null;

  protected readonly visible = computed(() => {
    const state = this.state();
    if (state.status !== 'loaded') {
      return [];
    }
    const exclude = this.excludeKinds();
    const items = exclude.length
      ? state.items.filter((o) => !exclude.includes(o.kind))
      : state.items;
    const needle = this.query().trim().toLocaleLowerCase();
    if (!needle) {
      return items;
    }
    const lang = this.language.active();
    return items.filter((o) =>
      `${localized(o.title, lang)} ${localized(o.description, lang)}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  });
  protected readonly groups = computed(() => groupByAudience(this.visible()));

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = {
        module: this.module(),
        standard_key: this.standardKey(),
        entity_type: this.entityType(),
        entity_id: this.entityId(),
        audience: this.audience(),
        kind: this.kind(),
        readiness: true,
        lang: this.language.active(),
      };
      this.reloads();
      if (!orgId) {
        return;
      }
      untracked(() => this.load(orgId, query));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  private load(orgId: string, query: Parameters<OutputsApi['list']>[1]): void {
    this.sub?.unsubscribe();
    if (this.state().status !== 'loaded') {
      this.state.set({ status: 'loading' });
    }
    this.sub = this.api.list(orgId, query).subscribe({
      next: (list) => this.state.set({ status: 'loaded', items: list.items }),
      error: () => this.state.set({ status: 'error' }),
    });
  }
}
