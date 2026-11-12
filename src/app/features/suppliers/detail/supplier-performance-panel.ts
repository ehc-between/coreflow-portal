import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { blankToNull, ratePercent } from '../data/supplier-display';
import { supplierErrorKey } from '../data/supplier-errors';
import {
  PERFORMANCE_KINDS,
  PerformanceEntry,
  PerformanceKind,
  PerformanceRequest,
  PerformanceStats,
} from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { PickedDeviation, SupplierDeviationPicker } from '../shared/deviation-picker';

type TriState = '' | 'yes' | 'no';

interface EntryDraft {
  kind: PerformanceKind;
  occurred_on: string;
  title: string;
  description: string;
  rating: string;
  on_time: TriState;
  quality_ok: TriState;
  reference: string;
  deviation: PickedDeviation | null;
}

const toTri = (v: boolean | null): TriState => (v === null ? '' : v ? 'yes' : 'no');
const fromTri = (v: TriState): boolean | null => (v === '' ? null : v === 'yes');

export function entryDraft(e: PerformanceEntry | null): EntryDraft {
  return {
    kind: e?.kind ?? 'delivery',
    occurred_on: e?.occurred_on ?? '',
    title: e?.title ?? '',
    description: e?.description ?? '',
    rating: e?.rating?.toString() ?? '',
    on_time: toTri(e?.on_time ?? null),
    quality_ok: toTri(e?.quality_ok ?? null),
    reference: e?.reference ?? '',
    deviation: e?.deviation_id ? { id: e.deviation_id, label: '' } : null,
  };
}

export function entryBody(d: EntryDraft): PerformanceRequest {
  const rating = Number.parseInt(d.rating, 10);
  return {
    kind: d.kind,
    occurred_on: d.occurred_on || null,
    title: d.title.trim(),
    description: blankToNull(d.description),
    rating: Number.isFinite(rating) ? rating : null,
    on_time: fromTri(d.on_time),
    quality_ok: fromTri(d.quality_ok),
    reference: blankToNull(d.reference),
    deviation_id: d.deviation?.id ?? null,
  };
}

/**
 * The supplier's performance log: 12-month figures (entries, nonconformities,
 * average rating, on-time and quality rates), the entries themselves, and a form to
 * log or edit one (optionally linked to a deviation).
 */
