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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, forkJoin } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { humanize } from '../../../core/kit/entity-types.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ROLE_KEYS, roleNameKey } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { FrameworkSelect } from '../components/framework-select';
import { labelOr } from '../data/report-display';
import { reportErrorKey } from '../data/report-errors';
import {
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
 * `/reports/dashboards` (`reports:manage`): design the home-dashboard widgets
 * for the whole organisation (the default) or for one role. People see the
 * layout of the first of their roles that has one, else the organisation
 * default, else the built-in layout.
 */
@Component({
  selector: 'app-dashboard-designer',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    FrameworkSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-4 pt-6 pb-12 sm:px-8">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'reports.designer.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">
            {{ 'reports.designer.subtitle' | transloco }}
          </p>
        </div>
        <a routerLink="/dashboard" class="text-[13px] font-semibold text-accent hover:underline">
          {{ 'reports.designer.openDashboard' | transloco }}
        </a>
      </header>

      <app-guide-intro class="mb-4 block" scope="reports" page="dashboards" />

      @if (loadError(); as key) {
        <app-alert>{{ key | transloco }}</app-alert>
      } @else if (!loaded()) {
        <p class="py-10 text-center text-[13.5px] text-fg-muted" role="status">
          {{ 'reports.common.loading' | transloco }}
        </p>
      } @else {
        <app-card class="mb-4 block">
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1">
              <label for="dash-scope" class="text-[12.5px] font-semibold text-fg-muted">{{
                'reports.designer.scope' | transloco
              }}</label>
              <select
                id="dash-scope"
                class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg"
                (change)="selectScope($any($event.target).value)"
              >
                @for (s of scopes; track s) {
                  <option [value]="s" [selected]="s === scope()">
                    {{ scopeLabel(s) }}{{ hasConfig(s) ? ' ●' : '' }}
                  </option>
                }
              </select>
            </div>
            <div class="min-w-0 flex-1 text-[12.5px] text-fg-muted">
              @if (config(); as c) {
                {{
                  'reports.designer.customised'
                    | transloco
                      : {
                          name: c.updated_by?.name || '—',
                          date: (c.updated_at | localDate: 'medium'),
                        }
                }}
              } @else {
                {{
                  (scope() === defaultScope
                    ? 'reports.designer.usingBuiltin'
                    : 'reports.designer.usingFallback'
                  ) | transloco
                }}
              }
            </div>
          </div>
          <app-field-help class="mt-2 block" scope="reports" page="dashboards" field="scope" />
        </app-card>

        <app-card class="mb-4 block">
          <h2 class="mb-3 text-[14px] font-semibold text-fg">
            {{ 'reports.designer.widgets' | transloco: { count: layout().length, max: max } }}
          </h2>
          <ol class="flex flex-col gap-2" data-testid="designer-widgets">
            @for (
              w of layout();
              track $index;
              let i = $index;
              let first = $first;
              let last = $last
            ) {
              <li
                class="flex flex-col gap-2 rounded-tile border border-border p-3 sm:flex-row sm:items-center"
              >
                <div class="min-w-0 flex-1">
                  <p class="text-[13px] font-semibold text-fg">{{ widgetTitle(w.key) }}</p>
                  @if (!isAvailable(w.key)) {
                    <app-badge tone="warn">{{
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
                    class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
                  <app-button variant="ghost" size="sm" [disabled]="first" (click)="move(i, -1)">
                    <span aria-hidden="true">↑</span>
                    <span class="sr-only">{{
                      'reports.designer.moveUp' | transloco: { title: widgetTitle(w.key) }
                    }}</span>
                  </app-button>
                  <app-button variant="ghost" size="sm" [disabled]="last" (click)="move(i, 1)">
                    <span aria-hidden="true">↓</span>
                    <span class="sr-only">{{
                      'reports.designer.moveDown' | transloco: { title: widgetTitle(w.key) }
                    }}</span>
                  </app-button>
                  <app-button variant="ghost" size="sm" (click)="remove(i)">
                    <app-icon name="x" [size]="14" />
                    <span class="sr-only">{{
                      'reports.designer.remove' | transloco: { title: widgetTitle(w.key) }
                    }}</span>
                  </app-button>
                </div>
              </li>
            } @empty {
              <li class="py-4 text-center text-[13px] text-fg-muted">
                {{ 'reports.designer.noWidgets' | transloco }}
              </li>
            }
          </ol>

          <div class="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <div class="flex flex-col gap-1">
              <label for="dash-add" class="text-[12.5px] font-semibold text-fg-muted">{{
                'reports.designer.add' | transloco
              }}</label>
              <select
                id="dash-add"
                class="h-10 min-w-[240px] rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg"
                [disabled]="layout().length >= max"
                (change)="add($any($event.target))"
              >
                <option value="">{{ 'reports.designer.choose' | transloco }}</option>
                @for (item of catalog(); track item.key) {
                  <option [value]="item.key">{{ widgetTitle(item.key) }}</option>
                }
              </select>
            </div>
            @if (addDescription(); as description) {
              <p class="text-[12px] text-fg-muted">{{ description }}</p>
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
      }

      <app-why-it-matters class="mt-6 block" scope="reports" page="dashboards" />
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

  protected readonly addDescription = computed(() => {
    const key = this.lastAdded();
    const item = this.catalog().find((c) => c.key === key);
    return item?.description_key ? this.scoped.text(item.description_key) || null : null;
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

  protected scopeLabel(scope: string): string {
    if (scope === DEFAULT_SCOPE) {
      return this.language.translate('reports.designer.orgDefault');
    }
    return labelOr((k) => this.language.translate(k), roleNameKey(scope), scope);
  }

  protected hasConfig(scope: string): boolean {
    return this.configs().some((c) => c.scope === scope);
  }

  protected widgetTitle(key: string): string {
    const item = this.catalog().find((c) => c.key === key);
    return this.scoped.text(item?.title_key, humanize(key));
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

  private resetLayout(): void {
    const config = this.config();
    this.layout.set(config ? normaliseLayout(config.widgets) : builtinLayout(this.catalog()));
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
      forkJoin([this.api.widgets(orgId), this.api.dashboards(orgId)]).subscribe({
        next: ([catalog, configs]) => {
          this.catalog.set(catalog.items);
          this.configs.set(configs.items);
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
