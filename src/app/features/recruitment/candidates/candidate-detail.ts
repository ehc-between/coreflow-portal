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
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
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
} from '../../../shared/kit/record-sections';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
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
  settingsLinkFor,
} from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments', 'attachments'];

/** What a candidate record still needs ("Oppfølging", docs/ux-guide.md §2.7). */
export function candidateMissing(
  c: CandidateDetail,
  recordNotice: () => void,
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (!c.privacy_notice_given_at) {
    items.push({
      key: 'notice',
      labelKey: 'recruitment.detail.cand.missing.notice',
      action: recordNotice,
    });
  }
  if (c.applications.length === 0) {
    items.push({
      key: 'application',
      labelKey: 'recruitment.detail.cand.missing.application',
      link: ['/recruitment/applications/new'],
      queryParams: { candidate_id: c.id },
    });
  }
  return items;
}

/**
 * A candidate, on the detail-page anatomy (docs/ux-guide.md §2.7): "Hovedinformasjon"
 * says whether the privacy notice was given, lists the applications (each with its
 * stage and progress), the contact details and when the data is deleted and why.
 * The "Oppfølging" card holds what is missing (record the notice, contact details,
 * a first application), the requirements, the connections with the exact approved
 * privacy-notice revision in Documents, and the consent metadata. Consent changes
 * and GDPR erasure are in "Mer". The record documents GDPR art. 13/14 for this person.
 */
