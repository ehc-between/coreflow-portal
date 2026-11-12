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
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { DocumentControlApi } from '../data/document-control-api';
import { documentControlErrorKey } from '../data/document-control-errors';
import {
  RETENTION_APPLIES_TO,
  RETENTION_DISPOSITIONS,
  RETENTION_TRIGGERS,
  RetentionAppliesTo,
  RetentionDisposition,
  RetentionRule,
  RetentionRuleCreate,
  RetentionTrigger,
} from '../data/document-control.models';
import { intOrNull, textOrNull } from '../shared/document-control-display';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';

const TABS: readonly RecordTab[] = ['details', 'activity', 'revisions', 'related'];

export const RETENTION_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'documents.control.retention.fields.name',
  description: 'documents.control.fields.description',
  applies_to: 'documents.control.retention.fields.appliesTo',
  retention_months: 'documents.control.retention.fields.months',
  trigger: 'documents.control.retention.fields.trigger',
  disposition: 'documents.control.retention.fields.disposition',
  legal_basis: 'documents.control.retention.fields.legalBasis',
  active: 'documents.control.common.active',
};

export interface RetentionFormValue {
  readonly name: string;
  readonly description: string;
  readonly appliesTo: RetentionAppliesTo;
  readonly months: string;
  readonly trigger: RetentionTrigger;
  readonly disposition: RetentionDisposition;
  readonly legalBasis: string;
  readonly active: boolean;
}

const EMPTY: RetentionFormValue = {
  name: '',
  description: '',
  appliesTo: 'document',
  months: '',
  trigger: 'obsoleted',
  disposition: 'review',
  legalBasis: '',
  active: true,
};

export function ruleToForm(r: RetentionRule): RetentionFormValue {
  return {
    name: r.name,
    description: r.description ?? '',
    appliesTo: r.applies_to,
    months: String(r.retention_months),
    trigger: r.trigger,
    disposition: r.disposition,
    legalBasis: r.legal_basis ?? '',
    active: r.active,
  };
}

/** The API body, or null when the period is missing / out of range (0-1200 months). */
export function ruleBody(v: RetentionFormValue): RetentionRuleCreate | null {
  const months = intOrNull(v.months);
  if (!v.name.trim() || months === null || months < 0 || months > 1200) {
    return null;
  }
  return {
    name: v.name.trim(),
    description: textOrNull(v.description),
    applies_to: v.appliesTo,
    retention_months: months,
    trigger: v.trigger,
    disposition: v.disposition,
    legal_basis: textOrNull(v.legalBasis),
    active: v.active,
  };
}

