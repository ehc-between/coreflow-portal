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
import { WatchButton } from '../../../shared/activity/watch-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { AuditAccess } from '../data/audit-access';
import { planStatusTone, programmeStatusTone, riskTone } from '../data/audit-display';
import {
  PLAN_STATUSES,
  ProgrammeAction,
  ProgrammeDetail,
  REASON_REQUIRED,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';

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

/** `/audits/programmes/:id`: an audit programme with its audits, approval and history. */
@Component({
  selector: 'app-audit-programme-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    RecordDetailLayout,
    WatchButton,
    GuideIntro,
    WhyItMatters,
    SupportsRequirements,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    PromptDialog,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as p) {
      <app-record-detail-layout
        entityType="audit_programme"
        [entityId]="p.id"
        [tabs]="tabs"
        [canEdit]="access.canWrite()"
        [includeAudit]="access.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/audits/programmes"
        backLabelKey="audits.programmes.back"
      >
        <div header>
          <p class="text-[12.5px] font-semibold text-fg-subtle">{{ p.code }} · {{ p.year }}</p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ p.title }}
          </h1>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <app-badge [tone]="tone(p.status)">{{
              'audits.programmeStatus.' + p.status | transloco
            }}</app-badge>
          </div>
        </div>
        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button entityType="audit_programme" [entityId]="p.id" />
          @for (a of p.available_actions; track a) {
            <app-button
              size="sm"
              [variant]="a === 'approve' ? 'primary' : 'secondary'"
              [disabled]="saving.busy()"
              (click)="transition(a)"
            >
              {{ 'audits.programmeAction.' + a | transloco }}
            </app-button>
          }
          @if (access.canWrite() && p.status !== 'closed') {
            <a
              [routerLink]="['/audits/programmes', p.id, 'edit']"
              class="inline-flex h-8 items-center rounded-[10px] border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
            >
              {{ 'audits.common.edit' | transloco }}
            </a>
          }
          @if (access.canManage()) {
            <app-button size="sm" variant="ghost" (click)="deleting.set(true)">{{
              'audits.common.delete' | transloco
            }}</app-button>
          }
        </div>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="audits" page="programmeDetail" />
          <app-card>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.description' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ p.description || '–' }}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.objectives' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ p.objectives || '–' }}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.riskBasis' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ p.risk_basis || '–' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.frameworks' | transloco }}
                </dt>
                <dd class="text-fg">
                  @for (f of p.frameworks; track f; let last = $last) {
                    {{ 'audits.frameworks.' + f | transloco }}{{ last ? '' : ', ' }}
                  } @empty {
                    –
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">{{ p.owner?.name || '–' }}</dd>
              </div>
              @if (p.approved_at) {
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.programmes.approved' | transloco }}
                  </dt>
                  <dd class="text-fg">
                    {{ p.approved_by?.name || '–' }}, {{ p.approved_at | localDate: 'medium' }}
                  </dd>
                </div>
              }
            </dl>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[16px] font-bold text-fg">
                {{ 'audits.programmes.audits' | transloco: { count: p.plans.length } }}
              </h2>
              @if (access.canWrite() && p.status !== 'closed') {
                <a
                  [routerLink]="['/audits/plans/new']"
                  [queryParams]="{ programme: p.id }"
                  class="text-[13px] font-semibold text-accent hover:underline"
                >
                  {{ 'audits.programmes.addAudit' | transloco }}
                </a>
              }
            </div>
            <div class="mb-3 flex flex-wrap gap-1.5">
              @for (s of planStatuses; track s) {
                @if (p.plan_counts[s]) {
                  <app-badge [tone]="planTone(s)"
                    >{{ 'audits.planStatus.' + s | transloco }}: {{ p.plan_counts[s] }}</app-badge
                  >
                }
              }
            </div>
            @if (p.plans.length) {
              <ul class="divide-y divide-border">
                @for (a of p.plans; track a.id) {
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                    <a
                      [routerLink]="['/audits/plans', a.id]"
                      class="min-w-0 flex-1 text-[13.5px] font-semibold text-fg hover:text-accent"
                    >
                      <span class="text-fg-subtle">{{ a.code }}</span> {{ a.title }}
                    </a>
                    <span class="text-[12.5px] text-fg-muted">{{
                      a.planned_start | localDay
                    }}</span>
                    <app-badge [tone]="riskTone(a.risk_level)">{{
                      'audits.risk.' + a.risk_level | transloco
                    }}</app-badge>
                    <app-badge [tone]="planTone(a.status)">{{
                      'audits.planStatus.' + a.status | transloco
                    }}</app-badge>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-[13px] text-fg-muted">
                {{ 'audits.programmes.noAudits' | transloco }}
              </p>
            }
          </app-card>
          <app-card>
            <app-supports-requirements entityType="audit_programme" [entityId]="p.id" />
          </app-card>
        </div>
        <div aside>
          <app-why-it-matters scope="audits" page="programmeDetail" />
        </div>
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-audit-load-state [state]="data.state()" (retry)="load()" />
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
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = PROGRAMME_FIELD_LABELS;
  protected readonly planStatuses = PLAN_STATUSES;
  protected readonly tone = programmeStatusTone;
  protected readonly planTone = planStatusTone;
  protected readonly riskTone = riskTone;
  protected readonly data = loadable<ProgrammeDetail>();
  protected readonly saving = mutator();
  protected readonly pending = signal<ProgrammeAction | null>(null);
  protected readonly deleting = signal(false);
  protected readonly title = computed(() => this.data.value()?.title ?? null);

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_programme',
      entityId: this.id(),
      view: 'detail',
      title: this.title(),
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
