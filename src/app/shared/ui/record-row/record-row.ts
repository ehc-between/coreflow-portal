import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe, LocalDayPipe } from '../../locale/locale-pipes';
import { Icon } from '../icon/icon';

/** What the row's date means; decides its label ("Frist", "Oppdatert" …). */
export type RecordRowDateKind = 'due' | 'updated' | 'created' | 'date' | 'next';

/**
 * Column template shared by `app-record-row` and `app-record-row-header` at ≥ 1024 px:
 * code · title · requirement coverage · badges · owner · date.
 *
 * The four optional columns read `--cf-rr-coverage`, `--cf-rr-badges`, `--cf-rr-owner`
 * and `--cf-rr-date`; a list (`[role=list]`) in which no row fills one of them sets it to
 * 0 (src/styles.scss), so an empty "Krav" or "Neste" column gives its room to the title
 * while header and rows stay aligned.
 */
export const RECORD_ROW_COLUMNS =
  'lg:grid lg:grid-cols-[minmax(84px,112px)_minmax(0,1fr)_var(--cf-rr-coverage,minmax(0,150px))_var(--cf-rr-badges,minmax(0,220px))_var(--cf-rr-owner,minmax(0,140px))_var(--cf-rr-date,minmax(0,116px))] lg:items-center lg:gap-x-4';

/** Room kept for the "+N" chip when badges overflow their column. */
const MORE_CHIP_PX = 34;

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
        #badges
        class="flex min-w-0 flex-wrap items-center gap-1.5 empty:hidden lg:flex-nowrap lg:overflow-hidden lg:empty:block [&>*]:flex-none"
        data-testid="record-row-badges"
      >
        <ng-content select="[badges]" />
        @if (hiddenBadges().length > 0) {
          <span
            class="cf-rr-more rounded-full border border-border bg-surface px-1.5 text-meta leading-5 font-semibold text-fg-muted"
            aria-hidden="true"
            data-testid="record-row-badges-more"
            [title]="hiddenBadges().join(', ')"
            >+{{ hiddenBadges().length }}</span
          >
        }
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
            <span class="lg:block"
              ><span class="lg:hidden"> · </span>{{ 'common.status.overdue' | transloco }}</span
            >
          }
        }
      </span>
    </div>
  `,
})
export class RecordRow {
  private readonly badges = viewChild.required<ElementRef<HTMLElement>>('badges');
  /** Text of the badges that did not fit the column (≥ 1024 px); shown as "+N". */
  protected readonly hiddenBadges = signal<readonly string[]>([]);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
        return;
      }
      const el = this.badges().nativeElement;
      const fit = () => this.fitBadges(el);
      const resize = new ResizeObserver(fit);
      const mutate = new MutationObserver(fit);
      resize.observe(el);
      mutate.observe(el, { childList: true, subtree: true, characterData: true });
      destroyRef.onDestroy(() => {
        resize.disconnect();
        mutate.disconnect();
      });
    });
  }

  /**
   * On one line (≥ 1024 px) the badges that do not fit are hidden visually (still read
   * by screen readers) and counted in a "+N" chip, instead of stacking one per line.
   */
  private fitBadges(el: HTMLElement): void {
    const items = Array.from(el.children).filter(
      (child): child is HTMLElement => !child.classList.contains('cf-rr-more'),
    );
    items.forEach((item) => item.classList.remove('cf-rr-hidden'));
    const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 1024px)').matches;
    const hidden: string[] = [];
    if (wide && items.length > 1) {
      const right = el.getBoundingClientRect().right;
      let cut = -1;
      items.forEach((item, i) => {
        const room = i === items.length - 1 ? 0 : MORE_CHIP_PX;
        if (cut < 0 && item.getBoundingClientRect().right > right - room + 0.5) {
          cut = i;
        }
      });
      if (cut >= 0) {
        // Always keep the first badge (the status).
        for (const item of items.slice(Math.max(cut, 1))) {
          item.classList.add('cf-rr-hidden');
          hidden.push(item.textContent?.trim() ?? '');
        }
      }
    }
    const current = this.hiddenBadges();
    if (current.length !== hidden.length || current.some((text, i) => text !== hidden[i])) {
      this.hiddenBadges.set(hidden);
    }
  }

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
      class="border-b border-border px-4 py-2 text-micro font-semibold tracking-wide text-fg-subtle uppercase [&>span]:min-w-0 [&>span]:truncate"
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
