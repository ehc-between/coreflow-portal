import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { RevisionHistory } from '../../../shared/kit/revision-history';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { RiskApi } from '../data/risk-api';
import { implementationTone } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  IMPLEMENTATION_STATUSES,
  INCLUSION_REASONS,
  ImplementationStatus,
  InclusionReason,
  Soa,
  SoaEntry,
  SoaEntryUpdate,
} from '../data/risk.models';
import { PersonSelect } from '../shared/person-select';
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';

export type ApplicableFilter = 'all' | 'yes' | 'no' | 'missing';

interface EntryForm {
  readonly applicable: boolean;
  readonly implementation_status: ImplementationStatus;
  readonly justification: string;
  readonly inclusion_reasons: readonly InclusionReason[];
  readonly implementation_notes: string;
  readonly owner_user_id: string;
  readonly reviewed: boolean;
  readonly change_reason: string;
}

const EMPTY_ENTRY_FORM: EntryForm = {
  applicable: true,
  implementation_status: 'not_started',
  justification: '',
  inclusion_reasons: [],
  implementation_notes: '',
  owner_user_id: '',
  reviewed: false,
  change_reason: '',
};

function entryToForm(e: SoaEntry): EntryForm {
  return {
    applicable: e.applicable,
    implementation_status: e.implementation_status,
    justification: e.justification ?? '',
    inclusion_reasons: e.inclusion_reasons,
    implementation_notes: e.implementation_notes ?? '',
    owner_user_id: e.owner?.id ?? '',
    reviewed: false,
    change_reason: '',
  };
}

/** The PATCH body: only changed fields (plus `reviewed` / `change_reason` when set). */
export function soaEntryPatch(entry: SoaEntry, f: EntryForm): SoaEntryUpdate {
  const before = entryToForm(entry);
  const out: Record<string, unknown> = {};
  if (f.applicable !== before.applicable) out['applicable'] = f.applicable;
  if (f.implementation_status !== before.implementation_status) {
    out['implementation_status'] = f.implementation_status;
  }
  if (f.justification.trim() !== before.justification.trim()) {
    out['justification'] = f.justification.trim() || null;
  }
  if (
    JSON.stringify([...f.inclusion_reasons].sort()) !==
    JSON.stringify([...before.inclusion_reasons].sort())
  ) {
    out['inclusion_reasons'] = f.inclusion_reasons;
  }
  if (f.implementation_notes.trim() !== before.implementation_notes.trim()) {
    out['implementation_notes'] = f.implementation_notes.trim() || null;
  }
  if (f.owner_user_id !== before.owner_user_id) out['owner_user_id'] = f.owner_user_id || null;
  if (f.reviewed) out['reviewed'] = true;
  if (f.change_reason.trim()) out['change_reason'] = f.change_reason.trim();
  return out as SoaEntryUpdate;
}

const SOA_FIELD_LABELS: Readonly<Record<string, string>> = {
  applicable: 'risk.soa.fields.applicable',
  implementation_status: 'risk.soa.fields.implementation',
  justification: 'risk.soa.fields.justification',
  inclusion_reasons: 'risk.soa.fields.reasons',
  implementation_notes: 'risk.soa.fields.notes',
  owner_user_id: 'risk.fields.owner',
  reviewed_at: 'risk.soa.fields.reviewedAt',
  control_ref: 'risk.soa.fields.control',
};

/**
 * One Statement of Applicability: every Annex A control with its applicability,
 * justification, inclusion reasons, implementation status, owner and the risks that
 * reference it. Managers edit an entry in a side panel (with an AI-drafted
 * justification and the entry's revision history); everyone can export CSV.
 * `?control=<ref>` opens that control.
 */
