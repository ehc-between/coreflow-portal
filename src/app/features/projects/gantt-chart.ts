import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { GanttBar, GanttRow, ganttLayout, routerTarget } from './data/gantt';
import { isFinishedStatus } from './data/project-display';

/**
 * A read-only Gantt chart: one row per item, bars for date spans, diamonds for
 * milestones (points in time), month ticks and a "today" line. The timeline
 * scrolls horizontally on narrow screens while the labels stay readable; every
 * bar's dates are also written out for screen readers. Undated rows are listed
 * with a "not scheduled" note.
 */
@Component({
  selector: 'app-gantt-chart',
  imports: [RouterLink, TranslocoPipe, LocalDayPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (layout(); as l) {
      <div class="overflow-x-auto" data-testid="gantt">
        <div class="min-w-[680px]">
          <div class="flex border-b border-border text-[11.5px] text-fg-subtle">
            <div class="w-[200px] flex-none px-3 py-1.5 font-semibold sm:w-[240px]">
              {{ labelKey() | transloco }}
            </div>
            <div class="relative h-7 flex-1" aria-hidden="true">
              @for (t of l.ticks; track t.date) {
                <span
                  class="absolute top-0 h-full border-l border-border pl-1 leading-7 whitespace-nowrap"
                  [style.left.%]="t.left"
                  >{{ t.date | localDay: 'MMM yy' }}</span
                >
              }
            </div>
          </div>
          <ul role="list">
            @for (b of l.bars; track b.row.kind + b.row.id) {
              <li class="flex border-b border-border last:border-b-0" [attr.data-kind]="b.row.kind">
                <div
                  class="flex w-[200px] min-w-0 flex-none flex-col justify-center px-3 py-1.5 sm:w-[240px]"
                  [style.padding-left.px]="12 + b.row.depth * 14"
                >
                  <a
                    [routerLink]="target(b.row).path"
                    [queryParams]="target(b.row).query"
                    class="truncate text-[12.5px] text-fg hover:underline"
                    [class.font-semibold]="b.row.kind !== 'task'"
                    [class.text-fail]="b.row.overdue"
                    >{{ b.row.title }}</a
                  >
                  <span class="truncate text-[11px] text-fg-subtle">
                    {{ kindKey(b.row.kind) | transloco }}
                    @if (b.row.subtitle) {
                      · {{ b.row.subtitle }}
                    }
                  </span>
                  <span class="sr-only">
                    @if (b.left === null) {
                      {{ 'projects.plan.unscheduled' | transloco }}
                    } @else if (b.point) {
                      {{
                        'projects.plan.dueOn'
                          | transloco: { date: (b.row.end ?? b.row.start | localDay) }
                      }}
                    } @else {
                      {{
                        'projects.plan.span'
                          | transloco
                            : { start: (b.row.start | localDay), end: (b.row.end | localDay) }
                      }}
                    }
                    @if (b.row.overdue) {
                      · {{ 'projects.common.overdue' | transloco }}
                    }
                  </span>
                </div>
                <div class="relative min-h-[40px] flex-1" aria-hidden="true">
                  @for (t of l.ticks; track t.date) {
                    <span
                      class="absolute top-0 h-full border-l border-border/50"
                      [style.left.%]="t.left"
                    ></span>
                  }
                  @if (l.today !== null) {
                    <span
                      class="absolute top-0 z-[1] h-full border-l-2 border-accent/60"
                      [style.left.%]="l.today"
                    ></span>
                  }
                  @if (b.left === null) {
                    <span
                      class="absolute top-1/2 left-2 -translate-y-1/2 text-[11px] text-fg-subtle italic"
                    >
                      {{ 'projects.plan.unscheduled' | transloco }}
                    </span>
                  } @else if (b.point) {
                    <span
                      class="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]"
                      [class]="barClass(b)"
                      [style.left.%]="b.left"
                      [attr.title]="b.row.title"
                    ></span>
                  } @else {
                    <span
                      class="absolute top-1/2 -translate-y-1/2 rounded-full"
                      [class]="barClass(b)"
                      [style.left.%]="b.left"
                      [style.width.%]="b.width"
                      [attr.title]="b.row.title"
                    ></span>
                  }
                </div>
              </li>
            }
          </ul>
        </div>
      </div>
      <p class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-fg-subtle">
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-2.5 w-5 rounded-full bg-accent"></span>
          {{ 'projects.plan.legend.span' | transloco }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-accent"></span>
          {{ 'projects.plan.legend.milestone' | transloco }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-2.5 w-5 rounded-full bg-fail"></span>
          {{ 'projects.plan.legend.overdue' | transloco }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="inline-block h-3 border-l-2 border-accent/60"></span>
          {{ 'projects.plan.legend.today' | transloco }}
        </span>
      </p>
    } @else {
      <p class="py-6 text-center text-[13px] text-fg-muted" data-testid="gantt-empty">
        {{ emptyKey() | transloco }}
      </p>
    }
  `,
})
export class GanttChart {
  readonly rows = input.required<readonly GanttRow[]>();
  /** Range hints (e.g. the project's planned start and end). */
  readonly start = input<string | null>(null);
  readonly end = input<string | null>(null);
  readonly labelKey = input('projects.plan.item');
  readonly emptyKey = input('projects.plan.empty');

  protected readonly layout = computed(() =>
    ganttLayout(this.rows(), { start: this.start(), end: this.end() }),
  );

  protected target(row: GanttRow) {
    return routerTarget(row.url);
  }

  protected kindKey(kind: string): string {
    return `projects.plan.kinds.${kind}`;
  }

  protected barClass(bar: GanttBar): string {
    const row = bar.row;
    const height = row.kind === 'phase' || row.kind === 'project' ? 'h-3.5' : 'h-2.5';
    const color = row.overdue
      ? 'bg-fail'
      : isFinishedStatus(row.status) || row.status === 'completed'
        ? 'bg-pass'
        : row.kind === 'task'
          ? 'bg-accent/60'
          : 'bg-accent';
    return bar.point ? color : `${height} ${color} min-w-[6px]`;
  }
}
