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
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RoleNamePipe } from '../../../shared/roles/role-name.pipe';
import { Button } from '../../../shared/ui/button/button';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContextApi } from '../data/context-api';
import { ContextFrameworks } from '../data/context-frameworks';
import { MatrixColumn, RACI_ROLES, RACI_WARNINGS, Raci, RaciMatrix } from '../data/context.models';
import { CONTEXT_NAV, CONTEXT_ROOT_CRUMB } from '../context-nav';
import { injectContextPermissions } from '../context-permissions';
import { ContextFilter } from '../ui/filter-select';
import { RaciLetter } from '../ui/raci-letter';
import { frameworkOptions } from '../list/list-config';

/** The cell key of a matrix column (`"<type>:<value>"`). */
export function columnKey(column: MatrixColumn): string {
  return `${column.type}:${column.value}`;
}

/** Per column: rows per letter (from the API, else counted from the cells). */
export function columnCounts(matrix: RaciMatrix): Record<string, Record<Raci, number>> {
  const out: Record<string, Record<Raci, number>> = {};
  for (const column of matrix.columns) {
    out[columnKey(column)] = { R: 0, A: 0, C: 0, I: 0 };
  }
  for (const row of matrix.rows) {
    for (const [key, raci] of Object.entries(row.cells)) {
      const entry = (out[key] ??= { R: 0, A: 0, C: 0, I: 0 });
      entry[raci] += 1;
    }
  }
  for (const column of matrix.columns) {
    const given = column.counts;
    if (given) {
      out[columnKey(column)] = {
        R: given.R ?? 0,
        A: given.A ?? 0,
        C: given.C ?? 0,
        I: given.I ?? 0,
      };
    }
  }
  return out;
}

