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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { DocumentControlApi } from '../data/document-control-api';
import { documentControlErrorKey } from '../data/document-control-errors';
import {
  DocumentType,
  EXTERNAL_STATUSES,
  ExternalCreate,
  ExternalDocument,
  ExternalStatus,
  RetentionRule,
} from '../data/document-control.models';
import { intOrNull, textOrNull, toDateInput } from '../shared/document-control-display';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';
import { DocumentsPersonSelect } from '../shared/person-select';

/** Form state of an external document. */
export interface ExternalFormValue {
  readonly title: string;
  readonly code: string;
  readonly publisher: string;
  readonly reference: string;
  readonly version: string;
  readonly url: string;
  readonly issuedOn: string;
  readonly status: ExternalStatus;
  readonly typeId: string;
  readonly ownerId: string;
  readonly interval: string;
  readonly nextReview: string;
  readonly retentionId: string;
  readonly notes: string;
}

export function emptyExternalForm(ownerId: string): ExternalFormValue {
  return {
    title: '',
    code: '',
    publisher: '',
    reference: '',
    version: '',
    url: '',
    issuedOn: '',
    status: 'current',
    typeId: '',
    ownerId,
    interval: '',
    nextReview: '',
    retentionId: '',
    notes: '',
  };
}

export function externalToForm(row: ExternalDocument): ExternalFormValue {
  return {
    title: row.title,
    code: row.code ?? '',
    publisher: row.publisher ?? '',
    reference: row.reference ?? '',
    version: row.version ?? '',
    url: row.url ?? '',
    issuedOn: toDateInput(row.issued_on),
    status: row.status,
    typeId: row.document_type_id ?? '',
    ownerId: row.owner?.id ?? '',
    interval: row.review_interval_months ? String(row.review_interval_months) : '',
    nextReview: toDateInput(row.next_review_at),
    retentionId: row.retention_rule_id ?? '',
    notes: row.notes ?? '',
  };
}

/** The API body for the form (blank optional fields are sent as null to clear them). */
export function externalBody(v: ExternalFormValue): ExternalCreate {
  return {
    title: v.title.trim(),
    code: textOrNull(v.code),
    publisher: textOrNull(v.publisher),
    reference: textOrNull(v.reference),
    version: textOrNull(v.version),
    url: textOrNull(v.url),
    issued_on: v.issuedOn || null,
    status: v.status,
    document_type_id: v.typeId || null,
    owner_user_id: v.ownerId || null,
    review_interval_months: intOrNull(v.interval),
    next_review_at: v.nextReview || null,
    retention_rule_id: v.retentionId || null,
    notes: textOrNull(v.notes),
  };
}

