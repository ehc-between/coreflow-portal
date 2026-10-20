import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { DocumentsApi } from '../../core/documents/documents-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LinkEntityType } from '../../core/standards/standards.models';
import { Icon } from '../../shared/ui/icon/icon';

/** A record picked as evidence. */
export interface EvidencePick {
  readonly entity_type: LinkEntityType;
  readonly entity_id: string;
  readonly label: string;
}

type PickerKind = 'document' | 'deviation';

const SEARCH_DEBOUNCE_MS = 250;
const RESULT_LIMIT = 10;

/**
 * Search box for linking a document or deviation as evidence for a
 * requirement. Searches the chosen record kind as the user types (debounced)
 * and emits the picked record; `cancelled` closes it.
 */
@Component({
  selector: 'app-evidence-picker',
  imports: [FormsModule, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-tile border border-border bg-surface-2 p-2.5">
      <div class="mb-2 flex items-center gap-2">
        <div class="flex rounded-[8px] border border-border bg-surface p-0.5" role="group">
          @for (k of kinds; track k) {
            <button
              type="button"
              class="rounded-[6px] px-2.5 py-1 text-[12px] font-semibold"
              [class]="kind() === k ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg'"
              [attr.aria-pressed]="kind() === k"
              (click)="setKind(k)"
            >
              {{ 'standards.entity.' + k | transloco }}
            </button>
          }
        </div>
        <span class="flex-1"></span>
        <button
          type="button"
          class="flex rounded-[6px] p-1 text-fg-subtle hover:text-fg"
          [attr.aria-label]="'standards.evidence.cancel' | transloco"
          (click)="cancelled.emit()"
        >
          <app-icon name="x" [size]="14" />
        </button>
      </div>
      <input
        type="search"
        class="h-9 w-full rounded-[8px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
        [ngModel]="query()"
        (ngModelChange)="onQuery($event)"
        [placeholder]="'standards.evidence.searchPlaceholder' | transloco"
        [attr.aria-label]="'standards.evidence.searchPlaceholder' | transloco"
      />
      @if (searching()) {
        <p class="mt-2 text-[12.5px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (query().trim() && results().length === 0) {
        <p class="mt-2 text-[12.5px] text-fg-muted">
          {{ 'standards.evidence.noResults' | transloco }}
        </p>
      }
      @if (results().length > 0) {
        <ul class="mt-1.5 flex flex-col">
          @for (r of results(); track r.entity_id) {
            <li>
              <button
                type="button"
                class="w-full truncate rounded-[6px] px-2 py-1.5 text-left text-[13px] text-fg hover:bg-surface"
                (click)="picked.emit(r)"
              >
                {{ r.label }}
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class EvidencePicker {
  private readonly documents = inject(DocumentsApi);
  private readonly deviations = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly picked = output<EvidencePick>();
  readonly cancelled = output<void>();

  protected readonly kinds: readonly PickerKind[] = ['document', 'deviation'];
  protected readonly kind = signal<PickerKind>('document');
  protected readonly query = signal('');
  protected readonly results = signal<readonly EvidencePick[]>([]);
  protected readonly searching = signal(false);

  private readonly search$ = new Subject<{ kind: PickerKind; q: string }>();
  private readonly sub: Subscription;

  constructor() {
    this.sub = this.search$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap(({ kind, q }) => this.search(kind, q)),
      )
      .subscribe((results) => {
        this.results.set(results);
        this.searching.set(false);
      });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
  }

  protected setKind(kind: PickerKind): void {
    this.kind.set(kind);
    this.trigger();
  }

  protected onQuery(q: string): void {
    this.query.set(q);
    this.trigger();
  }

  private trigger(): void {
    const q = this.query().trim();
    if (!q) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.search$.next({ kind: this.kind(), q });
  }

  private search(kind: PickerKind, q: string) {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return of([] as EvidencePick[]);
    }
    const request =
      kind === 'document'
        ? this.documents.search(orgId, q, RESULT_LIMIT).pipe(
            map((docs) =>
              docs.map<EvidencePick>((d) => ({
                entity_type: 'document',
                entity_id: d.id,
                label: d.doc_code ? `${d.doc_code} · ${d.title}` : d.title,
              })),
            ),
          )
        : this.deviations.listDeviations(orgId, { q, limit: RESULT_LIMIT }).pipe(
            map((page) =>
              page.items.map<EvidencePick>((d) => ({
                entity_type: 'deviation',
                entity_id: d.id,
                label: `${d.code} · ${d.title}`,
              })),
            ),
          );
    return request.pipe(catchError(() => of([] as EvidencePick[])));
  }
}
