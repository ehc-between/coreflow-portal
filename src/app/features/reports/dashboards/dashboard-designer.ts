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
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { humanize } from '../../../core/kit/entity-types.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ROLE_KEYS, roleNameKey } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { FrameworkSelect } from '../components/framework-select';
import { ReportsNav } from '../components/reports-nav';
import { labelOr, localized, moduleLabelKey } from '../data/report-display';
import { reportErrorKey } from '../data/report-errors';
import {
  BuiltinLayouts,
  DashboardConfig,
  FrameworkKey,
  MAX_DASHBOARD_WIDGETS,
  REPORTS_MODULE,
  WIDGET_SIZES,
  WidgetCatalogItem,
  WidgetConfig,
  WidgetSize,
  isFrameworkKey,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { ScopedText } from '../data/scoped-text';

/** The scope of the organisation-wide default layout. */
export const DEFAULT_SCOPE = 'default';

/** The built-in layout: every catalogue widget marked `default`, medium size. */
export function builtinLayout(catalog: readonly WidgetCatalogItem[]): WidgetConfig[] {
  return catalog.filter((w) => w.default).map((w) => ({ key: w.key, framework: null, size: 'md' }));
}

/** Move the item at `index` by `delta` places (no-op at the ends). */
export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** A stored layout made safe for the editor (sizes and frameworks normalised). */
export function normaliseLayout(widgets: readonly WidgetConfig[]): WidgetConfig[] {
  return widgets.map((w) => ({
    key: w.key,
    framework: isFrameworkKey(w.framework) ? w.framework : null,
    size: (WIDGET_SIZES as readonly string[]).includes(w.size) ? w.size : 'md',
  }));
}

/**
 * The layout a scope starts from while nothing is saved for it: the built-in layout
 * of the role (the backend has one for the quality manager, CISO, DPO, HSE manager,
 * AI officer, auditor and HR), else the built-in default, else the catalogue defaults.
 */
export function startingLayout(
  scope: string,
  builtin: BuiltinLayouts | null,
  catalog: readonly WidgetCatalogItem[],
): WidgetConfig[] {
  const own = scope !== DEFAULT_SCOPE ? builtin?.roles?.[scope] : null;
  if (own?.length) {
    return normaliseLayout(own);
  }
  if (builtin?.default?.length) {
    return normaliseLayout(builtin.default);
  }
  return builtinLayout(catalog);
}

/**
 * `/reports/dashboards` (`reports:manage`): choose the cards of the role overview on
 * the Reports page — for the whole organisation (the default) or per role. People
 * see the layout saved for their role, else the organisation default, else the
 * built-in layout of their role.
 */
@Component({
  selector: 'app-dashboard-designer',
  imports: [
    TranslocoPipe,
    LocalDatePipe,
    FieldHelp,
    WhyItMatters,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    FrameworkSelect,
    ReportsNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="reports.designer.title"
        descriptionKey="reports.designer.subtitle"
        [breadcrumbs]="[
          { labelKey: 'reports.hub.title', link: '/reports' },
          { labelKey: 'reports.nav.dashboards' },
        ]"
      />
      <app-reports-nav />
      <app-help-strip scope="reports" page="dashboards" />

      @if (loadError(); as key) {
        <app-error-state [bodyKey]="key" (retry)="reload()" />
      } @else if (!loaded()) {
        <app-loading-state [rows]="5" />
      } @else {
        <div class="max-w-[860px]">
          <app-card class="mb-4 block">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div class="flex flex-col gap-1 sm:w-[280px] sm:flex-none">
                <label for="dash-scope" class="text-ui font-semibold text-fg-muted">{{
                  'reports.designer.scope' | transloco
                }}</label>
                <select
                  id="dash-scope"
                  class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                  (change)="selectScope($any($event.target).value)"
                >
                  @for (s of scopes; track s) {
                    <option [value]="s" [selected]="s === scope()">
                      {{ scopeOption(s) }}
                    </option>
                  }
                </select>
              </div>
              <p class="min-w-0 flex-1 text-meta text-fg-muted" data-testid="designer-status">
                @if (config(); as c) {
                  {{
                    'reports.designer.customised'
                      | transloco
                        : {
                            name: c.updated_by?.name || ('reports.detail.unknownUser' | transloco),
                            date: (c.updated_at | localDate),
                          }
                  }}
                } @else {
                  {{ fallbackKey() | transloco: { role: scopeLabel(scope()) } }}
                }
              </p>
            </div>
            <app-field-help class="mt-2 block" scope="reports" page="dashboards" field="scope" />
          </app-card>

          <app-card class="mb-4 block">
            <h2 class="text-card font-semibold text-fg">
              {{ 'reports.designer.widgets' | transloco }}
            </h2>
            <p class="mb-3 text-meta text-fg-muted">
              {{ 'reports.designer.count' | transloco: { count: layout().length, max: max } }}
            </p>
            <ol class="flex flex-col gap-2" data-testid="designer-widgets">
              @for (
                w of layout();
                track $index;
                let i = $index;
                let first = $first;
                let last = $last
              ) {
                <li
                  class="flex flex-col gap-3 rounded-tile border border-border p-3 md:flex-row md:items-center"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-ui font-semibold text-fg">{{ widgetTitle(w.key) }}</p>
                    <p class="text-meta text-fg-muted">
                      {{ widgetModule(w.key) }}
                      @if (widgetDescription(w.key); as text) {
                        · {{ text }}
                      }
                    </p>
                    @if (!isAvailable(w.key)) {
                      <app-badge class="mt-1 inline-block" tone="warn">{{
                        'reports.designer.notAvailable' | transloco
                      }}</app-badge>
                    }
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <label class="sr-only" [attr.for]="'w-size-' + i">{{
                      'reports.designer.size' | transloco
                    }}</label>
                    <select
                      [id]="'w-size-' + i"
                      class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                      (change)="update(i, { size: $any($event.target).value })"
                    >
                      @for (size of sizes; track size) {
                        <option [value]="size" [selected]="size === w.size">
                          {{ 'reports.designer.sizes.' + size | transloco }}
                        </option>
                      }
                    </select>
                    <app-framework-select
                      [value]="w.framework ?? null"
                      (valueChange)="update(i, { framework: $event })"
                    />
                    <span class="flex items-center gap-1">
                      <button
                        type="button"
                        class="inline-flex h-10 w-10 items-center justify-center rounded-tile border border-border text-fg hover:bg-surface-2 disabled:opacity-40"
                        [disabled]="first"
                        [attr.aria-label]="
                          'reports.designer.moveUp' | transloco: { title: widgetTitle(w.key) }
                        "
                        (click)="move(i, -1)"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-10 w-10 items-center justify-center rounded-tile border border-border text-fg hover:bg-surface-2 disabled:opacity-40"
                        [disabled]="last"
                        [attr.aria-label]="
                          'reports.designer.moveDown' | transloco: { title: widgetTitle(w.key) }
                        "
                        (click)="move(i, 1)"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-10 w-10 items-center justify-center rounded-tile border border-border text-fg-muted hover:bg-surface-2 hover:text-fail-ink"
                        [attr.aria-label]="
                          'reports.designer.remove' | transloco: { title: widgetTitle(w.key) }
                        "
                        (click)="remove(i)"
                      >
                        <app-icon name="x" [size]="15" />
                      </button>
                    </span>
                  </div>
                </li>
              } @empty {
                <li class="py-4 text-center text-ui text-fg-muted">
                  {{ 'reports.designer.noWidgets' | transloco }}
                </li>
              }
            </ol>

            <div class="mt-4 border-t border-border pt-3">
              <label for="dash-add" class="mb-1 block text-ui font-semibold text-fg-muted">{{
                'reports.designer.add' | transloco
              }}</label>
              <select
                id="dash-add"
                class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg sm:w-auto sm:min-w-[320px]"
                [disabled]="layout().length >= max"
                (change)="add($any($event.target))"
              >
                <option value="">{{ 'reports.designer.choose' | transloco }}</option>
                @for (group of catalogGroups(); track group.module) {
                  <optgroup [label]="group.name">
                    @for (item of group.items; track item.key) {
                      <option [value]="item.key">{{ widgetTitle(item.key) }}</option>
                    }
                  </optgroup>
                }
              </select>
              @if (addDescription(); as description) {
                <p class="mt-1 text-meta text-fg-muted">{{ description }}</p>
              }
            </div>
          </app-card>

          @if (saveError(); as key) {
            <app-alert class="mb-3 block">{{ key | transloco }}</app-alert>
          }

          <div class="flex flex-wrap justify-end gap-2">
            @if (config()) {
              <app-button variant="ghost" (click)="resetOpen.set(true)">{{
                'reports.designer.reset' | transloco
              }}</app-button>
            }
            <app-button [loading]="saving()" (click)="save()">{{
              'reports.designer.save' | transloco
            }}</app-button>
          </div>
        </div>
      }

      <app-why-it-matters class="mt-8 block" scope="reports" page="dashboards" />
    </div>

    <app-confirm-dialog
      [open]="resetOpen()"
      [title]="'reports.designer.resetTitle' | transloco"
      [message]="'reports.designer.resetMessage' | transloco: { scope: scopeLabel(scope()) }"
      [confirmLabel]="'reports.designer.reset' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="saving()"
      (confirmed)="reset()"
      (cancelled)="resetOpen.set(false)"
    />
  `,
})
export class DashboardDesigner {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly scoped = inject(ScopedText);

  protected readonly defaultScope = DEFAULT_SCOPE;
  protected readonly scopes: readonly string[] = [DEFAULT_SCOPE, ...ROLE_KEYS];
  protected readonly sizes = WIDGET_SIZES;
  protected readonly max = MAX_DASHBOARD_WIDGETS;

  protected readonly catalog = signal<readonly WidgetCatalogItem[]>([]);
  protected readonly configs = signal<readonly DashboardConfig[]>([]);
  protected readonly builtin = signal<BuiltinLayouts | null>(null);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly resetOpen = signal(false);
  protected readonly scope = signal(DEFAULT_SCOPE);
  protected readonly layout = signal<WidgetConfig[]>([]);
  protected readonly lastAdded = signal<string | null>(null);

  protected readonly config = computed(
    () => this.configs().find((c) => c.scope === this.scope()) ?? null,
  );

  /** What applies while nothing is saved for the chosen scope. */
  protected readonly fallbackKey = computed(() => {
    const scope = this.scope();
    if (scope === DEFAULT_SCOPE) {
      return 'reports.designer.usingBuiltin';
    }
    if (this.builtin()?.roles?.[scope]?.length) {
      return 'reports.designer.usingRoleBuiltin';
    }
    return this.configs().some((c) => c.scope === DEFAULT_SCOPE)
      ? 'reports.designer.usingFallback'
      : 'reports.designer.usingBuiltinFallback';
  });

  protected readonly catalogGroups = computed(() => {
    const groups = new Map<string, WidgetCatalogItem[]>();
    for (const item of this.catalog()) {
      const list = groups.get(item.module);
      if (list) {
        list.push(item);
      } else {
        groups.set(item.module, [item]);
      }
    }
    return [...groups.entries()]
      .map(([module, items]) => ({ module, name: this.moduleName(module), items }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly addDescription = computed(() => {
    const key = this.lastAdded();
    return key ? this.widgetDescription(key) || null : null;
  });

  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: REPORTS_MODULE,
      view: 'settings',
      title: this.language.translate('reports.designer.title'),
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  protected scopeLabel(scope: string): string {
    if (scope === DEFAULT_SCOPE) {
      return this.language.translate('reports.designer.orgDefault');
    }
    return labelOr((k) => this.language.translate(k), roleNameKey(scope), scope);
  }

  /** The option text: the scope, plus "(tilpasset)" when a layout is saved for it. */
  protected scopeOption(scope: string): string {
    const label = this.scopeLabel(scope);
    return this.configs().some((c) => c.scope === scope)
      ? this.language.translate('reports.designer.customisedOption', { scope: label })
      : label;
  }

  protected widgetTitle(key: string): string {
    const item = this.catalog().find((c) => c.key === key);
    const own = localized(item?.title, this.language.active(), '');
    return this.scoped.text(item?.title_key, own || humanize(key));
  }

  protected widgetDescription(key: string): string {
    const item = this.catalog().find((c) => c.key === key);
    const own = localized(item?.description, this.language.active(), '');
    return this.scoped.text(item?.description_key, own);
  }

  protected widgetModule(key: string): string {
    const item = this.catalog().find((c) => c.key === key);
    return item ? this.moduleName(item.module) : '';
  }

  protected isAvailable(key: string): boolean {
    return this.catalog().find((c) => c.key === key)?.available ?? false;
  }

  protected selectScope(scope: string): void {
    this.scope.set(scope);
    this.saveError.set(null);
    this.resetLayout();
  }

  protected update(
    index: number,
    change: { size?: WidgetSize; framework?: FrameworkKey | null },
  ): void {
    this.layout.update((list) => list.map((w, i) => (i === index ? { ...w, ...change } : w)));
  }

  protected move(index: number, delta: number): void {
    this.layout.update((list) => moveItem(list, index, delta));
  }

  protected remove(index: number): void {
    this.layout.update((list) => list.filter((_, i) => i !== index));
  }

  protected add(select: HTMLSelectElement): void {
    const key = select.value;
    select.value = '';
    if (!key || this.layout().length >= MAX_DASHBOARD_WIDGETS) {
      return;
    }
    this.lastAdded.set(key);
    this.layout.update((list) => [...list, { key, framework: null, size: 'md' }]);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.api.saveDashboard(orgId, this.scope(), this.layout()).subscribe({
      next: (config) => {
        this.saving.set(false);
        this.configs.update((list) => [...list.filter((c) => c.scope !== config.scope), config]);
        this.notifications.success('reports.designer.saved');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(reportErrorKey(error));
      },
    });
  }

  protected reset(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const scope = this.scope();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.resetDashboard(orgId, scope).subscribe({
      next: () => {
        this.saving.set(false);
        this.resetOpen.set(false);
        this.configs.update((list) => list.filter((c) => c.scope !== scope));
        this.resetLayout();
        this.notifications.success('reports.designer.wasReset');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.resetOpen.set(false);
        this.saveError.set(reportErrorKey(error));
      },
    });
  }

  private moduleName(module: string): string {
    return labelOr((k) => this.language.translate(k), moduleLabelKey(module), module);
  }

  private resetLayout(): void {
    const config = this.config();
    this.layout.set(
      config
        ? normaliseLayout(config.widgets)
        : startingLayout(this.scope(), this.builtin(), this.catalog()),
    );
  }

  private load(orgId: string | null): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.loaded.set(false);
    this.loadError.set(null);
    this.sub.add(
      forkJoin([
        this.api.widgets(orgId),
        this.api.dashboards(orgId),
        // Older backends have no built-in layouts endpoint.
        this.api.builtinDashboards(orgId).pipe(catchError(() => of(null))),
      ]).subscribe({
        next: ([catalog, configs, builtin]) => {
          this.catalog.set(catalog.items);
          this.configs.set(configs.items);
          this.builtin.set(builtin);
          this.resetLayout();
          this.loaded.set(true);
        },
        error: (error: unknown) => {
          this.loadError.set(reportErrorKey(error));
          this.loaded.set(true);
        },
      }),
    );
  }
}