/** Register a new external document, or edit one (`:id/edit`). */
@Component({
  selector: 'app-external-form',
  imports: [
    TranslocoPipe,
    FieldHelp,
    Alert,
    Button,
    DateInput,
    FormActions,
    FormField,
    FormSection,
    LoadingState,
    PageHeader,
    DocumentsPageGuide,
    DocumentsPersonSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="titleKey()"
        [breadcrumbs]="[
          { labelKey: 'documents.control.nav.documents', link: '/documents' },
          { labelKey: 'documents.control.nav.external', link: '/documents/external' },
          { labelKey: titleKey() },
        ]"
        [backLink]="backLink()"
        backLabelKey="documents.control.external.back"
      />
      <app-documents-page-guide page="externalForm" />

      @if (errorKey(); as key) {
        <app-alert class="mb-4 block" tone="error">{{ key | transloco }}</app-alert>
      }

      @if (ready()) {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-form-section
            [title]="'documents.control.external.sections.source' | transloco"
            [description]="'documents.control.external.sections.sourceHint' | transloco"
          >
            <app-form-field
              span="full"
              inputId="ext-title"
              [required]="true"
              [label]="'documents.control.fields.title' | transloco"
            >
              <input
                id="ext-title"
                type="text"
                required
                maxlength="255"
                [value]="form().title"
                (input)="set('title', $any($event.target).value)"
                data-testid="external-title"
              />
            </app-form-field>
            <app-form-field
              inputId="ext-publisher"
              [label]="'documents.control.external.fields.publisher' | transloco"
            >
              <app-field-help
                label-suffix
                scope="documents"
                page="externalForm"
                field="publisher"
                [label]="'documents.control.external.fields.publisher' | transloco"
              />
              <input
                id="ext-publisher"
                type="text"
                maxlength="255"
                [value]="form().publisher"
                (input)="set('publisher', $any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              inputId="ext-reference"
              [label]="'documents.control.external.fields.reference' | transloco"
            >
              <input
                id="ext-reference"
                type="text"
                maxlength="120"
                [value]="form().reference"
                (input)="set('reference', $any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              inputId="ext-version"
              [label]="'documents.control.external.fields.version' | transloco"
            >
              <app-field-help
                label-suffix
                scope="documents"
                page="externalForm"
                field="version"
                [label]="'documents.control.external.fields.version' | transloco"
              />
              <input
                id="ext-version"
                type="text"
                maxlength="64"
                [value]="form().version"
                (input)="set('version', $any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              inputId="ext-issued"
              [label]="'documents.control.external.fields.issuedOn' | transloco"
            >
              <app-date-input
                inputId="ext-issued"
                [value]="form().issuedOn"
                (valueChange)="set('issuedOn', $event ?? '')"
              />
            </app-form-field>
            <app-form-field
              inputId="ext-code"
              [label]="'documents.control.external.fields.code' | transloco"
            >
              <input
                id="ext-code"
                type="text"
                maxlength="40"
                [value]="form().code"
                (input)="set('code', $any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              inputId="ext-status"
              [label]="'documents.control.fields.status' | transloco"
            >
              <select id="ext-status" (change)="set('status', $any($event.target).value)">
                @for (s of statuses; track s) {
                  <option [value]="s" [selected]="s === form().status">
                    {{ 'documents.control.external.status.' + s | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field
              span="full"
              inputId="ext-url"
              [label]="'documents.control.external.fields.url' | transloco"
            >
              <input
                id="ext-url"
                type="url"
                maxlength="1000"
                placeholder="https://"
                [value]="form().url"
                (input)="set('url', $any($event.target).value)"
              />
            </app-form-field>
          </app-form-section>

          <app-form-section
            [title]="'documents.control.external.sections.care' | transloco"
            [description]="'documents.control.external.sections.careHint' | transloco"
          >
            <app-form-field
              inputId="ext-owner"
              [label]="'documents.control.fields.owner' | transloco"
            >
              <app-documents-person-select
                inputId="ext-owner"
                [value]="form().ownerId"
                [currentName]="ownerName()"
                (valueChange)="set('ownerId', $event)"
              />
            </app-form-field>
            <app-form-field
              inputId="ext-type"
              [label]="'documents.control.fields.type' | transloco"
            >
              <select id="ext-type" (change)="set('typeId', $any($event.target).value)">
                <option value="" [selected]="!form().typeId">
                  {{ 'documents.control.common.none' | transloco }}
                </option>
                @for (t of types(); track t.id) {
                  <option [value]="t.id" [selected]="t.id === form().typeId">{{ t.name }}</option>
                }
              </select>
            </app-form-field>
            <app-form-field
              inputId="ext-interval"
              [label]="'documents.control.fields.reviewInterval' | transloco"
            >
              <app-field-help
                label-suffix
                scope="documents"
                page="externalForm"
                field="reviewInterval"
                [label]="'documents.control.fields.reviewInterval' | transloco"
              />
              <input
                id="ext-interval"
                type="number"
                min="1"
                max="120"
                [value]="form().interval"
                (input)="set('interval', $any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              inputId="ext-next-review"
              [label]="'documents.control.fields.nextReview' | transloco"
            >
              <app-date-input
                inputId="ext-next-review"
                [value]="form().nextReview"
                (valueChange)="set('nextReview', $event ?? '')"
              />
            </app-form-field>
            <app-form-field
              span="full"
              inputId="ext-retention"
              [label]="'documents.control.fields.retentionRule' | transloco"
            >
              <select id="ext-retention" (change)="set('retentionId', $any($event.target).value)">
                <option value="" [selected]="!form().retentionId">
                  {{ 'documents.control.common.none' | transloco }}
                </option>
                @for (r of retentionRules(); track r.id) {
                  <option [value]="r.id" [selected]="r.id === form().retentionId">
                    {{ r.name }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field
              span="full"
              inputId="ext-notes"
              [label]="'documents.control.external.fields.notes' | transloco"
            >
              <textarea
                id="ext-notes"
                rows="3"
                [value]="form().notes"
                (input)="set('notes', $any($event.target).value)"
              ></textarea>
            </app-form-field>
          </app-form-section>

          @if (id()) {
            <app-form-section [columns]="1">
              <app-form-field
                inputId="ext-reason"
                [label]="'documents.control.fields.changeReason' | transloco"
              >
                <input
                  id="ext-reason"
                  type="text"
                  maxlength="2000"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
              </app-form-field>
            </app-form-section>
          }

          <app-form-actions>
            <app-button type="button" variant="secondary" (click)="cancel()">
              {{ 'documents.control.common.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              [disabled]="!form().title.trim()"
              [loading]="saving()"
              data-testid="external-save"
            >
              {{ 'documents.control.common.save' | transloco }}
            </app-button>
          </app-form-actions>
        </form>
      } @else if (!errorKey()) {
        <app-loading-state [rows]="6" />
      }
    </div>
  `,
})
export class ExternalFormPage {
  private readonly api = inject(DocumentControlApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  /** Set on `:id/edit`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly statuses = EXTERNAL_STATUSES;
  protected readonly form = signal<ExternalFormValue>(
    emptyExternalForm(this.auth.user()?.id ?? ''),
  );
  protected readonly ownerName = signal<string | null>(null);
  protected readonly changeReason = signal('');
  protected readonly types = signal<readonly DocumentType[]>([]);
  protected readonly retentionRules = signal<readonly RetentionRule[]>([]);
  protected readonly ready = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly titleKey = computed(() =>
    this.id() ? 'documents.control.external.editTitle' : 'documents.control.external.new',
  );

  protected readonly backLink = computed(() => {
    const id = this.id();
    return id ? ['/documents/external', id] : ['/documents/external'];
  });

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'external_document',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.form().title || this.language.translate('documents.control.external.new'),
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
    this.api.listTypes(orgId).subscribe({ next: (t) => this.types.set(t), error: () => undefined });
    this.api.listRetentionRules(orgId).subscribe({
      next: (r) => this.retentionRules.set(r.filter((x) => x.applies_to !== 'record')),
      error: () => undefined,
    });
    if (!id) {
      this.ready.set(true);
      return;
    }
    this.api.getExternal(orgId, id).subscribe({
      next: (row) => {
        this.form.set(externalToForm(row));
        this.ownerName.set(row.owner?.name ?? null);
        this.ready.set(true);
      },
      error: (e: unknown) => this.errorKey.set(documentControlErrorKey(e)),
    });
  }

  protected set<K extends keyof ExternalFormValue>(key: K, value: ExternalFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected cancel(): void {
    void this.router.navigate(this.backLink());
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    if (!orgId || this.saving() || !this.form().title.trim()) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    const body = externalBody(this.form());
    const id = this.id();
    const request = id
      ? this.api.updateExternal(orgId, id, {
          ...body,
          change_reason: textOrNull(this.changeReason()),
        })
      : this.api.createExternal(orgId, body);
    request.subscribe({
      next: (row) => {
        this.saving.set(false);
        this.toasts.success('documents.control.common.savedToast');
        void this.router.navigate(['/documents/external', row.id]);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }
}
