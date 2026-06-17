import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DeviationType,
  DeviationTypeInput,
  FieldType,
  Standard,
} from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  FIELD_TYPE_OPTIONS,
  STANDARD_OPTIONS,
  fieldTypeHasOptions,
  fieldTypeLabelKey,
  standardLabelKey,
} from '../deviation-enums';
import { DynamicField } from '../dynamic-field';
import {
  DraftField,
  TypeValidation,
  emptyDraftField,
  slugify,
  toDraftField,
  toFieldDef,
  validateType,
} from './type-schema';

/**
 * Create / edit a deviation type. Top section captures identity (name, key,
 * description, code prefix, standards, active); the field-builder is an ordered
 * list of rows, each editing one schema field with a type select, an options
 * editor for select/multiselect, reorder / add / remove, and a live preview
 * rendered through {@link DynamicField}. The `key` slugs auto-suggest from the
 * name / label until the user edits them. Validates before save; maps a 422
 * `{detail:{key:...}}` onto the key field. Gated upstream on `deviations:admin`.
 */
@Component({
  selector: 'app-deviation-type-editor',
  imports: [FormsModule, RouterLink, TranslocoPipe, Card, Button, Icon, DynamicField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-8 pt-7 pb-12">
      <a
        routerLink="/deviations/types"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.types.backToTypes' | transloco }}
      </a>

      <h1 class="mb-[18px] font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
        {{ (isEdit() ? 'deviations.types.editTitle' : 'deviations.types.new') | transloco }}
      </h1>

      @if (loading()) {
        <app-card>
          <p class="py-6 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else {
        <form class="flex flex-col gap-4" (ngSubmit)="submit()">
          <app-card>
            <div class="flex flex-col gap-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label for="type-name" class="text-[13px] font-semibold text-fg-muted">
                    {{ 'deviations.types.editor.name' | transloco }}
                    <span class="text-fail" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="type-name"
                    type="text"
                    [ngModel]="name()"
                    (ngModelChange)="onNameChange($event)"
                    name="name"
                    autocomplete="off"
                    class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                  />
                  @if (validation().nameError) {
                    <p class="text-[12px] font-medium text-fail">
                      {{ validation().nameError! | transloco }}
                    </p>
                  }
                </div>
                <div class="flex flex-col gap-1.5">
                  <label for="type-key" class="text-[13px] font-semibold text-fg-muted">
                    {{ 'deviations.types.editor.key' | transloco }}
                    <span class="text-fail" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="type-key"
                    type="text"
                    [ngModel]="key()"
                    (ngModelChange)="onKeyChange($event)"
                    name="key"
                    autocomplete="off"
                    spellcheck="false"
                    class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 font-mono text-[13px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                  />
                  @if (keyError()) {
                    <p class="text-[12px] font-medium text-fail">
                      {{ keyError()! | transloco }}
                    </p>
                  }
                </div>
              </div>

              <div class="flex flex-col gap-1.5">
                <label for="type-desc" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.types.editor.description' | transloco }}
                </label>
                <textarea
                  id="type-desc"
                  [ngModel]="description()"
                  (ngModelChange)="description.set($event)"
                  name="description"
                  rows="2"
                  class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                ></textarea>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label for="type-prefix" class="text-[13px] font-semibold text-fg-muted">
                    {{ 'deviations.types.editor.codePrefix' | transloco }}
                    <span class="text-fail" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="type-prefix"
                    type="text"
                    [ngModel]="codePrefix()"
                    (ngModelChange)="codePrefix.set($event)"
                    name="codePrefix"
                    autocomplete="off"
                    [placeholder]="'deviations.types.editor.codePrefixPlaceholder' | transloco"
                    class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 font-mono text-[13px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                  />
                  @if (validation().prefixError) {
                    <p class="text-[12px] font-medium text-fail">
                      {{ validation().prefixError! | transloco }}
                    </p>
                  }
                </div>
                <label
                  class="flex cursor-pointer items-center gap-2 self-end pb-2.5 text-[13.5px] text-fg"
                >
                  <input
                    type="checkbox"
                    [ngModel]="isActive()"
                    (ngModelChange)="isActive.set($event)"
                    name="isActive"
                    class="h-4 w-4 accent-[var(--accent)]"
                  />
                  {{ 'deviations.types.editor.isActive' | transloco }}
                </label>
              </div>

              <div class="flex flex-col gap-2">
                <span class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.types.editor.standards' | transloco }}
                </span>
                <div class="flex flex-wrap gap-x-4 gap-y-2">
                  @for (option of standardOptions; track option) {
                    <label class="flex cursor-pointer items-center gap-2 text-[13.5px] text-fg">
                      <input
                        type="checkbox"
                        [checked]="standards().includes(option)"
                        (change)="toggleStandard(option)"
                        class="h-4 w-4 accent-[var(--accent)]"
                      />
                      {{ standardLabelKey(option) | transloco }}
                    </label>
                  }
                </div>
              </div>
            </div>
          </app-card>

          <app-card>
            <div class="mb-3 flex items-center justify-between gap-2">
              <span class="text-[13px] font-semibold text-fg-muted">
                {{ 'deviations.types.editor.schemaSection' | transloco }}
              </span>
              <button
                type="button"
                (click)="togglePreview()"
                class="text-[12.5px] font-semibold text-accent hover:underline"
              >
                {{
                  (showPreview()
                    ? 'deviations.types.editor.hidePreview'
                    : 'deviations.types.editor.showPreview'
                  ) | transloco
                }}
              </button>
            </div>

            @if (fields().length === 0) {
              <p class="py-4 text-center text-[13px] text-fg-muted">
                {{ 'deviations.types.editor.noFields' | transloco }}
              </p>
            }

            <div class="flex flex-col gap-3">
              @for (field of fields(); track i; let i = $index) {
                <div class="rounded-card border border-border bg-bg p-3.5">
                  <div class="mb-3 flex items-center gap-2">
                    <span class="font-mono text-[12px] text-fg-subtle">#{{ i + 1 }}</span>
                    <div class="ml-auto flex items-center gap-0.5">
                      <button
                        type="button"
                        (click)="move(i, -1)"
                        [disabled]="i === 0"
                        [attr.aria-label]="'deviations.types.editor.moveUp' | transloco"
                        class="flex rotate-180 rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                      >
                        <app-icon name="chevron" [size]="15" />
                      </button>
                      <button
                        type="button"
                        (click)="move(i, 1)"
                        [disabled]="i === fields().length - 1"
                        [attr.aria-label]="'deviations.types.editor.moveDown' | transloco"
                        class="flex rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                      >
                        <app-icon name="chevron" [size]="15" />
                      </button>
                      <button
                        type="button"
                        (click)="removeField(i)"
                        [attr.aria-label]="'deviations.types.editor.removeField' | transloco"
                        class="flex rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail"
                      >
                        <app-icon name="x" [size]="15" />
                      </button>
                    </div>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-2">
                    <div class="flex flex-col gap-1.5">
                      <label
                        [attr.for]="'flabel-' + i"
                        class="text-[12.5px] font-semibold text-fg-muted"
                      >
                        {{ 'deviations.types.editor.fieldLabel' | transloco }}
                      </label>
                      <input
                        [id]="'flabel-' + i"
                        type="text"
                        [ngModel]="field.label"
                        (ngModelChange)="setFieldLabel(i, $event)"
                        [name]="'flabel-' + i"
                        autocomplete="off"
                        class="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                      />
                      @if (validation().fields[i]?.label; as err) {
                        <p class="text-[12px] font-medium text-fail">{{ err | transloco }}</p>
                      }
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label
                        [attr.for]="'fkey-' + i"
                        class="text-[12.5px] font-semibold text-fg-muted"
                      >
                        {{ 'deviations.types.editor.fieldKey' | transloco }}
                      </label>
                      <input
                        [id]="'fkey-' + i"
                        type="text"
                        [ngModel]="field.key"
                        (ngModelChange)="setFieldKey(i, $event)"
                        [name]="'fkey-' + i"
                        autocomplete="off"
                        spellcheck="false"
                        class="h-9 w-full rounded-[10px] border border-border bg-surface px-3 font-mono text-[13px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                      />
                      @if (validation().fields[i]?.key; as err) {
                        <p class="text-[12px] font-medium text-fail">{{ err | transloco }}</p>
                      }
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label
                        [attr.for]="'ftype-' + i"
                        class="text-[12.5px] font-semibold text-fg-muted"
                      >
                        {{ 'deviations.types.editor.fieldType' | transloco }}
                      </label>
                      <div class="cf-select">
                        <select
                          [id]="'ftype-' + i"
                          [ngModel]="field.type"
                          (ngModelChange)="setFieldType(i, $event)"
                          [name]="'ftype-' + i"
                        >
                          @for (option of fieldTypeOptions; track option) {
                            <option [value]="option">
                              {{ fieldTypeLabelKey(option) | transloco }}
                            </option>
                          }
                        </select>
                      </div>
                    </div>
                    <label
                      class="flex cursor-pointer items-center gap-2 self-end pb-2 text-[13.5px] text-fg"
                    >
                      <input
                        type="checkbox"
                        [ngModel]="field.required"
                        (ngModelChange)="setFieldRequired(i, $event)"
                        [name]="'freq-' + i"
                        class="h-4 w-4 accent-[var(--accent)]"
                      />
                      {{ 'deviations.types.editor.fieldRequired' | transloco }}
                    </label>
                  </div>

                  @if (hasOptions(field.type)) {
                    <div class="mt-3 flex flex-col gap-2">
                      <span class="text-[12.5px] font-semibold text-fg-muted">
                        {{ 'deviations.types.editor.options' | transloco }}
                      </span>
                      @for (opt of field.options; track j; let j = $index) {
                        <div class="flex items-center gap-2">
                          <input
                            type="text"
                            [ngModel]="opt"
                            (ngModelChange)="setOption(i, j, $event)"
                            [name]="'fopt-' + i + '-' + j"
                            autocomplete="off"
                            [placeholder]="'deviations.types.editor.optionPlaceholder' | transloco"
                            class="h-9 flex-1 rounded-[10px] border border-border bg-surface px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                          />
                          <button
                            type="button"
                            (click)="removeOption(i, j)"
                            [attr.aria-label]="'deviations.types.editor.removeOption' | transloco"
                            class="flex flex-none rounded-[8px] p-2 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                          >
                            <app-icon name="x" [size]="14" />
                          </button>
                        </div>
                      }
                      <button
                        type="button"
                        (click)="addOption(i)"
                        class="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline"
                      >
                        <app-icon name="plus" [size]="14" />
                        {{ 'deviations.types.editor.addOption' | transloco }}
                      </button>
                      @if (validation().fields[i]?.options; as err) {
                        <p class="text-[12px] font-medium text-fail">{{ err | transloco }}</p>
                      }
                    </div>
                  }

                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      [ngModel]="field.placeholder"
                      (ngModelChange)="setFieldPlaceholder(i, $event)"
                      [name]="'fph-' + i"
                      autocomplete="off"
                      [placeholder]="'deviations.types.editor.placeholderHint' | transloco"
                      class="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                    />
                    <input
                      type="text"
                      [ngModel]="field.help"
                      (ngModelChange)="setFieldHelp(i, $event)"
                      [name]="'fhelp-' + i"
                      autocomplete="off"
                      [placeholder]="'deviations.types.editor.helpHint' | transloco"
                      class="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                    />
                  </div>

                  @if (showPreview() && field.label.trim() && field.key.trim()) {
                    <div class="mt-3 rounded-[10px] border border-dashed border-border px-3 py-2.5">
                      <p
                        class="mb-2 text-[11px] font-bold tracking-[0.06em] text-fg-subtle uppercase"
                      >
                        {{ 'deviations.types.editor.preview' | transloco }}
                      </p>
                      <app-dynamic-field [field]="previews()[i]" />
                    </div>
                  }
                </div>
              }
            </div>

            <button
              type="button"
              (click)="addField()"
              class="mt-3 inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
            >
              <app-icon name="plus" [size]="15" />
              {{ 'deviations.types.editor.addField' | transloco }}
            </button>
          </app-card>

          <div class="flex items-center gap-2">
            <app-button type="submit" [loading]="saving()">
              {{ 'deviations.types.editor.save' | transloco }}
            </app-button>
            <a routerLink="/deviations/types">
              <app-button type="button" variant="ghost">
                {{ 'deviations.types.editor.cancel' | transloco }}
              </app-button>
            </a>
          </div>
        </form>
      }
    </div>
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 36px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class DeviationTypeEditor {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly standardOptions = STANDARD_OPTIONS;
  protected readonly fieldTypeOptions = FIELD_TYPE_OPTIONS;
  protected readonly standardLabelKey = standardLabelKey;
  protected readonly fieldTypeLabelKey = fieldTypeLabelKey;
  protected readonly hasOptions = fieldTypeHasOptions;

  private readonly typeId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.typeId() !== null);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly showPreview = signal(true);

  protected readonly name = signal('');
  protected readonly key = signal('');
  protected readonly description = signal('');
  protected readonly codePrefix = signal('');
  protected readonly isActive = signal(true);
  protected readonly standards = signal<readonly Standard[]>([]);
  protected readonly fields = signal<DraftFieldState[]>([]);

  protected readonly keyError = signal<string | null>(null);

  // Tracks whether the key slug was auto-derived (so user edits stop tracking).
  private keyTouched = false;

  protected readonly validation = computed<TypeValidation>(() =>
    validateType(this.name(), this.codePrefix(), this.fields()),
  );

  /** Live preview of each draft field rendered via the dynamic-field renderer. */
  protected readonly previews = computed(() => this.fields().map(toFieldDef));

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      const id = this.route.snapshot.paramMap.get('id');
      this.typeId.set(id);
      if (orgId && id) {
        this.load(orgId, id);
      }
    });
  }

  protected onNameChange(value: string): void {
    this.name.set(value);
    if (!this.keyTouched && !this.isEdit()) {
      this.key.set(slugify(value));
    }
  }

  protected onKeyChange(value: string): void {
    this.keyTouched = true;
    this.key.set(value);
    this.keyError.set(null);
  }

  protected toggleStandard(standard: Standard): void {
    const current = this.standards();
    this.standards.set(
      current.includes(standard) ? current.filter((s) => s !== standard) : [...current, standard],
    );
  }

  protected togglePreview(): void {
    this.showPreview.update((v) => !v);
  }

  protected addField(): void {
    this.fields.update((list) => [...list, emptyDraftField()]);
  }

  protected removeField(index: number): void {
    this.fields.update((list) => list.filter((_, i) => i !== index));
  }

  protected move(index: number, delta: number): void {
    const target = index + delta;
    this.fields.update((list) => {
      if (target < 0 || target >= list.length) {
        return list;
      }
      const next = [...list];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  protected setFieldLabel(index: number, value: string): void {
    this.patchField(index, (f) => {
      const next = { ...f, label: value };
      if (!f.keyTouched) {
        next.key = slugify(value);
      }
      return next;
    });
  }

  protected setFieldKey(index: number, value: string): void {
    this.patchField(index, (f) => ({ ...f, key: value, keyTouched: true }));
  }

  protected setFieldType(index: number, value: FieldType): void {
    this.patchField(index, (f) => ({ ...f, type: value }));
  }

  protected setFieldRequired(index: number, value: boolean): void {
    this.patchField(index, (f) => ({ ...f, required: value }));
  }

  protected setFieldPlaceholder(index: number, value: string): void {
    this.patchField(index, (f) => ({ ...f, placeholder: value }));
  }

  protected setFieldHelp(index: number, value: string): void {
    this.patchField(index, (f) => ({ ...f, help: value }));
  }

  protected addOption(index: number): void {
    this.patchField(index, (f) => ({ ...f, options: [...f.options, ''] }));
  }

  protected removeOption(index: number, optIndex: number): void {
    this.patchField(index, (f) => ({
      ...f,
      options: f.options.filter((_, i) => i !== optIndex),
    }));
  }

  protected setOption(index: number, optIndex: number, value: string): void {
    this.patchField(index, (f) => ({
      ...f,
      options: f.options.map((o, i) => (i === optIndex ? value : o)),
    }));
  }

  protected submit(): void {
    const orgId = this.orgId();
    if (!orgId || this.saving()) {
      return;
    }
    if (!this.validation().valid) {
      this.notifications.error('deviations.types.editor.validationToast');
      return;
    }
    const keyValue = this.key().trim() || slugify(this.name());

    const body: DeviationTypeInput = {
      key: keyValue,
      name: this.name().trim(),
      description: this.description().trim() || undefined,
      standards: this.standards().length ? this.standards() : undefined,
      code_prefix: this.codePrefix().trim(),
      schema: this.fields().map(toFieldDef),
      is_active: this.isActive(),
    };

    this.saving.set(true);
    this.keyError.set(null);
    const id = this.typeId();
    const request$ = id ? this.api.updateType(orgId, id, body) : this.api.createType(orgId, body);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.success(
          id ? 'deviations.types.editor.savedToast' : 'deviations.types.editor.createdToast',
        );
        void this.router.navigateByUrl('/deviations/types');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.handleError(error);
      },
    });
  }

  private patchField(index: number, fn: (f: DraftFieldState) => DraftFieldState): void {
    this.fields.update((list) => list.map((f, i) => (i === index ? fn(f) : f)));
  }

  private handleError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      return;
    }
    if (error.status === 409) {
      this.keyError.set('deviations.types.editor.errors.keyTaken');
      return;
    }
    if (error.status === 422) {
      const detail = (error.error as { detail?: Record<string, string> } | null)?.detail;
      if (detail?.['key']) {
        this.keyError.set('deviations.types.editor.errors.keyTaken');
        return;
      }
    }
    this.notifications.error('deviations.types.editor.saveFailedToast');
  }

  private load(orgId: string, id: string): void {
    this.loading.set(true);
    this.api.getType(orgId, id).subscribe({
      next: (type) => {
        this.hydrate(type);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private hydrate(type: DeviationType): void {
    this.keyTouched = true;
    this.name.set(type.name);
    this.key.set(type.key);
    this.description.set(type.description ?? '');
    this.codePrefix.set(type.code_prefix);
    this.isActive.set(type.is_active);
    this.standards.set([...type.standards]);
    this.fields.set(type.schema.map((def) => ({ ...toDraftField(def), keyTouched: true })));
  }
}

/** A draft field plus editor-only bookkeeping (whether its key was hand-edited). */
type DraftFieldState = DraftField & { keyTouched?: boolean };
