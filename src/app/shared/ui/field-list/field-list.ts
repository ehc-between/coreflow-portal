import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterEveryRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';

/** How an empty value reads: "Ikke satt" (a field), "Ingen" (a collection) or "—" (dense tables). */
export type EmptyWord = 'notSet' | 'none' | 'dash';

/**
 * Read-only fields of a detail page: label (small, muted) above the value.
 *
 *   <app-field-list [columns]="2">
 *     <app-field-item labelKey="risk.fields.owner" [value]="risk.owner_name" />
 *     <app-field-item labelKey="risk.fields.assets" empty="none">
 *       @for (a of assets; track a.id) { <app-entity-chip … /> }
 *     </app-field-item>
 *   </app-field-list>
 */
@Component({
  selector: 'app-field-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'grid gap-x-6 gap-y-4',
    '[class.sm:grid-cols-2]': 'columns() >= 2',
    '[class.lg:grid-cols-3]': 'columns() >= 3',
  },
  template: `<ng-content />`,
})
export class FieldList {
  readonly columns = input<1 | 2 | 3>(2);
}

/**
 * One label + value. Shows `value`, else the projected content, else the empty word
 * (`empty`, default "Ikke satt"). `wide` spans the whole row (long text).
 */
@Component({
  selector: 'app-field-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '[class.sm:col-span-full]': 'wide()',
    'data-testid': 'field-item',
  },
  template: `
    <div class="text-meta font-semibold text-fg-muted">{{ labelResolved() }}</div>
    <div class="mt-1 text-body break-words text-fg">
      @if (hasValue()) {
        <span [class.whitespace-pre-line]="multiline()">{{ value() }}</span>
      }
      <span #content [hidden]="hasValue()" class="contents"><ng-content /></span>
      @if (!hasValue() && !hasContent()) {
        <span class="text-fg-subtle" data-testid="field-item-empty">{{ emptyText() }}</span>
      }
    </div>
  `,
})
export class FieldItem {
  private readonly language = inject(LanguageService);

  readonly labelKey = input<string | null | undefined>(null);
  /** Literal label (wins over `labelKey`). */
  readonly labelText = input<string | null | undefined>(null);
  readonly value = input<string | number | null | undefined>(null);
  readonly empty = input<EmptyWord>('notSet');
  readonly wide = input(false);
  /** Keep line breaks of a long text value. */
  readonly multiline = input(false);

  private readonly contentEl = viewChild.required<ElementRef<HTMLElement>>('content');
  protected readonly hasContent = signal(false);

  protected readonly hasValue = computed(() => {
    const v = this.value();
    return v !== null && v !== undefined && String(v).trim() !== '';
  });

  protected readonly labelResolved = computed(() => {
    const literal = this.labelText();
    if (literal) {
      return literal;
    }
    const key = this.labelKey();
    return key ? this.language.translate(key) : '';
  });

  protected readonly emptyText = computed(() =>
    this.language.translate(`common.empty.${this.empty()}`),
  );

  constructor() {
    afterEveryRender(() => {
      const el = this.contentEl().nativeElement;
      const has = Array.from(el.childNodes).some(
        (n) =>
          n.nodeType === Node.ELEMENT_NODE ||
          (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''),
      );
      if (has !== this.hasContent()) {
        this.hasContent.set(has);
      }
    });
  }

  // Template alias (keeps the public `label` input name free for the literal).
  protected label$ = this.labelResolved;
}
