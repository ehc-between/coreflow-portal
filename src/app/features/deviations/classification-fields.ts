import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { AskAbout } from '../../shared/ask/ask-about';
import { ClausePicker, parseClause } from '../../shared/requirement-links/clause-picker';
import { fixedShortName, shortNameKey } from '../../shared/requirement-links/requirement-label';
import { Icon } from '../../shared/ui/icon/icon';
import { CLAUSE_FRAMEWORKS } from './deviation-enums';
import { DeviationFormRow } from './ui/form-row';

/** A typical clause rendered as a one-click "add" chip. */
interface TypicalChip {
  readonly ref: string;
  readonly shortKey: string | null;
  readonly short: string;
  readonly number: string;
}

/**
 * The one place a deviation points at standards (audit finding 1): "Krav som er
 * berørt", a requirement picker over the catalogue whose value is canonical clause
 * refs (`iso9001:10.2`, `hs:10.2`). Every cited clause becomes a confirmed
 * requirement link on save, and the standard chips follow from those links. The
 * type's typical clauses are offered as one-click chips (never added
 * automatically). Free-form tags stay for the organisation's own grouping.
 * Two-way bound, shared by the create form and the edit form:
 *
 *   <app-deviation-classification-fields idPrefix="dev" [typical]="type.default_clauses"
 *     [(refs)]="refs" [(tags)]="tags" />
 */
@Component({
  selector: 'app-deviation-classification-fields',
  imports: [FormsModule, TranslocoPipe, AskAbout, ClausePicker, Icon, DeviationFormRow],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <app-deviation-form-row
      span="full"
      labelKey="deviations.form.requirements"
      [inputId]="idPrefix() + '-requirements'"
      [page]="page()"
      help="requirements"
      hintKey="deviations.form.requirementsHint"
      [plain]="true"
    >
      <app-ask-about
        ask
        field="requirements"
        [fieldLabel]="'deviations.form.requirements' | transloco"
        [requirements]="refs()"
      />
      <app-clause-picker
        [inputId]="idPrefix() + '-requirements'"
        [frameworks]="frameworks"
        [ngModel]="refs()"
        (ngModelChange)="refs.set($event ?? [])"
        [ariaLabel]="'deviations.form.requirements' | transloco"
        placeholderKey="deviations.form.requirementsPlaceholder"
      />
    </app-deviation-form-row>

    @if (typicalChips().length) {
      <div
        class="-mt-3 flex flex-wrap items-center gap-1.5 sm:col-span-2"
        data-testid="typical-clauses"
      >
        <span class="text-meta text-fg-muted">{{ 'deviations.form.typical' | transloco }}</span>
        @for (chip of typicalChips(); track chip.ref) {
          <button
            type="button"
            class="inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-border-strong bg-surface px-2.5 text-meta font-semibold text-fg-muted hover:border-accent hover:text-accent"
            [attr.aria-label]="
              'deviations.form.addTypical'
                | transloco
                  : {
                      short: chip.shortKey ? (chip.shortKey | transloco) : chip.short,
                      number: chip.number,
                    }
            "
            (click)="addTypical(chip.ref)"
          >
            <app-icon name="plus" [size]="12" />
            {{ chip.shortKey ? (chip.shortKey | transloco) : chip.short }} · {{ chip.number }}
          </button>
        }
      </div>
    }

    <app-deviation-form-row
      span="full"
      labelKey="deviations.create.fields.tags"
      [inputId]="idPrefix() + '-tag'"
      [page]="page()"
      hintKey="deviations.form.tagsHint"
    >
      @if (tags().length) {
        <div class="mb-1.5 flex flex-wrap gap-1.5">
          @for (t of tags(); track t) {
            <span
              class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2.5 text-meta font-medium text-fg"
            >
              {{ t }}
              <button
                type="button"
                [attr.aria-label]="'deviations.create.removeTagNamed' | transloco: { tag: t }"
                (click)="removeTag(t)"
                class="flex rounded-full p-0.5 text-fg-subtle hover:bg-surface hover:text-fg"
              >
                <app-icon name="x" [size]="13" />
              </button>
            </span>
          }
        </div>
      }
      <input
        [id]="idPrefix() + '-tag'"
        type="text"
        [value]="tagDraft()"
        (input)="tagDraft.set($any($event.target).value)"
        (keydown.enter)="addTag($event)"
        (blur)="commitTagDraft()"
        [placeholder]="'deviations.create.tagPlaceholder' | transloco"
        autocomplete="off"
      />
    </app-deviation-form-row>
  `,
})
export class DeviationClassificationFields {
  /** Prefix for the control ids (unique per form). */
  readonly idPrefix = input('dev');
  /** Guidance page of the field help (`new` / `detail`). */
  readonly page = input('new');
  /** Canonical clause refs the deviation cites (the requirement links). */
  readonly refs = model<readonly string[]>([]);
  readonly tags = model<readonly string[]>([]);
  /** The type's typical clauses, offered as one-click chips. */
  readonly typical = input<readonly string[] | null | undefined>([]);

  protected readonly frameworks = CLAUSE_FRAMEWORKS;
  protected readonly tagDraft = signal('');

  protected readonly typicalChips = computed<TypicalChip[]>(() => {
    const cited = new Set(this.refs());
    return (this.typical() ?? [])
      .filter((ref) => !cited.has(ref))
      .map((ref) => {
        const p = parseClause(ref);
        return {
          ref,
          shortKey: shortNameKey(p.framework),
          short: fixedShortName(p.framework) ?? p.framework,
          number: p.number,
        };
      });
  });

  protected addTypical(ref: string): void {
    if (!this.refs().includes(ref)) {
      this.refs.set([...this.refs(), ref]);
    }
  }

  protected addTag(event: Event): void {
    event.preventDefault();
    this.commitTagDraft();
  }

  protected commitTagDraft(): void {
    const value = this.tagDraft().trim();
    if (value && !this.tags().includes(value)) {
      this.tags.set([...this.tags(), value]);
    }
    this.tagDraft.set('');
  }

  protected removeTag(tag: string): void {
    this.tags.set(this.tags().filter((t) => t !== tag));
  }
}
