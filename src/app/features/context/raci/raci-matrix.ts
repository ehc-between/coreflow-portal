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
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContextApi } from '../data/context-api';
import { FRAMEWORK_KEYS, MatrixColumn, RaciMatrix } from '../data/context.models';
import { ContextNav } from '../ui/context-nav';
import { ContextFilter, FilterOption } from '../ui/filter-select';
import { RaciLetter } from '../ui/raci-letter';

/** The cell key of a matrix column (`"<type>:<value>"`). */
export function columnKey(column: MatrixColumn): string {
  return `${column.type}:${column.value}`;
}

/** Per column: how many rows it is accountable (A) / responsible (R) for. */
export function columnLoad(matrix: RaciMatrix): Record<string, { a: number; r: number }> {
  const load: Record<string, { a: number; r: number }> = {};
  for (const column of matrix.columns) {
    load[columnKey(column)] = { a: 0, r: 0 };
  }
  for (const row of matrix.rows) {
    for (const [key, raci] of Object.entries(row.cells)) {
      const entry = (load[key] ??= { a: 0, r: 0 });
      if (raci === 'A') {
        entry.a += 1;
      } else if (raci === 'R') {
        entry.r += 1;
      }
    }
  }
  return load;
}

/**
 * `/context/responsibilities/matrix`: the RACI matrix across all
 * responsibilities (rows) and the roles, departments and people assigned
 * (columns), with gaps (no A / no R) flagged per row. Scrolls sideways on small
 * screens with the first column sticky.
 */
