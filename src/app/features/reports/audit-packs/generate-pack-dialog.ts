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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { FlowContext } from '../../../core/kit/create-flow.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { frameworkLabelKey, labelOr, localized } from '../data/report-display';
import { reportErrorKey } from '../data/report-errors';
import {
  AuditPack,
  LinkedRecord,
  MAX_PACK_STANDARDS,
  REPORT_LANGS,
  Register,
  ReportLang,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { StandardOptions } from '../data/standard-options';

/** Registers that never go into a pack as a sheet (they are the pack's own sections). */
const PACK_SECTIONS = new Set(['soa', 'evidence_index', 'readiness']);

/** What a pack can be prefilled with (from an audit's "Lag revisjonspakke"). */
export interface PackPrefill {
  readonly standardKeys?: readonly string[];
  readonly auditPlan?: LinkedRecord | null;
  readonly title?: string | null;
}

/** A flow's prefill (`audit_plan.to_audit_pack`) as drawer values. */
export function prefillFromFlow(flow: FlowContext | null): PackPrefill | null {
  if (!flow) {
    return null;
  }
  const p = flow.prefill;
  const keys = Array.isArray(p['standard_keys'])
    ? (p['standard_keys'] as unknown[]).filter((k): k is string => typeof k === 'string')
    : [];
  const planId = typeof p['audit_plan_id'] === 'string' ? (p['audit_plan_id'] as string) : null;
  const from = p.from ?? null;
  return {
    standardKeys: keys,
    auditPlan: planId
      ? {
          id: planId,
          code: from?.code ?? null,
          title: from?.title ?? null,
          url: from?.url ?? null,
        }
      : null,
    title: typeof p.title === 'string' ? p.title : null,
  };
}

/** Whether a period is valid: both empty, one end only, or start on or before end. */
export function validPeriod(start: string, end: string): boolean {
  return !start || !end || start <= end;
}

/**
 * Generates an audit pack: one or more enabled standards (up to eight), optionally
 * the audit it is for and the period it covers, a title and language, whether to
 * include approved policies, and the registers — pre-ticked with the ones an
 * auditor of those standards expects (risk assessment, internal audit, management
 * review, competence, suppliers, assets …). Generation runs during the request; the
 * drawer stays open, busy, until the pack is ready.
 */
@Component({
  selector: 'app-generate-pack-dialog',
  imports: [
    TranslocoPipe,
    FieldHelp,
    EntityChip,
    FlowBanner,
    Alert,
    Button,
    DateInput,
    FormField,
    Icon,
    SlideOver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'reports.packs.generateTitle' | transloco"
      [closeLabel]="'reports.common.close' | transloco"
      [width]="560"
      (closed)="close()"
    >
      @if (open()) {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
          <app-flow-banner [flow]="flow()" />
          <p class="text-ui text-fg-muted">{{ 'reports.packs.generateIntro' | transloco }}</p>
          @if (standardsReady() && standards().length === 0) {
            <app-alert tone="info">{{ 'reports.packs.noStandards' | transloco }}</app-alert>
          }

          <fieldset>
            <legend class="mb-1 text-ui font-semibold text-fg-muted">
              {{ 'reports.packs.standards' | transloco }}
            </legend>
            <div class="flex flex-col gap-1">
              @for (s of standards(); track s.standard_key) {
                <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="standardKeys().includes(s.standard_key)"
                    [disabled]="
                      !standardKeys().includes(s.standard_key) && standardKeys().length >= max
                    "
                    (change)="toggleStandard(s.standard_key)"
                  />
                  {{ standardName(s.framework || s.standard_key) }}
                </label>
              }
            </div>
            <app-field-help class="mt-1 block" scope="reports" page="auditPacks" field="standard" />
            @if (submitted() && standardKeys().length === 0 && !auditPlan()) {
              <p class="mt-1 text-meta text-fail-ink" role="alert">
                {{ 'reports.packs.standardRequired' | transloco }}
              </p>
            }
          </fieldset>

          <div>
            <p class="mb-1 text-ui font-semibold text-fg-muted" id="pack-audit-label">
              {{ 'reports.packs.audit' | transloco }}
            </p>
            @if (auditPlan(); as plan) {
              <div class="flex flex-wrap items-center gap-2">
                <app-entity-chip [ref]="planRef(plan)" />
                <app-button variant="ghost" size="sm" (click)="setAudit(null)">
                  {{ 'reports.packs.removeAudit' | transloco }}
                </app-button>
              </div>
            } @else {
              <label for="pack-audit" class="sr-only">{{
                'reports.packs.auditSearch' | transloco
              }}</label>
              <input
                id="pack-audit"
                type="search"
                aria-describedby="pack-audit-label"
                class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                [placeholder]="'reports.packs.auditSearch' | transloco"
                (input)="search($any($event.target).value)"
              />
              @if (auditHits().length) {
                <ul
                  class="mt-1 flex flex-col rounded-tile border border-border bg-surface p-1"
                  data-testid="audit-hits"
                >
                  @for (hit of auditHits(); track hit.entity_id) {
                    <li>
                      <button
                        type="button"
                        class="flex w-full min-h-9 items-center gap-2 rounded-tile px-2 text-left text-ui hover:bg-surface-2"
                        (click)="pickAudit(hit)"
                      >
                        @if (hit.code) {
                          <span class="font-mono text-meta text-fg-muted">{{ hit.code }}</span>
                        }
                        <span class="min-w-0 truncate text-fg">{{ hit.title }}</span>
                      </button>
                    </li>
                  }
                </ul>
              }
              <app-field-help class="mt-1 block" scope="reports" page="auditPacks" field="audit" />
            }
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <app-form-field [label]="'reports.packs.periodStart' | transloco" inputId="pack-from">
              <app-date-input
                inputId="pack-from"
                [value]="periodStart()"
                (valueChange)="periodStart.set($event ?? '')"
              />
            </app-form-field>
            <app-form-field [label]="'reports.packs.periodEnd' | transloco" inputId="pack-to">
              <app-date-input
                inputId="pack-to"
                [value]="periodEnd()"
                (valueChange)="periodEnd.set($event ?? '')"
              />
            </app-form-field>
          </div>
          @if (!periodOk()) {
            <p class="-mt-3 text-meta text-fail-ink" role="alert">
              {{ 'reports.errors.invalid_window' | transloco }}
            </p>
          } @else {
            <app-field-help class="-mt-3 block" scope="reports" page="auditPacks" field="period" />
          }

          <app-form-field [label]="'reports.packs.packTitle' | transloco" inputId="pack-title">
            <input
              id="pack-title"
              type="text"
              maxlength="255"
              [value]="title()"
              [placeholder]="'reports.packs.packTitlePlaceholder' | transloco"
              (input)="title.set($any($event.target).value)"
            />
          </app-form-field>
          <app-form-field [label]="'reports.form.lang' | transloco" inputId="pack-lang">
            <select id="pack-lang" (change)="lang.set($any($event.target).value)">
              @for (l of langs; track l) {
                <option [value]="l" [selected]="l === lang()">
                  {{ 'reports.langs.' + l | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="includePolicies()"
              (change)="includePolicies.set($any($event.target).checked)"
            />
            {{ 'reports.packs.includePolicies' | transloco }}
          </label>

          @if (registers().length) {
            <fieldset data-testid="pack-registers">
              <legend class="mb-1 text-ui font-semibold text-fg-muted">
                {{ 'reports.packs.registers' | transloco }}
              </legend>
              @if (recommended().length) {
                <p class="mb-1 text-meta text-fg-muted">
                  {{ 'reports.packs.recommendedHint' | transloco }}
                </p>
              }
              <div class="flex flex-col gap-0.5">
                @for (reg of registers(); track reg.key) {
                  <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="isChosen(reg.key)"
                      (change)="toggle(reg.key)"
                    />
                    <span class="min-w-0">{{ name(reg) }}</span>
                    @if (recommended().includes(reg.key)) {
                      <span class="text-micro font-semibold text-accent">{{
                        'reports.packs.recommended' | transloco
                      }}</span>
                    }
                  </label>
                }
              </div>
              <div class="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="text-meta font-semibold text-accent hover:underline"
                  (click)="chooseAll()"
                >
                  {{ 'reports.packs.chooseAll' | transloco }}
                </button>
                @if (recommended().length) {
                  <button
                    type="button"
                    class="text-meta font-semibold text-accent hover:underline"
                    (click)="chooseRecommended()"
                  >
                    {{ 'reports.packs.chooseRecommended' | transloco }}
                  </button>
                }
              </div>
            </fieldset>
          }
          @if (saving()) {
            <p class="text-meta text-fg-muted" role="status">
              {{ 'reports.packs.building' | transloco }}
            </p>
          }
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div class="flex justify-end gap-2">
            <app-button variant="ghost" [disabled]="saving()" (click)="close()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()">
              <app-icon name="audit" [size]="15" />
              {{ 'reports.packs.generateSubmit' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-slide-over>
  `,
})
export class GeneratePackDialog {
  private readonly api = inject(ReportsApi);
  private readonly searchApi = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly standardOptions = inject(StandardOptions);

  readonly open = input(false);
  /** The create-from-here flow the drawer was opened by (an audit), if any. */
  readonly flow = input<FlowContext | null>(null);
  /** Values to start from (e.g. the audit and its standards). */
  readonly prefill = input<PackPrefill | null>(null);
  readonly closed = output<void>();
  readonly generated = output<AuditPack>();

  protected readonly langs = REPORT_LANGS;
  protected readonly max = MAX_PACK_STANDARDS;
  protected readonly standards = this.standardOptions.items;
  protected readonly standardsReady = this.standardOptions.ready;
  protected readonly uiLang = computed(() => this.language.active());

  protected readonly standardKeys = signal<readonly string[]>([]);
  protected readonly auditPlan = signal<LinkedRecord | null>(null);
  protected readonly auditHits = signal<readonly SearchItem[]>([]);
  protected readonly periodStart = signal('');
  protected readonly periodEnd = signal('');
  protected readonly title = signal('');
  protected readonly lang = signal<ReportLang>('en');
  protected readonly includePolicies = signal(true);
  /** null = everything offered (the API default). */
  protected readonly chosen = signal<readonly string[] | null>(null);
  protected readonly allRegisters = signal<readonly Register[]>([]);
  protected readonly recommended = signal<readonly string[]>([]);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly periodOk = computed(() => validPeriod(this.periodStart(), this.periodEnd()));

  protected readonly registers = computed(() =>
    this.allRegisters().filter((r) => !PACK_SECTIONS.has(r.key) && r.in_audit_pack !== false),
  );

  private readonly queries = new Subject<string>();
  private optionsSub = new Subscription();

  constructor() {
    const destroyRef = inject(DestroyRef);
    const searchSub = this.queries
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          return this.searchApi.search(orgId ?? '', q.length >= 2 && orgId ? q : '', {
            types: ['audit_plan'],
            limit: 8,
          });
        }),
      )
      .subscribe({
        next: (res) => this.auditHits.set(res.items),
        error: () => this.auditHits.set([]),
      });
    destroyRef.onDestroy(() => {
      searchSub.unsubscribe();
      this.optionsSub.unsubscribe();
    });
    effect(() => {
      if (!this.open()) {
        return;
      }
      const prefill = this.prefill();
      untracked(() => this.prepare(prefill));
    });
  }

  protected name(reg: Register): string {
    return localized(reg.label, this.language.active(), reg.key);
  }

  protected standardName(key: string): string {
    return labelOr((k) => this.language.translate(k), frameworkLabelKey(frameworkOf(key)), key);
  }

  protected planRef(plan: LinkedRecord) {
    return {
      entity_type: 'audit_plan',
      entity_id: plan.id,
      title: plan.title ?? '',
      code: plan.code,
      url: plan.url,
      module: 'audits',
    };
  }

  protected isChosen(key: string): boolean {
    const chosen = this.chosen();
    return chosen === null || chosen.includes(key);
  }

  protected toggle(key: string): void {
    const all = this.registers().map((r) => r.key);
    const current = this.chosen() ?? all;
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    this.chosen.set(next.length === all.length ? null : all.filter((k) => next.includes(k)));
  }

  protected chooseAll(): void {
    this.chosen.set(null);
  }

  protected chooseRecommended(): void {
    const offered = new Set(this.registers().map((r) => r.key));
    this.chosen.set(this.recommended().filter((k) => offered.has(k)));
  }

  protected toggleStandard(key: string): void {
    const current = this.standardKeys();
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : current.length < MAX_PACK_STANDARDS
        ? [...current, key]
        : current;
    this.standardKeys.set(next);
    this.loadOptions();
  }

  protected search(text: string): void {
    this.queries.next(text.trim());
  }

  protected pickAudit(hit: SearchItem): void {
    this.setAudit({ id: hit.entity_id, code: hit.code, title: hit.title, url: hit.url });
  }

  protected setAudit(plan: LinkedRecord | null): void {
    this.auditPlan.set(plan);
    this.auditHits.set([]);
    this.loadOptions();
  }

  protected close(): void {
    if (!this.saving()) {
      this.closed.emit();
    }
  }

  protected submit(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    const keys = this.standardKeys();
    const plan = this.auditPlan();
    if (!orgId || (keys.length === 0 && !plan) || !this.periodOk() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .createAuditPack(orgId, {
        standard_key: keys[0] ?? null,
        standard_keys: keys,
        audit_plan_id: plan?.id ?? null,
        period_start: this.periodStart() || null,
        period_end: this.periodEnd() || null,
        title: this.title().trim() || null,
        lang: this.lang(),
        include_policies: this.includePolicies(),
        registers: this.chosen(),
      })
      .subscribe({
        next: (pack) => {
          this.saving.set(false);
          this.generated.emit(pack);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(reportErrorKey(error));
        },
      });
  }

  private prepare(prefill: PackPrefill | null): void {
    this.submitted.set(false);
    this.error.set(null);
    this.chosen.set(null);
    this.recommended.set([]);
    this.periodStart.set('');
    this.periodEnd.set('');
    this.auditHits.set([]);
    this.standardKeys.set([...(prefill?.standardKeys ?? [])].slice(0, MAX_PACK_STANDARDS));
    this.auditPlan.set(prefill?.auditPlan ?? null);
    this.title.set(prefill?.title ?? '');
    const lang = this.language.active();
    this.lang.set((REPORT_LANGS as readonly string[]).includes(lang) ? (lang as ReportLang) : 'en');
    this.standardOptions.ensure();
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId && this.allRegisters().length === 0) {
      this.api.registers(orgId).subscribe({
        next: (list) => {
          if (this.allRegisters().length === 0) {
            this.allRegisters.set(list.items);
          }
        },
        error: () => undefined,
      });
    }
    this.loadOptions();
  }

  /** Pre-tick the registers recommended for the chosen standards / audit. */
  private loadOptions(): void {
    this.optionsSub.unsubscribe();
    this.optionsSub = new Subscription();
    const orgId = this.selectedOrg.currentOrgId();
    const keys = this.standardKeys();
    const plan = this.auditPlan();
    if (!orgId || (keys.length === 0 && !plan)) {
      this.recommended.set([]);
      this.chosen.set(null);
      return;
    }
    this.optionsSub.add(
      this.api.auditPackOptions(orgId, { standard_keys: keys, audit_plan_id: plan?.id }).subscribe({
        next: (options) => {
          if (options.registers?.length) {
            this.allRegisters.set(options.registers);
          }
          if (keys.length === 0 && options.standard_keys?.length) {
            // An audit alone: tick the audit's standards.
            this.standardKeys.set(options.standard_keys.slice(0, MAX_PACK_STANDARDS));
          }
          this.recommended.set(options.recommended_registers ?? []);
          if (this.recommended().length) {
            this.chooseRecommended();
          } else {
            this.chosen.set(null);
          }
        },
        // Older backends have no options endpoint: offer everything ticked.
        error: () => {
          this.recommended.set([]);
          this.chosen.set(null);
        },
      }),
    );
  }
}