/** Rows per warning (from the API, else counted from the rows). */
export function warningCounts(matrix: RaciMatrix): Record<string, number> {
  if (matrix.warning_counts) {
    return { ...matrix.warning_counts };
  }
  const out: Record<string, number> = {};
  for (const row of matrix.rows) {
    for (const warning of row.warnings) {
      out[warning] = (out[warning] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * `/context/responsibilities/matrix`: the RACI matrix across all
 * responsibilities (rows) and the roles, departments and people assigned
 * (columns). Each column shows who holds it today and how many rows it carries;
 * gaps (no A, no R, nobody holds the role, the same person does and approves)
 * are flagged per row and per column. Scrolls sideways on small screens with
 * the first column sticky.
 */
@Component({
  selector: 'app-context-raci-matrix',
  imports: [
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    RoleNamePipe,
    Button,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    StatusBadge,
    ContextFilter,
    RaciLetter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="context.raci.matrixTitle"
        descriptionKey="context.raci.matrixDescription"
        [breadcrumbs]="breadcrumbs"
      >
        @if (perms.canWrite()) {
          <a primary routerLink="/context/responsibilities/new" tabindex="-1">
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'context.kinds.responsibility.new' | transloco }}
            </app-button>
          </a>
        }
      </app-page-header>
      <app-module-nav [items]="nav" labelKey="modules.names.context" />
      <app-help-strip scope="context" page="raci-matrix" lesson="policies-and-raci" />

      <div class="flex flex-col gap-4">
        <div
          class="flex flex-wrap items-end gap-2"
          role="search"
          [attr.aria-label]="'ui.list.toolbar' | transloco"
        >
          <div class="flex min-w-[200px] flex-1 flex-col gap-1">
            <label class="sr-only" for="raci-q">{{ 'context.raci.searchLabel' | transloco }}</label>
            <input
              id="raci-q"
              type="search"
              class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
              [placeholder]="'context.raci.searchPlaceholder' | transloco"
              [value]="query()"
              (change)="query.set($any($event.target).value)"
              (keydown.enter)="query.set($any($event.target).value)"
            />
          </div>
          <app-context-filter
            labelKey="context.filters.framework"
            allKey="context.filters.allFrameworks"
            [options]="frameworkOptions()"
            [value]="framework()"
            (valueChange)="framework.set($event)"
          />
          <label class="flex min-h-10 items-center gap-2 text-ui text-fg-muted">
            <input
              type="checkbox"
              class="h-4 w-4"
              [checked]="includeArchived()"
              (change)="includeArchived.set($any($event.target).checked)"
            />
            {{ 'context.raci.includeArchived' | transloco }}
          </label>
        </div>

        <p class="flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-fg-muted">
          @for (r of letters; track r) {
            <span class="inline-flex items-center gap-1.5">
              <app-context-raci-letter [raci]="r" />
              {{ 'context.raci.roles.' + r | transloco }}
            </span>
          }
        </p>

        @if (error()) {
          <app-error-state (retry)="reload()" />
        } @else if (!matrix()) {
          <app-loading-state [rows]="5" />
        } @else if (matrix()!.rows.length === 0) {
          <app-empty-state
            icon="people"
            titleKey="context.raci.matrixEmptyTitle"
            bodyKey="context.raci.matrixEmpty"
            [ctaKey]="perms.canWrite() ? 'context.kinds.responsibility.new' : null"
            ctaLink="/context/responsibilities/new"
          />
        } @else {
          @if (warningList().length) {
            <ul
              class="flex flex-wrap gap-2"
              [attr.aria-label]="'context.raci.warningsLabel' | transloco"
            >
              @for (w of warningList(); track w.key) {
                <li
                  class="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn-soft px-3 py-1 text-meta font-semibold text-warn-ink"
                >
                  {{ 'context.raci.warningSummary.' + w.key | transloco: { count: w.count } }}
                </li>
              }
            </ul>
          }
          <div
            class="overflow-x-auto rounded-card border border-border bg-surface"
            tabindex="0"
            [attr.aria-label]="'context.raci.matrixTitle' | transloco"
          >
            <table class="w-full text-ui">
              <caption class="sr-only">
                {{
                  'context.raci.matrixCaption' | transloco
                }}
              </caption>
              <thead>
                <tr class="border-b border-border align-bottom">
                  <th
                    scope="col"
                    class="sticky left-0 z-10 min-w-[200px] bg-surface px-3 py-2 text-left text-meta font-semibold text-fg-muted"
                  >
                    {{ 'context.kinds.responsibility.one' | transloco }}
                  </th>
                  @for (column of matrix()!.columns; track columnKey(column)) {
                    @let counts = load()[columnKey(column)];
                    <th
                      scope="col"
                      class="min-w-[124px] px-2 py-2 text-center align-bottom font-semibold text-fg"
                      [attr.data-testid]="'col-' + columnKey(column)"
                    >
                      <span class="block">
                        @if (column.type === 'role') {
                          {{ column.value | roleName: column.name }}
                        } @else {
                          {{ column.name || column.value }}
                        }
                      </span>
                      <span class="block text-meta font-normal text-fg-subtle">
                        {{ 'context.assigneeTypes.' + column.type | transloco }}
                      </span>
                      @if (column.type !== 'user') {
                        <span class="mt-1 block text-meta font-normal text-fg-muted">
                          @if (column.members?.length) {
                            {{ memberNames(column) }}
                          } @else if (column.members) {
                            <span class="text-warn-ink">{{
                              'context.raci.noMembers' | transloco
                            }}</span>
                          }
                        </span>
                      }
                      @if (counts) {
                        <span
                          class="mt-1 block text-micro font-normal text-fg-subtle"
                          [attr.aria-label]="
                            'context.raci.columnCountsLabel'
                              | transloco: { r: counts.R, a: counts.A, c: counts.C, i: counts.I }
                          "
                        >
                          R {{ counts.R }} · A {{ counts.A }} · C {{ counts.C }} · I {{ counts.I }}
                        </span>
                      }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of matrix()!.rows; track row.id) {
                  <tr class="border-b border-border last:border-b-0 hover:bg-surface-2">
                    <th
                      scope="row"
                      class="sticky left-0 z-10 bg-surface px-3 py-2 text-left align-top font-normal"
                    >
                      <a
                        [routerLink]="row.url || ['/context/responsibilities', row.id]"
                        class="font-semibold text-fg hover:text-accent hover:underline"
                      >
                        <span class="font-mono text-meta text-fg-muted">{{ row.code }}</span>
                        {{ row.title }}
                      </a>
                      @if (row.area) {
                        <span class="block text-meta text-fg-subtle">{{ row.area }}</span>
                      }
                      @if (row.warnings.length) {
                        <span class="mt-1 flex flex-wrap gap-1">
                          @for (warning of row.warnings; track warning) {
                            <app-status-badge
                              meaning="lifecycle"
                              value="blocked"
                              [labelKey]="'context.raci.warnings.' + warning"
                            />
                          }
                        </span>
                      }
                    </th>
                    @for (column of matrix()!.columns; track columnKey(column)) {
                      <td class="px-2 py-2 text-center align-top">
                        @if (row.cells[columnKey(column)]; as raci) {
                          <app-context-raci-letter [raci]="raci" />
                          <span class="sr-only">{{
                            'context.raci.roles.' + raci | transloco
                          }}</span>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        <app-why-it-matters scope="context" page="raci-matrix" />
      </div>
    </div>
  `,
})
export class RaciMatrixPage {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly frameworks = inject(ContextFrameworks);

  protected readonly nav = CONTEXT_NAV;
  protected readonly perms = injectContextPermissions();
  protected readonly breadcrumbs = [
    CONTEXT_ROOT_CRUMB,
    { labelKey: 'context.kinds.responsibility.plural', link: '/context/responsibilities' },
    { labelKey: 'context.raci.matrixTitle' },
  ];
  protected readonly letters = RACI_ROLES;
  protected readonly frameworkOptions = computed(() => frameworkOptions(this.frameworks.ordered()));
  protected readonly columnKey = columnKey;

  protected readonly query = signal('');
  protected readonly framework = signal('');
  protected readonly includeArchived = signal(false);
  protected readonly matrix = signal<RaciMatrix | null>(null);
  protected readonly error = signal(false);
  protected readonly load = computed(() => {
    const matrix = this.matrix();
    return matrix ? columnCounts(matrix) : {};
  });
  protected readonly warningList = computed(() => {
    const matrix = this.matrix();
    if (!matrix) {
      return [];
    }
    const counts = warningCounts(matrix);
    const empty = matrix.columns.filter((c) => c.warnings?.includes('no_members')).length;
    const list = (RACI_WARNINGS as readonly string[])
      .map((key) => ({ key, count: counts[key] ?? 0 }))
      .filter((w) => w.count > 0);
    if (empty > 0) {
      list.push({ key: 'no_members', count: empty });
    }
    return list;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.frameworks.ensureLoaded();
    providePageContext(() => ({
      module: 'context',
      entityType: 'responsibility',
      view: 'other',
      title: this.language.translate('context.raci.matrixTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const q = this.query();
      const framework = this.framework();
      const archived = this.includeArchived();
      untracked(() => this.fetch(orgId, q, framework, archived));
    });
  }

  protected memberNames(column: MatrixColumn): string {
    return (column.members ?? [])
      .map((m) => m.name || this.language.translate('context.common.unknown'))
      .join(', ');
  }

  protected reload(): void {
    this.fetch(
      this.selectedOrg.currentOrgId(),
      this.query(),
      this.framework(),
      this.includeArchived(),
    );
  }

  private fetch(orgId: string | null, q: string, framework: string, archived: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.error.set(false);
    this.request = this.api
      .matrix(orgId, { q, framework, status: archived ? ['active', 'archived'] : ['active'] })
      .subscribe({
        next: (matrix) => this.matrix.set(matrix),
        error: () => this.error.set(true),
      });
  }
}
