import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { Output } from '../../core/outputs/outputs.models';
import { SECONDARY_LINK } from '../requirement-locations/location-links';
import { Icon } from '../ui/icon/icon';
import { GenerateDialog } from './generate-dialog';
import { OUTPUTS_SCOPE } from './output-display';

/** A list page's current filters, as the page holds them. */
export interface ListFilters {
  readonly q?: string | null;
  /** One status or several; values the register does not know are left out. */
  readonly status?: string | readonly string[] | null;
  readonly from?: string | Date | null;
  readonly to?: string | Date | null;
  readonly standard_key?: string | null;
}

/** The output key of a register's export (`register.<key>`, defined once in core). */
export function registerOutputKey(register: string): string {
  return `register.${register}`.slice(0, 64);
}

/**
 * The filters of a list page that the register export accepts: only the filter
 * names the register declares (`filter_params`), only statuses it knows, blanks
 * dropped. A list-only filter is never sent, so the export never 422s on it; the
 * file then holds at least what the list shows.
 */
export function registerExportFilters(
  output: Pick<Output, 'filter_params' | 'statuses'>,
  filters: ListFilters | null | undefined,
): Record<string, unknown> {
  const accepted = new Set(output.filter_params ?? []);
  const out: Record<string, unknown> = {};
  if (!filters) {
    return out;
  }
  const q = filters.q?.trim();
  if (q && accepted.has('q')) {
    out['q'] = q;
  }
  if (accepted.has('status') && filters.status) {
    const known = new Set(output.statuses ?? []);
    const raw = typeof filters.status === 'string' ? [filters.status] : filters.status;
    const status = raw.filter((s) => s && (known.size === 0 || known.has(s)));
    if (status.length > 0) {
      out['status'] = status;
    }
  }
  for (const name of ['from', 'to'] as const) {
    const value = filters[name];
    if (value && accepted.has(name)) {
      out[name] = value instanceof Date ? value.toISOString().slice(0, 19) : value;
    }
  }
  if (filters.standard_key && accepted.has('standard_key')) {
    out['standard_key'] = filters.standard_key;
  }
  return out;
}

/**
 * "Eksporter" on a register's list page (principle 7, U15): the register as Excel,
 * CSV or PDF with the list's current filters. The export is the same output the
 * library offers (`register.<key>`), so the formats, columns and permission are
 * defined once in core. Hidden when the register has no export the user may make.
 *
 *   <app-register-export secondary register="processes" [filters]="{ q: q(), status }" />
 */
@Component({
  selector: 'app-register-export',
  imports: [TranslocoPipe, Icon, GenerateDialog],
  viewProviders: [provideSharedScope(OUTPUTS_SCOPE)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (output(); as out) {
      <button
        type="button"
        [class]="buttonClass"
        [attr.data-testid]="'register-export-' + register()"
        (click)="dialogOpen.set(true)"
      >
        <app-icon name="download" [size]="15" />
        {{ 'outputs.actions.export' | transloco }}
      </button>
      @if (dialogOpen()) {
        <app-generate-dialog
          [open]="true"
          [output]="out"
          [standardKey]="standardKey()"
          [filters]="sent()"
          (closed)="dialogOpen.set(false)"
        />
      }
    }
  `,
})
export class RegisterExport {
  private readonly api = inject(OutputsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** The `report_registers` key (e.g. `processes`, `risk_register`). */
  readonly register = input.required<string>();
  readonly filters = input<ListFilters | null>(null);

  protected readonly buttonClass = SECONDARY_LINK.replace('h-8', 'h-9');
  protected readonly output = signal<Output | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly sent = computed(() => {
    const out = this.output();
    return out ? registerExportFilters(out, this.filters()) : {};
  });
  protected readonly standardKey = computed(() => {
    const key = this.sent()['standard_key'];
    return typeof key === 'string' ? key : null;
  });

  private sub?: Subscription;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const key = registerOutputKey(this.register());
      this.sub?.unsubscribe();
      this.output.set(null);
      if (!orgId) {
        return;
      }
      this.sub = this.api.get(orgId, key).subscribe({
        next: (out) => this.output.set(out.generates ? out : null),
        error: () => this.output.set(null), // no access or no such export: no button
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }
}
