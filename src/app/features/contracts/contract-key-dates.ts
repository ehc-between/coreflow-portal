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
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { ContractsApi } from './data/contracts-api';
import { KEY_DATE_KINDS, KeyDate, KeyDateKind } from './data/contract.models';
import { contractErrorKey } from './data/contract-errors';

interface KeyDateDraft {
  readonly kind: KeyDateKind;
  readonly label: string;
  readonly due_date: string;
  readonly notes: string;
}

const EMPTY: KeyDateDraft = { kind: 'renewal', label: '', due_date: '', notes: '' };

/**
 * Key dates of a contract (renewal, notice, review, payment, milestones…). Open
 * dates feed the reminder scan; done ones stay for the record.
 */
@Component({
  selector: 'app-contract-key-dates',
  imports: [TranslocoPipe, FieldHelp, LocalDayPipe, Badge, Button, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-keydates-h">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-keydates-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'contracts.keyDates.title' | transloco }}
        </h2>
        @if (canEdit() && !adding()) {
          <app-button
            variant="ghost"
            size="sm"
            (click)="adding.set(true)"
            data-testid="keydate-add"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'contracts.keyDates.add' | transloco }}
          </app-button>
        }
      </div>
      <app-field-help scope="contracts" page="detail" field="key_dates" />

      @if (adding()) {
        <form
          class="my-3 grid grid-cols-1 gap-3 rounded-tile border border-border p-3 sm:grid-cols-3"
          (submit)="$event.preventDefault(); add()"
          data-testid="keydate-form"
        >
          <app-form-field [label]="'contracts.keyDates.kind' | transloco" inputId="cf-kd-kind">
            <select id="cf-kd-kind" (change)="patch({ kind: $any($event.target).value })">
              @for (k of kinds; track k) {
                <option [value]="k" [selected]="draft().kind === k">
                  {{ 'contracts.deadlineKinds.' + k | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'contracts.keyDates.label' | transloco" inputId="cf-kd-label">
            <input
              id="cf-kd-label"
              type="text"
              maxlength="255"
              required
              [value]="draft().label"
              (input)="patch({ label: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field [label]="'contracts.keyDates.dueDate' | transloco" inputId="cf-kd-due">
            <input
              id="cf-kd-due"
              type="date"
              required
              [value]="draft().due_date"
              (change)="patch({ due_date: $any($event.target).value })"
            />
          </app-form-field>
          <div class="sm:col-span-3">
            <app-form-field [label]="'contracts.keyDates.notes' | transloco" inputId="cf-kd-notes">
              <input
                id="cf-kd-notes"
                type="text"
                maxlength="5000"
                [value]="draft().notes"
                (input)="patch({ notes: $any($event.target).value })"
              />
            </app-form-field>
          </div>
          <div class="flex justify-end gap-2 sm:col-span-3">
            <app-button variant="ghost" size="sm" (click)="cancel()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button type="submit" size="sm" [disabled]="!valid() || busy()" [loading]="busy()">
              {{ 'contracts.keyDates.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @if (keyDates().length === 0) {
        <p class="text-[13px] text-fg-muted">{{ 'contracts.keyDates.none' | transloco }}</p>
      } @else {
        <ul class="divide-y divide-border rounded-tile border border-border">
          @for (k of sorted(); track k.id) {
            <li
              class="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
              [class.opacity-60]="!!k.done_at"
            >
              <span
                class="w-[120px] flex-none text-[13px] font-semibold"
                [class.text-fail]="k.overdue && !k.done_at"
              >
                {{ k.due_date | localDay }}
              </span>
              <span class="min-w-0 flex-1 text-[13px] text-fg">
                <span [class.line-through]="!!k.done_at">{{ k.label }}</span>
                <span class="ml-2 text-[12px] text-fg-subtle">
                  {{ 'contracts.deadlineKinds.' + k.kind | transloco }}
                </span>
                @if (k.notes) {
                  <span class="block text-[12px] text-fg-muted">{{ k.notes }}</span>
                }
              </span>
              <span class="flex items-center gap-1">
                @if (k.done_at) {
                  <app-badge tone="pass">{{ 'contracts.keyDates.done' | transloco }}</app-badge>
                } @else if (k.overdue) {
                  <app-badge tone="fail">{{ 'contracts.common.overdue' | transloco }}</app-badge>
                }
                @if (canEdit()) {
                  <app-button variant="ghost" size="sm" [disabled]="busy()" (click)="toggleDone(k)">
                    {{
                      (k.done_at ? 'contracts.keyDates.reopen' : 'contracts.keyDates.markDone')
                        | transloco
                    }}
                  </app-button>
                  <app-button variant="ghost" size="sm" [disabled]="busy()" (click)="remove(k)">
                    <app-icon name="trash" [size]="14" />
                    <span class="sr-only">
                      {{ 'contracts.keyDates.removeNamed' | transloco: { label: k.label } }}
                    </span>
                  </app-button>
                }
              </span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ContractKeyDates {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly contractId = input.required<string>();
  readonly keyDates = input.required<readonly KeyDate[]>();
  readonly canEdit = input(false);
  readonly changed = output<void>();

  protected readonly kinds = KEY_DATE_KINDS;
  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly draft = signal<KeyDateDraft>(EMPTY);
  protected readonly valid = computed(
    () => !!this.draft().label.trim() && /^\d{4}-\d{2}-\d{2}$/.test(this.draft().due_date),
  );
  protected readonly sorted = computed(() =>
    [...this.keyDates()].sort(
      (a, b) => Number(!!a.done_at) - Number(!!b.done_at) || a.due_date.localeCompare(b.due_date),
    ),
  );

  protected patch(value: Partial<KeyDateDraft>): void {
    this.draft.update((d) => ({ ...d, ...value }));
  }

  protected cancel(): void {
    this.adding.set(false);
    this.draft.set(EMPTY);
  }

  protected add(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !this.valid() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .addKeyDate(orgId, this.contractId(), {
        kind: d.kind,
        label: d.label.trim(),
        due_date: d.due_date,
        notes: d.notes.trim() || null,
      })
      .subscribe(this.done(() => this.cancel()));
  }

  protected toggleDone(k: KeyDate): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .updateKeyDate(orgId, this.contractId(), k.id, { done: !k.done_at })
      .subscribe(this.done());
  }

  protected remove(k: KeyDate): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.removeKeyDate(orgId, this.contractId(), k.id).subscribe(this.done());
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