@Component({
  selector: 'app-context-raci-matrix',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    Alert,
    Badge,
    Icon,
    ContextNav,
    ContextFilter,
    RaciLetter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1280px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/context/responsibilities"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'context.kinds.responsibility.back' | transloco }}
      </a>
      <header class="mb-2 flex flex-wrap items-start justify-between gap-3">
        <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
          {{ 'context.raci.matrixTitle' | transloco }}
        </h1>
        <app-ask-about [prompt]="'context.ai.prompts.matrix' | transloco" />
      </header>
      <app-context-nav />

      <div class="mt-4 flex flex-col gap-4">
        <app-guide-intro scope="context" page="raci-matrix" />
        <div class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="raci-q">{{
            'context.list.searchPlaceholder' | transloco
          }}</label>
          <input
            id="raci-q"
            type="search"
            class="h-10 min-w-[200px] flex-1 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
            [placeholder]="'context.list.searchPlaceholder' | transloco"
            [value]="query()"
            (change)="query.set($any($event.target).value)"
            (keydown.enter)="query.set($any($event.target).value)"
          />
          <app-context-filter
            labelKey="context.filters.framework"
            allKey="context.filters.allFrameworks"
            [options]="frameworkOptions"
            [value]="framework()"
            (valueChange)="framework.set($event)"
          />
          <label class="flex items-center gap-2 text-[13px] text-fg-muted">
            <input
              type="checkbox"
              class="h-4 w-4"
              [checked]="includeArchived()"
              (change)="includeArchived.set($any($event.target).checked)"
            />
            {{ 'context.raci.includeArchived' | transloco }}
          </label>
        </div>

        <p class="flex flex-wrap items-center gap-3 text-[12.5px] text-fg-muted">
          @for (r of letters; track r) {
            <span class="inline-flex items-center gap-1.5">
              <app-context-raci-letter [raci]="r" />
              {{ 'context.raci.roles.' + r | transloco }}
            </span>
          }
        </p>

        @if (error()) {
          <app-alert tone="error">{{ 'context.list.loadError' | transloco }}</app-alert>
        } @else if (!matrix()) {
          <p class="text-[13.5px] text-fg-muted">{{ 'context.common.loading' | transloco }}</p>
        } @else if (matrix()!.rows.length === 0) {
          <p
            class="rounded-card border border-border bg-surface p-6 text-center text-[13.5px] text-fg-muted"
          >
            {{ 'context.raci.matrixEmpty' | transloco }}
          </p>
        } @else {
          <div
            class="overflow-x-auto rounded-card border border-border bg-surface"
            tabindex="0"
            [attr.aria-label]="'context.raci.matrixTitle' | transloco"
          >
            <table class="text-[13px]">
              <caption class="sr-only">
                {{
                  'context.raci.matrixCaption' | transloco
                }}
              </caption>
              <thead>
                <tr class="border-b border-border">
                  <th
                    scope="col"
                    class="sticky left-0 z-10 min-w-[220px] bg-surface px-3 py-2 text-left text-[12px] font-semibold text-fg-subtle"
                  >
                    {{ 'context.kinds.responsibility.one' | transloco }}
                  </th>
                  @for (column of matrix()!.columns; track columnKey(column)) {
                    <th
                      scope="col"
                      class="min-w-[96px] px-2 py-2 text-center align-bottom text-[12px] font-semibold text-fg"
                    >
                      <span class="block">
                        @if (column.type === 'role') {
                          {{ 'roles.' + column.value + '.name' | transloco }}
                        } @else {
                          {{ column.name || column.value }}
                        }
                      </span>
                      <span class="block text-[11px] font-normal text-fg-subtle">
                        {{ 'context.assigneeTypes.' + column.type | transloco }}
                      </span>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of matrix()!.rows; track row.id) {
                  <tr class="border-b border-border last:border-b-0 hover:bg-surface-2">
                    <th
                      scope="row"
                      class="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-normal"
                    >
                      <a
                        [routerLink]="['/context/responsibilities', row.id]"
                        class="font-semibold text-fg hover:text-accent hover:underline"
                      >
                        <span class="font-mono text-[11.5px] text-fg-muted">{{ row.code }}</span>
                        {{ row.title }}
                      </a>
                      @if (row.area) {
                        <span class="block text-[11.5px] text-fg-subtle">{{ row.area }}</span>
                      }
                      @for (warning of row.warnings; track warning) {
                        <app-badge tone="warn" class="mt-1 mr-1 inline-block">{{
                          'context.raci.warnings.' + warning | transloco
                        }}</app-badge>
                      }
                    </th>
                    @for (column of matrix()!.columns; track columnKey(column)) {
                      <td class="px-2 py-2 text-center">
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
              <tfoot>
                <tr class="border-t border-border bg-surface-2 text-[11.5px] text-fg-muted">
                  <th
                    scope="row"
                    class="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left font-semibold"
                  >
                    {{ 'context.raci.load' | transloco }}
                  </th>
                  @for (column of matrix()!.columns; track columnKey(column)) {
                    <td class="px-2 py-2 text-center">
                      {{
                        'context.raci.loadCell'
                          | transloco
                            : {
                                a: load()[columnKey(column)]?.a ?? 0,
                                r: load()[columnKey(column)]?.r ?? 0,
                              }
                      }}
                    </td>
                  }
                </tr>
              </tfoot>
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

  protected readonly letters = ['R', 'A', 'C', 'I'] as const;
  protected readonly frameworkOptions: readonly FilterOption[] = FRAMEWORK_KEYS.map((key) => ({
    value: key,
    label: `context.frameworks.${key}`,
  }));
  protected readonly columnKey = columnKey;

  protected readonly query = signal('');
  protected readonly framework = signal('');
  protected readonly includeArchived = signal(false);
  protected readonly matrix = signal<RaciMatrix | null>(null);
  protected readonly error = signal(false);
  protected readonly load = computed(() => {
    const matrix = this.matrix();
    return matrix ? columnLoad(matrix) : {};
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({ module: 'context', entityType: 'responsibility', view: 'other' }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const q = this.query();
      const framework = this.framework();
      const archived = this.includeArchived();
      untracked(() => this.fetch(orgId, q, framework, archived));
    });
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
