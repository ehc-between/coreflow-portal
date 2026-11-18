import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, of } from 'rxjs';
import { AttachmentsApi } from '../../../core/attachments/attachments-api';
import { Attachment } from '../../../core/attachments/attachment.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { CERTIFICATE_STANDARDS, CertificateIn, CertificateStandard } from '../data/supplier.models';

/** An empty certificate row. */
export function blankCertificate(): CertificateIn {
  return {
    standard: null,
    label: '',
    number: '',
    issuer: '',
    valid_until: '',
    attachment_id: null,
  };
}

/** Edit rows from the stored certificates (or the legacy free-text labels). */
export function certificateRows(
  certificates: readonly CertificateIn[] | undefined,
  legacy: readonly string[] | undefined,
): CertificateIn[] {
  if (certificates && certificates.length) {
    return certificates.map((c) => ({
      id: c.id ?? null,
      standard: c.standard ?? null,
      label: c.standard ? '' : (c.label ?? ''),
      number: c.number ?? '',
      issuer: c.issuer ?? '',
      valid_until: c.valid_until ?? '',
      attachment_id: c.attachment_id ?? null,
    }));
  }
  return (legacy ?? []).map((label) => ({ ...blankCertificate(), label }));
}

let nextId = 0;

/**
 * The supplier's certificates as structured rows: the standard (or another
 * certification by name), certificate number, issuer, valid-until date and the
 * certificate file (one of the files attached to the supplier). Expiry drives the
 * reminder and the "certificate expired / expiring" follow-up flags. Stateless: emits
 * the full list on every change.
 */
@Component({
  selector: 'app-supplier-certificates-editor',
  imports: [TranslocoPipe, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="flex flex-col gap-3" data-testid="certificate-rows">
      @for (c of rows(); track $index; let i = $index) {
        <li class="rounded-tile border border-border bg-bg p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-meta font-semibold text-fg-subtle">
              {{ 'suppliers.certificates.row' | transloco: { n: i + 1 } }}
            </span>
            <button
              type="button"
              class="rounded-tile p-1 text-fg-subtle hover:text-fail"
              [attr.aria-label]="'suppliers.certificates.remove' | transloco: { n: i + 1 }"
              (click)="remove(i)"
            >
              <app-icon name="trash" [size]="14" />
            </button>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-form-field
              [label]="'suppliers.certificates.standard' | transloco"
              [inputId]="id + '-std-' + i"
            >
              <select [id]="id + '-std-' + i" (change)="setStandard(i, $any($event.target).value)">
                <option value="" [selected]="!c.standard">
                  {{ 'suppliers.certificates.other' | transloco }}
                </option>
                @for (s of standards; track s) {
                  <option [value]="s" [selected]="c.standard === s">
                    {{ 'suppliers.certificates.standards.' + s | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            @if (!c.standard) {
              <app-form-field
                [label]="'suppliers.certificates.label' | transloco"
                [inputId]="id + '-label-' + i"
              >
                <input
                  [id]="id + '-label-' + i"
                  type="text"
                  maxlength="120"
                  [placeholder]="'suppliers.certificates.labelPlaceholder' | transloco"
                  [value]="c.label ?? ''"
                  (input)="patch(i, { label: $any($event.target).value })"
                />
              </app-form-field>
            }
            <app-form-field
              [label]="'suppliers.certificates.number' | transloco"
              [inputId]="id + '-no-' + i"
            >
              <input
                [id]="id + '-no-' + i"
                type="text"
                maxlength="100"
                [value]="c.number ?? ''"
                (input)="patch(i, { number: $any($event.target).value })"
              />
            </app-form-field>
            <app-form-field
              [label]="'suppliers.certificates.issuer' | transloco"
              [inputId]="id + '-iss-' + i"
            >
              <input
                [id]="id + '-iss-' + i"
                type="text"
                maxlength="200"
                [placeholder]="'suppliers.certificates.issuerPlaceholder' | transloco"
                [value]="c.issuer ?? ''"
                (input)="patch(i, { issuer: $any($event.target).value })"
              />
            </app-form-field>
            <app-form-field
              [label]="'suppliers.certificates.validUntilField' | transloco"
              [inputId]="id + '-until-' + i"
            >
              <input
                [id]="id + '-until-' + i"
                type="date"
                [attr.lang]="lang()"
                [value]="c.valid_until ?? ''"
                (input)="patch(i, { valid_until: $any($event.target).value })"
              />
            </app-form-field>
            <app-form-field
              [label]="'suppliers.certificates.file' | transloco"
              [inputId]="id + '-file-' + i"
            >
              @if (supplierId()) {
                <select
                  [id]="id + '-file-' + i"
                  (change)="patch(i, { attachment_id: $any($event.target).value || null })"
                >
                  <option value="" [selected]="!c.attachment_id">
                    {{ 'suppliers.certificates.noFile' | transloco }}
                  </option>
                  @for (a of attachments(); track a.id) {
                    <option [value]="a.id" [selected]="c.attachment_id === a.id">
                      {{ a.filename }}
                    </option>
                  }
                </select>
              } @else {
                <p [id]="id + '-file-' + i" class="text-meta text-fg-subtle">
                  {{ 'suppliers.certificates.fileAfterCreate' | transloco }}
                </p>
              }
            </app-form-field>
          </div>
        </li>
      }
    </ul>
    @if (supplierId() && attachments().length === 0 && rows().length > 0) {
      <p class="mt-2 text-meta text-fg-subtle">
        {{ 'suppliers.certificates.noFilesYet' | transloco }}
      </p>
    }
    <button
      type="button"
      class="mt-3 inline-flex items-center gap-1.5 rounded-tile px-3 py-1.5 text-ui font-semibold text-accent hover:bg-accent-soft"
      (click)="add()"
      data-testid="certificate-add"
    >
      <app-icon name="plus" [size]="14" />
      {{ 'suppliers.certificates.add' | transloco }}
    </button>
  `,
})
export class SupplierCertificatesEditor {
  private readonly attachmentsApi = inject(AttachmentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  readonly rows = input.required<readonly CertificateIn[]>();
  /** The supplier being edited (files can only be picked once it exists). */
  readonly supplierId = input<string | null>(null);
  readonly rowsChange = output<CertificateIn[]>();

  protected readonly id = `sup-cert-${++nextId}`;
  protected readonly standards = CERTIFICATE_STANDARDS;
  protected readonly attachments = signal<readonly Attachment[]>([]);
  protected readonly lang = () => (this.language.active() === 'nb' ? 'nb' : 'en');

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const supplierId = this.supplierId();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId || !supplierId) {
          this.attachments.set([]);
          return;
        }
        this.request = this.attachmentsApi
          .list(orgId, 'supplier', supplierId)
          .pipe(catchError(() => of([])))
          .subscribe((list) => this.attachments.set(list));
      });
    });
  }

  protected setStandard(index: number, value: string): void {
    const standard = (value || null) as CertificateStandard | null;
    this.patch(index, standard ? { standard, label: '' } : { standard: null });
  }

  protected patch(index: number, change: Partial<CertificateIn>): void {
    const next = [...this.rows()];
    next[index] = { ...next[index], ...change };
    this.rowsChange.emit(next);
  }

  protected remove(index: number): void {
    this.rowsChange.emit(this.rows().filter((_, i) => i !== index));
  }

  protected add(): void {
    this.rowsChange.emit([...this.rows(), blankCertificate()]);
  }
}
