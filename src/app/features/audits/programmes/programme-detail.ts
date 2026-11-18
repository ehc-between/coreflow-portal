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
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
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

/**
 * `/audits/programmes/:id`: an audit programme. Its basis (objectives, risks),
 * the audits in it, and the coverage matrix that shows what has and has not been
 * audited over the cycle, with "Plan an audit for this" on every gap.
 */
@Component({
  selector: 'app-audit-programme-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    RecordDetailLayout,
    WatchButton,
    AskAbout,
    WhyItMatters,
    Button,
    Card,
    ConfirmDialog,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    MenuItem,
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
      <app-record-detail-layout
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
        backLink="/audits/programmes"
        backLabelKey="audits.programmes.back"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono">{{ p.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ p.year }}</span>
          <app-status-badge [meaning]="sb.meaning" [value]="sb.value" [labelKey]="sb.labelKey" />
          <app-ask-about
            [prompt]="'audits.programmeDetail.askAbout' | transloco: { code: p.code }"
          />
          <app-watch-button entityType="audit_programme" [entityId]="p.id" />
        </ng-container>

        @if (primary(); as a) {
          <app-button primary size="sm" [disabled]="saving.busy()" (click)="transition(a)">
            {{ 'audits.programmeAction.' + a | transloco }}
          </app-button>
        }
        @if (access.canWrite() && p.status !== 'closed') {
          <a
            secondary
            [routerLink]="['/audits/plans/new']"
            [queryParams]="{ programme: p.id }"
            class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'audits.programmes.addAudit' | transloco }}
          </a>
        }
        @if (access.canWrite() && p.status !== 'closed') {
          <a
            secondary
            [routerLink]="['/audits/programmes', p.id, 'edit']"
            class="inline-flex h-8 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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

        <app-audits-nav nav />
        <app-help-strip help scope="audits" page="programmeDetail" lesson="internal-audits" />

        <div class="flex flex-col gap-5">
          <app-card>
            <h2 class="mb-4 font-display text-section font-bold text-fg">
              {{ 'audits.programmeDetail.about' | transloco }}
            </h2>
            <app-field-list>
              <app-field-item
                labelKey="audits.fields.description"
                [value]="p.description"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item
                labelKey="audits.fields.objectives"
                [value]="p.objectives"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item
                labelKey="audits.fields.riskBasis"
                [value]="p.risk_basis"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item
                labelKey="audits.fields.frameworks"
                [value]="frameworkNames()"
                empty="none"
              />
              <app-field-item labelKey="audits.fields.owner" [value]="p.owner?.name" />
              @if (p.approved_at) {
                <app-field-item
                  labelKey="audits.programmes.approved"
                  [value]="
                    'audits.report.byOn'
                      | transloco
                        : {
                            name: p.approved_by?.name || ('audits.common.someone' | transloco),
                            date: (p.approved_at | localDate),
                          }
                  "
                />
              }
            </app-field-list>
          </app-card>

          <app-card data-testid="programme-coverage">
            <h2 class="mb-1 font-display text-section font-bold text-fg">
              {{ 'audits.coverage.title' | transloco }}
            </h2>
            <p class="mb-4 text-meta text-fg-muted">{{ 'audits.coverage.intro' | transloco }}</p>
            <app-audit-programme-coverage [programmeId]="p.id" />
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{ 'audits.programmes.audits' | transloco: { count: p.plans.length } }}
            </h2>
            @if (p.plans.length) {
              <ul class="divide-y divide-border">
                @for (a of p.plans; track a.id) {
                  @let ab = planBadge(a.status);
                  @let rb = risk(a.risk_level);
                  <li class="flex flex-wrap items-center gap-2 py-2">
                    <a
                      [routerLink]="['/audits/plans', a.id]"
                      class="min-w-0 flex-1 basis-[220px] text-body font-semibold text-fg hover:text-accent"
                    >
                      <span class="font-mono text-meta font-normal text-fg-subtle">{{
                        a.code
                      }}</span>
                      {{ a.title }}
                    </a>
                    <span class="text-meta text-fg-muted">{{ a.planned_start | localDay }}</span>
                    <span class="text-meta text-fg-muted">{{ lead(a) }}</span>
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
        </div>

        <app-card aside>
          <h2 class="mb-3 font-display text-card font-bold text-fg">
            {{ 'audits.planDetail.summary' | transloco }}
          </h2>
          @if (p.plans.length) {
            <dl class="flex flex-col gap-1.5 text-ui">
              @for (s of planStatuses; track s) {
                @if (p.plan_counts[s]) {
                  <div class="flex justify-between gap-2">
                    <dt class="text-fg-muted">{{ 'audits.planStatus.' + s | transloco }}</dt>
                    <dd class="font-semibold text-fg">{{ p.plan_counts[s] }}</dd>
                  </div>
                }
              }
            </dl>
          } @else {
            <p class="text-meta text-fg-muted">{{ 'audits.programmes.noAudits' | transloco }}</p>
          }
        </app-card>
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
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = PROGRAMME_FIELD_LABELS;
  protected readonly planStatuses = PLAN_STATUSES;
  protected readonly badge = programmeStatusBadge;
  protected readonly planBadge = planStatusBadge;
  protected readonly risk = riskBadge;
  protected readonly lead = leadAuditorName;
  protected readonly data = loadable<ProgrammeDetail>();
  protected readonly saving = mutator();
  protected readonly pending = signal<ProgrammeAction | null>(null);
  protected readonly deleting = signal(false);

  protected readonly primary = computed<ProgrammeAction | null>(() => {
    const actions = this.data.value()?.available_actions ?? [];
    return actions.includes('approve') ? 'approve' : null;
  });
  protected readonly rest = computed(() =>
    (this.data.value()?.available_actions ?? []).filter((a) => a !== this.primary()),
  );
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
