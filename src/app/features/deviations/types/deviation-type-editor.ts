import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
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
  DeviationTypeDraftResponse,
  DeviationTypeInput,
  FieldDef,
  FieldType,
  FieldWidth,
  Standard,
} from '../../../core/deviations/deviation.models';
import { codedErrorDetail, notifyDeviationError } from '../../../core/deviations/deviation-errors';
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
  DraftFieldState,
  DraftSection,
  FieldErrors,
  TypeValidation,
  emptyDraftField,
  flattenSections,
  fromFieldDef,
  groupIntoSections,
  slugify,
  toFieldDef,
  validateType,
} from './type-schema';

/**
 * Create / edit a deviation type. Top section captures identity (name, key,
 * description, code prefix, standards, active); the field-builder is a sectioned
 * layout builder — fields are grouped into titled sections and reordered (within
 * and across sections) by drag-and-drop. Each field row edits one schema field
 * (type select, options editor for select/multiselect, a full/half width toggle,
 * help/placeholder) with a live preview rendered through {@link DynamicField}.
 * On save the sections flatten back into the ordered `schema: FieldDef[]`, each
 * field carrying its `width` + `section`. The `key` slugs auto-suggest from the
 * name / label until the user edits them. Validates before save; maps a 422
 * `{detail:{key:...}}` onto the key field. Gated upstream on `deviations:admin`.
 */