@Component({
  selector: 'app-candidate-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    Button,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
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
        [anatomy]="true"
        [entityType]="entityType"
        [entityId]="c.id"
        [title]="c.full_name"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink()"
        [tabs]="tabs"
        [canEdit]="c.can_edit"
        [requirementsPanel]="true"
        [missing]="missing()"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="cand-meta">{{ c.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'recruitment.detail.cand.type' | transloco }}</span>
          <span aria-hidden="true">·</span>
          @if (!c.privacy_notice_given_at) {
            <app-status-badge
              meaning="lifecycle"
              value="blocked"
              labelKey="recruitment.candidates.noticeMissing"
            />
          } @else if (c.talent_pool_consent) {
            <app-status-badge
              meaning="lifecycle"
              value="submitted"
              labelKey="recruitment.candidates.inPool"
            />
          } @else if (c.latest_stage; as stage) {
            <app-status-badge
              meaning="lifecycle"
              [value]="stageValue(stage)"
              [labelKey]="'recruitment.stage.' + stage"
            />
          }
        </ng-container>

        @if (perms().write && c.can_edit) {
          <a
            primary
            [routerLink]="['/recruitment/applications/new']"
            [queryParams]="{ candidate_id: c.id }"
          >
            <app-button data-testid="cand-add-application">
              <app-icon name="plus" [size]="15" />
              {{ 'recruitment.candidate.addApplication' | transloco }}
            </app-button>
          </a>
        }
        @if (perms().write && c.can_edit) {
          <a secondary [routerLink]="editLink()">
            <app-button variant="secondary" data-testid="cand-edit">
              {{ 'recruitment.common.edit' | transloco }}
            </app-button>
          </a>
        }
        @if (perms().write && c.can_edit && !c.privacy_notice_given_at) {
          <button
            overflow
            appMenuItem
            type="button"
            data-testid="record-notice"
            (click)="recordNotice()"
          >
            {{ 'recruitment.privacy.recordNotice' | transloco }}
          </button>
        }
        @if (perms().write && c.can_edit) {
          <button
            overflow
            appMenuItem
            type="button"
            data-testid="cand-consent"
            [disabled]="busy()"
            (click)="privacy({ talent_pool_consent: !c.talent_pool_consent })"
          >
            {{
              (c.talent_pool_consent
                ? 'recruitment.privacy.withdrawConsent'
                : 'recruitment.privacy.recordConsent'
              ) | transloco
            }}
          </button>
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

        <app-help-strip help scope="recruitment" page="candidate" lesson="candidate-privacy" />

        <app-record-lead record-lead [fillLink]="c.can_edit && perms().write ? editLink() : null">
          <app-record-status-line
            status
            [tone]="c.privacy_notice_given_at ? 'pass' : 'warn'"
            data-testid="cand-status-line"
          >
            {{
              (c.privacy_notice_given_at
                ? 'recruitment.detail.cand.status.noticeGiven'
                : 'recruitment.detail.cand.status.noticeMissing'
              ) | transloco: { date: (c.privacy_notice_given_at | localDate: 'mediumDate') }
            }}
          </app-record-status-line>
          <div class="min-w-0 sm:col-span-full">
            <span class="text-ui font-semibold text-fg">{{
              'recruitment.detail.cand.applications' | transloco
            }}</span>
            <ul class="mt-1 flex flex-col divide-y divide-border" data-testid="cand-applications">
              @for (a of c.applications; track a.id) {
                <li class="flex flex-col gap-1 py-2">
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <app-icon name="userplus" [size]="16" class="text-fg-muted" />
                    <a
                      [routerLink]="['/recruitment/applications', a.id]"
                      class="min-w-0 text-body font-semibold text-fg hover:text-accent hover:underline"
                    >
                      <span class="font-mono text-meta font-normal text-fg-muted">{{
                        a.requisition_code
                      }}</span>
                      {{ a.requisition_title }}
                    </a>
                    <app-status-badge
                      meaning="lifecycle"
                      [value]="stageValue(a.stage)"
                      [labelKey]="'recruitment.stage.' + a.stage"
                    />
                  </div>
                  <app-application-indicators class="pl-7" [app]="a" />
                </li>
              } @empty {
                <li class="py-2 text-body text-fg-muted">
                  {{ 'recruitment.candidate.noApplications' | transloco }}
                </li>
              }
            </ul>
          </div>
          <app-field-item size="lead" labelKey="recruitment.detail.cand.contact">
            @if (c.email) {
              <a [href]="'mailto:' + c.email" class="block text-accent hover:underline">{{
                c.email
              }}</a>
            }
            @if (c.phone) {
              <span class="block">{{ c.phone }}</span>
            }
          </app-field-item>
          <app-field-item
            size="lead"
            labelKey="recruitment.detail.cand.retention"
            data-testid="cand-retention"
          >
            <span class="block" [class.text-warn-ink]="due()" [class.font-semibold]="due()">
              {{
                c.retention_until
                  ? (c.retention_until | localDate: 'mediumDate')
                  : ('recruitment.privacy.retentionPending' | transloco)
              }}
            </span>
            <span class="mt-0.5 block text-ui text-fg-muted">{{ retentionWhy() }}</span>
            @if (perms().manage) {
              <a
                [routerLink]="settingsPath"
                class="mt-1 inline-block text-meta font-semibold text-accent hover:underline"
                >{{ 'recruitment.privacy.retentionSettings' | transloco }}</a
              >
            }
          </app-field-item>
        </app-record-lead>

        <app-record-details
          [columns]="3"
          [fillLink]="c.can_edit && perms().write ? editLink() : null"
        >
          <app-field-item
            labelKey="recruitment.detail.cand.source"
            [value]="'recruitment.source.' + c.source | transloco"
          />
          <app-field-item labelKey="recruitment.fields.location" [value]="c.location" />
          <app-field-item labelKey="recruitment.fields.profileUrl">
            @if (c.profile_url; as url) {
              <a
                [href]="url"
                target="_blank"
                rel="noopener noreferrer"
                class="break-all text-accent hover:underline"
                >{{ url }}</a
              >
            }
          </app-field-item>
          <app-field-item
            labelKey="recruitment.fields.notes"
            [value]="c.notes"
            [wide]="true"
            [multiline]="true"
          />
        </app-record-details>

        @if (c.privacy_notice_given_at && (noticeRef() || c.privacy_notice_version)) {
          <div follow-up-connections class="mt-3 flex flex-col gap-1" data-testid="cand-notice">
            <span class="text-meta font-semibold text-fg-muted">{{
              'recruitment.detail.cand.noticeDoc' | transloco
            }}</span>
            @if (noticeRef(); as ref) {
              <app-entity-chip [ref]="ref" [stacked]="true" />
              <span class="text-meta text-fg-muted">{{
                'recruitment.privacy.revision' | transloco: { revision: c.privacy_notice!.revision }
              }}</span>
            } @else {
              <span class="text-meta text-fg">{{
                'recruitment.privacy.legacyVersion'
                  | transloco: { version: c.privacy_notice_version }
              }}</span>
            }
          </div>
        }

        <app-record-meta follow-up-meta>
          <app-field-item layout="inline" labelKey="recruitment.privacy.pool">
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
          <app-field-item
            layout="inline"
            labelKey="recruitment.detail.created"
            [value]="c.created_at | localDate"
          />
          <app-field-item
            layout="inline"
            labelKey="recruitment.detail.updated"
            [value]="c.updated_at | localDate"
          />
        </app-record-meta>

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
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/recruitment/candidates',
    this.cand()?.id ?? '',
    'edit',
  ]);
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const c = this.cand();
    return c && c.can_edit && this.perms().write
      ? candidateMissing(c, () => this.recordNotice())
      : [];
  });
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

  protected recordNotice(): void {
    this.privacy({ privacy_notice_given: true });
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
