import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  Signal,
  afterEveryRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';

/** How an empty value reads: "Ikke satt" (a field), "Ingen" (a collection) or "—" (dense tables). */
export type EmptyWord = 'notSet' | 'none' | 'dash';

/** One field of a {@link FieldGroup}: its label and whether it is empty now. */
export interface FieldEntry {
  readonly label: Signal<string>;
  /** Empty and allowed to be hidden (not `keepEmpty`). */
  readonly hideable: Signal<boolean>;
}

/**
 * The fields of one section of a detail page (docs/ux-guide.md §2.7, "detail-page
 * anatomy"). A section component (`app-record-lead`, `app-record-details`,
 * `app-record-meta`) provides one with `hideEmpty` on: its `app-field-item`s
 * register here, empty ones hide themselves in view mode, and the section shows
 * one line instead ("3 felt er ikke fylt ut – Fyll ut").
 */
@Injectable()
export class FieldGroup {
  /** Hide empty fields (view mode). */
  readonly hideEmpty = signal(true);
  private readonly entries = signal<readonly FieldEntry[]>([]);

  /** Labels of the hidden (empty) fields, in template order. */
  readonly emptyLabels = computed(() =>
    this.entries()
      .filter((e) => e.hideable())
      .map((e) => e.label()),
  );

  /** Fields with a value (or kept while empty). */
  readonly shownCount = computed(
    () => this.entries().length - this.entries().filter((e) => e.hideable()).length,
  );

  register(entry: FieldEntry): () => void {
    this.entries.update((list) => [...list, entry]);
    return () => this.entries.update((list) => list.filter((e) => e !== entry));
  }
}

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
 *
 * Inside a {@link FieldGroup} with `hideEmpty` (the detail-page anatomy) an empty
 * item hides itself, unless `keepEmpty`: then it shows `emptyKey` ("Ikke planlagt")
 * and, with `emptyLink`, an action link (`emptyActionKey`, "Planlegg").
 *
 * `size="lead"` is the large look of the "Hovedinformasjon" section;
 * `layout="inline"` puts label and value on one row (the compact metadata block).
 */
@Component({
  selector: 'app-field-item',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.block]': '!collapsed() && layout() === "stacked"',
    '[class.flex]': '!collapsed() && layout() === "inline"',
    '[class.hidden]': 'collapsed()',
    class: 'min-w-0',
    '[class.items-baseline]': 'layout() === "inline"',
    '[class.justify-between]': 'layout() === "inline"',
    '[class.gap-3]': 'layout() === "inline"',
    '[class.sm:col-span-full]': 'wide()',
    'data-testid': 'field-item',
    '[attr.data-empty]': 'isEmpty() || null',
  },
  template: `
    <div [class]="labelClass()">{{ labelResolved() }}</div>
    <div class="break-words text-fg" [class]="valueClass()">
      @if (hasValue()) {
        <span [class.whitespace-pre-line]="multiline()">{{ value() }}</span>
      }
      <span #content [hidden]="hasValue()" class="contents"><ng-content /></span>
      @if (isEmpty()) {
        <span class="font-normal text-fg-subtle" data-testid="field-item-empty">{{
          emptyText()
        }}</span>
        @if (emptyLink(); as link) {
          <span aria-hidden="true" class="text-fg-subtle"> · </span>
          <a
            [routerLink]="link"
            class="font-semibold text-accent hover:underline"
            data-testid="field-item-empty-action"
            >{{ emptyActionText() }}</a
          >
        }
      }
    </div>
  `,
})
export class FieldItem {
  private readonly language = inject(LanguageService);
  private readonly group = inject(FieldGroup, { optional: true });

  readonly labelKey = input<string | null | undefined>(null);
  /** Literal label (wins over `labelKey`). */
  readonly labelText = input<string | null | undefined>(null);
  readonly value = input<string | number | null | undefined>(null);
  readonly empty = input<EmptyWord>('notSet');
  readonly wide = input(false);
  /** Keep line breaks of a long text value. */
  readonly multiline = input(false);
  /** `lead`: the large look of the "Hovedinformasjon" section. */
  readonly size = input<'default' | 'lead'>('default');
  /** `inline`: label and value on one row (compact metadata). */
  readonly layout = input<'stacked' | 'inline'>('stacked');
  /** Show this field even when empty inside a hide-empty group. */
  readonly keepEmpty = input(false);
  /** i18n key of the empty text (wins over `empty`), e.g. "Ikke planlagt". */
  readonly emptyKey = input<string | null | undefined>(null);
  /** Link of the empty field's action ("Planlegg"); shown only when empty. */
  readonly emptyLink = input<string | readonly unknown[] | null | undefined>(null);
  /** i18n key of the empty field's action label (default "Fyll ut"). */
  readonly emptyActionKey = input<string | null | undefined>(null);

  private readonly contentEl = viewChild.required<ElementRef<HTMLElement>>('content');
  protected readonly hasContent = signal(false);

  protected readonly hasValue = computed(() => {
    const v = this.value();
    return v !== null && v !== undefined && String(v).trim() !== '';
  });

  readonly isEmpty = computed(() => !this.hasValue() && !this.hasContent());

  protected readonly collapsed = computed(
    () => !!this.group?.hideEmpty() && this.isEmpty() && !this.keepEmpty(),
  );

  protected readonly labelClass = computed(() =>
    this.size() === 'lead'
      ? 'text-ui font-semibold text-fg'
      : this.layout() === 'inline'
        ? 'flex-none text-meta text-fg-muted'
        : 'text-meta font-semibold text-fg-muted',
  );

  protected readonly valueClass = computed(() =>
    this.size() === 'lead'
      ? 'mt-1 text-card leading-relaxed'
      : this.layout() === 'inline'
        ? 'min-w-0 text-right text-meta font-semibold'
        : 'mt-1 text-body',
  );

  protected readonly labelResolved = computed(() => {
    const literal = this.labelText();
    if (literal) {
      return literal;
    }
    const key = this.labelKey();
    return key ? this.language.translate(key) : '';
  });

  protected readonly emptyText = computed(() =>
    this.language.translate(this.emptyKey() || `common.empty.${this.empty()}`),
  );

  protected readonly emptyActionText = computed(() =>
    this.language.translate(this.emptyActionKey() || 'common.empty.fillIn'),
  );

  constructor() {
    if (this.group) {
      const unregister = this.group.register({
        label: this.labelResolved,
        hideable: computed(() => this.isEmpty() && !this.keepEmpty()),
      });
      inject(DestroyRef).onDestroy(unregister);
    }
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
