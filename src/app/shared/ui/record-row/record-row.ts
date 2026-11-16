import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe, LocalDayPipe } from '../../locale/locale-pipes';
import { Icon } from '../icon/icon';

/** What the row's date means; decides its label ("Frist", "Oppdatert" …). */
export type RecordRowDateKind = 'due' | 'updated' | 'created' | 'date' | 'next';

/**
 * Column template shared by `app-record-row` and `app-record-row-header` at ≥ 1024 px:
 * code · title · requirement coverage · badges · owner · date.
 */
export const RECORD_ROW_COLUMNS =
  'lg:grid lg:grid-cols-[minmax(84px,112px)_minmax(0,1fr)_minmax(0,150px)_minmax(0,180px)_minmax(0,140px)_minmax(0,116px)] lg:items-center lg:gap-x-4';

/**
 * One row of a record list, with the same slots everywhere (docs/ux-guide.md, "List"):
 * code (mono) · title + subtitle · `[coverage]` (requirement coverage chip) ·
 * `[badges]` (status first, then severity) · owner · date.
 *
 *   <app-record-row [code]="r.code" [title]="r.title" [link]="['/risk', r.id]"
 *       [owner]="r.owner_name" [date]="r.due_date" dateKind="due" [overdue]="r.overdue">
 *     <app-status-badge badges meaning="lifecycle" [value]="r.status" />
 *     <app-coverage-chip coverage … />
 *   </app-record-row>
 *
 * The whole row is clickable (the title link is stretched over it); the coverage
 * slot sits above it so its own actions stay clickable. Columns get headers at
 * ≥ 1024 px with `app-record-row-header`; below 640 px the slots stack.
 */
@Component({
  selector: 'app-record-row',
  imports: [RouterLink, TranslocoPipe, LocalDatePipe, LocalDayPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', role: 'listitem' },
  template: `
    <div
      data-testid="record-row"
      class="relative flex flex-col gap-1.5 border-b border-border px-4 py-3 hover:bg-surface-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5"
      [class]="columns"
    >
      <span
        class="font-mono text-meta text-fg-subtle sm:w-[96px] sm:flex-none lg:w-auto"
        data-testid="record-row-code"
        >{{ code() || '—' }}</span
      >
      <div class="min-w-0 sm:flex-1 lg:flex-none">
        <a
          [routerLink]="link()"
          class="block truncate text-body font-semibold text-fg after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:rounded-tile focus-visible:after:ring-2 focus-visible:after:ring-accent"
          data-testid="record-row-title"
          >{{ title() }}</a
        >
        @if (subtitle()) {
          <p class="mt-0.5 truncate text-meta text-fg-muted">{{ subtitle() }}</p>
        }
      </div>
      <div class="relative z-10 empty:hidden lg:empty:block" data-testid="record-row-coverage">
        <ng-content select="[coverage]" />
      </div>
      <div
        class="flex flex-wrap items-center gap-1.5 empty:hidden lg:empty:block"
        data-testid="record-row-badges"
      >
        <ng-content select="[badges]" />
      </div>
      <span
        class="min-w-0 items-center gap-1.5 text-meta text-fg-muted lg:flex"
        [class.flex]="!!owner()"
        [class.hidden]="!owner()"
        data-testid="record-row-owner"
      >
        @if (owner()) {
          <span class="lg:hidden" aria-hidden="true"><app-icon name="people" [size]="13" /></span>
          <span class="truncate">
            <span class="sr-only">{{ 'ui.recordRow.owner' | transloco }}: </span>{{ owner() }}</span
          >
        }
      </span>
      <span
        class="text-meta whitespace-nowrap lg:block"
        [class]="overdue() ? 'font-semibold text-warn-ink' : 'text-fg-muted'"
        [class.hidden]="!date()"
        data-testid="record-row-date"
      >
        @if (date()) {
          <span class="lg:sr-only">{{ dateLabelKey() | transloco }} </span>
          {{ isDay() ? (date() | localDay) : (date() | localDate: 'mediumDate') }}
          @if (overdue()) {
            <span> · {{ 'common.status.overdue' | transloco }}</span>
          }
        }
      </span>
    </div>
  `,
})
export class RecordRow {
  readonly code = input<string | null | undefined>(null);
  readonly title = input.required<string>();
  readonly subtitle = input<string | null | undefined>(null);
  readonly link = input.required<string | readonly unknown[]>();
  readonly owner = input<string | null | undefined>(null);
  /** ISO date or date-time. */
  readonly date = input<string | null | undefined>(null);
  readonly dateKind = input<RecordRowDateKind>('date');
  /** Mark the date as overdue (amber + "Forfalt"). */
  readonly overdue = input(false);

  protected readonly columns = RECORD_ROW_COLUMNS;
  protected readonly dateLabelKey = computed(() => `ui.recordRow.date.${this.dateKind()}`);
  /** Due / next / plain dates are calendar days (no timezone shift). */
  protected readonly isDay = computed(() => {
    const kind = this.dateKind();
    return kind === 'due' || kind === 'next' || kind === 'date';
  });
}

/**
 * Column headers for a list of `app-record-row`s, shown from 1024 px. Wrap both in
 * an element with `role="list"`; the header is hidden from the list semantics.
 *
 *   <app-record-row-header dateKind="due" />
 */
@Component({
  selector: 'app-record-row-header',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hidden lg:block', 'aria-hidden': 'true' },
  template: `
    <div
      class="border-b border-border px-4 py-2 text-micro font-semibold tracking-wide text-fg-subtle uppercase"
      [class]="columns"
    >
      <span>{{ codeKey() | transloco }}</span>
      <span>{{ titleKey() | transloco }}</span>
      <span>{{ coverage() ? ('ui.recordRow.coverage' | transloco) : '' }}</span>
      <span>{{ 'ui.recordRow.status' | transloco }}</span>
      <span>{{ owner() ? ('ui.recordRow.owner' | transloco) : '' }}</span>
      <span>{{ 'ui.recordRow.date.' + dateKind() | transloco }}</span>
    </div>
  `,
})
export class RecordRowHeader {
  readonly codeKey = input('ui.recordRow.code');
  readonly titleKey = input('ui.recordRow.title');
  readonly coverage = input(true);
  readonly owner = input(true);
  readonly dateKind = input<RecordRowDateKind>('date');

  protected readonly columns = RECORD_ROW_COLUMNS;
}
