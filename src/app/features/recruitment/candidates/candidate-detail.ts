import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { Breadcrumb } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RecruitmentApi } from '../data/recruitment-api';
import { retentionDue, stageToneValue } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  CandidateDetail,
  ENTITY_CANDIDATE,
  MODULE_KEY,
  PrivacyUpdate,
} from '../data/recruitment.models';
import { ApplicationIndicators } from '../shared/application-indicators';
import { injectConfirmedRefs } from '../shared/confirmed-refs';
import {
  RECRUITMENT_CRUMB,
  RECRUITMENT_SETTINGS_LINK,
  injectRecruitmentNav,
  settingsLinkFor,
} from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments', 'attachments'];

/**
 * A candidate: contact details, applications with their progress, the privacy
 * notice given (the exact approved revision in Documents), talent-pool consent,
 * when the data is deleted and why, and GDPR erasure (in "Mer"). The record
 * documents GDPR art. 13/14 (information given) for this person.
 */
@Component({
  selector: 'app-candidate-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    LocalDatePipe,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    MenuItem,
    StatusBadge,
    ApplicationIndicators,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (errorKey(); as key) {
      <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
        <app-error-state [bodyKey]="key" (retry)="reload()" />
        <a
          routerLink="/recruitment/candidates"
          class="mt-4 inline-block text-ui font-semibold text-accent"
          >{{ 'recruitment.common.backToList' | transloco }}</a
        >
      </div>
    } @else if (cand(); as c) {
      <app-record-detail-layout
        [entityType]="entityType"
        [entityId]="c.id"
        [title]="c.full_name"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink()"
        [tabs]="tabs"
        [canEdit]="c.can_edit"
        [requirementsPanel]="true"
      >
        <span meta class="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="cand-meta">
          <span class="font-mono font-semibold">{{ c.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'recruitment.source.' + c.source | transloco }}</span>
          @if (c.talent_pool_consent) {
            <app-status-badge
              meaning="lifecycle"
              value="submitted"
              labelKey="recruitment.candidates.inPool"
            />
          }
          @if (!c.privacy_notice_given_at) {
            <app-status-badge
              meaning="lifecycle"
              value="blocked"
              labelKey="recruitment.candidates.noticeMissing"
            />
          }
        </span>

        @if (perms().write && c.can_edit) {
          <a
            primary
            [routerLink]="['/recruitment/applications/new']"
            [queryParams]="{ candidate_id: c.id }"
          >
            <app-button size="sm" data-testid="cand-add-application">
              <app-icon name="plus" [size]="15" />
              {{ 'recruitment.candidate.addApplication' | transloco }}
            </app-button>
          </a>
        }
        @if (perms().write && c.can_edit) {
          <a secondary [routerLink]="['/recruitment/candidates', c.id, 'edit']">
            <app-button size="sm" variant="secondary">
              {{ 'recruitment.common.edit' | transloco }}
            </app-button>
          </a>
        }
        @if (perms().manage) {
          <button
            overflow
            appMenuItem
            type="button"
            [danger]="true"
            (click)="erasing.set(true)"
            data-testid="erase"
          >
            {{ 'recruitment.candidate.erase' | transloco }}
          </button>
        }

        <app-module-nav nav [items]="nav()" labelKey="modules.names.recruitment" />
        <app-help-strip help scope="recruitment" page="candidate" lesson="candidate-privacy" />

        <div class="flex flex-col gap-4">
          <app-card>
            <h2 class="mb-3 text-card font-bold text-fg">
              {{ 'recruitment.candidate.contact' | transloco }}
            </h2>
            <app-field-list>
              <app-field-item labelKey="recruitment.fields.email" [value]="c.email" />
              <app-field-item labelKey="recruitment.fields.phone" [value]="c.phone" />
              <app-field-item labelKey="recruitment.fields.location" [value]="c.location" />
              <app-field-item labelKey="recruitment.fields.profileUrl" [value]="c.profile_url" />
              @if (c.notes) {
                <app-field-item
                  labelKey="recruitment.fields.notes"
                  [value]="c.notes"
                  [wide]="true"
                  [multiline]="true"
                />
              }
            </app-field-list>
          </app-card>

          <app-card [padded]="false">
            <h2 class="px-5 pt-5 pb-2 text-card font-bold text-fg">
              {{ 'recruitment.candidate.applications' | transloco }}
            </h2>
            <ul class="flex flex-col" data-testid="cand-applications">
              @for (a of c.applications; track a.id) {
                <li class="relative border-t border-border px-5 py-3 hover:bg-surface-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-mono text-meta text-fg-subtle">{{ a.code }}</span>
                    <a
                      [routerLink]="['/recruitment/applications', a.id]"
                      class="min-w-0 flex-1 truncate text-body font-semibold text-fg after:absolute after:inset-0 hover:underline"
                    >
                      {{ a.requisition_code }} · {{ a.requisition_title }}
                    </a>
                    <app-status-badge
                      meaning="lifecycle"
                      [value]="stageValue(a.stage)"
                      [labelKey]="'recruitment.stage.' + a.stage"
                    />
                  </div>
                  <app-application-indicators class="mt-1" [app]="a" />
                </li>
              } @empty {
                <li class="border-t border-border px-5 py-4 text-ui text-fg-muted">
                  {{ 'recruitment.candidate.noApplications' | transloco }}
                </li>
              }
            </ul>
          </app-card>
        </div>

        <ng-container aside>
          <app-card>
            <h2 class="mb-3 text-card font-bold text-fg">
              {{ 'recruitment.privacy.title' | transloco }}
            </h2>
            <app-field-list [columns]="1">
              <app-field-item labelKey="recruitment.privacy.notice" data-testid="cand-notice">
                @if (c.privacy_notice_given_at) {
                  <span class="block">{{
                    'recruitment.privacy.givenOn'
                      | transloco: { date: (c.privacy_notice_given_at | localDate) }
                  }}</span>
                  @if (noticeRef(); as ref) {
                    <app-entity-chip class="mt-1 block" [ref]="ref" [showType]="false" />
                    <span class="block text-meta text-fg-muted">{{
                      'recruitment.privacy.revision'
                        | transloco: { revision: c.privacy_notice!.revision }
                    }}</span>
                  } @else if (c.privacy_notice_version) {
                    <span class="block text-meta text-fg-muted">{{
                      'recruitment.privacy.legacyVersion'
                        | transloco: { version: c.privacy_notice_version }
                    }}</span>
                  }
                } @else {
                  <span class="font-semibold text-warn-ink">{{
                    'recruitment.candidates.noticeMissing' | transloco
                  }}</span>
                }
              </app-field-item>
              <app-field-item labelKey="recruitment.privacy.pool">
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
              </app-field-item>
              <app-field-item labelKey="recruitment.privacy.retention" data-testid="cand-retention">
                <span class="block" [class]="due() ? 'font-semibold text-warn-ink' : 'text-fg'">
                  {{
                    c.retention_until
                      ? (c.retention_until | localDate: 'mediumDate')
                      : ('recruitment.privacy.retentionPending' | transloco)
                  }}
                </span>
                <span class="mt-0.5 block text-meta text-fg-muted">{{ retentionWhy() }}</span>
                @if (perms().manage) {
                  <a
                    [routerLink]="settingsPath"
                    class="mt-1 inline-block text-meta font-semibold text-accent"
                    >{{ 'recruitment.privacy.retentionSettings' | transloco }}</a
                  >
                }
              </app-field-item>
            </app-field-list>
            @if (perms().write && c.can_edit) {
              <div class="mt-4 flex flex-col gap-2">
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
          <div class="flex justify-start">
            <app-watch-button [entityType]="entityType" [entityId]="c.id" />
          </div>
        </ng-container>
        <app-why-it-matters aside-learn scope="recruitment" page="candidate" />
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="erasing()"
        [title]="'recruitment.candidate.eraseTitle' | transloco"
        [message]="'recruitment.candidate.eraseMessage' | transloco: { code: c.code }"
        [confirmLabel]="'recruitment.candidate.erase' | transloco"
        [cancelLabel]="'recruitment.common.keep' | transloco"
        [busy]="busy()"
        (confirmed)="erase()"
        (cancelled)="erasing.set(false)"
      />
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    }
  `,
})
export class CandidateDetailPage {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly perms = injectRecruitmentPerms();
  protected readonly nav = injectRecruitmentNav(this.perms);
  protected readonly settingsLink = computed(() => settingsLinkFor(this.perms()));
  protected readonly settingsPath = RECRUITMENT_SETTINGS_LINK;

  protected readonly entityType = ENTITY_CANDIDATE;
  protected readonly tabs = TABS;
  protected readonly stageValue = stageToneValue;

  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });
  protected readonly cand = signal<CandidateDetail | null>(null);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly erasing = signal(false);
  private readonly version = signal(0);
  private readonly refs = injectConfirmedRefs(ENTITY_CANDIDATE, this.id);

  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => [
    RECRUITMENT_CRUMB,
    { labelKey: 'recruitment.nav.candidates', link: '/recruitment/candidates' },
    { label: this.cand()?.full_name ?? '' },
  ]);
  protected readonly due = computed(() => retentionDue(this.cand()?.retention_until ?? null, 30));
  protected readonly noticeRef = computed(() => {
    const n = this.cand()?.privacy_notice;
    return n
      ? {
          entity_type: 'document',
          entity_id: n.document_id,
          title: n.title,
          code: n.code,
          url: n.url,
        }
      : null;
  });
  /** Why the candidate is kept until that date (or when the date will be set). */
  protected readonly retentionWhy = computed(() => {
    const c = this.cand();
    if (!c) {
      return '';
    }
    const basis = c.retention_basis ?? (c.retention_until ? 'closed' : 'active');
    const days = c.retention_days ?? null;
    const key =
      days === null
        ? `recruitment.privacy.retentionBasisNoDays.${basis}`
        : `recruitment.privacy.retentionBasis.${basis}`;
    return this.language.translate(key, { days });
  });

  constructor() {
    // Context carries ids only; candidate names never go to the assistant.
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_CANDIDATE,
      entityId: this.id(),
      view: 'detail',
      title: this.cand()?.code ?? null,
      requirements: this.refs(),
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const id = this.id();
      this.version();
      if (!orgId || !id) {
        return;
      }
      this.errorKey.set(null);
      const sub = this.api.getCandidate(orgId, id).subscribe({
        next: (c) => this.cand.set(c),
        error: (err) => this.errorKey.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
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
