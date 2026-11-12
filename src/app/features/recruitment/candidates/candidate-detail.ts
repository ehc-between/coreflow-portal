import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { RecruitmentApi } from '../data/recruitment-api';
import { retentionDue, stageTone } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  CandidateDetail,
  ENTITY_CANDIDATE,
  MODULE_KEY,
  PrivacyUpdate,
} from '../data/recruitment.models';
import { RecruitmentLessonButton } from '../shared/recruitment-lesson-button';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments', 'attachments'];

/** A candidate: contact details, privacy notice and consent, retention, applications, erasure. */
@Component({
  selector: 'app-candidate-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    LocalDatePipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    RecruitmentLessonButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as key) {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-alert>{{ key | transloco }}</app-alert>
        <a
          routerLink="/recruitment/candidates"
          class="mt-3 inline-block text-[13px] font-semibold text-accent"
          >{{ 'recruitment.common.backToList' | transloco }}</a
        >
      </div>
    } @else if (cand(); as c) {
      <app-record-detail-layout
        [entityType]="entityType"
        [entityId]="c.id"
        [tabs]="tabs"
        [canEdit]="c.can_edit"
        backLink="/recruitment/candidates"
        backLabelKey="recruitment.common.backToList"
      >
        <div header>
          <p class="mb-1 flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-fg-subtle">{{ c.code }}</span>
            @if (c.talent_pool_consent) {
              <app-badge tone="accent">{{ 'recruitment.candidates.inPool' | transloco }}</app-badge>
            }
          </p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ c.full_name }}
          </h1>
        </div>
        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button [entityType]="entityType" [entityId]="c.id" />
          @if (perms().write && c.can_edit) {
            <a
              [routerLink]="['/recruitment/applications/new']"
              [queryParams]="{ candidate_id: c.id }"
            >
              <app-button size="sm" variant="secondary">
                <app-icon name="plus" [size]="15" />
                {{ 'recruitment.candidate.addApplication' | transloco }}
              </app-button>
            </a>
            <a [routerLink]="['/recruitment/candidates', c.id, 'edit']">
              <app-button size="sm" variant="secondary">
                {{ 'recruitment.common.edit' | transloco }}
              </app-button>
            </a>
          }
          @if (perms().manage) {
            <app-button size="sm" variant="danger" (click)="erasing.set(true)" data-testid="erase">
              <app-icon name="trash" [size]="15" />
              {{ 'recruitment.candidate.erase' | transloco }}
            </app-button>
          }
        </div>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="recruitment" page="candidate" />
          <app-card>
            <dl class="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.email' | transloco }}</dt>
                <dd class="break-all text-fg">{{ c.email ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.phone' | transloco }}</dt>
                <dd class="text-fg">{{ c.phone ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.location' | transloco }}</dt>
                <dd class="text-fg">{{ c.location ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.fields.source' | transloco }}</dt>
                <dd class="text-fg">{{ 'recruitment.source.' + c.source | transloco }}</dd>
              </div>
              @if (c.profile_url) {
                <div class="sm:col-span-2">
                  <dt class="text-fg-subtle">{{ 'recruitment.fields.profileUrl' | transloco }}</dt>
                  <dd class="break-all text-fg">{{ c.profile_url }}</dd>
                </div>
              }
              @if (c.notes) {
                <div class="sm:col-span-2">
                  <dt class="text-fg-subtle">{{ 'recruitment.fields.notes' | transloco }}</dt>
                  <dd class="whitespace-pre-wrap text-fg">{{ c.notes }}</dd>
                </div>
              }
            </dl>
          </app-card>

          <app-card>
            <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
              {{ 'recruitment.candidate.applications' | transloco }}
            </h2>
            <ul class="flex flex-col">
              @for (a of c.applications; track a.id) {
                <li class="border-b border-border last:border-b-0">
                  <a
                    [routerLink]="['/recruitment/applications', a.id]"
                    class="flex flex-wrap items-center gap-2 py-2 text-[13px] outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span class="font-mono text-[12px] text-fg-subtle">{{ a.code }}</span>
                    <span class="min-w-0 flex-1 truncate font-semibold text-fg">
                      {{ a.requisition_code }} · {{ a.requisition_title }}
                    </span>
                    <app-badge [tone]="stageTone(a.stage)">{{
                      'recruitment.stage.' + a.stage | transloco
                    }}</app-badge>
                  </a>
                </li>
              } @empty {
                <li class="text-[13px] text-fg-muted">
                  {{ 'recruitment.candidate.noApplications' | transloco }}
                </li>
              }
            </ul>
          </app-card>
        </div>

        <ng-container aside>
          <app-card>
            <h2 class="mb-2 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
              {{ 'recruitment.privacy.title' | transloco }}
            </h2>
            <dl class="flex flex-col gap-2 text-[13px]">
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.privacy.notice' | transloco }}</dt>
                <dd class="text-fg">
                  @if (c.privacy_notice_given_at) {
                    {{
                      'recruitment.privacy.givenAt'
                        | transloco
                          : {
                              date: (c.privacy_notice_given_at | localDate),
                              version: c.privacy_notice_version ?? '—',
                            }
                    }}
                  } @else {
                    <span class="font-semibold text-warn">{{
                      'recruitment.candidates.noticeMissing' | transloco
                    }}</span>
                  }
                </dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.privacy.pool' | transloco }}</dt>
                <dd class="text-fg">
                  @if (c.talent_pool_consent) {
                    {{
                      'recruitment.privacy.consentSince'
                        | transloco: { date: (c.consent_given_at | localDate) }
                    }}
                  } @else if (c.consent_withdrawn_at) {
                    {{
                      'recruitment.privacy.consentWithdrawn'
                        | transloco: { date: (c.consent_withdrawn_at | localDate) }
                    }}
                  } @else {
                    {{ 'recruitment.privacy.noConsent' | transloco }}
                  }
                </dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'recruitment.privacy.retention' | transloco }}</dt>
                <dd
                  [class.text-fail]="due(c.retention_until)"
                  [class.font-semibold]="due(c.retention_until)"
                  class="text-fg"
                >
                  {{
                    c.retention_until
                      ? (c.retention_until | localDate)
                      : ('recruitment.privacy.retentionNone' | transloco)
                  }}
                </dd>
              </div>
            </dl>
            @if (perms().write && c.can_edit) {
              <div class="mt-3 flex flex-col gap-2">
                @if (!c.privacy_notice_given_at) {
                  <app-button
                    size="sm"
                    [loading]="busy()"
                    (click)="privacy({ privacy_notice_given: true })"
                    data-testid="record-notice"
                  >
                    {{ 'recruitment.privacy.recordNotice' | transloco }}
                  </app-button>
                }
                <app-button
                  size="sm"
                  variant="secondary"
                  [loading]="busy()"
                  (click)="privacy({ talent_pool_consent: !c.talent_pool_consent })"
                >
                  {{
                    (c.talent_pool_consent
                      ? 'recruitment.privacy.withdrawConsent'
                      : 'recruitment.privacy.recordConsent'
                    ) | transloco
                  }}
                </app-button>
              </div>
            }
          </app-card>
          <app-why-it-matters scope="recruitment" page="candidate" />
          <app-recruitment-lesson-button lesson="candidate-privacy" />
        </ng-container>
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="erasing()"
        [title]="'recruitment.candidate.eraseTitle' | transloco"
        [message]="'recruitment.candidate.eraseMessage' | transloco: { code: c.code }"
        [confirmLabel]="'recruitment.candidate.erase' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="erase()"
        (cancelled)="erasing.set(false)"
      />
    } @else {
      <p class="mx-auto max-w-[1180px] px-8 pt-8 text-[14px] text-fg-muted">
        {{ 'common.loading' | transloco }}
      </p>
    }
  `,
})
export class CandidateDetailPage {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly perms = injectRecruitmentPerms();

  protected readonly entityType = ENTITY_CANDIDATE;
  protected readonly tabs = TABS;
  protected readonly stageTone = stageTone;

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });
  protected readonly cand = signal<CandidateDetail | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly erasing = signal(false);

  constructor() {
    // Context carries ids only; the assistant has no candidate tools (assist-only policy).
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_CANDIDATE,
      entityId: this.id(),
      view: 'detail',
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const id = this.id();
      if (!orgId || !id) {
        return;
      }
      this.error.set(null);
      const sub = this.api.getCandidate(orgId, id).subscribe({
        next: (c) => this.cand.set(c),
        error: (err) => this.error.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected due(value: string | null): boolean {
    return retentionDue(value, 30);
  }

  protected privacy(body: PrivacyUpdate): void {
    const orgId = this.orgId();
    const c = this.cand();
    if (!orgId || !c || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.setPrivacy(orgId, c.id, body).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.cand.set(updated);
        this.toasts.success('recruitment.privacy.saved');
      },
      error: (err) => {
        this.busy.set(false);
        this.toasts.error(recruitmentError(err).key);
      },
    });
  }

  protected erase(): void {
    const orgId = this.orgId();
    const c = this.cand();
    if (!orgId || !c) {
      return;
    }
    this.busy.set(true);
    this.api.eraseCandidate(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.erasing.set(false);
        this.toasts.success('recruitment.candidate.erased', { code: c.code });
        void this.router.navigate(['/recruitment/candidates']);
      },
      error: (err) => {
        this.busy.set(false);
        this.erasing.set(false);
        this.toasts.error(recruitmentError(err).key);
      },
    });
  }
}