@Component({
  selector: 'app-deviation-type-editor',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    DragDropModule,
    Card,
    Button,
    Icon,
    DynamicField,
  ],
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
        <div class="flex flex-col gap-4">
          <app-card>
            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-2">
                <app-icon name="spark" [size]="16" class="text-accent" />
                <span class="text-[13px] font-semibold text-fg">
                  {{ 'deviations.types.editor.ai.title' | transloco }}
                </span>
              </div>
              <textarea
                [ngModel]="aiPrompt()"
                (ngModelChange)="aiPrompt.set($event)"
                name="aiPrompt"
                rows="2"
                [disabled]="drafting()"
                [placeholder]="'deviations.types.editor.ai.placeholder' | transloco"
                class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-60"
              ></textarea>
              <div class="flex">
                <app-button
                  type="button"
                  variant="secondary"
                  size="sm"
                  [loading]="drafting()"
                  [disabled]="!aiPrompt().trim()"
                  (click)="draftWithAi()"
                >
                  @if (!drafting()) {
                    <app-icon name="spark" [size]="15" />
                  }
                  {{
                    (drafting()
                      ? 'deviations.types.editor.ai.drafting'
                      : 'deviations.types.editor.ai.draft'
                    ) | transloco
                  }}
                </app-button>
              </div>
            </div>
          </app-card>

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
              <div class="mb-1 flex items-center justify-between gap-2">
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
              <p class="mb-4 text-[12px] text-fg-subtle">
                {{ 'deviations.types.editor.dragHint' | transloco }}
              </p>

              <div class="flex flex-col gap-5">
                @for (section of sections(); track s; let s = $index) {
                  <div class="rounded-card border border-border bg-surface p-4">
                    <div class="mb-3 flex items-center gap-2">
                      <input
                        type="text"
                        [ngModel]="section.title"
                        (ngModelChange)="setSectionTitle(s, $event)"
                        [name]="'sectitle-' + s"
                        autocomplete="off"
                        [placeholder]="
                          (s === 0
                            ? 'deviations.types.editor.defaultSection'
                            : 'deviations.types.editor.sectionTitlePlaceholder'
                          ) | transloco
                        "
                        [attr.aria-label]="'deviations.types.editor.sectionTitle' | transloco"
                        class="h-9 flex-1 rounded-[10px] border border-transparent bg-transparent px-2 text-[14px] font-semibold text-fg outline-none hover:border-border focus:border-accent focus:bg-bg focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                      />
                      @if (s > 0) {
                        <button
                          type="button"
                          (click)="removeSection(s)"
                          [attr.aria-label]="'deviations.types.editor.removeSection' | transloco"
                          class="flex flex-none rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail"
                        >
                          <app-icon name="x" [size]="15" />
                        </button>
                      }
                    </div>

                    <div
                      cdkDropList
                      [cdkDropListData]="s"
                      [cdkDropListConnectedTo]="dropListIds()"
                      [id]="'droplist-' + s"
                      (cdkDropListDropped)="onDrop($event)"
                      class="flex flex-col gap-3"
                    >
                      @if (section.fields.length === 0) {
                        <p
                          class="rounded-[10px] border border-dashed border-border py-4 text-center text-[13px] text-fg-subtle"
                        >
                          {{ 'deviations.types.editor.emptySection' | transloco }}
                        </p>
                      }

                      @for (field of section.fields; track f; let f = $index) {
                        <div cdkDrag class="rounded-card border border-border bg-bg p-3.5">
                          <div
                            *cdkDragPlaceholder
                            class="rounded-card border border-dashed border-accent bg-accent-soft"
                            [style.height.px]="64"
                          ></div>
                          <div class="mb-3 flex items-center gap-2">
                            <button
                              type="button"
                              cdkDragHandle
                              [attr.aria-label]="'deviations.types.editor.dragField' | transloco"
                              class="flex cursor-grab rounded-[8px] p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
                            >
                              <app-icon name="grip" [size]="16" />
                            </button>
                            <span class="font-mono text-[12px] text-fg-subtle">#{{ f + 1 }}</span>
                            <div class="ml-auto flex items-center gap-0.5">
                              <button
                                type="button"
                                (click)="removeField(s, f)"
                                [attr.aria-label]="
                                  'deviations.types.editor.removeField' | transloco
                                "
                                class="flex rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail"
                              >
                                <app-icon name="x" [size]="15" />
                              </button>
                            </div>
                          </div>

                          <div class="grid gap-3 sm:grid-cols-2">
                            <div class="flex flex-col gap-1.5">
                              <label
                                [attr.for]="'flabel-' + s + '-' + f"
                                class="text-[12.5px] font-semibold text-fg-muted"
                              >
                                {{ 'deviations.types.editor.fieldLabel' | transloco }}
                              </label>
                              <input
                                [id]="'flabel-' + s + '-' + f"
                                type="text"
                                [ngModel]="field.label"
                                (ngModelChange)="setFieldLabel(s, f, $event)"
                                [name]="'flabel-' + s + '-' + f"
                                autocomplete="off"
                                class="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                              />
                              @if (errorFor(field)?.label; as err) {
                                <p class="text-[12px] font-medium text-fail">
                                  {{ err | transloco }}
                                </p>
                              }
                            </div>
                            <div class="flex flex-col gap-1.5">
                              <label
                                [attr.for]="'fkey-' + s + '-' + f"
                                class="text-[12.5px] font-semibold text-fg-muted"
                              >
                                {{ 'deviations.types.editor.fieldKey' | transloco }}
                              </label>
                              <input
                                [id]="'fkey-' + s + '-' + f"
                                type="text"
                                [ngModel]="field.key"
                                (ngModelChange)="setFieldKey(s, f, $event)"
                                [name]="'fkey-' + s + '-' + f"
                                autocomplete="off"
                                spellcheck="false"
                                class="h-9 w-full rounded-[10px] border border-border bg-surface px-3 font-mono text-[13px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                              />
                              @if (errorFor(field)?.key; as err) {
                                <p class="text-[12px] font-medium text-fail">
                                  {{ err | transloco }}
                                </p>
                              }
                            </div>
                            <div class="flex flex-col gap-1.5">
                              <label
                                [attr.for]="'ftype-' + s + '-' + f"
                                class="text-[12.5px] font-semibold text-fg-muted"
                              >
                                {{ 'deviations.types.editor.fieldType' | transloco }}
                              </label>
                              <div class="cf-select">
                                <select
                                  [id]="'ftype-' + s + '-' + f"
                                  [ngModel]="field.type"
                                  (ngModelChange)="setFieldType(s, f, $event)"
                                  [name]="'ftype-' + s + '-' + f"
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
                                (ngModelChange)="setFieldRequired(s, f, $event)"
                                [name]="'freq-' + s + '-' + f"
                                class="h-4 w-4 accent-[var(--accent)]"
                              />
                              {{ 'deviations.types.editor.fieldRequired' | transloco }}
                            </label>
                          </div>

                          <div class="mt-3 flex flex-col gap-1.5">
                            <span class="text-[12.5px] font-semibold text-fg-muted">
                              {{ 'deviations.types.editor.fieldWidth' | transloco }}
                            </span>
                            <div
                              class="inline-flex w-fit rounded-[10px] border border-border bg-surface p-0.5"
                            >
                              @for (option of widthOptions; track option) {
                                <button
                                  type="button"
                                  (click)="setFieldWidth(s, f, option)"
                                  [class.bg-accent]="field.width === option"
                                  [class.text-white]="field.width === option"
                                  [class.text-fg-muted]="field.width !== option"
                                  class="rounded-[8px] px-3 py-1 text-[12.5px] font-semibold"
                                >
                                  {{
                                    (option === 'full'
                                      ? 'deviations.types.editor.widthFull'
                                      : 'deviations.types.editor.widthHalf'
                                    ) | transloco
                                  }}
                                </button>
                              }
                            </div>
                            <span class="text-[11.5px] text-fg-subtle">
                              {{ 'deviations.types.editor.widthHint' | transloco }}
                            </span>
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
                                    (ngModelChange)="setOption(s, f, j, $event)"
                                    [name]="'fopt-' + s + '-' + f + '-' + j"
                                    autocomplete="off"
                                    [placeholder]="
                                      'deviations.types.editor.optionPlaceholder' | transloco
                                    "
                                    class="h-9 flex-1 rounded-[10px] border border-border bg-surface px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                                  />
                                  <button
                                    type="button"
                                    (click)="removeOption(s, f, j)"
                                    [attr.aria-label]="
                                      'deviations.types.editor.removeOption' | transloco
                                    "
                                    class="flex flex-none rounded-[8px] p-2 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                                  >
                                    <app-icon name="x" [size]="14" />
                                  </button>
                                </div>
                              }
                              <button
                                type="button"
                                (click)="addOption(s, f)"
                                class="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline"
                              >
                                <app-icon name="plus" [size]="14" />
                                {{ 'deviations.types.editor.addOption' | transloco }}
                              </button>
                              @if (errorFor(field)?.options; as err) {
                                <p class="text-[12px] font-medium text-fail">
                                  {{ err | transloco }}
                                </p>
                              }
                            </div>
                          }

                          <div class="mt-3 grid gap-3 sm:grid-cols-2">
                            <input
                              type="text"
                              [ngModel]="field.placeholder"
                              (ngModelChange)="setFieldPlaceholder(s, f, $event)"
                              [name]="'fph-' + s + '-' + f"
                              autocomplete="off"
                              [placeholder]="'deviations.types.editor.placeholderHint' | transloco"
                              class="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                            />
                            <input
                              type="text"
                              [ngModel]="field.help"
                              (ngModelChange)="setFieldHelp(s, f, $event)"
                              [name]="'fhelp-' + s + '-' + f"
                              autocomplete="off"
                              [placeholder]="'deviations.types.editor.helpHint' | transloco"
                              class="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                            />
                          </div>

                          @if (showPreview() && field.label.trim() && field.key.trim()) {
                            <div
                              class="mt-3 rounded-[10px] border border-dashed border-border px-3 py-2.5"
                            >
                              <p
                                class="mb-2 text-[11px] font-bold tracking-[0.06em] text-fg-subtle uppercase"
                              >
                                {{ 'deviations.types.editor.preview' | transloco }}
                              </p>
                              <app-dynamic-field [field]="previewOf(field)" />
                            </div>
                          }
                        </div>
                      }
                    </div>

                    <button
                      type="button"
                      (click)="addField(s)"
                      class="mt-3 inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
                    >
                      <app-icon name="plus" [size]="15" />
                      {{ 'deviations.types.editor.addField' | transloco }}
                    </button>
                  </div>
                }
              </div>

              <button
                type="button"
                (click)="addSection()"
                class="mt-4 inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
              >
                <app-icon name="plus" [size]="15" />
                {{ 'deviations.types.editor.addSection' | transloco }}
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
        </div>
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
  protected readonly widthOptions: readonly FieldWidth[] = ['full', 'half'];
  protected readonly standardLabelKey = standardLabelKey;
  protected readonly fieldTypeLabelKey = fieldTypeLabelKey;
  protected readonly hasOptions = fieldTypeHasOptions;

  private readonly typeId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.typeId() !== null);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly drafting = signal(false);
  protected readonly showPreview = signal(true);

  protected readonly aiPrompt = signal('');

  protected readonly name = signal('');
  protected readonly key = signal('');
  protected readonly description = signal('');
  protected readonly codePrefix = signal('');
  protected readonly isActive = signal(true);
  protected readonly standards = signal<readonly Standard[]>([]);
  /** The layout builder's source of truth: ordered sections of ordered fields. */
  protected readonly sections = signal<DraftSection[]>([{ title: '', fields: [] }]);

  protected readonly keyError = signal<string | null>(null);

  // Tracks whether the key slug was auto-derived (so user edits stop tracking).
  private keyTouched = false;

  /**
   * The rendered field instances in section then within-section order, keeping
   * object identity so per-field errors can be matched back in the template.
   */
  private readonly orderedFields = computed<DraftFieldState[]>(() =>
    this.sections().flatMap((section) => section.fields),
  );

  /** Drop-list element ids, one per section, for CDK connected lists. */
  protected readonly dropListIds = computed<string[]>(() =>
    this.sections().map((_, i) => `droplist-${i}`),
  );

  protected readonly validation = computed<TypeValidation>(() =>
    validateType(this.name(), this.codePrefix(), this.orderedFields()),
  );

  /**
   * Per-field validation messages keyed by field object identity. `orderedFields`
   * and `validation` derive from the same `sections()` snapshot, so the field
   * instances rendered in the template match these keys for the current pass.
   */
  private readonly errorsByField = computed<Map<DraftFieldState, FieldErrors>>(() => {
    const fields = this.orderedFields();
    const errors = this.validation().fields;
    const map = new Map<DraftFieldState, FieldErrors>();
    fields.forEach((field, i) => map.set(field, errors[i]));
    return map;
  });

  constructor() {
    this.sections.set([{ title: '', fields: [] }]);

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

  protected errorFor(field: DraftFieldState): FieldErrors | undefined {
    return this.errorsByField().get(field);
  }

  /** Live preview of a single draft field via the dynamic-field renderer. */
  protected previewOf(field: DraftFieldState): ReturnType<typeof toFieldDef> {
    return toFieldDef(field);
  }

  protected addSection(): void {
    this.sections.update((list) => [...list, { title: '', fields: [] }]);
  }

  protected setSectionTitle(sectionIndex: number, value: string): void {
    this.sections.update((list) =>
      list.map((section, i) => (i === sectionIndex ? { ...section, title: value } : section)),
    );
  }

  /** Removes a section, folding its fields into the previous section. */
  protected removeSection(sectionIndex: number): void {
    if (sectionIndex === 0) {
      return;
    }
    this.sections.update((list) => {
      const next = list.map((section) => ({ ...section, fields: [...section.fields] }));
      const [removed] = next.splice(sectionIndex, 1);
      next[sectionIndex - 1].fields.push(...removed.fields);
      return next;
    });
  }

  protected addField(sectionIndex: number): void {
    this.sections.update((list) =>
      list.map((section, i) =>
        i === sectionIndex
          ? { ...section, fields: [...section.fields, emptyDraftField()] }
          : section,
      ),
    );
  }

  protected removeField(sectionIndex: number, fieldIndex: number): void {
    this.patchSectionFields(sectionIndex, (fields) => fields.filter((_, i) => i !== fieldIndex));
  }

  protected onDrop(event: CdkDragDrop<number>): void {
    const from = event.previousContainer.data;
    const to = event.container.data;
    this.sections.update((list) => {
      const next = list.map((section) => ({ ...section, fields: [...section.fields] }));
      if (from === to) {
        moveItemInArray(next[to].fields, event.previousIndex, event.currentIndex);
      } else {
        transferArrayItem(
          next[from].fields,
          next[to].fields,
          event.previousIndex,
          event.currentIndex,
        );
      }
      return next;
    });
  }

  protected setFieldLabel(sectionIndex: number, fieldIndex: number, value: string): void {
    this.patchField(sectionIndex, fieldIndex, (f) => {
      const next = { ...f, label: value };
      if (!f.keyTouched) {
        next.key = slugify(value);
      }
      return next;
    });
  }

  protected setFieldKey(sectionIndex: number, fieldIndex: number, value: string): void {
    this.patchField(sectionIndex, fieldIndex, (f) => ({ ...f, key: value, keyTouched: true }));
  }

  protected setFieldType(sectionIndex: number, fieldIndex: number, value: FieldType): void {
    this.patchField(sectionIndex, fieldIndex, (f) => ({ ...f, type: value }));
  }

  protected setFieldRequired(sectionIndex: number, fieldIndex: number, value: boolean): void {
    this.patchField(sectionIndex, fieldIndex, (f) => ({ ...f, required: value }));
  }

  protected setFieldWidth(sectionIndex: number, fieldIndex: number, value: FieldWidth): void {
    this.patchField(sectionIndex, fieldIndex, (f) => ({ ...f, width: value }));
  }

  protected setFieldPlaceholder(sectionIndex: number, fieldIndex: number, value: string): void {
    this.patchField(sectionIndex, fieldIndex, (f) => ({ ...f, placeholder: value }));
  }

  protected setFieldHelp(sectionIndex: number, fieldIndex: number, value: string): void {
    this.patchField(sectionIndex, fieldIndex, (f) => ({ ...f, help: value }));
  }

  protected addOption(sectionIndex: number, fieldIndex: number): void {
    this.patchField(sectionIndex, fieldIndex, (f) => ({ ...f, options: [...f.options, ''] }));
  }

  protected removeOption(sectionIndex: number, fieldIndex: number, optIndex: number): void {
    this.patchField(sectionIndex, fieldIndex, (f) => ({
      ...f,
      options: f.options.filter((_, i) => i !== optIndex),
    }));
  }

  protected setOption(
    sectionIndex: number,
    fieldIndex: number,
    optIndex: number,
    value: string,
  ): void {
    this.patchField(sectionIndex, fieldIndex, (f) => ({
      ...f,
      options: f.options.map((o, i) => (i === optIndex ? value : o)),
    }));
  }

  protected draftWithAi(): void {
    const orgId = this.orgId();
    const prompt = this.aiPrompt().trim();
    if (!orgId || !prompt || this.drafting()) {
      return;
    }
    this.drafting.set(true);
    const standards = this.standards().length ? this.standards() : undefined;
    this.api.draftType(orgId, prompt, standards).subscribe({
      next: (draft) => {
        this.drafting.set(false);
        this.applyDraft(draft);
        this.notifications.success('deviations.types.editor.ai.draftedToast');
      },
      error: (error: unknown) => {
        this.drafting.set(false);
        if (error instanceof HttpErrorResponse && error.status === 503) {
          this.notifications.info('deviations.types.editor.ai.notConfigured');
          return;
        }
        this.notifications.error('deviations.types.editor.ai.failed');
      },
    });
  }

  /** Replaces the editor form with an AI-drafted type for the admin to review. */
  private applyDraft(draft: DeviationTypeDraftResponse): void {
    this.keyTouched = true;
    this.name.set(draft.name);
    this.key.set(draft.key);
    this.description.set(draft.description ?? '');
    this.codePrefix.set(draft.code_prefix);
    this.standards.set([...draft.standards]);
    this.setSectionsFromSchema(draft.schema);
    this.keyError.set(null);
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
      schema: flattenSections(this.sections()).map(toFieldDef),
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

  private patchSectionFields(
    sectionIndex: number,
    fn: (fields: DraftFieldState[]) => DraftFieldState[],
  ): void {
    this.sections.update((list) =>
      list.map((section, i) =>
        i === sectionIndex ? { ...section, fields: fn(section.fields) } : section,
      ),
    );
  }

  private patchField(
    sectionIndex: number,
    fieldIndex: number,
    fn: (f: DraftFieldState) => DraftFieldState,
  ): void {
    this.patchSectionFields(sectionIndex, (fields) =>
      fields.map((f, i) => (i === fieldIndex ? fn(f) : f)),
    );
  }

  /** Groups a stored/drafted schema into the sectioned builder state. */
  private setSectionsFromSchema(schema: readonly FieldDef[]): void {
    const drafts = schema.map(fromFieldDef);
    this.sections.set(groupIntoSections(drafts, ''));
  }

  private handleError(error: unknown): void {
    const coded = codedErrorDetail(error);
    if (coded?.code === 'type_key_exists') {
      this.keyError.set('deviations.types.editor.errors.keyTaken');
      return;
    }
    if (coded?.code === 'invalid_type_key') {
      this.keyError.set('deviations.errors.invalid_type_key');
      return;
    }
    if (!coded && error instanceof HttpErrorResponse) {
      // Legacy (uncoded) API: a 409, or a 422 naming `key`, meant the key clashed.
      const legacy = (error.error as { detail?: unknown } | null)?.detail;
      const namesKey =
        !!legacy && typeof legacy === 'object' && !!(legacy as Record<string, unknown>)['key'];
      if (error.status === 409 || (error.status === 422 && namesKey)) {
        this.keyError.set('deviations.types.editor.errors.keyTaken');
        return;
      }
    }
    notifyDeviationError(this.notifications, error, 'deviations.types.editor.saveFailedToast');
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
    this.setSectionsFromSchema(type.schema);
  }
}
