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
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AuditAccess } from '../data/audit-access';
import { fromDateInput, textOrNull, toDateInput } from '../data/audit-display';
import {
  CERTIFICATION_STATUSES,
  CertificationDetail,
  CertificationInput,
  CertificationStatus,
  FRAMEWORKS,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditFormPage } from '../shared/form-page';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditUserSelect } from '../shared/user-select';

export interface CertificationFormValue {
  framework: string;
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
    certification_body: v.body.trim(),
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

/** `/audits/certifications/new` and `/:id/edit`: a certificate and its cycle dates. */
@Component({
  selector: 'app-audit-certification-form',
  imports: [TranslocoPipe, FormField, FieldHelp, AuditFormPage, AuditUserSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-audit-form-page
      [titleKey]="id() ? 'audits.certificationForm.editTitle' : 'audits.certificationForm.newTitle'"
      guidePage="certificationForm"
      [backLink]="id() ? ['/audits/certifications', id()] : '/audits/certifications'"
      [busy]="saving.busy()"
      [canSave]="valid()"
      [ready]="!id() || existing.state() === 'ready'"
      (save)="save()"
      (cancelled)="back()"
    >
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <app-form-field [label]="'audits.fields.framework' | transloco" inputId="cert-framework">
          <select id="cert-framework" (change)="patch({ framework: $any($event.target).value })">
            @for (k of frameworks; track k) {
              <option [value]="k" [selected]="f().framework === k">
                {{ 'audits.frameworks.' + k | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'audits.fields.status' | transloco" inputId="cert-status">
          <select id="cert-status" (change)="patch({ status: $any($event.target).value })">
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="f().status === s">
                {{ 'audits.certificationStatus.' + s | transloco }}
              </option>
            }
          </select>
          <app-field-help scope="audits" page="certificationForm" field="status" />
        </app-form-field>
        <app-form-field [label]="'audits.fields.certificationBody' | transloco" inputId="cert-body">
          <input
            id="cert-body"
            required
            aria-required="true"
            maxlength="200"
            [value]="f().body"
            (input)="patch({ body: $any($event.target).value })"
          />
          <app-field-help scope="audits" page="certificationForm" field="body" />
        </app-form-field>
        <app-form-field
          [label]="'audits.fields.certificateNumber' | transloco"
          inputId="cert-number"
        >
          <input
            id="cert-number"
            maxlength="100"
            [value]="f().number"
            (input)="patch({ number: $any($event.target).value })"
          />
        </app-form-field>
      </div>
      <app-form-field [label]="'audits.fields.scope' | transloco" inputId="cert-scope">
        <textarea
          id="cert-scope"
          rows="3"
          [value]="f().scope"
          (input)="patch({ scope: $any($event.target).value })"
        ></textarea>
        <app-field-help scope="audits" page="certificationForm" field="scope" />
      </app-form-field>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <app-form-field [label]="'audits.fields.issuedAt' | transloco" inputId="cert-issued">
          <input
            id="cert-issued"
            type="date"
            [value]="f().issued"
            (input)="patch({ issued: $any($event.target).value })"
          />
        </app-form-field>
        <app-form-field
          [label]="'audits.certification.nextSurveillance' | transloco"
          inputId="cert-surv"
        >
          <input
            id="cert-surv"
            type="date"
            [value]="f().surveillance"
            (input)="patch({ surveillance: $any($event.target).value })"
          />
          <app-field-help scope="audits" page="certificationForm" field="surveillance" />
        </app-form-field>
        <app-form-field [label]="'audits.fields.expiresAt' | transloco" inputId="cert-expires">
          <input
            id="cert-expires"
            type="date"
            [value]="f().expires"
            (input)="patch({ expires: $any($event.target).value })"
          />
        </app-form-field>
      </div>
      <app-form-field [label]="'audits.fields.owner' | transloco" inputId="cert-owner">
        <app-audit-user-select
          inputId="cert-owner"
          [value]="f().ownerId"
          [currentName]="existing.value()?.owner?.name ?? null"
          (valueChange)="patch({ ownerId: $event })"
        />
      </app-form-field>
      <app-form-field [label]="'audits.fields.notes' | transloco" inputId="cert-notes">
        <textarea
          id="cert-notes"
          rows="2"
          [value]="f().notes"
          (input)="patch({ notes: $any($event.target).value })"
        ></textarea>
      </app-form-field>
      @if (id()) {
        <app-form-field [label]="'audits.fields.changeReason' | transloco" inputId="cert-reason">
          <input
            id="cert-reason"
            maxlength="2000"
            [value]="f().changeReason"
            (input)="patch({ changeReason: $any($event.target).value })"
          />
        </app-form-field>
      }
    </app-audit-form-page>
  `,
})
export class CertificationForm {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly access = inject(AuditAccess);

  readonly id = input<string | undefined>(undefined);

  protected readonly frameworks = FRAMEWORKS;
  protected readonly statuses = CERTIFICATION_STATUSES;
  protected readonly existing = loadable<CertificationDetail>();
  protected readonly saving = mutator();
  protected readonly f = signal<CertificationFormValue>({
    framework: 'iso9001',
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
  protected readonly valid = computed(() => !!this.f().body.trim() && !!this.f().framework);

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
