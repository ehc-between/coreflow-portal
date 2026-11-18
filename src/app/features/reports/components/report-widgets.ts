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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { humanize } from '../../../core/kit/entity-types.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { roleNameKey } from '../../../core/org/roles';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { frameworkLabelKey, labelOr, localized, widgetLink } from '../data/report-display';
import {
  DashboardResponse,
  DashboardWidget,
  FrameworkKey,
  REPORTS_PERMISSIONS,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { ScopedText } from '../data/scoped-text';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { MetricView } from './metric-view';

let nextId = 0;

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly value: DashboardResponse };

/** Grid span of a widget size on wide screens (4 columns). */
export function widgetSpan(size: string): string {
  switch (size) {
    case 'sm':
      return 'md:col-span-1';
    case 'lg':
      return 'md:col-span-2 xl:col-span-4';
    default:
      return 'md:col-span-1 xl:col-span-2';
  }
}

/**
 * The caller's role overview (`GET reports/dashboard`): the cards of their role's
 * layout, else the organisation default, else the built-in layout for the role.
 * Each card shows its metric through `<app-metric-view>`, says in one line what it
 * counts, links to the list behind it, and says so plainly when the caller cannot
 * see its data. Loads its own translation scope, so it can be embedded anywhere.
 */
@Component({
  selector: 'app-report-widgets',
  imports: [RouterLink, TranslocoPipe, Card, ErrorState, Icon, LoadingState, MetricView],
  viewProviders: [provideSharedScope('reports')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section [attr.aria-labelledby]="headingId" data-testid="report-widgets">
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div class="min-w-0">
          <h2 [id]="headingId" class="font-display text-section font-bold text-fg">
            {{ 'reports.widgets.heading' | transloco }}
          </h2>
          @if (sourceLabel(); as source) {
            <p class="text-meta text-fg-muted">{{ source }}</p>
          }
        </div>
        @if (canManage()) {
          <a
            routerLink="/reports/dashboards"
            class="text-meta font-semibold text-accent hover:underline"
            data-testid="widgets-customise"
          >
            {{ 'reports.widgets.customise' | transloco }}
          </a>
        }
      </div>
      @switch (state().status) {
        @case ('loading') {
          <app-loading-state [rows]="2" />
        }
        @case ('error') {
          <app-error-state bodyKey="reports.widgets.loadFailed" (retry)="reload()" />
        }
        @case ('ready') {
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            @for (widget of widgets(); track $index) {
              <app-card [class]="span(widget.size)" data-testid="report-widget">
                <div class="mb-3 flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="text-card font-semibold text-fg">{{ title(widget) }}</h3>
                    @if (description(widget); as text) {
                      <p class="mt-0.5 text-meta text-fg-muted">{{ text }}</p>
                    }
                    @if (widget.framework) {
                      <p class="mt-0.5 text-meta text-fg-subtle">
                        {{ frameworkName(widget.framework) }}
                      </p>
                    }
                  </div>
                  @if (link(widget); as target) {
                    <a
                      [routerLink]="target.path"
                      [queryParams]="target.queryParams"
                      class="flex h-8 w-8 flex-none items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-accent"
                      [attr.aria-label]="
                        'reports.widgets.open' | transloco: { title: title(widget) }
                      "
                    >
                      <app-icon name="arrow" [size]="15" />
                    </a>
                  }
                </div>
                @if (widget.available && widget.data) {
                  <app-metric-view
                    [kind]="widget.kind"
                    [data]="widget.data"
                    [fieldLabels]="widget.field_labels"
                  />
                } @else {
                  <p class="text-meta text-fg-muted">
                    {{ 'reports.widgets.unavailable' | transloco }}
                  </p>
                }
              </app-card>
            } @empty {
              <app-card class="md:col-span-2 xl:col-span-4">
                <p class="py-4 text-center text-ui text-fg-muted">
                  {{ 'reports.widgets.empty' | transloco }}
                </p>
              </app-card>
            }
          </div>
        }
      }
    </section>
  `,
})
export class ReportWidgets {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly scoped = inject(ScopedText);

  readonly framework = input<FrameworkKey | null>(null);

  protected readonly headingId = `cf-report-widgets-${++nextId}`;
  protected readonly state = signal<State>({ status: 'loading' });

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(REPORTS_PERMISSIONS.manage),
  );

  protected readonly widgets = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.value.widgets : [];
  });

  protected readonly sourceLabel = computed(() => {
    const s = this.state();
    if (s.status !== 'ready') {
      return null;
    }
    const translate = (k: string, p?: Record<string, unknown>) => this.language.translate(k, p);
    const role = s.value.role_key
      ? labelOr((k) => translate(k), roleNameKey(s.value.role_key), s.value.role_key)
      : null;
    switch (s.value.source) {
      case 'role':
        return translate('reports.widgets.sourceRole', { role });
      case 'org':
        return translate('reports.widgets.sourceOrg');
      default:
        return role
          ? translate('reports.widgets.sourceBuiltinRole', { role })
          : translate('reports.widgets.sourceBuiltin');
    }
  });

  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const framework = this.framework();
      untracked(() => this.load(orgId, framework));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.framework());
  }

  protected span(size: string): string {
    return `block ${widgetSpan(size)}`;
  }

  protected title(widget: DashboardWidget): string {
    const fallback = localized(widget.title, this.language.active(), '') || humanize(widget.key);
    return this.scoped.text(widget.title_key, fallback);
  }

  protected description(widget: DashboardWidget): string {
    const own = localized(widget.description, this.language.active(), '');
    const key = widget.title_key?.replace(/\.title$/, '.description') ?? null;
    return this.scoped.text(key, own);
  }

  protected frameworkName(framework: string): string {
    return labelOr((k) => this.language.translate(k), frameworkLabelKey(framework), framework);
  }

  protected link(widget: DashboardWidget) {
    return widgetLink(widget.key, widget.data);
  }

  private load(orgId: string | null, framework: FrameworkKey | null): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      this.state.set({ status: 'error' });
      return;
    }
    this.state.set({ status: 'loading' });
    this.sub.add(
      this.api.dashboard(orgId, framework).subscribe({
        next: (value) => this.state.set({ status: 'ready', value }),
        error: () => this.state.set({ status: 'error' }),
      }),
    );
  }
}
