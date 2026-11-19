import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import {
  leadAuditorName,
  planStatusBadge,
  programmeStatusBadge,
  riskBadge,
} from '../data/audit-display';
import {
  PLAN_STATUSES,
  ProgrammeAction,
  ProgrammeDetail,
  ProgrammeStatus,
  REASON_REQUIRED,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { ProgrammeCoverage } from './programme-coverage';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const PROGRAMME_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'audits.fields.title',
  year: 'audits.fields.year',
  status: 'audits.fields.status',
  description: 'audits.fields.description',
  objectives: 'audits.fields.objectives',
  risk_basis: 'audits.fields.riskBasis',
  frameworks: 'audits.fields.frameworks',
  owner_user_id: 'audits.fields.owner',
};

/** Tone of the status sentence: a draft is a to-do, approved is on track, closed is neutral. */
export const PROGRAMME_TONE: Readonly<Record<ProgrammeStatus, StatusLineTone>> = {
  draft: 'warn',
  approved: 'pass',
  closed: 'neutral',
};

/** The audits of a programme that are finished (closed) and still open (not closed or cancelled). */
export function programmeProgress(counts: Readonly<Record<string, number>>): {
  readonly done: number;
  readonly open: number;
  readonly total: number;
} {
  const n = (s: string) => counts[s] ?? 0;
  const done = n('closed');
  const total = PLAN_STATUSES.filter((s) => s !== 'cancelled').reduce((sum, s) => sum + n(s), 0);
  return { done, open: total - done, total };
}

/** What a programme still needs ("Oppfølging", docs/ux-guide.md §2.7). */
export function programmeMissing(
  p: ProgrammeDetail,
  opts: {
    readonly canEdit: boolean;
    readonly editLink: readonly unknown[];
    readonly newAudit: readonly unknown[];
    readonly approve: (() => void) | null;
  },
): RecordMissingItem[] {
  if (!opts.canEdit) {
    return [];
  }
  const items: RecordMissingItem[] = [];
  if (!p.plans.length) {
    items.push({
      key: 'audits',
      labelKey: 'audits.programmeDetail.missing.audits',
      link: opts.newAudit,
      queryParams: { programme: p.id },
    });
  }
  if (!p.objectives?.trim()) {
    items.push({
      key: 'objectives',
      labelKey: 'audits.programmeDetail.missing.objectives',
      link: opts.editLink,
    });
  }
  if (!p.owner) {
    items.push({
      key: 'owner',
      labelKey: 'audits.programmeDetail.missing.owner',
      link: opts.editLink,
    });
  }
  if (p.status === 'draft' && p.plans.length && opts.approve) {
    items.push({
      key: 'approve',
      labelKey: 'audits.programmeDetail.missing.approve',
      action: opts.approve,
    });
  }
  return items;
}

/**
 * `/audits/programmes/:id`: an audit programme, on the detail-page anatomy
 * (docs/ux-guide.md §2.7). "Hovedinformasjon": where the programme stands, what
 * it should achieve, why these areas, and how many of its audits are done.
 * Below: the audits in it (each with code, title, date, lead auditor and status)
 * and the coverage matrix that shows what has and has not been audited over the
 * cycle, with "Plan an audit for this" on every gap.
 */