/** Create (`/documents/retention/new`) or view and edit (`/documents/retention/:id`) a rule. */
@Component({
  selector: 'app-retention-form',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    RecordDetailLayout,
    SupportsRequirements,
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
        <app-documents-page-guide page="retentionForm" lesson="retention-basics" />
        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
          <app-card>
            <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2" [disabled]="!perms.canManage()">
              <app-form-field
                class="sm:col-span-2"
                inputId="ret-name"
                [label]="'documents.control.retention.fields.name' | transloco"
              >
                <input
                  id="ret-name"
                  type="text"
                  required
                  maxlength="120"
                  [value]="form().name"
                  (input)="set('name', $any($event.target).value)"
                  data-testid="retention-name"
                />
              </app-form-field>
              <app-form-field
                inputId="ret-applies"
                [label]="'documents.control.retention.fields.appliesTo' | transloco"
              >
                <select id="ret-applies" (change)="set('appliesTo', $any($event.target).value)">
                  @for (a of appliesTo; track a) {
                    <option [value]="a" [selected]="a === form().appliesTo">
                      {{ 'documents.control.retention.appliesTo.' + a | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
              <div>
                <app-form-field
                  inputId="ret-months"
                  [label]="'documents.control.retention.fields.months' | transloco"
                >
                  <input
                    id="ret-months"
                    type="number"
                    min="0"
                    max="1200"
                    required
                    [value]="form().months"
                    (input)="set('months', $any($event.target).value)"
                    data-testid="retention-months"
                  />
                </app-form-field>
                <app-field-help scope="documents" page="retentionForm" field="months" />
              </div>
              <div>
                <app-form-field
                  inputId="ret-trigger"
                  [label]="'documents.control.retention.fields.trigger' | transloco"
                >
                  <select id="ret-trigger" (change)="set('trigger', $any($event.target).value)">
                    @for (t of triggers; track t) {
                      <option [value]="t" [selected]="t === form().trigger">
                        {{ 'documents.control.retention.triggers.' + t | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="documents" page="retentionForm" field="trigger" />
              </div>
              <div>
                <app-form-field
                  inputId="ret-disposition"
                  [label]="'documents.control.retention.fields.disposition' | transloco"
                >
                  <select
                    id="ret-disposition"
                    (change)="set('disposition', $any($event.target).value)"
                  >
                    @for (d of dispositions; track d) {
                      <option [value]="d" [selected]="d === form().disposition">
                        {{ 'documents.control.retention.dispositions.' + d | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="documents" page="retentionForm" field="disposition" />
              </div>
              <div class="sm:col-span-2">
                <div class="flex items-end gap-1.5">
                  <app-form-field
                    class="flex-1"
                    inputId="ret-legal"
                    [label]="'documents.control.retention.fields.legalBasis' | transloco"
                  >
                    <input
                      id="ret-legal"
                      type="text"
                      maxlength="255"
                      [value]="form().legalBasis"
                      (input)="set('legalBasis', $any($event.target).value)"
                    />
                  </app-form-field>
                  <app-ask-about
                    class="mb-2"
                    [prompt]="'documents.control.retention.askLegalBasis' | transloco"
                    field="legal_basis"
                  />
                </div>
              </div>
              <app-form-field
                class="sm:col-span-2"
                inputId="ret-description"
                [label]="'documents.control.fields.description' | transloco"
              >
                <textarea
                  id="ret-description"
                  rows="2"
                  maxlength="4000"
                  [value]="form().description"
                  (input)="set('description', $any($event.target).value)"
                ></textarea>
              </app-form-field>
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
                  inputId="ret-reason"
                  [label]="'documents.control.fields.changeReason' | transloco"
                >
                  <input
                    id="ret-reason"
                    type="text"
                    maxlength="2000"
                    [value]="changeReason()"
                    (input)="changeReason.set($any($event.target).value)"
                  />
                </app-form-field>
              }
            </fieldset>
          </app-card>
          @if (perms.canManage()) {
            <div class="flex flex-wrap items-center gap-2">
              <app-button
                type="submit"
                [disabled]="!body() || saving()"
                [loading]="saving()"
                data-testid="retention-save"
              >
                {{ 'documents.control.common.save' | transloco }}
              </app-button>
              <a routerLink="/documents/retention">
                <app-button type="button" variant="ghost">
                  {{ 'documents.control.common.cancel' | transloco }}
                </app-button>
              </a>
            </div>
          }
        </form>
      </div>
    </ng-template>

    @if (id(); as ruleId) {
      @if (current(); as r) {
        <app-record-detail-layout
          entityType="retention_rule"
          [entityId]="ruleId"
          [tabs]="tabs"
          [canEdit]="perms.canManage()"
          [includeAudit]="perms.canReadAudit()"
          [fieldLabels]="fieldLabels"
          backLink="/documents/retention"
          backLabelKey="documents.control.retention.back"
        >
          <div header>
            <p class="mb-1 text-[12.5px] text-fg-subtle">
              {{ 'documents.control.retention.appliesTo.' + r.applies_to | transloco }}
            </p>
            <h1
              class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            >
              {{ r.name }}
            </h1>
            <p class="mt-1 text-[12.5px] text-fg-muted">
              {{ 'documents.control.retention.usedBy' | transloco: { count: r.usage_count } }}
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
          <ng-container aside>
            @if (perms.canReadStandards()) {
              <app-card>
                <app-supports-requirements entityType="retention_rule" [entityId]="ruleId" />
              </app-card>
            }
          </ng-container>
        </app-record-detail-layout>
        <app-confirm-dialog
          [open]="deleteOpen()"
          [title]="'documents.control.retention.deleteTitle' | transloco"
          [message]="'documents.control.retention.deleteMessage' | transloco: { name: r.name }"
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
          routerLink="/documents/retention"
          class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'documents.control.retention.back' | transloco }}
        </a>
        <h1
          class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
        >
          {{ 'documents.control.retention.new' | transloco }}
        </h1>
        <ng-container [ngTemplateOutlet]="formTpl" />
      </div>
    }
  `,
})
export class RetentionFormPage {
  private readonly api = inject(DocumentControlApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  readonly id = input<string | undefined>(undefined);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = RETENTION_FIELD_LABELS;
  protected readonly appliesTo = RETENTION_APPLIES_TO;
  protected readonly triggers = RETENTION_TRIGGERS;
  protected readonly dispositions = RETENTION_DISPOSITIONS;

  protected readonly current = signal<RetentionRule | null>(null);
  protected readonly form = signal<RetentionFormValue>(EMPTY);
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly body = computed(() => ruleBody(this.form()));

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'retention_rule',
      entityId: this.id() ?? null,
      view: this.id() ? 'detail' : 'new',
      title: this.current()?.name ?? this.language.translate('documents.control.retention.new'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      if (!orgId || !id) {
        return;
      }
      untracked(() =>
        this.api.getRetentionRule(orgId, id).subscribe({
          next: (r) => this.apply(r),
          error: (e: unknown) => this.errorKey.set(documentControlErrorKey(e)),
        }),
      );
    });
  }

  private apply(r: RetentionRule): void {
    this.current.set(r);
    this.form.set(ruleToForm(r));
    this.changeReason.set('');
  }

  protected set<K extends keyof RetentionFormValue>(key: K, value: RetentionFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    const body = this.body();
    if (!orgId || !body || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    const id = this.id();
    const request = id
      ? this.api.updateRetentionRule(orgId, id, {
          ...body,
          change_reason: textOrNull(this.changeReason()),
        })
      : this.api.createRetentionRule(orgId, body);
    request.subscribe({
      next: (r) => {
        this.saving.set(false);
        this.toasts.success('documents.control.common.savedToast');
        if (id) {
          this.apply(r);
        } else {
          void this.router.navigate(['/documents/retention', r.id]);
        }
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    const id = this.id();
    if (!orgId || !id) {
      return;
    }
    this.saving.set(true);
    this.api.deleteRetentionRule(orgId, id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteOpen.set(false);
        this.toasts.success('documents.control.common.deletedToast');
        void this.router.navigateByUrl('/documents/retention');
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.deleteOpen.set(false);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }
}
