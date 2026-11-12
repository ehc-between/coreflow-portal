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
import { Icon } from '../../../shared/ui/icon/icon';
import { AssetsApi } from '../data/assets-api';

export interface AssetOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/**
 * The current org's assets as picker options (the first 200 by code, retired and
 * disposed ones included so existing references stay readable). Loaded once per
 * org; `refresh()` re-reads after a new asset is registered.
 */
@Injectable({ providedIn: 'root' })
export class AssetOptionsService {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly state = signal<{ orgId: string; items: readonly AssetOption[] } | null>(null);
  private loadingFor: string | null = null;

  readonly options = computed<readonly AssetOption[]>(() => {
    const orgId = this.selectedOrg.currentOrgId();
    const state = this.state();
    return state && state.orgId === orgId ? state.items : [];
  });

  ensureLoaded(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.state()?.orgId === orgId || this.loadingFor === orgId) {
      return;
    }
    this.load(orgId);
  }

  refresh(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId);
    }
  }

  private load(orgId: string): void {
    this.loadingFor = orgId;
    this.api.list(orgId, { sort: 'code', limit: 200 }).subscribe({
      next: (page) => {
        this.loadingFor = null;
        this.state.set({
          orgId,
          items: page.items.map((a) => ({ id: a.id, code: a.code, name: a.name })),
        });
      },
      error: () => {
        this.loadingFor = null;
        this.state.set({ orgId, items: [] });
      },
    });
  }
}

/** Native `<select>` of one asset, valued by id ('' = none). */
@Component({
  selector: 'app-asset-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="" [selected]="!value()">{{ 'assets.common.noAsset' | transloco }}</option>
      @if (orphan()) {
        <option [value]="value()" selected>{{ currentLabel() || value() }}</option>
      }
      @for (a of options(); track a.id) {
        <option [value]="a.id" [selected]="a.id === value()">{{ a.code }} {{ a.name }}</option>
      }
    </select>
  `,
})
export class AssetSelect {
  private readonly service = inject(AssetOptionsService);

  readonly inputId = input('');
  readonly value = input('');
  readonly currentLabel = input<string | null>(null);
  readonly disabled = input(false);
  readonly describedBy = input('');
  readonly valueChange = output<string>();

  protected readonly options = this.service.options;
  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.options().some((a) => a.id === value);
  });

  constructor() {
    this.service.ensureLoaded();
  }
}

/** Pick several assets: a select that adds to a removable chip list. */
@Component({
  selector: 'app-asset-multi-select',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <select
        [id]="inputId()"
        [attr.aria-describedby]="describedBy() || null"
        (change)="add($any($event.target))"
      >
        <option value="" selected>{{ 'assets.common.addAsset' | transloco }}</option>
        @for (a of available(); track a.id) {
          <option [value]="a.id">{{ a.code }} {{ a.name }}</option>
        }
      </select>
      @if (chosen().length) {
        <ul
          class="flex flex-wrap gap-1.5"
          [attr.aria-label]="'assets.common.chosenAssets' | transloco"
        >
          @for (a of chosen(); track a.id) {
            <li
              class="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5 text-[12.5px] text-fg"
            >
              <span class="font-mono text-[11.5px] text-fg-muted">{{ a.code }}</span>
              {{ a.name }}
              <button
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-muted hover:bg-surface hover:text-fg"
                [attr.aria-label]="'assets.common.removeAsset' | transloco: { name: a.name }"
                (click)="remove(a.id)"
              >
                <app-icon name="x" [size]="12" />
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class AssetMultiSelect {
  private readonly service = inject(AssetOptionsService);

  readonly inputId = input('');
  readonly value = input<readonly string[]>([]);
  readonly describedBy = input('');
  readonly valueChange = output<readonly string[]>();

  protected readonly chosen = computed(() => {
    const byId = new Map(this.service.options().map((a) => [a.id, a]));
    return this.value()
      .map((id) => byId.get(id))
      .filter((a): a is AssetOption => !!a);
  });
  protected readonly available = computed(() => {
    const taken = new Set(this.value());
    return this.service.options().filter((a) => !taken.has(a.id));
  });

  constructor() {
    this.service.ensureLoaded();
  }

  protected add(select: HTMLSelectElement): void {
    const id = select.value;
    select.value = '';
    if (id && !this.value().includes(id)) {
      this.valueChange.emit([...this.value(), id]);
    }
  }

  protected remove(id: string): void {
    this.valueChange.emit(this.value().filter((v) => v !== id));
  }
}
