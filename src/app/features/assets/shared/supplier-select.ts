import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SupplierRef } from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';

/**
 * The current org's suppliers (Suppliers register) as picker options, loaded once per
 * org. `available` is false when the register cannot be read (module off, no
 * permission): forms then keep only the free-text fallback.
 */
@Injectable({ providedIn: 'root' })
export class SupplierOptionsService {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly state = signal<{
    orgId: string;
    items: readonly SupplierRef[];
    available: boolean;
  } | null>(null);
  private loadingFor: string | null = null;

  private readonly current = computed(() => {
    const state = this.state();
    return state && state.orgId === this.selectedOrg.currentOrgId() ? state : null;
  });
  readonly options = computed<readonly SupplierRef[]>(() => this.current()?.items ?? []);
  readonly available = computed(() => this.current()?.available ?? false);

  ensureLoaded(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.state()?.orgId === orgId || this.loadingFor === orgId) {
      return;
    }
    this.loadingFor = orgId;
    this.api.supplierOptions(orgId).subscribe({
      next: (res) => {
        this.loadingFor = null;
        this.state.set({ orgId, items: res.items, available: true });
      },
      error: () => {
        this.loadingFor = null;
        this.state.set({ orgId, items: [], available: false });
      },
    });
  }
}

/**
 * Native `<select>` of a supplier in the Suppliers register, valued by id ('' = none).
 * A current supplier missing from the options stays selectable under `currentLabel`.
 */
@Component({
  selector: 'app-asset-supplier-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [attr.aria-describedby]="describedBy() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">
        {{ emptyLabelKey() || 'assets.common.noSupplier' | transloco }}
      </option>
      @if (orphan()) {
        <option [value]="value()" selected>{{ currentLabel() || value() }}</option>
      }
      @for (s of options(); track s.id) {
        <option [value]="s.id" [selected]="s.id === value()">{{ s.name }} ({{ s.code }})</option>
      }
    </select>
  `,
})
export class AssetSupplierSelect {
  private readonly service = inject(SupplierOptionsService);

  readonly inputId = input('');
  readonly value = input('');
  readonly currentLabel = input<string | null>(null);
  readonly describedBy = input('');
  readonly emptyLabelKey = input('');
  readonly valueChange = output<string>();

  protected readonly options = this.service.options;
  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.options().some((s) => s.id === value);
  });

  constructor() {
    this.service.ensureLoaded();
  }
}
