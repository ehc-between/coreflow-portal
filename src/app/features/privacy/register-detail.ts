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
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { formatLocalDate, formatLocalDay } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { PrivacyApi } from './data/privacy-api';
import {
  ConsentRecord,
  DataBreach,
  DataSubjectRequest,
  Dpia,
  DpiaRisk,
  LegalBasisAssessment,
  PERM_APPROVE,
  PERM_MANAGE,
  PrivacyRecord,
} from './data/privacy.models';
import { statusKey, statusTone } from './data/privacy-display';
import { privacyError } from './data/privacy-errors';
import { PrivacyRefsService } from './data/privacy-refs.service';
import {
  FactDef,
  FieldDef,
  REGISTERS,
  RegisterKey,
  fieldLabelKey,
  revisionFieldLabels,
} from './data/privacy-registers';
import { BreachPanel, DecisionPanel, DsrPanel } from './detail-panels';
import { REGISTER_LESSONS } from './register-list';
import { PrivacyLessonLink, privacyPermissions } from './privacy-nav';

interface ShownValue {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  readonly wide: boolean;
  readonly link?: readonly unknown[] | null;
}

interface ShownSection {
  readonly key: string;
  readonly values: readonly ShownValue[];
}

/** Statuses that need an outcome on a data subject request. */
const OUTCOME_STATUSES = ['completed', 'rejected'];

/**
 * A privacy record (`/privacy/<segment>/:id`) of any register: the register's
 * own panel (request deadline, breach clock, DPIA / assessment decision),
 * status changes, every field by section, clause evidence, and the record kit
 * tabs (tasks, related items, activity, comments, attachments, revisions).
 */