@Component({
  selector: 'app-supplier-performance-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FieldHelp,
    FormField,
    Icon,
    SlideOver,
    SupplierDeviationPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <div class="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'suppliers.performance.title' | transloco }}
        </h2>
        @if (canWrite()) {
          <app-button size="sm" variant="secondary" (click)="openForm(null)">
            <app-icon name="plus" [size]="14" />
            {{ 'suppliers.performance.log' | transloco }}
          </app-button>
        }
      </div>
      @if (stats(); as s) {
        <dl class="grid grid-cols-2 gap-3 px-4 pb-3 sm:grid-cols-5">
          <div>
            <dt class="text-[12px] text-fg-muted">
              {{ 'suppliers.performance.stats.entries' | transloco }}
            </dt>
            <dd class="font-display text-[18px] font-bold text-fg">{{ s.entries }}</dd>
          </div>
          <div>
            <dt class="text-[12px] text-fg-muted">
              {{ 'suppliers.performance.stats.nonconformities' | transloco }}
            </dt>
            <dd
              class="font-display text-[18px] font-bold"
              [class.text-fail]="s.nonconformities > 0"
            >
              {{ s.nonconformities }}
            </dd>
          </div>
          <div>
            <dt class="text-[12px] text-fg-muted">
              {{ 'suppliers.performance.stats.rating' | transloco }}
            </dt>
            <dd class="font-display text-[18px] font-bold text-fg">
              {{ s.average_rating === null ? '–' : (s.average_rating | localNumber: '1.1-1') }}
            </dd>
          </div>
          <div>
            <dt class="text-[12px] text-fg-muted">
              {{ 'suppliers.performance.stats.onTime' | transloco }}
            </dt>
            <dd class="font-display text-[18px] font-bold text-fg">
              {{ rate(s.on_time_rate) }}
            </dd>
          </div>
          <div>
            <dt class="text-[12px] text-fg-muted">
              {{ 'suppliers.performance.stats.quality' | transloco }}
            </dt>
            <dd class="font-display text-[18px] font-bold text-fg">
              {{ rate(s.quality_ok_rate) }}
            </dd>
          </div>
        </dl>
        <p class="px-4 pb-2 text-[12px] text-fg-subtle">
          {{ 'suppliers.performance.stats.period' | transloco: { days: s.period_days } }}
        </p>
      }
      @switch (state()) {
        @case ('loading') {
          <p class="px-4 pb-4 text-[13.5px] text-fg-muted">
            {{ 'suppliers.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="px-4 pb-4 text-[13.5px] text-fail">
            {{ 'suppliers.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (entries().length === 0) {
            <p class="px-4 pb-4 text-[13.5px] text-fg-muted">
              {{ 'suppliers.performance.none' | transloco }}
            </p>
          } @else {
            <ul class="divide-y divide-border border-t border-border">
              @for (e of entries(); track e.id) {
                <li class="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-[13.5px] font-semibold text-fg">{{ e.title }}</p>
                    <p class="flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                      <span>{{ e.occurred_on | localDay }}</span>
                      <span>{{ 'suppliers.performanceKind.' + e.kind | transloco }}</span>
                      @if (e.reference) {
                        <span>{{ e.reference }}</span>
                      }
                      @if (e.deviation_url) {
                        <a
                          [routerLink]="e.deviation_url"
                          class="font-semibold text-accent hover:underline"
                        >
                          {{ 'suppliers.performance.linkedDeviation' | transloco }}
                        </a>
                      }
                    </p>
                    @if (e.description) {
                      <p class="mt-1 text-[13px] whitespace-pre-line text-fg-muted">
                        {{ e.description }}
                      </p>
                    }
                  </div>
                  <span class="flex flex-wrap items-center gap-2 text-[12.5px]">
                    @if (e.rating !== null) {
                      <span
                        [attr.aria-label]="
                          'suppliers.performance.ratingOf' | transloco: { rating: e.rating }
                        "
                      >
                        {{ 'suppliers.performance.ratingOf' | transloco: { rating: e.rating } }}
                      </span>
                    }
                    @if (e.on_time !== null) {
                      <app-badge [tone]="e.on_time ? 'pass' : 'fail'">
                        {{
                          (e.on_time
                            ? 'suppliers.performance.onTime'
                            : 'suppliers.performance.late'
                          ) | transloco
                        }}
                      </app-badge>
                    }
                    @if (e.quality_ok !== null) {
                      <app-badge [tone]="e.quality_ok ? 'pass' : 'fail'">
                        {{
                          (e.quality_ok
                            ? 'suppliers.performance.qualityOk'
                            : 'suppliers.performance.qualityNotOk'
                          ) | transloco
                        }}
                      </app-badge>
                    }
                    @if (e.can_edit) {
                      <button
                        type="button"
                        class="rounded-[8px] px-2 py-1 text-[12.5px] font-semibold text-accent hover:bg-accent-soft"
                        [attr.aria-label]="
                          'suppliers.performance.editEntry' | transloco: { title: e.title }
                        "
                        (click)="openForm(e)"
                      >
                        {{ 'suppliers.common.edit' | transloco }}
                      </button>
                      <button
                        type="button"
                        class="rounded-[8px] p-1 text-fg-subtle hover:text-fail"
                        [attr.aria-label]="
                          'suppliers.performance.deleteEntry' | transloco: { title: e.title }
                        "
                        (click)="pendingDelete.set(e)"
                      >
                        <app-icon name="trash" [size]="14" />
                      </button>
                    }
                  </span>
                </li>
              }
            </ul>
          }
        }
      }
    </app-card>

    <app-slide-over
      [open]="formOpen()"
      [title]="
        (editing() ? 'suppliers.performance.editTitle' : 'suppliers.performance.logTitle')
          | transloco
      "
      [closeLabel]="'common.cancel' | transloco"
      (closed)="formOpen.set(false)"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
        <div class="grid grid-cols-2 gap-3">
          <app-form-field [label]="'suppliers.performance.form.kind' | transloco" inputId="pf-kind">
            <select id="pf-kind" (change)="set('kind', $any($event.target).value)">
              @for (k of kinds; track k) {
                <option [value]="k" [selected]="d().kind === k">
                  {{ 'suppliers.performanceKind.' + k | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'suppliers.performance.form.date' | transloco" inputId="pf-date">
            <input
              id="pf-date"
              type="date"
              [value]="d().occurred_on"
              (input)="set('occurred_on', $any($event.target).value)"
            />
          </app-form-field>
        </div>
        <app-form-field [label]="'suppliers.performance.form.title' | transloco" inputId="pf-title">
          <input
            id="pf-title"
            type="text"
            maxlength="255"
            required
            [value]="d().title"
            (input)="set('title', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'suppliers.performance.form.description' | transloco"
          inputId="pf-desc"
        >
          <textarea
            id="pf-desc"
            rows="3"
            maxlength="10000"
            [value]="d().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="suppliers" page="performance" field="rating" />
            </div>
            <app-form-field
              [label]="'suppliers.performance.form.rating' | transloco"
              inputId="pf-rating"
            >
              <select id="pf-rating" (change)="set('rating', $any($event.target).value)">
                <option value="" [selected]="!d().rating">
                  {{ 'suppliers.performance.form.noRating' | transloco }}
                </option>
                @for (r of ratings; track r) {
                  <option [value]="r" [selected]="d().rating === '' + r">
                    {{ 'suppliers.performance.ratingOf' | transloco: { rating: r } }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <app-form-field
            [label]="'suppliers.performance.form.onTime' | transloco"
            inputId="pf-ontime"
          >
            <select id="pf-ontime" (change)="set('on_time', $any($event.target).value)">
              @for (o of tri; track o) {
                <option [value]="o" [selected]="d().on_time === o">
                  {{ 'suppliers.performance.form.tri.' + (o || 'unknown') | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field
            [label]="'suppliers.performance.form.qualityOk' | transloco"
            inputId="pf-quality"
          >
            <select id="pf-quality" (change)="set('quality_ok', $any($event.target).value)">
              @for (o of tri; track o) {
                <option [value]="o" [selected]="d().quality_ok === o">
                  {{ 'suppliers.performance.form.tri.' + (o || 'unknown') | transloco }}
                </option>
              }
            </select>
          </app-form-field>
        </div>
        <app-form-field
          [label]="'suppliers.performance.form.reference' | transloco"
          inputId="pf-ref"
        >
          <input
            id="pf-ref"
            type="text"
            maxlength="100"
            [placeholder]="'suppliers.performance.form.referencePlaceholder' | transloco"
            [value]="d().reference"
            (input)="set('reference', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'suppliers.performance.form.deviation' | transloco"
          inputId="pf-dev"
        >
          <app-supplier-deviation-picker
            inputId="pf-dev"
            [value]="d().deviation"
            (valueChange)="set('deviation', $event)"
          />
        </app-form-field>
        @if (formError(); as key) {
          <app-alert>{{ key | transloco }}</app-alert>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="ghost" (click)="formOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()" [disabled]="!d().title.trim()">
            {{ 'common.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>

    <app-confirm-dialog
      [open]="pendingDelete() !== null"
      [title]="'suppliers.performance.deleteTitle' | transloco"
      [message]="
        'suppliers.performance.deleteMessage' | transloco: { title: pendingDelete()?.title ?? '' }
      "
      [confirmLabel]="'suppliers.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="pendingDelete.set(null)"
    />
  `,
})
export class SupplierPerformancePanel {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly supplierId = input.required<string>();
  readonly canWrite = input(false);
  /** The log changed (the page refreshes the supplier's figures). */
  readonly changed = output<void>();

  protected readonly kinds = PERFORMANCE_KINDS;
  protected readonly ratings = [1, 2, 3, 4, 5] as const;
  protected readonly tri: readonly TriState[] = ['', 'yes', 'no'];

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly entries = signal<readonly PerformanceEntry[]>([]);
  protected readonly stats = signal<PerformanceStats | null>(null);

  protected readonly formOpen = signal(false);
  private readonly editingEntry = signal<PerformanceEntry | null>(null);
  protected readonly editing = computed(() => this.editingEntry() !== null);
  protected readonly d = signal<EntryDraft>(entryDraft(null));
  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly pendingDelete = signal<PerformanceEntry | null>(null);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.supplierId();
      untracked(() => this.load(orgId, id));
    });
  }

  protected rate(value: number | null): string {
    const pct = ratePercent(value);
    return pct === null ? '–' : `${pct} %`;
  }

  protected set<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected openForm(entry: PerformanceEntry | null): void {
    this.editingEntry.set(entry);
    this.d.set(entryDraft(entry));
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const draft = this.d();
    if (!orgId || this.busy() || !draft.title.trim()) {
      return;
    }
    const body = entryBody(draft);
    const editing = this.editingEntry();
    const call = editing
      ? this.api.updatePerformance(orgId, editing.id, body)
      : this.api.logPerformance(orgId, this.supplierId(), body);
    this.busy.set(true);
    this.formError.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.formOpen.set(false);
        this.notifications.success(
          editing ? 'suppliers.performance.saved' : 'suppliers.performance.logged',
        );
        this.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.formError.set(supplierErrorKey(err));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const entry = this.pendingDelete();
    if (!orgId || !entry) {
      return;
    }
    this.busy.set(true);
    this.api.deletePerformance(orgId, entry.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.pendingDelete.set(null);
        this.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.pendingDelete.set(null);
        this.notifications.error(supplierErrorKey(err));
      },
    });
  }

  private reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.supplierId());
    this.changed.emit();
  }

  private load(orgId: string | null, supplierId: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listPerformance(orgId, supplierId, { limit: 50 }).subscribe({
      next: (res) => {
        this.entries.set(res.items);
        this.stats.set(res.stats);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
