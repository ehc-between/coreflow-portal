import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, switchMap } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchItem } from '../../../core/search/search.models';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip, EntityChipRef } from '../../../shared/kit/entity-chip';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RecruitmentApi } from '../data/recruitment-api';
import { blankToNull } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  CheckPolicy,
  EntityLink,
  LINK_KINDS,
  LinkKind,
  MODULE_KEY,
  POLICY_CHECK_TYPES,
  PolicyCheckType,
  ROLE_RISKS,
  RecruitmentSettings,
  RecruitmentSettingsInput,
  RoleRisk,
} from '../data/recruitment.models';
import { RecordSearchPicker } from '../shared/record-search-picker';
import { RECRUITMENT_CRUMB, injectRecruitmentNav } from '../shared/recruitment-nav';
import { RecruitmentField } from '../shared/recruitment-field';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';

const MIN_DAYS = 30;
const MAX_DAYS = 3650;

/** Search types and settings field per linked record. */
const LINKS: Readonly<
  Record<LinkKind, { readonly type: string; readonly field: keyof RecruitmentSettingsInput }>
> = {
  processing_record: { type: 'ropa_entry', field: 'processing_record_id' },
  dpia: { type: 'dpia', field: 'dpia_id' },
  ai_system: { type: 'ai_system', field: 'ai_system_id' },
};

type Policy = Record<RoleRisk, PolicyCheckType[]>;

function policyFrom(p: CheckPolicy): Policy {
  const pick = (list: readonly string[]) =>
    POLICY_CHECK_TYPES.filter((t) => list.includes(t)) as PolicyCheckType[];
  return { low: pick(p.low ?? []), medium: pick(p.medium ?? []), high: pick(p.high ?? []) };
}

function samePolicy(a: Policy, b: Policy): boolean {
  return ROLE_RISKS.every((r) => a[r].join() === b[r].join());
}

function toRef(link: EntityLink | null | undefined): EntityChipRef | null {
  return link
    ? {
        entity_type: link.entity_type,
        entity_id: link.id,
        title: link.title,
        code: link.code,
        url: link.url,
        status: link.status,
      }
    : null;
}

/**
 * Recruitment settings (`recruitment:manage`): the privacy notice candidates get (an
 * approved document), the record of processing, DPIA and AI system that cover
 * recruitment in Privacy and AI governance, how long candidate data is kept, which
 * checks each risk level requires, and the erasure run with its evidence.
 */
