import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { allowedTargets, needsApproval } from '../data/supplier-display';
import { SUPPLIER_STATUSES, SupplierStatus } from '../data/supplier.models';

export interface StatusChange {
  readonly status: SupplierStatus;
  readonly reason: string;
}

/**
 * Change a supplier's status by hand, with a required reason. Statuses that need
 * approval rights (approved, conditional, suspended, rejected) are only offered to
 * users who may approve; normally approval comes from a decided evaluation.
 */
@Component({
  selector: 'app-supplier-status-dialog',
  imports: [TranslocoPipe, Alert, Button, FormField, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'suppliers.statusDialog.title' | transloco"
      [subtitle]="'suppliers.statusDialog.current' | transloco: { status: currentLabel() }"
      [closeLabel]="'common.cancel' | transloco"
      (closed)="cancelled.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); confirm()">
        <p class="text-[13px] text-fg-muted">{{ 'suppliers.statusDialog.hint' | transloco }}</p>
        <app-form-field [label]="'suppliers.statusDialog.newStatus' | transloco" inputId="sup-st">
          <select id="sup-st" (change)="target.set($any($event.target).value)">
            <option value="" [selected]="!target()">
              {{ 'suppliers.statusDialog.choose' | transloco }}
            </option>
            @for (s of targets(); track s) {
              <option [value]="s" [selected]="target() === s">
                {{ 'suppliers.status.' + s | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        @if (!canApprove()) {
          <p class="text-[12.5px] text-fg-subtle">
            {{ 'suppliers.statusDialog.approvalOnly' | transloco }}
          </p>
        } @else if (target() && approvalTarget()) {
          <app-alert tone="info">{{ 'suppliers.statusDialog.approvalNote' | transloco }}</app-alert>
        }
        <app-form-field [label]="'suppliers.statusDialog.reason' | transloco" inputId="sup-st-r">
          <textarea
            id="sup-st-r"
            rows="3"
            maxlength="2000"
            required
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
        @if (error(); as key) {
          <app-alert>{{ key | transloco }}</app-alert>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="ghost" (click)="cancelled.emit()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()" [disabled]="!valid()">
            {{ 'suppliers.statusDialog.confirm' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class SupplierStatusDialog {
  readonly open = input(false);
  readonly current = input.required<SupplierStatus>();
  readonly canApprove = input(false);
  readonly busy = input(false);
  /** i18n key of an error to show (from the failed request). */
  readonly error = input<string | null>(null);
  readonly confirmed = output<StatusChange>();
  readonly cancelled = output<void>();

  protected readonly target = signal<SupplierStatus | ''>('');
  protected readonly reason = signal('');
  private readonly language = inject(LanguageService);
  protected readonly currentLabel = computed(() =>
    this.language.translate(`suppliers.status.${this.current()}`),
  );
  protected readonly targets = computed(() =>
    allowedTargets(this.current(), SUPPLIER_STATUSES, this.canApprove()),
  );
  protected readonly approvalTarget = computed(() => {
    const t = this.target();
    return !!t && needsApproval(this.current(), t);
  });
  protected readonly valid = computed(() => !!this.target() && !!this.reason().trim());

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.target.set('');
          this.reason.set('');
        });
      }
    });
  }

  protected confirm(): void {
    const status = this.target();
    if (!status || !this.reason().trim()) {
      return;
    }
    this.confirmed.emit({ status, reason: this.reason().trim() });
  }
}
