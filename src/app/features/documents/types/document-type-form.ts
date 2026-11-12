import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { DocumentControlApi } from '../data/document-control-api';
import { documentControlErrorKey } from '../data/document-control-errors';
import { DocumentType, DocumentTypeCreate, RetentionRule } from '../data/document-control.models';
import { intOrNull, textOrNull } from '../shared/document-control-display';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';
import { DEFAULT_NUMBERING_PATTERN, isValidPattern, previewCode } from './numbering';

const TABS: readonly RecordTab[] = ['details', 'activity', 'related'];

/** Type keys the backend accepts (1-32 letters, digits, `.`, `_`, `-`; starts alphanumeric). */
export const TYPE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export interface TypeFormValue {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly prefix: string;
  readonly pattern: string;
  readonly nextNumber: string;
  readonly interval: string;
  readonly ack: boolean;
  readonly retentionId: string;
  readonly active: boolean;
}

const EMPTY: TypeFormValue = {
  key: '',
  name: '',
  description: '',
  prefix: '',
  pattern: '',
  nextNumber: '1',
  interval: '',
  ack: false,
  retentionId: '',
  active: true,
};

export function typeToForm(t: DocumentType): TypeFormValue {
  return {
    key: t.key,
    name: t.name,
    description: t.description ?? '',
    prefix: t.numbering_prefix ?? '',
    pattern: t.numbering_pattern ?? '',
    nextNumber: String(t.next_number),
    interval: t.default_review_interval_months ? String(t.default_review_interval_months) : '',
    ack: t.default_acknowledgement_required,
    retentionId: t.retention_rule_id ?? '',
    active: t.active,
  };
}

export function typeBody(v: TypeFormValue): DocumentTypeCreate {
  return {
    key: v.key.trim(),
    name: v.name.trim(),
    description: textOrNull(v.description),
    numbering_prefix: textOrNull(v.prefix),
    numbering_pattern: textOrNull(v.pattern),
    default_review_interval_months: intOrNull(v.interval),
    default_acknowledgement_required: v.ack,
    retention_rule_id: v.retentionId || null,
    active: v.active,
  };
}

/**
 * Create (`/documents/types/new`) or view and edit (`/documents/types/:id`) a
 * document type: its numbering scheme with a live preview of the next code, and
 * the defaults new documents of the type get.
 */