@Component({
  selector: 'app-recruitment-settings',
  imports: [
    TranslocoPipe,
    WhyItMatters,
    EntityChip,
    LocalDatePipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    HelpStrip,
    LoadingState,
    ModuleNav,
    PageHeader,
    StatusBadge,
    RecordSearchPicker,
    RecruitmentField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="recruitment.settings.title"
        descriptionKey="recruitment.settings.description"
        [breadcrumbs]="breadcrumbs"
      />
      <app-module-nav [items]="nav()" labelKey="modules.names.recruitment" />
      <app-help-strip scope="recruitment" page="settings" lesson="candidate-privacy" />

      @if (loadError(); as key) {
        <app-error-state [bodyKey]="key" (retry)="reload()" />
      } @else if (settings(); as s) {
        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div class="flex min-w-0 flex-col gap-5">
            <!-- Privacy notice -->
            <app-card data-testid="set-notice">
              <h2 class="mb-1 text-section font-bold text-fg">
                {{ 'recruitment.settings.noticeSection' | transloco }}
              </h2>
              <p class="mb-3 text-ui text-fg-muted">
                {{ 'recruitment.settings.noticeIntro' | transloco }}
              </p>
              @if (s.privacy_notice_document; as doc) {
                <div class="flex flex-wrap items-center gap-2">
                  <app-entity-chip
                    [ref]="{
                      entity_type: 'document',
                      entity_id: doc.id,
                      title: doc.title,
                      code: doc.code,
                      url: doc.url,
                      status: doc.status,
                    }"
                    [showType]="false"
                  />
                  <app-status-badge meaning="lifecycle" [value]="doc.status" />
                  <button
                    type="button"
                    class="text-ui font-semibold text-fg-muted hover:text-fg"
                    [disabled]="busy() !== null"
                    (click)="link('privacy_notice_document_id', null)"
                  >
                    {{ 'recruitment.settings.unlink' | transloco }}
                  </button>
                </div>
                <p class="mt-2 text-meta text-fg-muted">
                  {{
                    'recruitment.settings.noticeVersion'
                      | transloco: { version: s.effective_notice_version ?? doc.version ?? '—' }
                  }}
                  @if (doc.approved_at) {
                    ·
                    {{
                      'recruitment.settings.noticeApprovedAt'
                        | transloco: { date: (doc.approved_at | localDate: 'mediumDate') }
                    }}
                  }
                </p>
              } @else {
                <app-alert tone="info" class="mb-3 block">
                  {{ 'recruitment.settings.noticeMissing' | transloco }}
                </app-alert>
                <app-record-search-picker
                  [types]="documentTypes"
                  labelKey="recruitment.settings.noticePick"
                  placeholderKey="recruitment.settings.noticePickPlaceholder"
                  testId="set-notice-search"
                  (picked)="link('privacy_notice_document_id', $event.entity_id)"
                />
                <details class="mt-4 text-ui">
                  <summary class="cursor-pointer font-semibold text-fg-muted">
                    {{ 'recruitment.settings.noticeLegacy' | transloco }}
                  </summary>
                  <div class="mt-3 flex flex-col gap-4">
                    <app-recruitment-field
                      labelKey="recruitment.fields.noticeVersion"
                      inputId="set-version"
                      page="settings"
                    >
                      <input
                        id="set-version"
                        maxlength="32"
                        [value]="noticeVersion()"
                        (input)="noticeVersion.set($any($event.target).value)"
                      />
                    </app-recruitment-field>
                    <app-recruitment-field
                      labelKey="recruitment.fields.noticeText"
                      inputId="set-notice"
                      page="settings"
                      help="privacy_notice"
                    >
                      <textarea
                        id="set-notice"
                        rows="8"
                        maxlength="20000"
                        [value]="noticeText()"
                        (input)="noticeText.set($any($event.target).value)"
                      ></textarea>
                    </app-recruitment-field>
                  </div>
                </details>
              }
            </app-card>

            <!-- Privacy and AI governance links -->
            <app-card data-testid="set-links">
              <h2 class="mb-1 text-section font-bold text-fg">
                {{ 'recruitment.settings.linksSection' | transloco }}
              </h2>
              <p class="mb-3 text-ui text-fg-muted">
                {{ 'recruitment.settings.linksIntro' | transloco }}
              </p>
              <ul class="flex flex-col divide-y divide-border">
                @for (kind of linkKinds; track kind) {
                  <li class="py-3 first:pt-0 last:pb-0" [attr.data-testid]="'set-link-' + kind">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div class="min-w-0">
                        <h3 class="text-body font-semibold text-fg">
                          {{ 'recruitment.settings.links.' + kind + '.title' | transloco }}
                        </h3>
                        <p class="text-meta text-fg-muted">
                          {{ 'recruitment.settings.links.' + kind + '.why' | transloco }}
                        </p>
                      </div>
                      @if (!linkRef(kind) && picking() !== kind) {
                        <div class="flex flex-wrap gap-2">
                          <app-button
                            size="sm"
                            [loading]="busy() === kind"
                            [disabled]="busy() !== null"
                            (click)="createLinked(kind)"
                            [attr.data-testid]="'set-create-' + kind"
                          >
                            {{ 'recruitment.settings.links.' + kind + '.create' | transloco }}
                          </app-button>
                          <app-button
                            size="sm"
                            variant="secondary"
                            [disabled]="busy() !== null"
                            (click)="picking.set(kind)"
                          >
                            {{ 'recruitment.settings.linkExisting' | transloco }}
                          </app-button>
                        </div>
                      }
                    </div>
                    @if (linkRef(kind); as ref) {
                      <div class="mt-2 flex flex-wrap items-center gap-2">
                        <app-entity-chip [ref]="ref" [statusText]="true" />
                        <button
                          type="button"
                          class="text-ui font-semibold text-fg-muted hover:text-fg"
                          [disabled]="busy() !== null"
                          (click)="link(fieldOf(kind), null)"
                        >
                          {{ 'recruitment.settings.unlink' | transloco }}
                        </button>
                      </div>
                    } @else if (picking() === kind) {
                      <div class="mt-2 flex items-start gap-2">
                        <app-record-search-picker
                          class="min-w-0 flex-1"
                          [types]="[typeOf(kind)]"
                          [labelKey]="'recruitment.settings.links.' + kind + '.title'"
                          placeholderKey="recruitment.picker.placeholder"
                          (picked)="pickLinked(kind, $event)"
                        />
                        <app-button size="sm" variant="ghost" (click)="picking.set(null)">
                          {{ 'common.cancel' | transloco }}
                        </app-button>
                      </div>
                    }
                    @if (kind === 'dpia' && !s.dpia && dpiaReasons().length > 0) {
                      <div class="mt-2 rounded-tile bg-warn-soft px-3 py-2 text-meta text-warn-ink">
                        <p class="font-semibold">
                          {{ 'recruitment.settings.dpiaAdvised' | transloco }}
                        </p>
                        <ul class="mt-1 list-disc pl-4">
                          @for (r of dpiaReasons(); track r) {
                            <li>{{ 'recruitment.settings.dpiaReasons.' + r | transloco }}</li>
                          }
                        </ul>
                      </div>
                    }
                    @if (kind === 'ai_system' && s.ai_use; as use) {
                      <p class="mt-2 text-meta text-fg-muted" data-testid="set-ai-use">
                        {{ 'recruitment.settings.aiUse' | transloco: { count: use.runs_30d } }}
                        @if (use.last_run_at) {
                          ·
                          {{
                            'recruitment.settings.aiLastUse'
                              | transloco: { date: (use.last_run_at | localDate) }
                          }}
                        }
                      </p>
                    }
                  </li>
                }
              </ul>
            </app-card>

            <form class="flex flex-col gap-5" novalidate (submit)="$event.preventDefault(); save()">
              <app-card>
                <h2 class="mb-1 text-section font-bold text-fg">
                  {{ 'recruitment.settings.retentionSection' | transloco }}
                </h2>
                <p class="mb-3 text-ui text-fg-muted">
                  {{ 'recruitment.settings.retentionIntro' | transloco }}
                </p>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <app-recruitment-field
                    labelKey="recruitment.fields.retentionDays"
                    inputId="set-retention"
                    page="settings"
                    help="retention_days"
                    [required]="true"
                    [error]="dayError(retentionDays())"
                  >
                    <input
                      id="set-retention"
                      type="number"
                      [min]="minDays"
                      [max]="maxDays"
                      [value]="retentionDays()"
                      (input)="retentionDays.set(+$any($event.target).value)"
                    />
                  </app-recruitment-field>
                  <app-recruitment-field
                    labelKey="recruitment.fields.talentPoolDays"
                    inputId="set-pool"
                    page="settings"
                    help="talent_pool_days"
                    [required]="true"
                    [error]="dayError(poolDays())"
                  >
                    <input
                      id="set-pool"
                      type="number"
                      [min]="minDays"
                      [max]="maxDays"
                      [value]="poolDays()"
                      (input)="poolDays.set(+$any($event.target).value)"
                    />
                  </app-recruitment-field>
                  <app-recruitment-field
                    labelKey="recruitment.fields.hiredRetentionDays"
                    inputId="set-hired"
                    page="settings"
                    help="hired_retention_days"
                    [required]="true"
                    [error]="dayError(hiredDays())"
                  >
                    <input
                      id="set-hired"
                      type="number"
                      [min]="minDays"
                      [max]="maxDays"
                      [value]="hiredDays()"
                      (input)="hiredDays.set(+$any($event.target).value)"
                      data-testid="set-hired"
                    />
                  </app-recruitment-field>
                </div>
              </app-card>

              <app-card data-testid="set-policy">
                <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="text-section font-bold text-fg">
                    {{ 'recruitment.settings.policySection' | transloco }}
                  </h2>
                  @if (policyCustom()) {
                    <app-button size="sm" variant="ghost" (click)="resetPolicy()">
                      {{ 'recruitment.settings.policyReset' | transloco }}
                    </app-button>
                  }
                </div>
                <p class="mb-3 text-ui text-fg-muted">
                  {{ 'recruitment.settings.policyIntro' | transloco }}
                </p>
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[420px] text-ui">
                    <caption class="sr-only">
                      {{
                        'recruitment.settings.policySection' | transloco
                      }}
                    </caption>
                    <thead>
                      <tr class="border-b border-border text-left text-meta text-fg-muted">
                        <th scope="col" class="py-2 pr-3 font-semibold">
                          {{ 'recruitment.fields.checkType' | transloco }}
                        </th>
                        @for (risk of risks; track risk) {
                          <th scope="col" class="px-2 py-2 text-center font-semibold">
                            {{ 'recruitment.roleRisk.' + risk | transloco }}
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (type of policyTypes; track type) {
                        <tr class="border-b border-border last:border-b-0">
                          <th scope="row" class="py-2 pr-3 text-left font-normal text-fg">
                            {{ 'recruitment.checkType.' + type | transloco }}
                          </th>
                          @for (risk of risks; track risk) {
                            <td class="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                class="h-4 w-4 accent-[var(--accent)]"
                                [checked]="policy()[risk].includes(type)"
                                (change)="togglePolicy(risk, type, $any($event.target).checked)"
                                [attr.aria-label]="
                                  'recruitment.settings.policyCell'
                                    | transloco
                                      : {
                                          type: ('recruitment.checkType.' + type | transloco),
                                          risk: ('recruitment.roleRisk.' + risk | transloco),
                                        }
                                "
                              />
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="mt-3 text-meta text-fg-muted">
                  {{
                    'recruitment.settings.legalBasisChecks'
                      | transloco: { checks: legalBasisText() }
                  }}
                </p>
              </app-card>

              @if (saveError(); as key) {
                <app-alert>{{ key | transloco }}</app-alert>
              }
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-meta text-fg-subtle">
                  @if (s.updated_at) {
                    {{
                      'recruitment.settings.updatedAt'
                        | transloco: { date: (s.updated_at | localDate) }
                    }}
                  }
                </span>
                <app-button type="submit" [loading]="busy() === 'save'" data-testid="set-save">
                  {{ 'recruitment.common.save' | transloco }}
                </app-button>
              </div>
            </form>
          </div>

          <aside class="flex flex-col gap-4" [attr.aria-label]="'ui.detail.aside' | transloco">
            <app-card data-testid="set-retention-run">
              <h2 class="mb-2 text-card font-bold text-fg">
                {{ 'recruitment.settings.purgeSection' | transloco }}
              </h2>
              <p class="mb-3 text-ui text-fg-muted">
                {{ 'recruitment.settings.purgeIntro' | transloco }}
              </p>
              @if (s.retention_run; as run) {
                <dl class="mb-3 flex flex-col gap-2 text-ui">
                  <div class="flex items-center justify-between gap-2">
                    <dt class="text-fg-muted">{{ 'recruitment.settings.dueNow' | transloco }}</dt>
                    <dd
                      class="font-semibold"
                      [class]="run.due_now > 0 ? 'text-warn-ink' : 'text-fg'"
                    >
                      {{ run.due_now }}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <dt class="text-fg-muted">{{ 'recruitment.settings.due30' | transloco }}</dt>
                    <dd class="font-semibold text-fg">{{ run.due_30d }}</dd>
                  </div>
                  <div>
                    <dt class="text-fg-muted">{{ 'recruitment.settings.lastRun' | transloco }}</dt>
                    <dd class="text-fg">
                      @if (run.last_run_at) {
                        {{
                          'recruitment.settings.lastRunValue'
                            | transloco
                              : {
                                  date: (run.last_run_at | localDate),
                                  count: run.last_run_erased ?? 0,
                                }
                        }}
                      } @else {
                        {{ 'recruitment.settings.neverRun' | transloco }}
                      }
                    </dd>
                  </div>
                </dl>
              }
              <app-button
                variant="danger"
                size="sm"
                [disabled]="(s.retention_run?.due_now ?? 1) === 0"
                (click)="purging.set(true)"
                data-testid="purge"
              >
                {{
                  ((s.retention_run?.due_now ?? 1) === 0
                    ? 'recruitment.settings.nothingDue'
                    : 'recruitment.settings.purgeCount'
                  ) | transloco: { count: s.retention_run?.due_now ?? 0 }
                }}
              </app-button>
            </app-card>
            <app-why-it-matters scope="recruitment" page="settings" />
          </aside>
        </div>
      } @else {
        <app-loading-state [rows]="6" />
      }
    </div>

    <app-confirm-dialog
      [open]="purging()"
      [title]="'recruitment.settings.purgeTitle' | transloco"
      [message]="
        'recruitment.settings.purgeMessage'
          | transloco: { count: settings()?.retention_run?.due_now ?? 0 }
      "
      [confirmLabel]="'recruitment.settings.purge' | transloco"
      [cancelLabel]="'recruitment.common.keep' | transloco"
      [busy]="busy() === 'purge'"
      (confirmed)="purge()"
      (cancelled)="purging.set(false)"
    />
  `,
})
export class RecruitmentSettingsPage {
  private readonly api = inject(RecruitmentApi);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly perms = injectRecruitmentPerms();
  protected readonly nav = injectRecruitmentNav(this.perms);
  protected readonly breadcrumbs = [RECRUITMENT_CRUMB, { labelKey: 'recruitment.settings.title' }];

  protected readonly risks = ROLE_RISKS;
  protected readonly policyTypes = POLICY_CHECK_TYPES;
  protected readonly linkKinds = LINK_KINDS;
  protected readonly documentTypes = ['document'];
  protected readonly minDays = MIN_DAYS;
  protected readonly maxDays = MAX_DAYS;

  protected readonly settings = signal<RecruitmentSettings | null>(null);
  protected readonly retentionDays = signal(180);
  protected readonly poolDays = signal(730);
  protected readonly hiredDays = signal(180);
  protected readonly noticeText = signal('');
  protected readonly noticeVersion = signal('');
  protected readonly policy = signal<Policy>({ low: [], medium: [], high: [] });
  /** null = keep; 'reset' = back to the default table on save. */
  protected readonly policyReset = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly busy = signal<'save' | 'purge' | 'link' | LinkKind | null>(null);
  protected readonly purging = signal(false);
  protected readonly picking = signal<LinkKind | null>(null);
  protected readonly submitted = signal(false);
  private readonly version = signal(0);

  protected readonly policyCustom = computed(() => {
    const s = this.settings();
    if (!s || this.policyReset()) {
      return false;
    }
    const def = s.default_check_policy ? policyFrom(s.default_check_policy) : null;
    return def ? !samePolicy(def, this.policy()) : !!s.check_policy_custom;
  });
  protected readonly dpiaReasons = computed(() => this.settings()?.dpia_reasons ?? []);
  protected readonly legalBasisText = computed(() =>
    (this.settings()?.legal_basis_checks ?? ['criminal_record', 'credit'])
      .map((t) => this.language.translate(`recruitment.checkType.${t}`))
      .join(', '),
  );

  constructor() {
    providePageContext(() => ({
      module: MODULE_KEY,
      view: 'settings',
      title: this.language.translate('recruitment.settings.title'),
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      this.version();
      if (!orgId) {
        return;
      }
      this.loadError.set(null);
      const sub = this.api.getSettings(orgId).subscribe({
        next: (s) => this.apply(s),
        error: (err) => this.loadError.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }

  protected dayError(n: number): string | null {
    const ok = Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS;
    return this.submitted() && !ok ? 'recruitment.form.errors.days' : null;
  }

  private valid(): boolean {
    const ok = (n: number) => Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS;
    return ok(this.retentionDays()) && ok(this.poolDays()) && ok(this.hiredDays());
  }

  private apply(s: RecruitmentSettings): void {
    this.settings.set(s);
    this.retentionDays.set(s.retention_days);
    this.poolDays.set(s.talent_pool_days);
    this.hiredDays.set(s.hired_retention_days ?? 180);
    this.noticeText.set(s.privacy_notice ?? '');
    this.noticeVersion.set(s.privacy_notice_version ?? '');
    this.policy.set(policyFrom(s.check_policy));
    this.policyReset.set(false);
  }

  protected fieldOf(kind: LinkKind): keyof RecruitmentSettingsInput {
    return LINKS[kind].field;
  }

  protected typeOf(kind: LinkKind): string {
    return LINKS[kind].type;
  }

  protected linkRef(kind: LinkKind): EntityChipRef | null {
    return toRef(this.settings()?.[kind]);
  }

  protected togglePolicy(risk: RoleRisk, type: PolicyCheckType, on: boolean): void {
    this.policyReset.set(false);
    this.policy.update((p) => {
      const list = on ? [...new Set([...p[risk], type])] : p[risk].filter((t) => t !== type);
      return { ...p, [risk]: POLICY_CHECK_TYPES.filter((t) => list.includes(t)) };
    });
  }

  protected resetPolicy(): void {
    const def = this.settings()?.default_check_policy;
    if (def) {
      this.policy.set(policyFrom(def));
    }
    this.policyReset.set(true);
  }

  /** The required PUT fields, unchanged (for link-only saves). */
  private base(): RecruitmentSettingsInput {
    const s = this.settings()!;
    return { retention_days: s.retention_days, talent_pool_days: s.talent_pool_days };
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.submitted.set(true);
    if (!this.valid()) {
      this.saveError.set('recruitment.form.fixErrors');
      return;
    }
    this.saveError.set(null);
    const s = this.settings();
    const body: RecruitmentSettingsInput = {
      retention_days: this.retentionDays(),
      talent_pool_days: this.poolDays(),
      hired_retention_days: this.hiredDays(),
      ...(s?.privacy_notice_document
        ? {}
        : {
            privacy_notice: blankToNull(this.noticeText()),
            privacy_notice_version: blankToNull(this.noticeVersion()),
          }),
      check_policy: this.policyReset() ? null : this.policy(),
    };
    this.busy.set('save');
    this.api.updateSettings(orgId, body).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.apply(updated);
        this.toasts.success('recruitment.settings.saved');
      },
      error: (err) => {
        this.busy.set(null);
        this.saveError.set(recruitmentError(err).key);
      },
    });
  }

  /** Link (or with null unlink) a document / processing record / DPIA / AI system now. */
  protected link(field: keyof RecruitmentSettingsInput, id: string | null): void {
    const orgId = this.orgId();
    if (!orgId || !this.settings()) {
      return;
    }
    this.busy.set('link');
    this.send(this.api.updateSettings(orgId, { ...this.base(), [field]: id }), () =>
      this.toasts.success(id ? 'recruitment.settings.linked' : 'recruitment.settings.unlinked'),
    );
  }

  protected pickLinked(kind: LinkKind, item: SearchItem): void {
    this.picking.set(null);
    this.link(this.fieldOf(kind), item.entity_id);
  }

  /** Create the prefilled record in Privacy / AI governance and link it. */
  protected createLinked(kind: LinkKind): void {
    const orgId = this.orgId();
    if (!orgId || !this.settings()) {
      return;
    }
    this.busy.set(kind);
    const call = this.api.linkPrefill(orgId, kind, this.language.active()).pipe(
      switchMap((prefill) =>
        this.api.createLinked(prefill).pipe(
          switchMap((created) =>
            this.api.updateSettings(orgId, {
              ...this.base(),
              [prefill.settings_field]: created.id,
            }),
          ),
        ),
      ),
    );
    this.send(call, () => this.toasts.success(`recruitment.settings.links.${kind}.created`));
  }

  private send(call: Observable<RecruitmentSettings>, done: () => void): void {
    call.subscribe({
      next: (updated) => {
        this.busy.set(null);
        const policy = this.policy();
        const dirtyPolicy = this.policyCustom() || this.policyReset();
        this.apply(updated);
        if (dirtyPolicy) {
          this.policy.set(policy);
        }
        done();
      },
      error: (err) => {
        this.busy.set(null);
        const e = recruitmentError(err);
        this.toasts.error(
          e.key === 'recruitment.errors.forbidden' || e.key.startsWith('errors.')
            ? 'recruitment.settings.linkFailed'
            : e.key,
        );
      },
    });
  }

  protected purge(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set('purge');
    this.api.purgeExpired(orgId).subscribe({
      next: (res) => {
        this.busy.set(null);
        this.purging.set(false);
        this.toasts.success('recruitment.settings.purged', { count: res.erased });
        this.reload();
      },
      error: (err) => {
        this.busy.set(null);
        this.purging.set(false);
        this.toasts.error(recruitmentError(err).key);
      },
    });
  }
}
