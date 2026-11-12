import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { Icon } from '../../../shared/ui/icon/icon';

export interface PickedDeviation {
  readonly id: string;
  readonly label: string;
}

/**
 * Pick a deviation (nonconformity) to link a performance entry to: a search box over
 * the global search (`types=deviation`) and the chosen one as a removable chip.
 */
@Component({
  selector: 'app-supplier-deviation-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value(); as picked) {
      <div class="flex items-center gap-2 rounded-tile border border-border bg-bg px-3 py-2">
        <app-icon name="flag" [size]="14" />
        <span class="min-w-0 flex-1 truncate text-[13px] text-fg">{{
          picked.label || ('suppliers.performance.linkedDeviation' | transloco)
        }}</span>
        <button
          type="button"
          class="rounded-[8px] p-1 text-fg-subtle hover:text-fail"
          [attr.aria-label]="'suppliers.performance.form.unlinkDeviation' | transloco"
          (click)="valueChange.emit(null)"
        >
          <app-icon name="x" [size]="13" />
        </button>
      </div>
    } @else {
      <input
        [id]="inputId()"
        type="search"
        class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-[13.5px]"
        [placeholder]="'suppliers.performance.form.deviationPlaceholder' | transloco"
        (input)="search($any($event.target).value)"
      />
      @if (results().length) {
        <ul
          class="mt-1 max-h-48 overflow-y-auto rounded-tile border border-border bg-surface"
          role="listbox"
          [attr.aria-label]="'suppliers.performance.form.deviationResults' | transloco"
        >
          @for (item of results(); track item.entity_id) {
            <li role="option" aria-selected="false">
              <button
                type="button"
                class="w-full px-3 py-2 text-left text-[13px] text-fg hover:bg-surface-2"
                (click)="pick(item)"
              >
                @if (item.code) {
                  <span class="font-mono text-fg-muted">{{ item.code }}</span>
                }
                {{ item.title }}
              </button>
            </li>
          }
        </ul>
      }
    }
  `,
})
export class SupplierDeviationPicker {
  private readonly api = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly inputId = input('');
  readonly value = input<PickedDeviation | null>(null);
  readonly valueChange = output<PickedDeviation | null>();

  protected readonly results = signal<readonly SearchItem[]>([]);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
  }

  protected search(text: string): void {
    this.request.unsubscribe();
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || text.trim().length < 2) {
      this.results.set([]);
      return;
    }
    this.request = this.api.search(orgId, text, { types: ['deviation'], limit: 8 }).subscribe({
      next: (res) => this.results.set(res.items),
      error: () => this.results.set([]),
    });
  }

  protected pick(item: SearchItem): void {
    this.results.set([]);
    this.valueChange.emit({
      id: item.entity_id,
      label: item.code ? `${item.code} ${item.title}` : item.title,
    });
  }
}
