import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AttachmentsApi } from '../../core/attachments/attachments-api';
import { Attachment } from '../../core/attachments/attachment.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { ContractsApi } from './data/contracts-api';
import { ContractVersion } from './data/contract.models';
import { contractErrorKey } from './data/contract-errors';

interface VersionDraft {
  readonly change_summary: string;
  readonly effective_date: string;
  readonly signed: boolean;
  readonly attachment_id: string;
}

const EMPTY: VersionDraft = {
  change_summary: '',
  effective_date: '',
  signed: false,
  attachment_id: '',
};

/**
 * Versions of a contract (newest first) and their signed copies. A signed copy is
 * an attachment of the contract (upload it in the Attachments tab), pinned to a
 * version here.
 */
@Component({
  selector: 'app-contract-versions',
  imports: [TranslocoPipe, FieldHelp, LocalDayPipe, Badge, Button, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-versions-h">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-versions-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'contracts.versions.title' | transloco }}
        </h2>
        @if (canEdit() && !adding()) {
          <app-button
            variant="ghost"
            size="sm"
            (click)="adding.set(true)"
            data-testid="version-add"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'contracts.versions.add' | transloco }}
          </app-button>
        }
      </div>
      <app-field-help scope="contracts" page="detail" field="versions" />

      @if (adding()) {
        <form
          class="my-3 grid grid-cols-1 gap-3 rounded-tile border border-border p-3 sm:grid-cols-2"
          (submit)="$event.preventDefault(); add()"
          data-testid="version-form"
        >
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'contracts.versions.changeSummary' | transloco"
              inputId="cf-v-summary"
            >
              <textarea
                id="cf-v-summary"
                rows="2"
                maxlength="5000"
                required
                [value]="draft().change_summary"
                (input)="patch({ change_summary: $any($event.target).value })"
              ></textarea>
            </app-form-field>
          </div>
          <app-form-field
            [label]="'contracts.versions.effectiveDate' | transloco"
            inputId="cf-v-effective"
          >
            <input
              id="cf-v-effective"
              type="date"
              [value]="draft().effective_date"
              (change)="patch({ effective_date: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field
            [label]="'contracts.versions.signedCopy' | transloco"
            inputId="cf-v-attachment"
          >
            <select
              id="cf-v-attachment"
              (change)="patch({ attachment_id: $any($event.target).value })"
            >
              <option value="" [selected]="!draft().attachment_id">
                {{ 'contracts.versions.noCopy' | transloco }}
              </option>
              @for (a of attachments(); track a.id) {
                <option [value]="a.id" [selected]="draft().attachment_id === a.id">
                  {{ a.filename }}
                </option>
              }
            </select>
          </app-form-field>
          <label class="flex items-center gap-2 text-[13.5px] text-fg sm:col-span-2">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="draft().signed"
              (change)="patch({ signed: $any($event.target).checked })"
            />
            {{ 'contracts.versions.signed' | transloco }}
          </label>
          @if (attachments().length === 0) {
            <p class="text-[12.5px] text-fg-muted sm:col-span-2">
              {{ 'contracts.versions.uploadHint' | transloco }}
            </p>
          }
          <div class="flex justify-end gap-2 sm:col-span-2">
            <app-button variant="ghost" size="sm" (click)="cancel()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              size="sm"
              [disabled]="!draft().change_summary.trim() || busy()"
              [loading]="busy()"
            >
              {{ 'contracts.versions.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @if (versions().length === 0) {
        <p class="text-[13px] text-fg-muted">{{ 'contracts.versions.none' | transloco }}</p>
      } @else {
        <ul class="divide-y divide-border rounded-tile border border-border">
          @for (v of versions(); track v.id) {
            <li class="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
              <span class="w-[48px] flex-none font-mono text-[13px] font-semibold text-fg">
                {{ 'contracts.versions.number' | transloco: { n: v.version_no } }}
              </span>
              <span class="min-w-0 flex-1 text-[13px]">
                <span class="block text-fg">{{ v.change_summary }}</span>
                <span class="block text-[12px] text-fg-subtle">
                  @if (v.effective_date) {
                    {{
                      'contracts.versions.effective'
                        | transloco: { date: (v.effective_date | localDay) }
                    }}
                    ·
                  }
                  {{ v.created_by?.name ?? '' }} · {{ v.created_at | localDay }}
                </span>
                @if (fileName(v.attachment_id); as name) {
                  <button
                    type="button"
                    class="mt-0.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"
                    (click)="download(v.attachment_id!)"
                  >
                    <app-icon name="documents" [size]="13" />
                    {{ name }}
                  </button>
                }
              </span>
              <span class="flex flex-wrap items-center gap-1.5">
                @if (v.signed) {
                  <app-badge tone="pass">{{
                    'contracts.versions.signedBadge' | transloco
                  }}</app-badge>
                } @else {
                  <app-badge tone="neutral">{{
                    'contracts.versions.unsigned' | transloco
                  }}</app-badge>
                }
                @if (canEdit()) {
                  @if (!v.signed) {
                    <app-button
                      variant="ghost"
                      size="sm"
                      [disabled]="busy()"
                      (click)="update(v, { signed: true })"
                    >
                      {{ 'contracts.versions.markSigned' | transloco }}
                    </app-button>
                  }
                  @if (!v.attachment_id && attachments().length) {
                    <label class="sr-only" [attr.for]="'cf-v-pin-' + v.id">
                      {{ 'contracts.versions.pinCopy' | transloco }}
                    </label>
                    <select
                      [id]="'cf-v-pin-' + v.id"
                      class="h-8 max-w-[180px] rounded-[8px] border border-border bg-bg px-2 text-[12.5px] text-fg"
                      (change)="pin(v, $any($event.target).value)"
                    >
                      <option value="">{{ 'contracts.versions.pinCopy' | transloco }}</option>
                      @for (a of attachments(); track a.id) {
                        <option [value]="a.id">{{ a.filename }}</option>
                      }
                    </select>
                  }
                }
              </span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ContractVersions {
  private readonly api = inject(ContractsApi);
  private readonly attachmentsApi = inject(AttachmentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly contractId = input.required<string>();
  readonly versions = input.required<readonly ContractVersion[]>();
  readonly attachments = input<readonly Attachment[]>([]);
  readonly canEdit = input(false);
  readonly changed = output<void>();

  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly draft = signal<VersionDraft>(EMPTY);
  private readonly names = computed(
    () => new Map(this.attachments().map((a) => [a.id, a.filename] as const)),
  );

  protected fileName(id: string | null): string | null {
    return id ? (this.names().get(id) ?? null) : null;
  }

  protected patch(value: Partial<VersionDraft>): void {
    this.draft.update((d) => ({ ...d, ...value }));
  }

  protected cancel(): void {
    this.adding.set(false);
    this.draft.set(EMPTY);
  }

  protected add(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d.change_summary.trim() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .addVersion(orgId, this.contractId(), {
        change_summary: d.change_summary.trim(),
        effective_date: d.effective_date || null,
        signed: d.signed,
        attachment_id: d.attachment_id || null,
      })
      .subscribe(this.done(() => this.cancel()));
  }

  protected pin(v: ContractVersion, attachmentId: string): void {
    if (attachmentId) {
      this.update(v, { attachment_id: attachmentId });
    }
  }

  protected update(v: ContractVersion, body: { signed?: boolean; attachment_id?: string }): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateVersion(orgId, this.contractId(), v.id, body).subscribe(this.done());
  }

  protected download(attachmentId: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.attachmentsApi.download(orgId, attachmentId).subscribe({
      next: (res) => globalThis.location?.assign(res.url),
      error: () => this.notifications.error('contracts.errors.downloadFailed'),
    });
  }

  private done(after?: () => void) {
    return {
      next: () => {
        this.busy.set(false);
        after?.();
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(contractErrorKey(error));
      },
    };
  }
}
