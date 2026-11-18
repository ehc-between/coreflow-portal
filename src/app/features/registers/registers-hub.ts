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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { LocationsApi } from '../../core/locations/locations-api';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RegisterCatalogService } from '../../core/registers/register-catalog.service';
import { isAllowed, resolvePin } from '../../layout/nav-v2';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { RegisterRow, arrangeRows, searchRows, toRows } from './register-groups';
import { RegisterList } from './register-list';
import { RegisterPinState } from './register-pins';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * Registre (`/registers`, simplify plan U04): every list the org keeps, in one place,
 * grouped by job area instead of by module. Each row is a door to the list, with its
 * count and when it last changed. Pinned registers sit on top; registers no enabled
 * standard needs and that hold nothing fold away under "More registers (N)". The
 * search also matches everyday words ("kalibrering", "nestenulykke", "databehandler")
 * and looks inside the folded part. Data: `GET /locations/counts`.
 *
 * Shell v2 (U03) owns the route and the menu; the pins are the same pins as the
 * menu's "Festet" (`ShellPreferencesService`, keyed by route path).
 */
@Component({
  selector: 'app-registers-hub',
  imports: [
    TranslocoPipe,
    Card,
    EmptyState,
    ErrorState,
    Icon,
    LoadingState,
    PageHeader,
    RegisterList,
  ],
  providers: [RegisterPinState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header titleKey="registers.title" descriptionKey="registers.description" />

      <div
        class="mb-5 flex h-11 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
        role="search"
      >
        <app-icon name="search" [size]="16" class="text-fg-subtle" />
        <label for="registers-search" class="sr-only">{{
          'registers.search.label' | transloco
        }}</label>
        <input
          id="registers-search"
          type="search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          [placeholder]="'registers.search.placeholder' | transloco"
          class="h-full flex-1 bg-transparent text-ui text-fg outline-none"
          autocomplete="off"
          data-testid="registers-search"
        />
      </div>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (rows().length === 0) {
            <app-empty-state
              icon="grid"
              titleKey="registers.empty.title"
              bodyKey="registers.empty.body"
            />
          } @else if (searching()) {
            <p class="mb-2 text-meta text-fg-muted" aria-live="polite" data-testid="registers-hits">
              {{ 'registers.search.hits' | transloco: { count: hits().length } }}
            </p>
            @if (hits().length) {
              <app-card [padded]="false">
                <app-register-list [rows]="hits()" />
              </app-card>
            } @else {
              <app-empty-state
                icon="search"
                titleKey="registers.search.noneTitle"
                [titleParams]="{ query: query().trim() }"
                bodyKey="registers.search.noneBody"
                [compact]="true"
              />
            }
          } @else {
            @if (sections().pinned.length) {
              <section class="mb-6" data-testid="registers-pinned">
                <h2 class="mb-2 text-card font-semibold text-fg">
                  {{ 'registers.pinned.title' | transloco }}
                </h2>
                <app-card [padded]="false">
                  <app-register-list [rows]="sections().pinned" />
                </app-card>
              </section>
            }
            @for (group of sections().groups; track group.key) {
              <section class="mb-6" data-testid="registers-group" [attr.data-group]="group.key">
                <h2 class="mb-2 text-card font-semibold text-fg">
                  {{ 'registers.groups.' + group.key | transloco }}
                </h2>
                <app-card [padded]="false">
                  <app-register-list [rows]="group.rows" />
                </app-card>
              </section>
            }
            @if (sections().folded.length) {
              <details class="group" data-testid="registers-folded">
                <summary
                  class="flex cursor-pointer list-none items-center gap-2 py-2 text-card font-semibold text-fg-muted hover:text-fg"
                >
                  <app-icon
                    name="chevron"
                    [size]="14"
                    class="-rotate-90 transition-transform group-open:rotate-0"
                  />
                  {{ 'registers.more.title' | transloco: { count: sections().folded.length } }}
                </summary>
                <p class="mb-2 text-meta text-fg-muted">{{ 'registers.more.hint' | transloco }}</p>
                <app-card [padded]="false">
                  <app-register-list [rows]="sections().folded" />
                </app-card>
              </details>
            }
          }
        }
      }
    </div>
  `,
})
export class RegistersHub {
  private readonly api = inject(LocationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly catalog = inject(RegisterCatalogService);
  private readonly modules = inject(ModuleService);
  private readonly pins = inject(RegisterPinState);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly RegisterRow[]>([]);
  protected readonly query = signal('');

  protected readonly searching = computed(() => this.query().trim().length > 0);
  protected readonly hits = computed(() => searchRows(this.rows(), this.query()));
  protected readonly sections = computed(() =>
    arrangeRows(this.rows(), this.pins.keys(), (key) => this.pinOnly(key)),
  );

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const lang = this.language.active();
      untracked(() => this.load(orgId, lang));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    this.pins.connect(computed(() => this.sections().pinned.map((row) => row.pinKey)));
  }

  /** A pin that is not one of the hub's registers (a module's start page), if open. */
  private pinOnly(key: string): RegisterRow | null {
    const target = resolvePin(key, null);
    const granted = this.selectedOrg.currentOrg()?.permissions;
    if (!target || !isAllowed(target, granted, (m) => this.modules.isEnabled(m))) {
      return null;
    }
    const title = target.label ?? this.language.translate(target.labelKey);
    return {
      key: `pin:${key}`,
      pinKey: key,
      title,
      area: null,
      group: 'other',
      route: `/${target.path}`,
      query: {},
      count: null,
      lastUpdatedAt: null,
      folded: false,
      search: [title.toLocaleLowerCase(), '', ''],
    };
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.language.active());
  }

  private load(orgId: string | null, lang: string): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      this.rows.set([]);
      this.state.set('ready');
      return;
    }
    // Keep the rows on screen while a language switch reloads them.
    if (!this.rows().length) {
      this.state.set('loading');
    }
    this.sub = this.api.counts(orgId, lang, ['register', 'page', 'settings']).subscribe({
      next: (res) => {
        // The menu names registers pinned here from the same data.
        this.catalog.remember(orgId, lang, res.items);
        this.rows.set(toRows(res.items));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