@Component({
  selector: 'app-soa-view',
  imports: [
    TourStepDirective,
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    FieldHelp,
    RevisionHistory,
    LocalDatePipe,
    Alert,
    Badge,
    Button,
    Card,
    FormField,
    Icon,
    KpiTile,
    SlideOver,
    PersonSelect,
    RiskPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <a
        routerLink="/risk/soa"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'risk.soa.back' | transloco }}
      </a>
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ soa()?.standard_name ?? ('risk.soa.title' | transloco) }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">{{ 'risk.soa.viewSubtitle' | transloco }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (soa()?.generated) {
            <app-button size="sm" variant="secondary" [loading]="exporting()" (click)="exportCsv()">
              <app-icon name="upload" [size]="14" />
              {{ 'risk.soa.export' | transloco }}
            </app-button>
          }
          @if (perms.canManage()) {
            <app-button size="sm" variant="ghost" (click)="generate()">
              {{ (soa()?.generated ? 'risk.soa.addMissing' : 'risk.soa.generate') | transloco }}
            </app-button>
          }
        </div>
      </header>

      <app-risk-page-guide
        class="mb-5"
        page="soaView"
        lesson="statement-of-applicability"
        tour="soa"
      />

      @if (state() === 'error') {
        <app-alert tone="error">{{ loadErrorKey() | transloco }}</app-alert>
      } @else if (soa(); as s) {
        @if (!s.generated) {
          <app-card>
            <p class="py-6 text-center text-[13.5px] text-fg-muted">
              {{
                (perms.canManage() ? 'risk.soa.notGenerated' : 'risk.soa.askManager') | transloco
              }}
            </p>
          </app-card>
        } @else {
          <section
            class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4"
            [attr.aria-label]="'risk.soa.stats' | transloco"
            [appTourStep]="'risk-soa-stats'"
          >
            <app-kpi-tile
              [label]="'risk.soa.statApplicable' | transloco"
              [value]="s.stats.applicable"
              [delta]="'risk.soa.ofTotal' | transloco: { total: s.stats.total }"
            />
            <app-kpi-tile
              [label]="'risk.soa.statExcluded' | transloco"
              [value]="s.stats.excluded"
            />
            <app-kpi-tile
              [label]="'risk.soa.statImplemented' | transloco"
              [value]="s.stats.implemented"
              tone="pass"
              [delta]="'risk.soa.partialCount' | transloco: { count: s.stats.partial }"
            />
            <app-kpi-tile
              [label]="'risk.soa.statMissing' | transloco"
              [value]="s.stats.missing_justification"
              [tone]="s.stats.missing_justification > 0 ? 'warn' : 'neutral'"
            />
          </section>

          <div class="mb-3 flex flex-wrap items-center gap-2" [appTourStep]="'risk-soa-filters'">
            <label class="sr-only" for="soa-q">{{ 'risk.soa.search' | transloco }}</label>
            <input
              id="soa-q"
              type="search"
              class="h-10 min-w-[200px] flex-1 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg"
              [placeholder]="'risk.soa.searchPlaceholder' | transloco"
              [value]="q()"
              (input)="q.set($any($event.target).value)"
            />
            <label class="sr-only" for="soa-applicable">{{
              'risk.soa.fields.applicable' | transloco
            }}</label>
            <select
              id="soa-applicable"
              class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
              (change)="applicable.set($any($event.target).value)"
            >
              @for (a of applicableFilters; track a) {
                <option [value]="a" [selected]="a === applicable()">
                  {{ 'risk.soa.applicableFilters.' + a | transloco }}
                </option>
              }
            </select>
            <label class="sr-only" for="soa-impl">{{
              'risk.soa.fields.implementation' | transloco
            }}</label>
            <select
              id="soa-impl"
              class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
              (change)="implementation.set($any($event.target).value)"
            >
              <option value="" [selected]="!implementation()">
                {{ 'risk.soa.allStatuses' | transloco }}
              </option>
              @for (i of implementationStatuses; track i) {
                <option [value]="i" [selected]="i === implementation()">
                  {{ 'risk.soa.implementation.' + i | transloco }}
                </option>
              }
            </select>
            @if (themes().length > 1) {
              <label class="sr-only" for="soa-theme">{{
                'risk.soa.fields.theme' | transloco
              }}</label>
              <select
                id="soa-theme"
                class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
                (change)="theme.set($any($event.target).value)"
              >
                <option value="" [selected]="!theme()">
                  {{ 'risk.soa.allThemes' | transloco }}
                </option>
                @for (t of themes(); track t) {
                  <option [value]="t" [selected]="t === theme()">{{ t }}</option>
                }
              </select>
            }
          </div>

          <app-card [padded]="false">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[720px] text-left text-[13px]">
                <caption class="sr-only">
                  {{
                    s.standard_name
                  }}
                </caption>
                <thead class="border-b border-border text-[12px] text-fg-muted">
                  <tr>
                    <th scope="col" class="px-4 py-2 font-semibold">
                      {{ 'risk.soa.fields.control' | transloco }}
                    </th>
                    <th scope="col" class="px-2 py-2 font-semibold">
                      {{ 'risk.soa.fields.applicable' | transloco }}
                    </th>
                    <th scope="col" class="px-2 py-2 font-semibold">
                      {{ 'risk.soa.fields.implementation' | transloco }}
                    </th>
                    <th scope="col" class="px-2 py-2 font-semibold">
                      {{ 'risk.soa.fields.reasons' | transloco }}
                    </th>
                    <th scope="col" class="px-4 py-2 font-semibold">
                      {{ 'risk.soa.fields.risks' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  @for (e of visible(); track e.id) {
                    <tr
                      class="align-top hover:bg-surface-2"
                      [class.bg-accent-soft]="e.id === selected()?.id"
                    >
                      <td class="px-4 py-2.5">
                        <button
                          type="button"
                          class="text-left hover:underline"
                          (click)="open(e)"
                          [attr.data-testid]="'soa-' + e.control_ref"
                        >
                          <span class="font-mono text-[12px] text-fg-subtle">{{
                            e.control_ref
                          }}</span>
                          <span class="block font-semibold text-fg">{{ titleOf(e) }}</span>
                        </button>
                        @if (e.needs_justification) {
                          <span class="mt-0.5 block text-[12px] font-semibold text-warn">
                            {{ 'risk.soa.needsJustification' | transloco }}
                          </span>
                        }
                      </td>
                      <td class="px-2 py-2.5">
                        <app-badge [tone]="e.applicable ? 'pass' : 'neutral'">
                          {{ (e.applicable ? 'risk.soa.yes' : 'risk.soa.no') | transloco }}
                        </app-badge>
                      </td>
                      <td class="px-2 py-2.5">
                        <app-badge [tone]="implTone(e.implementation_status)">
                          {{ 'risk.soa.implementation.' + e.implementation_status | transloco }}
                        </app-badge>
                      </td>
                      <td class="px-2 py-2.5 text-[12px] text-fg-muted">
                        @for (r of e.inclusion_reasons; track r; let last = $last) {
                          {{ 'risk.soa.reasons.' + r | transloco }}{{ last ? '' : ', ' }}
                        }
                      </td>
                      <td class="px-4 py-2.5 text-[12px]">
                        @for (r of e.risks.slice(0, 3); track r.id) {
                          <a
                            [routerLink]="['/risk/risks', r.id]"
                            class="mr-1.5 font-mono text-accent hover:underline"
                            >{{ r.code }}</a
                          >
                        }
                        @if (e.risks.length > 3) {
                          <span class="text-fg-subtle">+{{ e.risks.length - 3 }}</span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5" class="py-10 text-center text-[14px] text-fg-muted">
                        {{ 'risk.filters.noMatch' | transloco }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </app-card>
        }
      } @else {
        <p class="py-10 text-center text-[14px] text-fg-muted">
          {{ 'risk.common.loading' | transloco }}
        </p>
      }
    </div>

    <app-slide-over
      [open]="selected() !== null"
      [title]="panelTitle()"
      [subtitle]="soa()?.standard_name ?? ''"
      [closeLabel]="'risk.common.close' | transloco"
      [width]="560"
      (closed)="close()"
    >
      @if (selected(); as e) {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
          <fieldset [disabled]="!perms.canManage()" class="flex flex-col gap-4">
            <label class="inline-flex items-center gap-2 text-[13.5px] font-semibold text-fg">
              <input
                type="checkbox"
                [checked]="form().applicable"
                (change)="set('applicable', $any($event.target).checked)"
              />
              {{ 'risk.soa.applicableLabel' | transloco }}
            </label>
            <app-field-help scope="risk" page="soaView" field="applicable" />

            <fieldset>
              <legend
                class="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted"
              >
                {{ 'risk.soa.fields.reasons' | transloco }}
                <app-field-help scope="risk" page="soaView" field="reasons" />
              </legend>
              <div class="flex flex-wrap gap-x-4 gap-y-1.5">
                @for (r of reasons; track r) {
                  <label class="inline-flex items-center gap-1.5 text-[13px] text-fg">
                    <input
                      type="checkbox"
                      [checked]="form().inclusion_reasons.includes(r)"
                      (change)="toggleReason(r, $any($event.target).checked)"
                    />
                    {{ 'risk.soa.reasons.' + r | transloco }}
                  </label>
                }
              </div>
            </fieldset>

            <app-form-field
              [label]="'risk.soa.fields.justification' | transloco"
              inputId="soa-justification"
            >
              <textarea
                id="soa-justification"
                rows="4"
                [value]="form().justification"
                [attr.aria-invalid]="justificationMissing() || null"
                (input)="set('justification', $any($event.target).value)"
              ></textarea>
              <app-field-help scope="risk" page="soaView" field="justification" />
            </app-form-field>
            @if (perms.canManage()) {
              <div>
                <app-ai-assist-button
                  assist="risk.soa_justification"
                  labelKey="risk.ai.draftJustification"
                  [input]="{ entry_id: e.id }"
                  entityType="soa_entry"
                  [entityId]="e.id"
                  (text)="set('justification', $event)"
                />
                <p class="mt-1 text-[12px] text-fg-subtle">
                  {{ 'risk.ai.justificationHint' | transloco }}
                </p>
              </div>
            }
            @if (justificationMissing()) {
              <app-alert tone="error">{{
                'risk.errors.justification_required' | transloco
              }}</app-alert>
            }

            <app-form-field
              [label]="'risk.soa.fields.implementation' | transloco"
              inputId="soa-impl-status"
            >
              <select
                id="soa-impl-status"
                (change)="set('implementation_status', $any($event.target).value)"
              >
                @for (i of implementationStatuses; track i) {
                  <option [value]="i" [selected]="i === form().implementation_status">
                    {{ 'risk.soa.implementation.' + i | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field [label]="'risk.soa.fields.notes' | transloco" inputId="soa-notes">
              <textarea
                id="soa-notes"
                rows="3"
                [value]="form().implementation_notes"
                (input)="set('implementation_notes', $any($event.target).value)"
              ></textarea>
            </app-form-field>
            <app-form-field [label]="'risk.fields.owner' | transloco" inputId="soa-owner">
              <app-person-select
                inputId="soa-owner"
                [value]="form().owner_user_id"
                [currentName]="e.owner?.name ?? null"
                (valueChange)="set('owner_user_id', $event)"
              />
            </app-form-field>
            <label class="inline-flex items-center gap-2 text-[13px] text-fg">
              <input
                type="checkbox"
                [checked]="form().reviewed"
                (change)="set('reviewed', $any($event.target).checked)"
              />
              {{ 'risk.soa.markReviewed' | transloco }}
              @if (e.reviewed_at) {
                <span class="text-fg-subtle">
                  ({{
                    'risk.soa.lastReviewed'
                      | transloco: { date: (e.reviewed_at | localDate: 'mediumDate') }
                  }})
                </span>
              }
            </label>
            <app-form-field
              [label]="'risk.fields.changeReason' | transloco"
              inputId="soa-change-reason"
            >
              <input
                id="soa-change-reason"
                maxlength="2000"
                [value]="form().change_reason"
                (input)="set('change_reason', $any($event.target).value)"
              />
            </app-form-field>
          </fieldset>

          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }
          @if (perms.canManage()) {
            <div class="flex justify-end">
              <app-button type="submit" [loading]="saving()" [disabled]="saving()">
                {{ 'risk.common.save' | transloco }}
              </app-button>
            </div>
          }

          <section class="border-t border-border pt-3">
            <h3 class="mb-2 text-[13.5px] font-semibold text-fg">
              {{ 'risk.soa.relatedRisks' | transloco: { treatments: e.treatment_count } }}
            </h3>
            <ul class="flex flex-col gap-1 text-[13px]">
              @for (r of e.risks; track r.id) {
                <li>
                  <a [routerLink]="['/risk/risks', r.id]" class="text-accent hover:underline">
                    <span class="font-mono">{{ r.code }}</span> {{ r.title }}
                  </a>
                </li>
              } @empty {
                <li class="text-fg-muted">{{ 'risk.soa.noRisks' | transloco }}</li>
              }
            </ul>
          </section>

          <section class="border-t border-border pt-3">
            <h3 class="mb-2 text-[13.5px] font-semibold text-fg">
              {{ 'risk.soa.history' | transloco }}
            </h3>
            <app-revision-history
              entityType="soa_entry"
              [entityId]="e.id"
              [fieldLabels]="fieldLabels"
            />
          </section>
        </form>
      }
    </app-slide-over>
  `,
})
export class SoaViewPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(RiskPermissions);

  readonly key = input.required<string>();
  /** `?control=<ref>` opens that control. */
  readonly control = input<string | undefined>(undefined);

  protected readonly applicableFilters: readonly ApplicableFilter[] = [
    'all',
    'yes',
    'no',
    'missing',
  ];
  protected readonly implementationStatuses = IMPLEMENTATION_STATUSES;
  protected readonly reasons = INCLUSION_REASONS;
  protected readonly fieldLabels = SOA_FIELD_LABELS;

  protected readonly soa = signal<Soa | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadErrorKey = signal('risk.common.loadFailed');
  protected readonly q = signal('');
  protected readonly applicable = signal<ApplicableFilter>('all');
  protected readonly implementation = signal<ImplementationStatus | ''>('');
  protected readonly theme = signal('');
  protected readonly selected = signal<SoaEntry | null>(null);
  protected readonly form = signal<EntryForm>(EMPTY_ENTRY_FORM);
  protected readonly saving = signal(false);
  protected readonly exporting = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  private openedControl: string | null = null;
  private sub: Subscription | null = null;

  protected readonly themes = computed(() => [
    ...new Set((this.soa()?.items ?? []).map((e) => e.theme).filter((t): t is string => !!t)),
  ]);

  /** Filtering is client-side: an SoA is at most ~100 rows. */
  protected readonly visible = computed(() => {
    const q = this.q().trim().toLowerCase();
    const applicable = this.applicable();
    const impl = this.implementation();
    const theme = this.theme();
    return (this.soa()?.items ?? []).filter(
      (e) =>
        (!q ||
          e.control_ref.toLowerCase().includes(q) ||
          e.title.toLowerCase().includes(q) ||
          (e.title_nb ?? '').toLowerCase().includes(q)) &&
        (applicable === 'all' ||
          (applicable === 'yes' && e.applicable) ||
          (applicable === 'no' && !e.applicable) ||
          (applicable === 'missing' && e.needs_justification)) &&
        (!impl || e.implementation_status === impl) &&
        (!theme || e.theme === theme),
    );
  });

  protected readonly panelTitle = computed(() => {
    const e = this.selected();
    return e ? `${e.control_ref} · ${this.titleOf(e)}` : '';
  });

  protected readonly justificationMissing = computed(() => {
    const f = this.form();
    return !f.applicable && !f.justification.trim() && this.submitted();
  });
  private readonly submitted = signal(false);

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'soa_entry',
      entityId: this.selected()?.id ?? null,
      view: this.selected() ? 'detail' : 'list',
      title: this.soa()?.standard_name ?? this.language.translate('risk.soa.title'),
      selection: this.selected() ? { field: this.selected()?.control_ref } : null,
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const key = this.key();
      untracked(() => this.load(orgId, key));
    });
    effect(() => {
      const control = this.control();
      const soa = this.soa();
      untracked(() => {
        if (control && soa && control !== this.openedControl) {
          const entry = soa.items.find((e) => e.control_ref === control);
          if (entry) {
            this.openedControl = control;
            this.open(entry, false);
          }
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, key: string): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = this.api.getSoa(orgId, key).subscribe({
      next: (soa) => {
        this.soa.set(soa);
        this.state.set('ready');
      },
      error: (e: unknown) => {
        this.loadErrorKey.set(riskErrorKey(e));
        this.state.set('error');
      },
    });
  }

  protected titleOf(e: SoaEntry): string {
    return this.language.active() === 'nb' && e.title_nb ? e.title_nb : e.title;
  }

  protected implTone(status: ImplementationStatus) {
    return implementationTone(status);
  }

  protected open(e: SoaEntry, syncUrl = true): void {
    this.selected.set(e);
    this.form.set(entryToForm(e));
    this.errorKey.set(null);
    this.submitted.set(false);
    if (syncUrl) {
      this.openedControl = e.control_ref;
      void this.router.navigate([], { queryParams: { control: e.control_ref }, replaceUrl: true });
    }
  }

  protected close(): void {
    this.selected.set(null);
    this.openedControl = null;
    void this.router.navigate([], { queryParams: { control: null }, replaceUrl: true });
  }

  protected set<K extends keyof EntryForm>(key: K, value: EntryForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected toggleReason(reason: InclusionReason, checked: boolean): void {
    this.form.update((f) => ({
      ...f,
      inclusion_reasons: checked
        ? [...new Set([...f.inclusion_reasons, reason])]
        : f.inclusion_reasons.filter((r) => r !== reason),
    }));
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    const entry = this.selected();
    const f = this.form();
    this.submitted.set(true);
    if (!orgId || !entry || (!f.applicable && !f.justification.trim())) {
      return;
    }
    const body = soaEntryPatch(entry, f);
    if (Object.keys(body).length === 0) {
      this.close();
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    this.api.updateSoaEntry(orgId, entry.id, body).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.toasts.success('risk.notices.soaSaved', { ref: updated.control_ref });
        this.selected.set(updated);
        this.form.set(entryToForm(updated));
        this.submitted.set(false);
        this.load(orgId, this.key());
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }

  protected generate(): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.api.generateSoa(orgId, this.key()).subscribe({
      next: (res) => {
        this.soa.set(res);
        this.toasts.success('risk.soa.generated', { count: res.created });
      },
      error: (e: unknown) => this.toasts.error(riskErrorKey(e)),
    });
  }

  protected exportCsv(): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.exporting.set(true);
    this.api.exportSoa(orgId, this.key()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `soa-${this.key()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting.set(false);
        this.toasts.error('risk.soa.exportFailed');
      },
    });
  }
}
