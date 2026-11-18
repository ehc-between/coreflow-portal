import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DocumentSummary } from '../../../core/documents/document.models';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';

let nextId = 0;

/** Document types that describe how work is done, listed first. */
const HOW_TYPES = ['procedure', 'process', 'instruction', 'work_instruction', 'routine'];

/** Procedures first, then by code; filtered by code or title. */
export function rankDocuments(
  docs: readonly DocumentSummary[],
  query: string,
): readonly DocumentSummary[] {
  const q = query.trim().toLowerCase();
  const rank = (d: DocumentSummary) => {
    const i = HOW_TYPES.indexOf(d.type);
    return i === -1 ? HOW_TYPES.length : i;
  };
  return docs
    .filter(
      (d) =>
        d.status !== 'obsolete' &&
        (!q || `${d.doc_code} ${d.title}`.toLowerCase().includes(q)),
    )
    .slice()
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.doc_code || '').localeCompare(b.doc_code || '', undefined, { numeric: true }),
    );
}

/**
 * Searchable picker over the org's controlled documents: procedures and
 * instructions first, each with code, title and status. Shows the current
 * choice (with a clear button) or a filter box with the matching documents.
 * Emits the chosen document id, or null when cleared.
 */
@Component({
  selector: 'app-process-document-select',
  imports: [TranslocoPipe, Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label [attr.for]="inputId" class="mb-1.5 block text-ui font-semibold text-fg-muted">
      {{ labelKey() | transloco }}
    </label>
    @if (current(); as doc) {
      <div
        class="flex items-center gap-2 rounded-tile border border-border bg-surface px-3 py-2"
        data-testid="doc-select-current"
      >
        <app-icon name="documents" [size]="14" class="text-fg-subtle" />
        <span class="min-w-0 flex-1 truncate text-ui text-fg">
          <span class="font-mono text-meta text-fg-muted">{{ doc.doc_code }}</span>
          {{ doc.title }}
        </span>
        <app-status-badge
          meaning="lifecycle"
          [value]="doc.status"
          [labelKey]="'processes.document.status.' + doc.status"
        />
        @if (!disabled()) {
          <button
            type="button"
            class="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-label]="'processes.picker.clear' | transloco: { title: doc.title }"
            (click)="valueChange.emit(null)"
          >
            <app-icon name="x" [size]="14" />
          </button>
        }
      </div>
      @if (doc.status !== 'approved') {
        <p class="mt-1 text-meta text-warn-ink" data-testid="doc-select-not-approved">
          {{ 'processes.document.linkedNotApproved' | transloco }}
        </p>
      }
    } @else {
      <div
        class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
      >
        <app-icon name="search" [size]="15" class="text-fg-subtle" />
        <input
          [id]="inputId"
          type="search"
          class="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none"
          [placeholder]="'processes.picker.documentPlaceholder' | transloco"
          [value]="query()"
          [disabled]="disabled()"
          (input)="query.set($any($event.target).value)"
          (focus)="focused.set(true)"
          data-testid="doc-select-input"
        />
      </div>
      @if (focused() || query()) {
        <ul
          class="mt-1.5 flex max-h-64 flex-col overflow-y-auto rounded-tile border border-border bg-surface p-1"
          [attr.aria-label]="labelKey() | transloco"
          data-testid="doc-select-options"
        >
          @for (doc of matches(); track doc.id) {
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                (click)="pick(doc.id)"
              >
                <span class="min-w-0 flex-1 truncate text-ui text-fg">
                  <span class="font-mono text-meta text-fg-muted">{{ doc.doc_code }}</span>
                  {{ doc.title }}
                </span>
                <app-status-badge
                  meaning="lifecycle"
                  [value]="doc.status"
                  [labelKey]="'processes.document.status.' + doc.status"
                />
              </button>
            </li>
          } @empty {
            <li class="px-2.5 py-2 text-ui text-fg-muted">
              {{ 'processes.picker.noHits' | transloco }}
            </li>
          }
        </ul>
      }
    }
  `,
})
export class DocumentSelect {
  readonly documents = input.required<readonly DocumentSummary[]>();
  readonly value = input<string | null | undefined>(null);
  readonly labelKey = input('processes.map.step.procedure');
  readonly disabled = input(false);
  readonly valueChange = output<string | null>();

  protected readonly inputId = `cf-proc-doc-${++nextId}`;
  protected readonly query = signal('');
  protected readonly focused = signal(false);

  protected readonly current = computed(
    () => this.documents().find((d) => d.id === this.value()) ?? null,
  );
  protected readonly matches = computed(() =>
    rankDocuments(this.documents(), this.query()).slice(0, 30),
  );

  protected pick(id: string): void {
    this.query.set('');
    this.focused.set(false);
    this.valueChange.emit(id);
  }
}
