import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../button/button';

/**
 * Offset-based Previous / Next pager with an "x–y of z" range. The host owns
 * the offset and reloads on `pageChange` (the new offset). When the backend
 * doesn't report a total (`total` null), the range omits it and Next stays
 * enabled while a full page came back.
 *
 *   <app-pager [offset]="offset()" [pageSize]="pageSize" [count]="items().length"
 *              [total]="total()" (pageChange)="goTo($event)" />
 */
@Component({
  selector: 'app-pager',
  imports: [TranslocoPipe, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <nav
        class="mt-4 flex items-center justify-between gap-4"
        [attr.aria-label]="'common.pagination.label' | transloco"
      >
        <span class="text-[13px] text-fg-subtle">
          @if (total() !== null) {
            {{ 'common.pagination.range' | transloco: { from: from(), to: to(), total: total() } }}
          } @else {
            {{ 'common.pagination.rangeOpen' | transloco: { from: from(), to: to() } }}
          }
        </span>
        <div class="flex items-center gap-2">
          <app-button
            variant="secondary"
            size="sm"
            [disabled]="offset() === 0"
            (click)="pageChange.emit(prevOffset())"
          >
            {{ 'common.pagination.prev' | transloco }}
          </app-button>
          <app-button
            variant="secondary"
            size="sm"
            [disabled]="!hasNext()"
            (click)="pageChange.emit(offset() + pageSize())"
          >
            {{ 'common.pagination.next' | transloco }}
          </app-button>
        </div>
      </nav>
    }
  `,
})
export class Pager {
  /** Offset of the first row on the current page. */
  readonly offset = input(0);
  readonly pageSize = input(25);
  /** Rows on the current page. */
  readonly count = input(0);
  /** Unpaged total, or null when unknown. */
  readonly total = input<number | null>(null);

  /** The offset to load next. */
  readonly pageChange = output<number>();

  protected readonly from = computed(() => (this.count() === 0 ? 0 : this.offset() + 1));
  protected readonly to = computed(() => this.offset() + this.count());
  protected readonly prevOffset = computed(() => Math.max(0, this.offset() - this.pageSize()));

  protected readonly hasNext = computed(() => {
    const total = this.total();
    return total === null ? this.count() >= this.pageSize() : this.to() < total;
  });

  /** Hidden when everything fits on the first page. */
  protected readonly visible = computed(() => this.offset() > 0 || this.hasNext());
}