@Component({
  selector: 'app-document-type-form',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    TourStepDirective,
    RecordDetailLayout,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #formTpl>
      <div class="flex flex-col gap-4">
        <app-documents-page-guide page="typeForm" lesson="numbering-and-types" tour="typeForm" />
        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
          <fieldset class="contents" [disabled]="!perms.canManage()">
            <app-card>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <app-form-field
                  inputId="type-name"
                  [label]="'documents.control.types.fields.name' | transloco"
                >
                  <input
                    id="type-name"
                    type="text"
                    required
                    maxlength="120"
                    [value]="form().name"
                    (input)="set('name', $any($event.target).value)"
                    data-testid="type-name"
                  />
                </app-form-field>
                <div>
                  <app-form-field
                    inputId="type-key"
                    [label]="'documents.control.types.fields.key' | transloco"
                  >
                    <input
                      id="type-key"
                      type="text"
                      required
                      maxlength="32"
                      [readOnly]="!!id()"
                      [value]="form().key"
                      (input)="set('key', $any($event.target).value)"
                      data-testid="type-key"
                    />
                  </app-form-field>
                  <app-field-help scope="documents" page="typeForm" field="key" />
                  @if (!id() && form().key && !keyValid()) {
                    <p class="mt-1 text-[12px] text-fail" role="alert">
                      {{ 'documents.control.errors.invalid_type_key' | transloco }}
                    </p>
                  }
                </div>
                <app-form-field
                  class="sm:col-span-2"
                  inputId="type-description"
                  [label]="'documents.control.fields.description' | transloco"
                >
                  <textarea
                    id="type-description"
                    rows="2"
                    maxlength="4000"
                    [value]="form().description"
                    (input)="set('description', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                {{ 'documents.control.types.numbering' | transloco }}
              </h2>
              <div
                class="grid grid-cols-1 gap-4 sm:grid-cols-3"
                [appTourStep]="'documents-type-numbering'"
              >
                <app-form-field
                  inputId="type-prefix"
                  [label]="'documents.control.types.fields.prefix' | transloco"
                >
                  <input
                    id="type-prefix"
                    type="text"
                    maxlength="16"
                    [value]="form().prefix"
                    (input)="set('prefix', $any($event.target).value)"
                  />
                </app-form-field>
                <div>
                  <app-form-field
                    inputId="type-pattern"
                    [label]="'documents.control.types.fields.pattern' | transloco"
                  >
                    <input
                      id="type-pattern"
                      type="text"
                      maxlength="64"
                      [placeholder]="defaultPattern"
                      [value]="form().pattern"
                      (input)="set('pattern', $any($event.target).value)"
                      data-testid="type-pattern"
                    />
                  </app-form-field>
                  <app-field-help scope="documents" page="typeForm" field="pattern" />
                </div>
                @if (id()) {
                  <app-form-field
                    inputId="type-next"
                    [label]="'documents.control.types.fields.nextNumber' | transloco"
                  >
                    <input
                      id="type-next"
                      type="number"
                      min="1"
                      [value]="form().nextNumber"
                      (input)="set('nextNumber', $any($event.target).value)"
                    />
                  </app-form-field>
                }
              </div>
              <p class="mt-3 text-[13px]" aria-live="polite" data-testid="type-preview">
                @if (!numberingOn()) {
                  <span class="text-fg-muted">{{
                    'documents.control.types.numberingOff' | transloco
                  }}</span>
                } @else if (preview(); as code) {
                  <span class="text-fg-muted">{{
                    'documents.control.types.preview' | transloco
                  }}</span>
                  <span class="ml-1 font-mono font-semibold text-fg">{{ code }}</span>
                } @else {
                  <span class="text-fail" role="alert">{{
                    'documents.control.errors.invalid_numbering_pattern' | transloco
                  }}</span>
                }
              </p>
            </app-card>

            <app-card>
              <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                {{ 'documents.control.types.defaults' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <app-form-field
                    inputId="type-interval"
                    [label]="'documents.control.fields.reviewInterval' | transloco"
                  >
                    <input
                      id="type-interval"
                      type="number"
                      min="1"
                      max="120"
                      [value]="form().interval"
                      (input)="set('interval', $any($event.target).value)"
                    />
                  </app-form-field>
                  <app-field-help scope="documents" page="typeForm" field="reviewInterval" />
                </div>
                <app-form-field
                  inputId="type-retention"
                  [label]="'documents.control.fields.retentionRule' | transloco"
                >
                  <select
                    id="type-retention"
                    (change)="set('retentionId', $any($event.target).value)"
                  >
                    <option value="" [selected]="!form().retentionId">
                      {{ 'documents.control.common.none' | transloco }}
                    </option>
                    @for (r of rules(); track r.id) {
                      <option [value]="r.id" [selected]="r.id === form().retentionId">
                        {{ r.name }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <label class="inline-flex items-start gap-2 text-[13.5px] text-fg sm:col-span-2">
                  <input
                    type="checkbox"
                    class="mt-0.5"
                    [checked]="form().ack"
                    (change)="set('ack', $any($event.target).checked)"
                  />
                  <span>
                    {{ 'documents.control.types.fields.ack' | transloco }}
                    <span class="block text-[12px] text-fg-subtle">{{
                      'documents.control.types.ackHint' | transloco
                    }}</span>
                  </span>
                </label>
                <label class="inline-flex items-center gap-2 text-[13.5px] text-fg sm:col-span-2">
                  <input
                    type="checkbox"
                    [checked]="form().active"
                    (change)="set('active', $any($event.target).checked)"
                  />
                  {{ 'documents.control.common.active' | transloco }}
                </label>
                @if (id()) {
                  <app-form-field
                    class="sm:col-span-2"
                    inputId="type-reason"
                    [label]="'documents.control.fields.changeReason' | transloco"
                  >
                    <input
                      id="type-reason"
                      type="text"
                      maxlength="2000"
                      [value]="changeReason()"
                      (input)="changeReason.set($any($event.target).value)"
                    />
                  </app-form-field>
                }
              </div>
            </app-card>
          </fieldset>

          @if (perms.canManage()) {
            <div class="flex flex-wrap items-center gap-2">
              <app-button
                type="submit"
                [disabled]="!canSave()"
                [loading]="saving()"
                data-testid="type-save"
              >
                {{ 'documents.control.common.save' | transloco }}
              </app-button>
              <a routerLink="/documents/types">
                <app-button type="button" variant="ghost">
                  {{ 'documents.control.common.cancel' | transloco }}
                </app-button>
              </a>
            </div>
          }
        </form>
      </div>
    </ng-template>

    @if (id(); as typeId) {
      @if (current(); as t) {
        <app-record-detail-layout
          entityType="document_type"
          [entityId]="typeId"
          [tabs]="tabs"
          [canEdit]="perms.canManage()"
          [includeAudit]="perms.canReadAudit()"
          backLink="/documents/types"
          backLabelKey="documents.control.types.back"
        >
          <div header>
            <p class="mb-1 font-mono text-[12.5px] text-fg-subtle">{{ t.key }}</p>
            <h1
              class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            >
              {{ t.name }}
            </h1>
            <p class="mt-1 text-[12.5px] text-fg-muted">
              {{ 'documents.control.types.usedBy' | transloco: { count: t.document_count } }}
            </p>
          </div>
          <ng-container actions>
            @if (perms.canManage()) {
              <app-button size="sm" variant="ghost" (click)="deleteOpen.set(true)">
                <app-icon name="trash" [size]="14" />
                <span class="sr-only sm:not-sr-only">{{
                  'documents.control.common.delete' | transloco
                }}</span>
              </app-button>
            }
          </ng-container>
          <ng-container [ngTemplateOutlet]="formTpl" />
        </app-record-detail-layout>
        <app-confirm-dialog
          [open]="deleteOpen()"
          [title]="'documents.control.types.deleteTitle' | transloco"
          [message]="'documents.control.types.deleteMessage' | transloco: { name: t.name }"
          [confirmLabel]="'documents.control.common.delete' | transloco"
          [cancelLabel]="'documents.control.common.cancel' | transloco"
          [busy]="saving()"
          (confirmed)="remove()"
          (cancelled)="deleteOpen.set(false)"
        />
      } @else if (errorKey(); as key) {
        <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        </div>
      } @else {
        <p class="py-16 text-center text-[14px] text-fg-muted">
          {{ 'documents.control.common.loading' | transloco }}
        </p>
      }
    } @else {
      <div class="mx-auto max-w-[860px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
        <a
          routerLink="/documents/types"
          class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'documents.control.types.back' | transloco }}
        </a>
        <h1
          class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
        >
          {{ 'documents.control.types.new' | transloco }}
        </h1>
        <ng-container [ngTemplateOutlet]="formTpl" />
      </div>
    }
  `,
})
export class DocumentTypeFormPage {
  private readonly api = inject(DocumentControlApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  /** Set on `/documents/types/:id`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly tabs = TABS;
  protected readonly defaultPattern = DEFAULT_NUMBERING_PATTERN;
  protected readonly current = signal<DocumentType | null>(null);
  protected readonly form = signal<TypeFormValue>(EMPTY);
  protected readonly rules = signal<readonly RetentionRule[]>([]);
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly keyValid = computed(() => TYPE_KEY_PATTERN.test(this.form().key.trim()));
  protected readonly numberingOn = computed(
    () => !!this.form().prefix.trim() || !!this.form().pattern.trim(),
  );
  protected readonly preview = computed(() => {
    const f = this.form();
    return previewCode(f.pattern, f.prefix, Number(f.nextNumber) || 1);
  });
  protected readonly canSave = computed(() => {
    const f = this.form();
    const patternOk = !f.pattern.trim() || isValidPattern(f.pattern.trim());
    return !!f.name.trim() && (!!this.id() || this.keyValid()) && patternOk && !this.saving();
  });

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document_type',
      entityId: this.id() ?? null,
      view: this.id() ? 'detail' : 'new',
      title: this.current()?.name ?? this.language.translate('documents.control.types.new'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  private load(orgId: string | null, id: string | undefined): void {
    if (!orgId) {
      return;
    }
    this.api.listRetentionRules(orgId).subscribe({
      next: (r) => this.rules.set(r.filter((x) => x.applies_to === 'document')),
      error: () => undefined,
    });
    if (!id) {
      return;
    }
    this.api.getType(orgId, id).subscribe({
      next: (t) => this.apply(t),
      error: (e: unknown) => this.errorKey.set(documentControlErrorKey(e)),
    });
  }

  private apply(t: DocumentType): void {
    this.current.set(t);
    this.form.set(typeToForm(t));
    this.changeReason.set('');
  }

  protected set<K extends keyof TypeFormValue>(key: K, value: TypeFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    if (!orgId || !this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    const body = typeBody(this.form());
    const id = this.id();
    if (id) {
      const { key: _key, ...rest } = body;
      void _key;
      const next = intOrNull(this.form().nextNumber);
      this.api
        .updateType(orgId, id, {
          ...rest,
          next_number: next && next !== this.current()?.next_number ? next : undefined,
          change_reason: textOrNull(this.changeReason()),
        })
        .subscribe({
          next: (t) => {
            this.saving.set(false);
            this.apply(t);
            this.toasts.success('documents.control.common.savedToast');
          },
          error: (e: unknown) => this.fail(e),
        });
      return;
    }
    this.api.createType(orgId, body).subscribe({
      next: (t) => {
        this.saving.set(false);
        this.toasts.success('documents.control.common.savedToast');
        void this.router.navigate(['/documents/types', t.id]);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  private fail(e: unknown): void {
    this.saving.set(false);
    this.errorKey.set(documentControlErrorKey(e));
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    const id = this.id();
    if (!orgId || !id) {
      return;
    }
    this.saving.set(true);
    this.api.deleteType(orgId, id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteOpen.set(false);
        this.toasts.success('documents.control.common.deletedToast');
        void this.router.navigateByUrl('/documents/types');
      },
      error: (e: unknown) => {
        this.deleteOpen.set(false);
        this.fail(e);
      },
    });
  }
}