@Component({
  selector: 'app-audit-programme-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    WhyItMatters,
    Button,
    Card,
    ConfirmDialog,
    FieldItem,
    HelpStrip,
    Icon,
    MenuItem,
    ProgressBar,
    PromptDialog,
    StatusBadge,
    AuditsNav,
    AuditLoadState,
    ProgrammeCoverage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as p) {
      @let sb = badge(p.status);
      @let pr = progress();
      <app-record-detail-layout
        [anatomy]="true"
        entityType="audit_programme"
        [entityId]="p.id"
        [title]="p.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.audits', link: '/audits' },
          { labelKey: 'audits.programmes.title', link: '/audits/programmes' },
          { label: p.code },
        ]"
        [tabs]="tabs"
        [requirementsPanel]="true"
        [canEdit]="access.canWrite()"
        [includeAudit]="access.canReadAudit()"
        [fieldLabels]="fieldLabels"
        [missing]="missing()"
        backLink="/audits/programmes"
        backLabelKey="audits.programmes.back"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono">{{ p.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ p.year }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge [meaning]="sb.meaning" [value]="sb.value" [labelKey]="sb.labelKey" />
        </ng-container>

        @if (primary(); as a) {
          <app-button primary [disabled]="saving.busy()" (click)="transition(a)">
            {{ 'audits.programmeAction.' + a | transloco }}
          </app-button>
        } @else if (canEdit()) {
          <app-button primary (click)="addAudit()">
            <app-icon name="plus" [size]="13" />
            {{ 'audits.programmes.addAudit' | transloco }}
          </app-button>
        }
        @if (primary() && canEdit()) {
          <a
            secondary
            [routerLink]="newAuditLink"
            [queryParams]="{ programme: p.id }"
            class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'audits.programmes.addAudit' | transloco }}
          </a>
        }
        @if (canEdit()) {
          <a
            secondary
            [routerLink]="editLink()"
            class="inline-flex h-9 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {{ 'audits.common.edit' | transloco }}
          </a>
        }
        @for (a of rest(); track a) {
          <button appMenuItem overflow [disabled]="saving.busy()" (click)="transition(a)">
            {{ 'audits.programmeAction.' + a | transloco }}
          </button>
        }
        @if (access.canManage()) {
          <button appMenuItem overflow [danger]="true" (click)="deleting.set(true)">
            {{ 'audits.common.delete' | transloco }}
          </button>
        }

        <button appMenuItem ask type="button" (click)="askAi()">
          <app-icon name="spark" [size]="15" />
          {{ 'audits.detail.ask.programme' | transloco }}
        </button>

        <app-audits-nav nav />
        <app-help-strip help scope="audits" page="programmeDetail" lesson="internal-audits" />

        <app-record-lead record-lead [fillLink]="canEdit() ? editLink() : null">
          <app-record-status-line status [tone]="statusTone()">
            {{ 'audits.programmeDetail.status.' + p.status | transloco }}
          </app-record-status-line>
          <app-field-item
            size="lead"
            labelKey="audits.programmeDetail.lead.objectives"
            [value]="p.objectives"
            [multiline]="true"
          />
          <app-field-item
            size="lead"
            labelKey="audits.programmeDetail.lead.riskBasis"
            [value]="p.risk_basis"
            [multiline]="true"
          />
          <app-field-item size="lead" [wide]="true" labelKey="audits.programmeDetail.lead.progress">
            @if (pr.total) {
              <div
                class="flex flex-wrap items-center gap-x-3 gap-y-1"
                data-testid="programme-progress"
              >
                <app-progress-bar
                  class="block w-32"
                  [value]="(pr.done / pr.total) * 100"
                  [label]="
                    'audits.programmeDetail.progress'
                      | transloco: { done: pr.done, total: pr.total }
                  "
                />
                <span>{{
                  'audits.programmeDetail.progress' | transloco: { done: pr.done, total: pr.total }
                }}</span>
                @if (pr.open) {
                  <span class="text-ui text-fg-muted">
                    · {{ 'audits.programmeDetail.progressOpen' | transloco: { count: pr.open } }}
                  </span>
                }
              </div>
            }
          </app-field-item>
        </app-record-lead>

        <div class="flex flex-col gap-6">
          <app-record-details [columns]="2" [fillLink]="canEdit() ? editLink() : null">
            <app-field-item
              labelKey="audits.fields.description"
              [value]="p.description"
              [wide]="true"
              [multiline]="true"
            />
            <app-field-item labelKey="audits.fields.frameworks" [value]="frameworkNames()" />
          </app-record-details>

          <app-card data-testid="programme-audits">
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{ 'audits.programmes.audits' | transloco: { count: p.plans.length } }}
            </h2>
            @if (p.plans.length) {
              <ul class="divide-y divide-border">
                @for (a of p.plans; track a.id) {
                  @let ab = planBadge(a.status);
                  @let rb = risk(a.risk_level);
                  <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                    <a
                      [routerLink]="['/audits/plans', a.id]"
                      class="group flex min-w-0 flex-1 basis-[260px] items-start gap-2.5"
                    >
                      <span
                        class="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-tile bg-surface-2 text-fg-muted group-hover:text-accent"
                        aria-hidden="true"
                      >
                        <app-icon name="audit" [size]="15" />
                      </span>
                      <span class="min-w-0">
                        <span class="block font-mono text-meta text-fg-subtle">{{ a.code }}</span>
                        <span
                          class="block text-body font-semibold text-fg group-hover:text-accent group-hover:underline"
                          >{{ a.title }}</span
                        >
                      </span>
                    </a>
                    <span class="text-meta text-fg-muted">
                      {{ a.planned_start | localDay }}
                      @if (lead(a); as name) {
                        · {{ name }}
                      }
                    </span>
                    <app-status-badge
                      [meaning]="rb.meaning"
                      [value]="rb.value"
                      [labelKey]="rb.labelKey"
                    />
                    <app-status-badge
                      [meaning]="ab.meaning"
                      [value]="ab.value"
                      [labelKey]="ab.labelKey"
                    />
                  </li>
                }
              </ul>
            } @else {
              <p class="text-body text-fg-muted">
                {{ 'audits.programmes.noAudits' | transloco }}
              </p>
            }
          </app-card>

          <app-card data-testid="programme-coverage">
            <h2 class="mb-1 font-display text-section font-bold text-fg">
              {{ 'audits.coverage.title' | transloco }}
            </h2>
            <p class="mb-4 text-meta text-fg-muted">{{ 'audits.coverage.intro' | transloco }}</p>
            <app-audit-programme-coverage [programmeId]="p.id" />
          </app-card>
        </div>

        <app-record-meta follow-up-meta>
          <app-field-item layout="inline" labelKey="audits.fields.owner" [value]="p.owner?.name" />
          @if (p.approved_at) {
            <app-field-item
              layout="inline"
              labelKey="audits.programmes.approved"
              [value]="
                'audits.report.byOn'
                  | transloco
                    : {
                        name: p.approved_by?.name || ('audits.common.someone' | transloco),
                        date: (p.approved_at | localDay),
                      }
              "
            />
          }
          <app-field-item
            layout="inline"
            labelKey="audits.detail.meta.updated"
            [value]="p.updated_at | localDate"
          />
        </app-record-meta>

        <div aside-learn>
          <app-why-it-matters scope="audits" page="programmeDetail" />
        </div>
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-audit-load-state [state]="data.state()" [rows]="6" (retry)="load()" />
      </div>
    }

    <app-prompt-dialog
      [open]="!!pending()"
      [title]="'audits.programmeAction.' + (pending() ?? 'reopen') | transloco"
      [message]="'audits.common.reasonMessage' | transloco"
      [label]="'audits.common.reason' | transloco"
      [required]="true"
      [busy]="saving.busy()"
      [confirmLabel]="'audits.programmeAction.' + (pending() ?? 'reopen') | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      (confirmed)="run(pending()!, $event)"
      (cancelled)="pending.set(null)"
    />
    <app-confirm-dialog
      [open]="deleting()"
      [title]="'audits.programmes.deleteTitle' | transloco"
      [message]="'audits.programmes.deleteMessage' | transloco"
      [confirmLabel]="'audits.common.delete' | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      [busy]="saving.busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(false)"
    />
  `,
})
export class ProgrammeDetailPage {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = PROGRAMME_FIELD_LABELS;
  protected readonly newAuditLink: readonly unknown[] = ['/audits/plans/new'];
  protected readonly badge = programmeStatusBadge;
  protected readonly planBadge = planStatusBadge;
  protected readonly risk = riskBadge;
  protected readonly lead = leadAuditorName;
  protected readonly data = loadable<ProgrammeDetail>();
  protected readonly saving = mutator();
  protected readonly pending = signal<ProgrammeAction | null>(null);
  protected readonly deleting = signal(false);

  protected readonly canEdit = computed(
    () => this.access.canWrite() && this.data.value()?.status !== 'closed',
  );
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/audits/programmes',
    this.id(),
    'edit',
  ]);
  protected readonly statusTone = computed(
    () => PROGRAMME_TONE[this.data.value()?.status ?? 'draft'] ?? 'neutral',
  );
  protected readonly progress = computed(() =>
    programmeProgress(this.data.value()?.plan_counts ?? {}),
  );
  protected readonly primary = computed<ProgrammeAction | null>(() => {
    const actions = this.data.value()?.available_actions ?? [];
    return actions.includes('approve') ? 'approve' : null;
  });
  protected readonly rest = computed(() =>
    (this.data.value()?.available_actions ?? []).filter((a) => a !== this.primary()),
  );
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const p = this.data.value();
    if (!p) {
      return [];
    }
    return programmeMissing(p, {
      canEdit: this.canEdit(),
      editLink: this.editLink(),
      newAudit: this.newAuditLink,
      approve: this.primary() === 'approve' ? () => this.transition('approve') : null,
    });
  });
  protected readonly frameworkNames = computed(() =>
    (this.data.value()?.frameworks ?? [])
      .map((f) => this.language.translate(`audits.frameworks.${f}`))
      .join(', '),
  );

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_programme',
      entityId: this.id(),
      view: 'detail',
      title: this.data.value()?.title ?? null,
    }));
    effect(() => {
      this.access.orgId();
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      this.data.load(this.api.getProgramme(orgId, this.id()));
    }
  }

  protected addAudit(): void {
    void this.router.navigate(this.newAuditLink, { queryParams: { programme: this.id() } });
  }

  protected askAi(): void {
    const p = this.data.value();
    if (!p) {
      return;
    }
    this.ask.askAbout(this.language.translate('audits.programmeDetail.askAbout', { code: p.code }));
  }

  protected transition(action: ProgrammeAction): void {
    if (REASON_REQUIRED.has(`programme:${action}`)) {
      this.pending.set(action);
    } else {
      this.run(action, null);
    }
  }

  protected run(action: ProgrammeAction, reason: string | null): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.transitionProgramme(orgId, this.id(), action, reason), {
      success: 'audits.notices.programmeTransitioned',
      next: (p) => {
        this.pending.set(null);
        this.data.set(p);
      },
      error: () => {
        this.pending.set(null);
      },
    });
  }

  protected remove(): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.deleteProgramme(orgId, this.id()), {
      success: 'audits.notices.programmeDeleted',
      next: () => void this.router.navigate(['/audits/programmes']),
      error: () => {
        this.deleting.set(false);
      },
    });
  }
}
