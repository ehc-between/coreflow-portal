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
import { LanguageService } from '../../../core/i18n/language.service';
import { AuditAccess } from '../data/audit-access';
import { fromDateInput, textOrNull, toDateInput } from '../data/audit-display';
import { AuditFrameworks } from '../data/audit-frameworks';
import {
  CERTIFICATION_STATUSES,
  CertificationDetail,
  CertificationInput,
  CertificationStatus,
  EntityRef,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditField } from '../shared/audit-field';
import { AuditFormPage } from '../shared/form-page';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditRecordSelect } from '../shared/record-picker';
import { AuditUserSelect } from '../shared/user-select';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormSection } from '../../../shared/ui/form-section/form-section';

export interface CertificationFormValue {
  framework: string;
  supplier: EntityRef | null;
  body: string;
  number: string;
  status: CertificationStatus;
  scope: string;
  notes: string;
  issued: string;
  expires: string;
  surveillance: string;
  ownerId: string;
  changeReason: string;
}

export function certificationFormToInput(
  v: CertificationFormValue,
  editing: boolean,
): CertificationInput {
  return {
    framework: v.framework,
    supplier_id: v.supplier?.entity_id ?? null,
    // Without a body name the backend uses the supplier's name.
    certification_body: textOrNull(v.body),
    certificate_number: textOrNull(v.number),
    status: v.status,
    scope: textOrNull(v.scope),
    notes: textOrNull(v.notes),
    issued_at: fromDateInput(v.issued),
    expires_at: fromDateInput(v.expires),
    next_surveillance_at: fromDateInput(v.surveillance),
    owner_user_id: v.ownerId || null,
    ...(editing ? { change_reason: textOrNull(v.changeReason) } : {}),
  };
}

/**
 * `/audits/certifications/new` and `/:id/edit`: a certificate of a certifiable ISO
 * standard, its certification body (picked from Suppliers, or typed), and the
 * cycle dates.
 */