@Component({
  selector: 'app-privacy-register-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    PromptDialog,
    BreachPanel,
    DecisionPanel,
    DsrPanel,
    PrivacyLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'privacy.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ loadError() | transloco }}</app-alert>
          <a
            [routerLink]="['/privacy', def().segment]"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'privacy.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (record(); as r) {
          <app-record-detail-layout
            [entityType]="def().entityType"
            [entityId]="r.id"
            [tabs]="tabs()"
            [canEdit]="canWrite()"
            [fieldLabels]="fieldLabels()"
            [backLink]="['/privacy', def().segment]"
            backLabelKey="privacy.common.backToList"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ r.code }}</span>
                <span>{{ 'privacy.registers.' + def().key + '.name' | transloco }}</span>
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="privacy-heading"
              >
                {{ r.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(r.status)" data-testid="privacy-status">{{
                  statusKey(r.status) | transloco
                }}</app-badge>
                @if (ownerName(); as name) {
                  <span class="text-[12.5px] text-fg-muted">{{
                    'privacy.list.owner' | transloco: { name }
                  }}</span>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button [entityType]="def().entityType" [entityId]="r.id" />
              <app-ask-about [prompt]="'privacy.ask.summarise' | transloco: { code: r.code }" />
              @if (canWrite() && editable()) {
                <a
                  [routerLink]="['/privacy', def().segment, r.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="privacy-edit"
                >
                  {{ 'privacy.common.edit' | transloco }}
                </a>
              }
              @if (canDelete()) {
                <app-button
                  variant="ghost"
                  size="sm"
                  (click)="deleting.set(true)"
                  data-testid="privacy-delete"
                >
                  <app-icon name="trash" [size]="14" />
                  {{ 'privacy.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="privacy" page="detail" />

              @switch (def().key) {
                @case ('dsr') {
                  <app-privacy-dsr-panel
                    [request]="asDsr()"
                    [canWrite]="canWrite()"
                    (changed)="record.set($event)"
                  />
                }
                @case ('breach') {
                  <app-privacy-breach-panel [breach]="asBreach()" [canWrite]="canWrite()" />
                }
                @case ('dpia') {
                  <app-privacy-decision-panel
                    register="dpia"
                    [record]="asDpia()"
                    [canApprove]="canApprove()"
                    (changed)="record.set($event)"
                  />
                }
                @case ('lba') {
                  <app-privacy-decision-panel
                    register="lba"
                    [record]="asLba()"
                    [canApprove]="canApprove()"
                    (changed)="record.set($event)"
                  />
                }
              }

              @if (canWrite() && statusOptions().length) {
                <app-card>
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div class="flex flex-col gap-1.5">
                      <label
                        for="cf-privacy-status"
                        class="text-[13px] font-semibold text-fg-muted"
                      >
                        {{ 'privacy.detail.changeStatus' | transloco }}
                      </label>
                      <select
                        id="cf-privacy-status"
                        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
                        (change)="nextStatus.set($any($event.target).value)"
                        data-testid="status-select"
                      >
                        @for (s of statusOptions(); track s) {
                          <option [value]="s" [selected]="(nextStatus() || r.status) === s">
                            {{ statusKey(s) | transloco }}
                          </option>
                        }
                      </select>
                    </div>
                    <app-button
                      size="sm"
                      [disabled]="!nextStatus() || nextStatus() === r.status"
                      [loading]="busy()"
                      (click)="applyStatus()"
                      data-testid="status-apply"
                    >
                      {{ 'privacy.detail.applyStatus' | transloco }}
                    </app-button>
                  </div>
                  <p class="mt-2 text-[12.5px] text-fg-subtle">
                    {{ 'privacy.detail.statusHint.' + def().key | transloco }}
                  </p>
                </app-card>
              }

              @if (def().key === 'consent' && canWrite() && r.status === 'active') {
                <app-card>
                  <p class="mb-2 text-[13px] text-fg-muted">
                    {{ 'privacy.consent.withdrawHint' | transloco }}
                  </p>
                  <app-button
                    variant="secondary"
                    size="sm"
                    (click)="withdrawing.set(true)"
                    data-testid="consent-withdraw"
                  >
                    {{ 'privacy.consent.withdraw' | transloco }}
                  </app-button>
                </app-card>
              }

              @if (actionError(); as e) {
                <app-alert tone="error" data-testid="action-error">
                  {{ e.key | transloco: { fields: e.fields } }}
                </app-alert>
              }

              @if (r.description) {
                <app-card>
                  <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                    {{ 'privacy.fields.description' | transloco }}
                  </h2>
                  <p class="text-[13.5px] whitespace-pre-line text-fg">{{ r.description }}</p>
                </app-card>
              }

              @for (section of shown(); track section.key) {
                <app-card>
                  <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                    {{ 'privacy.form.sections.' + section.key | transloco }}
                  </h2>
                  <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
                    @for (v of section.values; track v.key) {
                      <div [class.sm:col-span-2]="v.wide" [attr.data-value]="v.key">
                        <dt class="text-fg-subtle">{{ v.label }}</dt>
                        <dd class="break-words whitespace-pre-line text-fg">
                          @if (v.link) {
                            <a [routerLink]="v.link" class="text-accent hover:underline">{{
                              v.text
                            }}</a>
                          } @else {
                            {{ v.text }}
                          }
                        </dd>
                      </div>
                    }
                  </dl>
                </app-card>
              }

              @if (risks().length) {
                <app-card>
                  <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                    {{ 'privacy.fields.risks' | transloco }}
                  </h2>
                  <ul class="flex flex-col gap-2">
                    @for (risk of risks(); track $index) {
                      <li class="rounded-tile border border-border p-3 text-[13px]">
                        <p class="text-fg">{{ risk.description }}</p>
                        <p class="mt-1 flex flex-wrap gap-2 text-fg-muted">
                          <span>{{
                            'privacy.dpia.levelSummary'
                              | transloco
                                : {
                                    likelihood:
                                      ('privacy.options.level.' + risk.likelihood | transloco),
                                    severity:
                                      ('privacy.options.level.' + risk.severity | transloco),
                                  }
                          }}</span>
                          @if (risk.residual) {
                            <span>{{
                              'privacy.dpia.residualSummary'
                                | transloco
                                  : {
                                      level: ('privacy.options.level.' + risk.residual | transloco),
                                    }
                            }}</span>
                          }
                        </p>
                        @if (risk.mitigation) {
                          <p class="mt-1 text-fg-muted">{{ risk.mitigation }}</p>
                        }
                      </li>
                    }
                  </ul>
                </app-card>
              }

              <app-supports-requirements [entityType]="def().entityType" [entityId]="r.id" />

              <div class="flex flex-col gap-3">
                <app-why-it-matters scope="privacy" [page]="def().key" />
                <app-privacy-lesson-link [lesson]="lesson()" />
              </div>
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="def().entityType"
                [entityId]="r.id"
                [canCreate]="canWrite()"
                [entityLabel]="r.code"
              />
            </div>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'privacy.detail.deleteTitle' | transloco: { code: r.code }"
            [message]="'privacy.detail.deleteMessage' | transloco"
            [confirmLabel]="'privacy.common.delete' | transloco"
            [cancelLabel]="'privacy.common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
          <app-prompt-dialog
            [open]="askOutcome()"
            [title]="'privacy.dsr.outcomeTitle' | transloco"
            [message]="'privacy.dsr.outcomeMessage' | transloco"
            [label]="'privacy.fields.outcome' | transloco"
            [confirmLabel]="'privacy.detail.applyStatus' | transloco"
            [cancelLabel]="'privacy.common.cancel' | transloco"
            [required]="true"
            [maxLength]="10000"
            [busy]="busy()"
            (confirmed)="patchStatus($event)"
            (cancelled)="askOutcome.set(false)"
          />
          <app-confirm-dialog
            [open]="withdrawing()"
            [title]="'privacy.consent.withdrawTitle' | transloco"
            [message]="'privacy.consent.withdrawMessage' | transloco"
            [confirmLabel]="'privacy.consent.withdraw' | transloco"
            [cancelLabel]="'privacy.common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="withdraw()"
            (cancelled)="withdrawing.set(false)"
          />
        }
      }
    }
  `,
})
export class PrivacyRegisterDetail {
  private readonly api = inject(PrivacyApi);
  private readonly refs = inject(PrivacyRefsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly perms = privacyPermissions();

  readonly register = input.required<RegisterKey>();
  readonly id = input.required<string>();

  protected readonly def = computed(() => REGISTERS[this.register()]);
  protected readonly lesson = computed(() => REGISTER_LESSONS[this.register()]);
  protected readonly statusKey = statusKey;
  protected readonly statusTone = statusTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly loadError = signal('privacy.common.loadFailed');
  protected readonly record = signal<PrivacyRecord | null>(null);
  protected readonly busy = signal(false);
  protected readonly deleting = signal(false);
  protected readonly withdrawing = signal(false);
  protected readonly askOutcome = signal(false);
  protected readonly nextStatus = signal('');
  protected readonly actionError = signal<{ key: string; fields: string } | null>(null);

  protected readonly canWrite = computed(() => this.perms().has(this.def().writePermission));
  protected readonly canApprove = computed(() => this.perms().has(PERM_APPROVE));
  protected readonly canDelete = computed(
    () =>
      this.perms().has(PERM_MANAGE) &&
      this.def().deletePermissions.every((p) => this.perms().has(p)),
  );
  /** Decided DPIAs / assessments are changed by moving them back to draft, not edited in place. */
  protected readonly editable = computed(() => {
    const status = this.record()?.status;
    return !(
      (this.def().key === 'dpia' || this.def().key === 'lba') &&
      (status === 'approved' || status === 'rejected')
    );
  });

  protected readonly tabs = computed<readonly RecordTab[]>(() => [
    'details',
    'tasks',
    'related',
    'activity',
    'comments',
    'attachments',
    ...(this.def().revisions ? (['revisions'] as const) : []),
  ]);
  protected readonly fieldLabels = computed(() => revisionFieldLabels(this.def()));

  protected readonly statusOptions = computed(() => {
    const r = this.record();
    const settable = this.def().settableStatuses;
    if (!r || !settable.length) {
      return [];
    }
    return settable.includes(r.status) ? settable : [r.status, ...settable];
  });

  protected readonly ownerName = computed(() => this.refs.userName(this.record()?.owner_user_id));

  protected readonly asDsr = computed(() => this.record() as DataSubjectRequest);
  protected readonly asBreach = computed(() => this.record() as DataBreach);
  protected readonly asDpia = computed(() => this.record() as Dpia);
  protected readonly asLba = computed(() => this.record() as LegalBasisAssessment);
  protected readonly risks = computed<readonly DpiaRisk[]>(() =>
    this.def().key === 'dpia' ? ((this.record() as Dpia | null)?.risks ?? []) : [],
  );

  /** Facts first, then the editable fields by section (title, description and tables apart). */
  protected readonly shown = computed<readonly ShownSection[]>(() => {
    const r = this.record() as unknown as Record<string, unknown> | null;
    if (!r) {
      return [];
    }
    const sections: ShownSection[] = [];
    const facts = this.def()
      .facts.filter((f) => r[f.key] !== null && r[f.key] !== undefined && r[f.key] !== '')
      .map((f) => this.showFact(f, r[f.key]));
    if (facts.length) {
      sections.push({ key: 'facts', values: facts });
    }
    const factKeys = new Set(this.def().facts.map((f) => f.key));
    const order: string[] = [];
    const grouped = new Map<string, ShownValue[]>();
    for (const f of this.def().fields) {
      if (
        ['title', 'description'].includes(f.key) ||
        f.kind === 'screening' ||
        f.kind === 'risks' ||
        factKeys.has(f.key) ||
        (f.showIf && !f.showIf(r))
      ) {
        continue;
      }
      if (!grouped.has(f.section)) {
        grouped.set(f.section, []);
        order.push(f.section);
      }
      grouped.get(f.section)!.push(this.showField(f, r[f.key]));
    }
    for (const key of order) {
      sections.push({ key, values: grouped.get(key)! });
    }
    if (this.def().key === 'dpia') {
      const screening = (r['screening'] as Record<string, boolean> | undefined) ?? {};
      const met = Object.keys(screening).filter((k) => screening[k]);
      sections.push({
        key: 'screening',
        values: [
          {
            key: 'screening',
            label: this.t('privacy.dpia.criteriaMet'),
            text: met.length
              ? met.map((c) => this.t(`privacy.criteria.${c}.label`)).join('\n')
              : this.t('privacy.dpia.noneMet'),
            wide: true,
          },
        ],
      });
    }
    return sections;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.refs.ensureMembers();
    providePageContext(() => {
      const r = this.record();
      return {
        module: 'privacy',
        entityType: this.def().entityType,
        entityId: this.id(),
        view: 'detail',
        // Personal-data registers never put the record title in the context.
        title: r ? (this.def().personal ? r.code : `${r.code} ${r.title}`) : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const register = this.register();
      untracked(() => this.load(orgId, register, id));
    });
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.language.translate(key, params);
  }

  private none(): string {
    return this.t('privacy.common.none');
  }

  private showFact(f: FactDef, value: unknown): ShownValue {
    const label = this.t(f.labelKey ?? `privacy.fields.${f.key}`);
    return {
      key: f.key,
      label,
      text: this.format(f.kind, value, f.optionSet),
      wide: f.kind === 'text',
    };
  }

  private showField(f: FieldDef, value: unknown): ShownValue {
    const label = this.t(fieldLabelKey(f));
    if (f.kind === 'ref' && f.ref && typeof value === 'string' && value) {
      return {
        key: f.key,
        label,
        text: this.refs.label(f.ref, value) ?? this.t('privacy.detail.linkedRecord'),
        wide: !!f.wide,
        link: ['/privacy', REGISTERS[f.ref].segment, value],
      };
    }
    return { key: f.key, label, text: this.format(f.kind, value, f.optionSet), wide: !!f.wide };
  }

  private format(kind: string, value: unknown, optionSet?: string): string {
    if (value === null || value === undefined || value === '') {
      return kind === 'tristate' ? this.t('privacy.common.undecided') : this.none();
    }
    const locale = this.language.locale();
    switch (kind) {
      case 'boolean':
      case 'tristate':
        return this.t(value ? 'privacy.common.yes' : 'privacy.common.no');
      case 'date':
        return formatLocalDay(String(value), 'mediumDate', locale);
      case 'datetime':
        return formatLocalDate(String(value), 'medium', locale);
      case 'select':
        return optionSet ? this.t(`privacy.options.${optionSet}.${value}`) : String(value);
      case 'multi':
        return Array.isArray(value) && value.length
          ? value.map((v) => this.t(`privacy.options.${optionSet}.${v}`)).join(', ')
          : this.none();
      case 'tags':
        return Array.isArray(value) && value.length ? value.join(', ') : this.none();
      case 'owner':
        return this.refs.userName(String(value)) ?? this.t('privacy.common.someone');
      case 'department':
        return this.refs.departmentName(String(value)) ?? this.t('privacy.detail.linkedRecord');
      default:
        return String(value);
    }
  }

  private load(orgId: string | null, register: RegisterKey, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, REGISTERS[register], id).subscribe({
      next: (record) => {
        this.record.set(record);
        this.nextStatus.set(record.status);
        this.state.set('ready');
      },
      error: (err) => {
        this.loadError.set(privacyError(err).key);
        this.state.set('error');
      },
    });
  }

  protected applyStatus(): void {
    const r = this.record();
    const status = this.nextStatus();
    if (!r || !status || status === r.status) {
      return;
    }
    if (
      this.def().key === 'dsr' &&
      OUTCOME_STATUSES.includes(status) &&
      !(r as DataSubjectRequest).outcome
    ) {
      this.askOutcome.set(true);
      return;
    }
    this.patchStatus(null);
  }

  protected patchStatus(outcome: string | null): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r) {
      return;
    }
    const body: Record<string, unknown> = { status: this.nextStatus() };
    if (outcome?.trim()) {
      body['outcome'] = outcome.trim();
    }
    this.mutate(this.api.update(orgId, this.def(), r.id, body), 'privacy.notices.statusChanged');
  }

  protected withdraw(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record() as ConsentRecord | null;
    if (!orgId || !r) {
      return;
    }
    this.mutate(
      this.api.update(orgId, this.def(), r.id, {
        withdrawn_at: new Date().toISOString().slice(0, 19),
      }),
      'privacy.notices.withdrawn',
    );
  }

  private mutate(call: ReturnType<PrivacyApi['update']>, notice: string): void {
    this.busy.set(true);
    this.actionError.set(null);
    call.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.askOutcome.set(false);
        this.withdrawing.set(false);
        this.record.set(saved);
        this.nextStatus.set(saved.status);
        this.notify.success(notice, {
          code: saved.code,
          status: this.t(statusKey(saved.status)),
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.askOutcome.set(false);
        this.withdrawing.set(false);
        const e = privacyError(err);
        this.actionError.set({
          key: e.key,
          fields: e.fields.map((f) => this.t(`privacy.fields.${f}`)).join(', '),
        });
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r) {
      return;
    }
    this.busy.set(true);
    this.api.remove(orgId, this.def(), r.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(false);
        this.refs.invalidate(this.def().key);
        this.notify.success('privacy.notices.deleted', { code: r.code });
        void this.router.navigate(['/privacy', this.def().segment]);
      },
      error: (err) => {
        this.busy.set(false);
        this.deleting.set(false);
        this.actionError.set({ key: privacyError(err).key, fields: '' });
      },
    });
  }
}
