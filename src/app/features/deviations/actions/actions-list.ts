import { providePageContext } from '../../../core/ai/page-context';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ActionListItem } from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { DEVIATIONS_ROOT_CRUMB } from '../deviation-display';
import { DeviationFilter, FilterOption } from '../ui/filter-select';
import { DeviationsNavService } from '../ui/deviations-nav';
import { ActionListRow } from './action-list-row';
import {
  ActionListQuery,
  ActionOwnerScope,
  ActionScope,
  actionListQueryParams,
  parseActionListQuery,
  toActionFilters,
} from './actions-list-data';
import { StatusLegend } from '../../../shared/ui/status-legend/status-legend';

const PAGE_SIZE = 25;

/**
 * CAPA actions across every deviation the user may view, soonest due first —
 * the drill-down behind the dashboard's open / overdue action tiles. Filters:
 * open vs overdue, and everyone's vs mine; both are mirrored in the URL
 * (`?overdue=true`, `?owner_user_id=me`). Reloads on org switch.
 */
@Component({
  selector: 'app-actions-list',
  imports: [
    StatusLegend,
    TranslocoPipe,
    EmptyState,
    ErrorState,
    HelpStrip,
    LoadingState,
    ModuleNav,
    PageHeader,
    Pager,
    RecordRowHeader,
    ActionListRow,
    DeviationFilter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="deviations.actionsList.title"
        descriptionKey="deviations.actionsList.subtitle"
        [breadcrumbs]="breadcrumbs"
      />
      <app-module-nav [items]="nav.items()" labelKey="modules.names.deviations" />
      <app-help-strip scope="deviations" page="actions" />

      <div class="mb-4 flex flex-wrap items-end gap-2">
        <app-deviation-filter
          labelKey="deviations.actionsList.scope"
          allKey="deviations.actionsList.scopeOpen"
          [options]="scopeOptions"
          [value]="query().scope === 'overdue' ? 'overdue' : ''"
          (valueChange)="onScopeChange($any($event || 'open'))"
        />
        <app-deviation-filter
          labelKey="deviations.filters.owner"
          allKey="deviations.filters.allOwners"
          [options]="ownerOptions"
          [value]="query().owner === 'me' ? 'me' : ''"
          (valueChange)="onOwnerChange($any($event || 'all'))"
        />
        <app-status-legend [text]="'deviations.statusPair.actions' | transloco" />
      </div>

      @if (failed()) {
        <app-error-state (retry)="goTo(offset())" />
      } @else if (loading()) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-empty-state
          icon="checkcircle"
          titleKey="deviations.actionsList.empty"
          bodyKey="deviations.actionsList.emptyBody"
          [compact]="true"
        />
      } @else {
        <div class="overflow-hidden rounded-card border border-border bg-surface">
          <app-record-row-header
            dateKind="due"
            [coverage]="false"
            codeKey="deviations.actionsList.deviationColumn"
            titleKey="deviations.actionsList.actionColumn"
          />
          <div role="list" [attr.aria-label]="'deviations.actionsList.title' | transloco">
            @for (action of items(); track action.id) {
              <app-action-list-row [action]="action" [showOwner]="true" />
            }
          </div>
        </div>
        <div class="mt-3">
          <app-pager
            [offset]="offset()"
            [pageSize]="pageSize"
            [count]="items().length"
            [total]="total()"
            (pageChange)="goTo($event)"
          />
        </div>
      }
    </div>
  `,
})
export class ActionsList {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  protected readonly nav = inject(DeviationsNavService);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly breadcrumbs = [
    DEVIATIONS_ROOT_CRUMB,
    { labelKey: 'deviations.actionsList.title' },
  ];
  protected readonly scopeOptions: readonly FilterOption[] = [
    { value: 'overdue', label: 'deviations.actionsList.scopeOverdue' },
  ];
  protected readonly ownerOptions: readonly FilterOption[] = [
    { value: 'me', label: 'deviations.actionsList.ownerMe' },
  ];

  protected readonly query = signal<ActionListQuery>(
    parseActionListQuery(this.route.snapshot.queryParamMap),
  );
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly ActionListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  private request = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'deviation_action',
      view: 'list',
      title: this.language.translate('deviations.actionsList.title'),
    }));
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        this.offset.set(0);
        this.load(orgId);
      });
    });
  }

  protected onScopeChange(scope: ActionScope): void {
    this.update({ ...this.query(), scope });
  }

  protected onOwnerChange(owner: ActionOwnerScope): void {
    this.update({ ...this.query(), owner });
  }

  protected goTo(offset: number): void {
    this.offset.set(Math.max(0, offset));
    this.load(this.selectedOrg.currentOrgId());
  }

  private update(query: ActionListQuery): void {
    this.query.set(query);
    this.offset.set(0);
    // Mirror the filters in the URL so the view can be shared / reloaded.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: actionListQueryParams(query),
      replaceUrl: true,
    });
    this.load(this.selectedOrg.currentOrgId());
  }

  private load(orgId: string | null): void {
    this.request.unsubscribe();
    this.items.set([]);
    this.total.set(0);
    this.failed.set(false);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = this.api
      .listActions(orgId, toActionFilters(this.query(), this.pageSize, this.offset()))
      .subscribe({
        next: (page) => {
          this.items.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
        },
      });
  }
}