@Component({
  selector: 'app-audit-certification-form',
  imports: [
    FormSection,
    DateInput,
    TranslocoPipe,
    AuditField,
    AuditFormPage,
    AuditRecordSelect,
    AuditUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-audit-form-page
      [titleKey]="id() ? 'audits.certificationForm.editTitle' : 'audits.certificationForm.newTitle'"
      guidePage="certificationForm"
      [breadcrumbs]="breadcrumbs()"
      [busy]="saving.busy()"
      [canSave]="valid()"
      invalidKey="audits.certificationForm.fix"
      [ready]="!id() || existing.state() === 'ready'"
      (save)="save()"
      (cancelled)="back()"
    >
      <app-form-section
        [title]="'audits.certificationForm.sections.basics' | transloco"
        [description]="'audits.certificationForm.sections.basicsHint' | transloco"
      >
        <app-audit-field
          inputId="cert-framework"
          labelKey="audits.fields.framework"
          [required]="true"
          helpPage="certificationForm"
          helpField="framework"
        >
          <select id="cert-framework" (change)="patch({ framework: $any($event.target).value })">
            @for (k of frameworkOptions(); track k) {
              <option [value]="k" [selected]="f().framework === k">
                {{ 'audits.frameworks.' + k | transloco }}
              </option>
            }
          </select>
        </app-audit-field>
        <app-audit-field
          inputId="cert-status"
          labelKey="audits.fields.status"
          helpPage="certificationForm"
          helpField="status"
        >
          <select id="cert-status" (change)="patch({ status: $any($event.target).value })">
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="f().status === s">
                {{ 'audits.certificationStatus.' + s | transloco }}
              </option>
            }
          </select>
        </app-audit-field>
        <app-audit-field
          span="full"
          inputId="cert-supplier"
          labelKey="audits.certificationForm.supplier"
          helpPage="certificationForm"
          helpField="supplier"
          [plain]="true"
        >
          <app-audit-record-select
            inputId="cert-supplier"
            [types]="['supplier']"
            [max]="1"
            labelKey="audits.certificationForm.supplier"
            placeholderKey="audits.certificationForm.searchSupplier"
            [value]="f().supplier ? [f().supplier!] : []"
            (valueChange)="setSupplier($event[0] ?? null)"
          />
        </app-audit-field>
        <app-audit-field
          inputId="cert-body"
          labelKey="audits.fields.certificationBody"
          [required]="!f().supplier"
          helpPage="certificationForm"
          helpField="body"
        >
          <input
            id="cert-body"
            maxlength="200"
            [attr.aria-required]="!f().supplier"
            [value]="f().body"
            (input)="patch({ body: $any($event.target).value })"
          />
        </app-audit-field>
        <app-audit-field inputId="cert-number" labelKey="audits.fields.certificateNumber">
          <input
            id="cert-number"
            maxlength="100"
            [value]="f().number"
            (input)="patch({ number: $any($event.target).value })"
          />
        </app-audit-field>
        <app-audit-field
          span="full"
          inputId="cert-scope"
          labelKey="audits.fields.scope"
          helpPage="certificationForm"
          helpField="scope"
        >
          <textarea
            id="cert-scope"
            rows="3"
            [value]="f().scope"
            (input)="patch({ scope: $any($event.target).value })"
          ></textarea>
        </app-audit-field>
        <app-audit-field inputId="cert-owner" labelKey="audits.fields.owner">
          <app-audit-user-select
            inputId="cert-owner"
            [value]="f().ownerId"
            [currentName]="existing.value()?.owner?.name ?? null"
            (valueChange)="patch({ ownerId: $event })"
          />
        </app-audit-field>
      </app-form-section>

      <app-form-section
        [title]="'audits.certificationForm.sections.dates' | transloco"
        [description]="'audits.certificationForm.sections.datesHint' | transloco"
      >
        <app-audit-field inputId="cert-issued" labelKey="audits.fields.issuedAt">
          <app-date-input
            inputId="cert-issued"
            [value]="f().issued"
            (valueChange)="patch({ issued: $event ?? '' })"
          />
        </app-audit-field>
        <app-audit-field inputId="cert-expires" labelKey="audits.fields.expiresAt">
          <app-date-input
            inputId="cert-expires"
            [value]="f().expires"
            (valueChange)="patch({ expires: $event ?? '' })"
          />
        </app-audit-field>
        <app-audit-field
          inputId="cert-surv"
          labelKey="audits.certification.nextSurveillance"
          helpPage="certificationForm"
          helpField="surveillance"
        >
          <app-date-input
            inputId="cert-surv"
            [value]="f().surveillance"
            (valueChange)="patch({ surveillance: $event ?? '' })"
          />
        </app-audit-field>
        <app-audit-field span="full" inputId="cert-notes" labelKey="audits.fields.notes">
          <textarea
            id="cert-notes"
            rows="2"
            [value]="f().notes"
            (input)="patch({ notes: $any($event.target).value })"
          ></textarea>
        </app-audit-field>
      </app-form-section>
      @if (id()) {
        <app-form-section [columns]="1">
          <app-audit-field inputId="cert-reason" labelKey="audits.fields.changeReason">
            <input
              id="cert-reason"
              maxlength="2000"
              [value]="f().changeReason"
              (input)="patch({ changeReason: $any($event.target).value })"
            />
          </app-audit-field>
        </app-form-section>
      }
    </app-audit-form-page>
  `,
})
export class CertificationForm {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly access = inject(AuditAccess);
  private readonly frameworks = inject(AuditFrameworks);
  private readonly language = inject(LanguageService);

  readonly id = input<string | undefined>(undefined);

  protected readonly statuses = CERTIFICATION_STATUSES;
  protected readonly lang = this.language.active;
  protected readonly existing = loadable<CertificationDetail>();
  protected readonly saving = mutator();
  protected readonly f = signal<CertificationFormValue>({
    framework: 'iso9001',
    supplier: null,
    body: '',
    number: '',
    status: 'planned',
    scope: '',
    notes: '',
    issued: '',
    expires: '',
    surveillance: '',
    ownerId: '',
    changeReason: '',
  });
  protected readonly frameworkOptions = computed(() =>
    this.frameworks.certifiable(this.f().framework || null),
  );
  protected readonly valid = computed(
    () => (!!this.f().body.trim() || !!this.f().supplier) && !!this.f().framework,
  );
  protected readonly breadcrumbs = computed(() => {
    const id = this.id();
    return [
      { labelKey: 'modules.names.audits', link: '/audits' },
      { labelKey: 'audits.certifications.title', link: '/audits/certifications' },
      {
        labelKey: id ? 'audits.certificationForm.editTitle' : 'audits.certificationForm.newTitle',
      },
    ];
  });

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_certification',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
    }));
    effect(() => {
      const orgId = this.access.orgId();
      const id = this.id();
      untracked(() => orgId && id && this.existing.load(this.api.getCertification(orgId, id)));
    });
    effect(() => {
      const c = this.existing.value();
      if (c) {
        untracked(() =>
          this.f.set({
            framework: c.framework,
            supplier: c.supplier ?? null,
            body: c.certification_body,
            number: c.certificate_number ?? '',
            status: c.status,
            scope: c.scope ?? '',
            notes: c.notes ?? '',
            issued: toDateInput(c.issued_at),
            expires: toDateInput(c.expires_at),
            surveillance: toDateInput(c.next_surveillance_at),
            ownerId: c.owner?.id ?? '',
            changeReason: '',
          }),
        );
      }
    });
  }

  protected patch(change: Partial<CertificationFormValue>): void {
    this.f.update((v) => ({ ...v, ...change }));
  }

  /** Picking a supplier fills the body name when it is still empty. */
  protected setSupplier(supplier: EntityRef | null): void {
    this.f.update((v) => ({
      ...v,
      supplier,
      body: supplier && !v.body.trim() ? supplier.title : v.body,
    }));
  }

  protected save(): void {
    const orgId = this.access.orgId();
    if (!orgId || !this.valid()) {
      return;
    }
    const id = this.id();
    const body = certificationFormToInput(this.f(), !!id);
    this.saving.run(
      id
        ? this.api.updateCertification(orgId, id, body)
        : this.api.createCertification(orgId, body),
      {
        success: id ? 'audits.notices.saved' : 'audits.notices.certificationCreated',
        next: (c) => void this.router.navigate(['/audits/certifications', c.id]),
      },
    );
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/audits/certifications', id] : ['/audits/certifications']);
  }
}
