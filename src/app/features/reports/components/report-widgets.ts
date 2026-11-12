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
import { Icon } from '../../../shared/ui/icon/icon';
import { frameworkLabelKey, labelOr, widgetLink } from '../data/report-display';
import { DashboardResponse, DashboardWidget, FrameworkKey } from '../data/reports.models';
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
 * The caller's dashboard widgets (`GET reports/dashboard`): the layout of their
 * role, else the organisation default, else the built-in one. Each widget shows
 * its metric through `<app-metric-view>`, links to the list behind it, and says
 * so plainly when the caller cannot see its data. Embedded on the home
 * dashboard; loads its own translation scope.
 */
@Component({
  selector: 'app-report-widgets',
  imports: [RouterLink, TranslocoPipe, Card, Icon, MetricView],
  viewProviders: [provideSharedScope('reports')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section [attr.aria-labelledby]="headingId" data-testid="report-widgets">
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 [id]="headingId" class="font-display text-[17px] font-bold tracking-[-0.02em] text-fg">
          {{ 'reports.widgets.heading' | transloco }}
        </h2>
        @if (sourceLabel(); as source) {
          <p class="text-[12.5px] text-fg-muted">{{ source }}</p>
        }
      </div>
      @switch (state().status) {
        @case ('loading') {
          <p class="text-[13px] text-fg-muted" role="status">
            {{ 'reports.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-card>
            <p class="py-4 text-center text-[13px] text-fg-muted">
              {{ 'reports.widgets.loadFailed' | transloco }}
            </p>
          </app-card>
        }
        @case ('ready') {
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            @for (widget of widgets(); track $index) {
              <app-card [class]="span(widget.size)" data-testid="report-widget">
                <div class="mb-3 flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="text-[13px] font-semibold text-fg">{{ title(widget) }}</h3>
                    @if (widget.framework) {
                      <p class="text-[11.5px] text-fg-subtle">
                        {{ frameworkName(widget.framework) }}
                      </p>
                    }
                  </div>
                  @if (link(widget); as target) {
                    <a
                      [routerLink]="target.path"
                      [queryParams]="target.queryParams"
                      class="flex flex-none items-center rounded-[6px] p-1 text-fg-subtle hover:text-accent"
                      [attr.aria-label]="
                        'reports.widgets.open' | transloco: { title: title(widget) }
                      "
                    >
                      <app-icon name="arrow" [size]="15" />
                    </a>
                  }
                </div>
                @if (widget.available && widget.data) {
                  <app-metric-view [kind]="widget.kind" [data]="widget.data" />
                } @else {
                  <p class="text-[12.5px] text-fg-muted">
                    {{ 'reports.widgets.unavailable' | transloco }}
                  </p>
                }
              </app-card>
            } @empty {
              <app-card class="md:col-span-2 xl:col-span-4">
                <p class="py-4 text-center text-[13px] text-fg-muted">
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
    switch (s.value.source) {
      case 'role': {
        const role = s.value.role_key ?? '';
        return translate('reports.widgets.sourceRole', {
          role: labelOr((k) => translate(k), roleNameKey(role), role),
        });
      }
      case 'org':
        return translate('reports.widgets.sourceOrg');
      default:
        return translate('reports.widgets.sourceBuiltin');
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

  protected span(size: string): string {
    return `block ${widgetSpan(size)}`;
  }

  protected title(widget: DashboardWidget): string {
    return this.scoped.text(widget.title_key, humanize(widget.key));
  }

  protected frameworkName(framework: string): string {
    return labelOr((k) => this.language.translate(k), frameworkLabelKey(framework), framework);
  }

  protected link(widget: DashboardWidget) {
    return widgetLink(widget.key);
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
