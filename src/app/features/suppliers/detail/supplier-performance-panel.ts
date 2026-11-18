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
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { blankToNull, ratePercent } from '../data/supplier-display';
import { supplierErrorKey } from '../data/supplier-errors';
import {
  PERFORMANCE_KINDS,
  PerformanceEntry,
  PerformanceKind,
  PerformanceRequest,
  PerformanceStats,
  PerformanceWarning,
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

/** A late or not-OK entry (or a nonconformity) that has no deviation linked yet. */
export function needsDeviation(e: PerformanceEntry): boolean {
  return (
    !e.deviation_id && (e.on_time === false || e.quality_ok === false || e.kind === 'nonconformity')
  );
}

/**
 * The supplier's performance log: 12-month figures (entries, nonconformities,
 * average rating, on-time and quality rates), a warning when results are weak (with
 * "Start ekstraordinær vurdering"), the entries themselves ("Registrer avvik" on a late
 * or not-OK one), and a form to log or edit one (optionally linked to a deviation).
 */
@Component({
  selector: 'app-supplier-performance-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldHelp,
    FormField,
    Icon,
    LoadingState,
    SlideOver,
    StatusBadge,
    SupplierDeviationPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <div class="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2">
        <h2 class="font-display text-card font-bold text-fg">
          {{ 'suppliers.performance.title' | transloco }}
        </h2>
        @if (canWrite()) {
          <app-button size="sm" variant="secondary" (click)="openForm(null)">
            <app-icon name="plus" [size]="14" />
            {{ 'suppliers.performance.log' | transloco }}
          </app-button>
        }
      </div>
      @if (warning(); as w) {
        <div
          class="mx-5 mb-3 rounded-tile border border-warn bg-warn-soft px-3 py-2.5 text-ui text-fg"
          role="note"
          data-testid="performance-warning"
        >
          <p class="font-semibold">{{ 'suppliers.performance.warning.title' | transloco }}</p>
          <ul class="mt-1 list-disc pl-5 text-fg-muted">
            @for (r of w.reasons; track r) {
              <li>
                {{ 'suppliers.performance.warning.' + r | transloco: { threshold: w.threshold } }}
              </li>
            }
          </ul>
          @if (w.suggest_evaluation && canWrite()) {
            <div class="mt-2">
              <app-button size="sm" variant="secondary" (click)="evaluateRequested.emit()">
                {{ 'suppliers.performance.warning.evaluate' | transloco }}
              </app-button>
            </div>
          }
        </div>
      }
      @if (stats(); as s) {
        <dl class="grid grid-cols-2 gap-3 px-5 pb-3 sm:grid-cols-5">
          <div>
            <dt class="text-meta text-fg-muted">
              {{ 'suppliers.performance.stats.entries' | transloco }}
            </dt>
            <dd class="font-display text-section font-bold text-fg">{{ s.entries }}</dd>
          </div>
          <div>
            <dt class="text-meta text-fg-muted">
              {{ 'suppliers.performance.stats.nonconformities' | transloco }}
            </dt>
            <dd
              class="font-display text-section font-bold"
              [class.text-warn-ink]="s.nonconformities > 0"
            >
              {{ s.nonconformities }}
            </dd>
          </div>
          <div>
            <dt class="text-meta text-fg-muted">
              {{ 'suppliers.performance.stats.rating' | transloco }}
            </dt>
            <dd class="font-display text-section font-bold text-fg">
              {{ s.average_rating === null ? '–' : (s.average_rating | localNumber: '1.1-1') }}
            </dd>
          </div>
          <div>
            <dt class="text-meta text-fg-muted">
              {{ 'suppliers.performance.stats.onTime' | transloco }}
            </dt>
            <dd class="font-display text-section font-bold text-fg">
              {{ rate(s.on_time_rate) }}
            </dd>
          </div>
          <div>
            <dt class="text-meta text-fg-muted">
              {{ 'suppliers.performance.stats.quality' | transloco }}
            </dt>
            <dd class="font-display text-section font-bold text-fg">
              {{ rate(s.quality_ok_rate) }}
            </dd>
          </div>
        </dl>
        <p class="px-5 pb-2 text-meta text-fg-subtle">
          {{ 'suppliers.performance.stats.period' | transloco: { days: s.period_days } }}
        </p>
      }
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="2" />
        }
        @case ('error') {
          <app-error-state (retry)="reloadList()" />
        }
        @default {
          @if (entries().length === 0) {
            <p class="px-5 pb-4 text-ui text-fg-muted">
              {{ 'suppliers.performance.none' | transloco }}
            </p>
          } @else {
            <ul class="divide-y divide-border border-t border-border">
              @for (e of entries(); track e.id) {
                <li class="flex flex-col gap-1 px-5 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-body font-semibold text-fg">{{ e.title }}</p>
                    <p class="flex flex-wrap gap-x-3 text-meta text-fg-subtle">
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
                      } @else if (canRaise(e)) {
                        <button
                          type="button"
                          class="font-semibold text-accent hover:underline"
                          [attr.aria-label]="
                            'suppliers.performance.raiseDeviationFor'
                              | transloco: { title: e.title }
                          "
                          (click)="raiseDeviation()"
                          data-testid="raise-deviation"
                        >
                          {{ 'suppliers.performance.raiseDeviation' | transloco }}
                        </button>
                      }
                    </p>
                    @if (e.description) {
                      <p class="mt-1 text-ui whitespace-pre-line text-fg-muted">
                        {{ e.description }}
                      </p>
                    }
                  </div>
                  <span class="flex flex-wrap items-center gap-2 text-meta">
                    @if (e.rating !== null) {
                      <span>
                        {{ 'suppliers.performance.ratingOf' | transloco: { rating: e.rating } }}
                      </span>
                    }
                    @if (e.on_time !== null) {
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="e.on_time ? 'passed' : 'failed'"
                        [labelKey]="
                          e.on_time ? 'suppliers.performance.onTime' : 'suppliers.performance.late'
                        "
                      />
                    }
                    @if (e.quality_ok !== null) {
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="e.quality_ok ? 'passed' : 'failed'"
                        [labelKey]="
                          e.quality_ok
                            ? 'suppliers.performance.qualityOk'
                            : 'suppliers.performance.qualityNotOk'
                        "
                      />
                    }
                    @if (e.can_edit) {
                      <button
                        type="button"
                        class="rounded-tile px-2 py-1 text-meta font-semibold text-accent hover:bg-accent-soft"
                        [attr.aria-label]="
                          'suppliers.performance.editEntry' | transloco: { title: e.title }
                        "
                        (click)="openForm(e)"
                      >
                        {{ 'suppliers.common.edit' | transloco }}
                      </button>
                      <button
                        type="button"
                        class="rounded-tile p-1 text-fg-subtle hover:text-fail"
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
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              [attr.lang]="lang()"
              [value]="d().occurred_on"
              (input)="set('occurred_on', $any($event.target).value)"
            />
          </app-form-field>
        </div>
        <app-form-field
          [label]="'suppliers.performance.form.title' | transloco"
          inputId="pf-title"
          [required]="true"
        >
          <input
            id="pf-title"
            type="text"
            maxlength="255"
            required
            aria-required="true"
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
        <app-form-field
          [label]="'suppliers.performance.form.rating' | transloco"
          inputId="pf-rating"
        >
          <app-field-help label-suffix scope="suppliers" page="performance" field="rating" />
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
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        @if (badEntry() && !d().deviation) {
          <p class="text-meta text-fg-muted" data-testid="deviation-hint">
            {{ 'suppliers.performance.form.deviationHint' | transloco }}
          </p>
        }
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
  private readonly language = inject(LanguageService);
  private readonly flows = inject(CreateFlowService);

  readonly supplierId = input.required<string>();
  readonly canWrite = input(false);
  /** Weak results (from the supplier): shown with "Start ekstraordinær vurdering". */
  readonly warning = input<PerformanceWarning | null | undefined>(null);
  /** The log changed (the page refreshes the supplier's figures). */
  readonly changed = output<void>();
  /** "Start ekstraordinær vurdering" from the warning (the page owns the dialog). */
  readonly evaluateRequested = output<void>();

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
  protected readonly lang = computed(() => (this.language.active() === 'nb' ? 'nb' : 'en'));
  /** The entry being written went wrong (late or quality not OK). */
  protected readonly badEntry = computed(
    () => this.d().on_time === 'no' || this.d().quality_ok === 'no',
  );
  private readonly canWriteDeviations = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('deviations:write'),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.supplierId();
      untracked(() => this.load(orgId, id));
    });
  }

  /** Offer "Registrer avvik" on a late or not-OK entry without a linked deviation. */
  protected canRaise(e: PerformanceEntry): boolean {
    return this.canWrite() && this.canWriteDeviations() && needsDeviation(e);
  }

  /** A new deviation linked to the supplier (create from here). */
  protected raiseDeviation(): void {
    void this.flows.start('supplier.to_deviation', 'supplier', this.supplierId());
  }

  protected reloadList(): void {
    this.load(this.selectedOrg.currentOrgId(), this.supplierId());
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
    if (!this.stats()) {
      this.state.set('loading');
    }
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
