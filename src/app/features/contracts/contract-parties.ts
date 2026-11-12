import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { ContractsApi } from './data/contracts-api';
import { PARTY_ROLES, Party, PartyIn, PartyRole } from './data/contract.models';
import { contractErrorKey } from './data/contract-errors';
import { MAX_PARTIES, PartyDraft, emptyParty } from './data/contract-form-model';

function draftOf(p: Party): PartyDraft {
  return {
    name: p.name,
    role: p.role,
    is_internal: p.is_internal,
    org_number: p.org_number ?? '',
    contact_name: p.contact_name ?? '',
    contact_email: p.contact_email ?? '',
  };
}

function toPartyIn(d: PartyDraft): PartyIn {
  return {
    name: d.name.trim(),
    role: d.role,
    is_internal: d.is_internal,
    org_number: d.org_number.trim() || null,
    contact_name: d.contact_name.trim() || null,
    contact_email: d.contact_email.trim() || null,
  };
}

/** The parties to a contract, with add / edit / remove for editors. */
@Component({
  selector: 'app-contract-parties',
  imports: [TranslocoPipe, Badge, Button, ConfirmDialog, FormField, Icon, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="'cf-parties-h'">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-parties-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'contracts.parties.title' | transloco }}
        </h2>
        @if (canEdit() && parties().length < maxParties) {
          <app-button variant="ghost" size="sm" (click)="openNew()" data-testid="party-add">
            <app-icon name="plus" [size]="14" />
            {{ 'contracts.parties.add' | transloco }}
          </app-button>
        }
      </div>
      @if (parties().length === 0) {
        <p class="text-[13px] text-fg-muted">{{ 'contracts.parties.none' | transloco }}</p>
      } @else {
        <ul class="divide-y divide-border rounded-tile border border-border">
          @for (p of parties(); track p.id) {
            <li class="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-fg">
                  {{ p.name }}
                  <app-badge tone="neutral">{{
                    'contracts.partyRoles.' + p.role | transloco
                  }}</app-badge>
                  @if (p.is_internal) {
                    <app-badge tone="accent">{{
                      'contracts.parties.internal' | transloco
                    }}</app-badge>
                  }
                </span>
                <span class="block text-[12px] text-fg-subtle">
                  @if (p.org_number) {
                    {{ 'contracts.parties.orgNumberValue' | transloco: { value: p.org_number } }}
                  }
                  @if (p.contact_name || p.contact_email) {
                    · {{ p.contact_name ?? '' }} {{ p.contact_email ?? '' }}
                  }
                </span>
              </span>
              @if (canEdit()) {
                <span class="flex gap-1">
                  <app-button variant="ghost" size="sm" (click)="openEdit(p)">
                    {{ 'contracts.common.edit' | transloco }}
                  </app-button>
                  <app-button variant="ghost" size="sm" (click)="removing.set(p)">
                    <app-icon name="trash" [size]="14" />
                    <span class="sr-only">
                      {{ 'contracts.parties.removeNamed' | transloco: { name: p.name } }}
                    </span>
                  </app-button>
                </span>
              }
            </li>
          }
        </ul>
      }
    </section>

    <app-slide-over
      [open]="editing() !== null"
      [title]="
        (editingId() ? 'contracts.parties.editTitle' : 'contracts.parties.addTitle') | transloco
      "
      [closeLabel]="'common.cancel' | transloco"
      (closed)="close()"
    >
      @if (editing(); as d) {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
          <app-form-field [label]="'contracts.parties.name' | transloco" inputId="cf-party-name">
            <input
              id="cf-party-name"
              type="text"
              maxlength="255"
              required
              [value]="d.name"
              (input)="patch({ name: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field [label]="'contracts.parties.role' | transloco" inputId="cf-party-role">
            <select id="cf-party-role" (change)="patch({ role: $any($event.target).value })">
              @for (r of roles; track r) {
                <option [value]="r" [selected]="d.role === r">
                  {{ 'contracts.partyRoles.' + r | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <label class="flex items-center gap-2 text-[13.5px] text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="d.is_internal"
              (change)="patch({ is_internal: $any($event.target).checked })"
            />
            {{ 'contracts.parties.isInternal' | transloco }}
          </label>
          <app-form-field
            [label]="'contracts.parties.orgNumber' | transloco"
            inputId="cf-party-org"
          >
            <input
              id="cf-party-org"
              type="text"
              maxlength="64"
              [value]="d.org_number"
              (input)="patch({ org_number: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field
            [label]="'contracts.parties.contactName' | transloco"
            inputId="cf-party-contact"
          >
            <input
              id="cf-party-contact"
              type="text"
              maxlength="255"
              [value]="d.contact_name"
              (input)="patch({ contact_name: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field
            [label]="'contracts.parties.contactEmail' | transloco"
            inputId="cf-party-email"
          >
            <input
              id="cf-party-email"
              type="email"
              maxlength="320"
              [value]="d.contact_email"
              (input)="patch({ contact_email: $any($event.target).value })"
            />
          </app-form-field>
          <div class="flex justify-end gap-2">
            <app-button variant="ghost" (click)="close()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="busy()" [disabled]="busy() || !d.name.trim()">
              {{ 'common.save' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-slide-over>

    <app-confirm-dialog
      [open]="removing() !== null"
      [title]="'contracts.parties.removeTitle' | transloco"
      [message]="removeMessage()"
      [confirmLabel]="'contracts.parties.remove' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
  `,
})
export class ContractParties {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly contractId = input.required<string>();
  readonly parties = input.required<readonly Party[]>();
  readonly canEdit = input(false);
  readonly changed = output<void>();

  protected readonly roles = PARTY_ROLES;
  protected readonly maxParties = MAX_PARTIES;
  protected readonly editing = signal<PartyDraft | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly removing = signal<Party | null>(null);
  protected readonly busy = signal(false);

  protected removeMessage(): string {
    const p = this.removing();
    return p ? this.language.translate('contracts.parties.removeMessage', { name: p.name }) : '';
  }

  protected openNew(): void {
    this.editingId.set(null);
    this.editing.set(emptyParty({ is_internal: this.parties().length === 0 }));
  }

  protected openEdit(p: Party): void {
    this.editingId.set(p.id);
    this.editing.set(draftOf(p));
  }

  protected close(): void {
    this.editing.set(null);
    this.editingId.set(null);
  }

  protected patch(value: Partial<PartyDraft> & { role?: PartyRole }): void {
    const d = this.editing();
    if (d) {
      this.editing.set({ ...d, ...value });
    }
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.editing();
    if (!orgId || !d || !d.name.trim() || this.busy()) {
      return;
    }
    const id = this.editingId();
    const body = toPartyIn(d);
    const request = id
      ? this.api.updateParty(orgId, this.contractId(), id, body)
      : this.api.addParty(orgId, this.contractId(), body);
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.close();
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(contractErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.removing();
    if (!orgId || !p) {
      return;
    }
    this.busy.set(true);
    this.api.removeParty(orgId, this.contractId(), p.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(contractErrorKey(error));
      },
    });
  }
}
