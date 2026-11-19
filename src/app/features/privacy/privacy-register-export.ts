import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { Output } from '../../core/outputs/outputs.models';
import { GenerateDialog } from '../../shared/outputs/generate-dialog';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { RegisterKey } from './data/privacy-registers';

/** The backend `report_registers` key of each privacy register (U12: all nine). */
export const REPORT_REGISTER: Readonly<Record<RegisterKey, string>> = {
  ropa: 'processing_records',
  dpia: 'dpias',
  dsr: 'data_subject_requests',
  breach: 'data_breaches',
  processor: 'processors',
  transfer: 'transfer_assessments',
  retention: 'retention_schedules',
  consent: 'consent_records',
  lba: 'legal_basis_assessments',
};

/** Registers whose export accepts a status filter (the others export every status). */
const STATUS_FILTER: ReadonlySet<RegisterKey> = new Set([
  'processor',
  'transfer',
  'retention',
  'consent',
  'lba',
]);

/** The export filters for a list: its search text and, where accepted, its statuses. */
export function exportFilters(
  register: RegisterKey,
  q: string,
  statuses: readonly string[],
): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (q.trim()) {
    filters['q'] = q.trim();
  }
  if (STATUS_FILTER.has(register) && statuses.length > 0) {
    filters['status'] = [...statuses];
  }
  return filters;
}

/**
 * "Eksporter" on every privacy list (principle 7): the list with its current search
 * and filter, as Excel, CSV or PDF, through the output platform (stored, versioned and
 * audit-logged; nb/en chosen in the dialog).
 *
 *   <app-privacy-register-export secondary register="ropa" [q]="q()" [statuses]="s" />
 */
@Component({
  selector: 'app-privacy-register-export',
  imports: [TranslocoPipe, Button, Icon, GenerateDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-button
      variant="secondary"
      size="sm"
      [disabled]="busy()"
      [attr.title]="'privacy.export.listTitle' | transloco"
      (click)="open()"
      data-testid="privacy-list-export"
    >
      <app-icon name="upload" [size]="14" />
      {{ 'privacy.export.list' | transloco }}
    </app-button>
    @if (output(); as o) {
      <app-generate-dialog
        [open]="true"
        [output]="o"
        [filters]="filters()"
        (closed)="output.set(null)"
      />
    }
  `,
})
export class PrivacyRegisterExport {
  private readonly api = inject(OutputsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  readonly register = input.required<RegisterKey>();
  readonly q = input('');
  readonly statuses = input<readonly string[]>([]);

  protected readonly output = signal<Output | null>(null);
  protected readonly busy = signal(false);
  protected readonly filters = computed(() =>
    exportFilters(this.register(), this.q(), this.statuses()),
  );
  private sub: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected open(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.sub?.unsubscribe();
    this.sub = this.api
      .get(orgId, `register.${REPORT_REGISTER[this.register()]}`, {
        lang: this.language.active(),
      })
      .subscribe({
        next: (o) => {
          this.busy.set(false);
          this.output.set(o);
        },
        error: () => {
          this.busy.set(false);
          this.notifications.error('errors.generic');
        },
      });
  }
}
