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
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { AskPanelService } from '../../ask/ask-panel.service';
import { Term } from '../../../shared/guidance/term';
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
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContextApi } from '../data/context-api';
import { AddressedStatus, InterestedParty } from '../data/context.models';
import { KINDS, contextErrorKey, isPastDay, priorityBadge, statusBadge } from '../context-kinds';
import { CONTEXT_ROOT_CRUMB } from '../context-nav';
import { injectContextPermissions } from '../context-permissions';
import { FIELD_LABELS, HeaderAction, lifecycleBody, placeActions } from './context-detail';
import { PartyRegisters } from './party-registers';
import { CustomersAvailability } from '../../../shared/customers';
import { CustomersApi } from '../../customers/data/customers-api';

/** Tone of the "Håndtert – …" sentence: done is green, open work is a to-do (never red). */
const ADDRESSED_TONE: Readonly<Record<AddressedStatus, StatusLineTone>> = {
  addressed: 'pass',
  partially: 'warn',
  not_addressed: 'warn',
  not_relevant: 'neutral',
};

/** What an interested party still needs ("Oppfølging", docs/ux-guide.md §2.7). */
export function partyMissing(
  party: InterestedParty,
  editLink: readonly unknown[],
  reviewOverdue: boolean,
  review: (() => void) | null,
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (reviewOverdue && review) {
    items.push({ key: 'review', labelKey: 'context.partyDetail.missing.review', action: review });
  }
  if (!party.needs?.trim() && !party.expectations?.trim()) {
    items.push({ key: 'needs', labelKey: 'context.partyDetail.missing.needs', link: editLink });
  }
  if (!party.how_addressed?.trim() && party.addressed_status !== 'not_relevant') {
    items.push({
      key: 'how',
      labelKey: 'context.partyDetail.missing.howAddressed',
      link: editLink,
    });
  }
  if (!party.owner) {
    items.push({ key: 'owner', labelKey: 'context.partyDetail.missing.owner', link: editLink });
  }
  return items;
}

/**
 * The detail page of an interested party (`/context/interested-parties/:id`), the
 * pilot of the detail-page anatomy (docs/ux-guide.md §2.7): header with one
 * primary action and "Spør KI"; "Hovedinformasjon" with what the party needs and
 * expects and how it is handled; the other fields with the empty ones hidden; one
 * "Oppfølging" card with what is missing, the requirements, the connections and a
 * compact metadata block.
 */
@Component({
  selector: 'app-context-party-detail',
  imports: [
    TranslocoPipe,
    Term,
    WhyItMatters,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    SupportsRequirements,
    EntityTasks,
    Button,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    StatusBadge,
    PartyRegisters,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-error-state
            titleKey="context.detail.notFoundTitle"
            bodyKey="context.detail.notFound"
            (retry)="reload()"
          />
        </div>
      }
      @case ('ready') {
        @if (record(); as r) {
          @let status = statusOf(r);
          <app-record-detail-layout
            [anatomy]="true"
            [entityType]="entityType"
            [entityId]="r.id"
            [title]="r.name"
            [breadcrumbs]="breadcrumbs()"
            [tabs]="tabs"
            [canEdit]="r.can_edit"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ r.code }}</span>
              <span aria-hidden="true">·</span>
              <app-term key="interested-party" scope="context">{{
                'context.kinds.party.one' | transloco
              }}</app-term>
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="status.meaning"
                [value]="status.value"
                [labelKey]="status.labelKey"
              />
              @if (reviewOverdue()) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="context.detail.reviewOverdue"
                />
              }
            </ng-container>

            @if (placed().primary; as action) {
              <app-button
                primary
                [loading]="busy() === action"
                [disabled]="!!busy()"
                (click)="run(action)"
                [attr.data-testid]="'context-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </app-button>
            }
            @for (action of placed().secondary; track action) {
              <app-button
                secondary
                variant="secondary"
                [disabled]="!!busy()"
                (click)="run(action)"
                [attr.data-testid]="'context-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </app-button>
            }
            @for (action of placed().overflow; track action) {
              <button
                appMenuItem
                overflow
                type="button"
                [disabled]="!!busy()"
                (click)="run(action)"
                [attr.data-testid]="'context-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </button>
            }
            @if (perms.canManage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                [disabled]="!!busy()"
                (click)="deleteOpen.set(true)"
                data-testid="context-delete"
              >
                {{ 'context.actions.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('summarise')">
              <app-icon name="spark" [size]="15" />
              {{ 'context.ai.summarise' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('improve')">
              <app-icon name="spark" [size]="15" />
              {{ 'context.ai.improve.party' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('explain')">
              <app-icon name="spark" [size]="15" />
              {{ 'context.ai.explain' | transloco }}
            </button>

            <app-help-strip
              help
              scope="context"
              [page]="guidance + '-detail'"
              [lesson]="lesson"
              [subject]="r.name"
            />

            <app-record-lead record-lead [fillLink]="editLink()">
              <app-record-status-line status [tone]="addressedTone()">
                {{ 'context.partyDetail.status.' + r.addressed_status | transloco }}
              </app-record-status-line>
              <app-field-item
                size="lead"
                labelKey="context.partyDetail.lead.needs"
                [value]="r.needs"
                [multiline]="true"
              />
              <app-field-item
                size="lead"
                labelKey="context.partyDetail.lead.expectations"
                [value]="r.expectations"
                [multiline]="true"
              />
              <app-field-item
                size="lead"
                labelKey="context.partyDetail.lead.requirements"
                [value]="r.requirements"
                [multiline]="true"
              />
              @if (isCustomers()) {
                <p class="-mt-2 mb-4 text-meta text-fg-muted" data-testid="party-customer-hint">
                  {{ 'context.partyDetail.customers.requirementsHint' | transloco }}
                </p>
              }
              <app-field-item
                size="lead"
                labelKey="context.partyDetail.lead.howAddressed"
                [value]="r.how_addressed"
                [multiline]="true"
              />
            </app-record-lead>

            <app-record-details [columns]="3" [fillLink]="editLink()">
              <app-field-item
                labelKey="context.fields.category"
                [value]="'context.partyCategories.' + r.category | transloco"
              />
              <app-field-item
                labelKey="context.fields.partyType"
                [value]="'context.partyTypes.' + r.party_type | transloco"
              />
              <app-field-item labelKey="context.fields.priority">
                @let pr = priority(r);
                <app-status-badge
                  [meaning]="pr.meaning"
                  [value]="pr.value"
                  [labelKey]="pr.labelKey"
                />
                <span class="mt-1 block text-meta text-fg-muted">
                  {{
                    'context.partyDetail.priorityBasis'
                      | transloco
                        : {
                            influence: ('context.levels.' + r.influence | transloco),
                            interest: ('context.levels.' + r.interest | transloco),
                          }
                  }}
                </span>
              </app-field-item>
              @if (r.is_compliance_obligation) {
                <app-field-item
                  labelKey="context.partyDetail.binding"
                  [wide]="true"
                  [value]="'context.partyDetail.bindingYes' | transloco"
                />
              }
              <app-field-item
                labelKey="context.fields.description"
                [wide]="true"
                [value]="r.description"
                [multiline]="true"
              />
              <app-field-item
                labelKey="context.fields.monitoring"
                [wide]="true"
                [value]="r.monitoring"
                [multiline]="true"
              />
              <app-field-item
                labelKey="context.partyDetail.frameworks"
                [wide]="true"
                [value]="frameworkNames(r.frameworks)"
              />
            </app-record-details>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="r.id"
                [canCreate]="canCreateTasks()"
                [entityLabel]="r.code + ' ' + r.name"
              />
            </div>

            <app-supports-requirements
              aside-requirements
              [entityType]="entityType"
              [entityId]="r.id"
              [canEdit]="r.can_edit"
              [frameworks]="r.frameworks.length ? r.frameworks : null"
              (linksChange)="onLinks($event)"
            />

            <app-context-party-registers
              follow-up-connections
              variant="inline"
              [party]="r"
              [canEdit]="r.can_edit"
            />
            @if (isCustomers() && customers.canRead()) {
              <a
                follow-up-connections
                routerLink="/customers"
                [queryParams]="{ status: 'active' }"
                class="inline-flex items-center gap-1.5 text-ui font-semibold text-accent hover:underline"
                data-testid="party-customer-register"
              >
                <app-icon name="building" [size]="14" />
                {{
                  (activeCustomers() === null
                    ? 'context.partyDetail.customers.register'
                    : 'context.partyDetail.customers.registerCount'
                  ) | transloco: { count: activeCustomers() }
                }}
                <span aria-hidden="true">→</span>
              </a>
            }

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="context.fields.owner"
                [value]="r.owner?.name"
              />
              <app-field-item layout="inline" labelKey="context.fields.reviewInterval">
                @if (r.review_interval_months; as months) {
                  {{ 'context.detail.everyMonths' | transloco: { count: months } }}
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="context.fields.nextReview"
                [keepEmpty]="true"
                emptyKey="kit.detail.meta.notPlanned"
                emptyActionKey="kit.detail.meta.plan"
                [emptyLink]="r.can_edit ? editLink() : null"
              >
                @if (r.next_review_at) {
                  <span [class.text-warn-ink]="reviewOverdue()">{{
                    r.next_review_at | localDay
                  }}</span>
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="context.fields.updated"
                [value]="r.updated_at | localDate"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters scope="context" [page]="guidance + '-detail'" />
            </div>
          </app-record-detail-layout>

          <app-prompt-dialog
            [open]="reviewOpen()"
            [title]="'context.lifecycle.review.title' | transloco"
            [message]="'context.lifecycle.review.message' | transloco: { title: r.name }"
            [label]="'context.lifecycle.review.label' | transloco"
            [required]="false"
            confirmVariant="primary"
            [confirmLabel]="'context.actions.review' | transloco"
            [cancelLabel]="'context.common.cancel' | transloco"
            [busy]="!!busy()"
            (confirmed)="confirmReview($event)"
            (cancelled)="reviewOpen.set(false)"
          />
          <app-confirm-dialog
            [open]="deleteOpen()"
            [title]="'context.delete.title' | transloco: { type: kindLabel() }"
            [message]="'context.delete.message' | transloco: { title: r.name }"
            [confirmLabel]="'context.actions.delete' | transloco"
            [cancelLabel]="'context.common.cancel' | transloco"
            [busy]="busy() === 'delete'"
            (confirmed)="remove()"
            (cancelled)="deleteOpen.set(false)"
          />
        }
      }
    }
  `,
})
export class PartyDetail {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  protected readonly customers = inject(CustomersAvailability);
  private readonly customersApi = inject(CustomersApi);
  /** Active customers in the register (the "Kunder" party points at it); null until known. */
  protected readonly activeCustomers = signal<number | null>(null);

  /** Route param (component input binding). */
  readonly id = input.required<string>();
  /** Route data (unused: this page is for parties only). */
  readonly contextKind = input<unknown>(undefined);

  protected readonly entityType = KINDS.party.entityType;
  protected readonly guidance = KINDS.party.guidance;
  protected readonly lesson = KINDS.party.lesson;
  protected readonly listPath = `/context/${KINDS.party.segment}`;
  protected readonly perms = injectContextPermissions();
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly tabs: readonly RecordTab[] = [
    'details',
    'related',
    'activity',
    'comments',
    'attachments',
    'revisions',
    'tasks',
  ];

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly record = signal<InterestedParty | null>(null);
  /** A customer party while the customer register is on: it points at the register. */
  protected readonly isCustomers = computed(
    () => this.record()?.category === 'customer' && this.customers.enabled(),
  );
  protected readonly busy = signal<HeaderAction | 'delete' | null>(null);
  protected readonly reviewOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  private readonly confirmedRefs = signal<readonly string[]>([]);

  protected readonly kindLabel = computed(() => this.language.translate('context.kinds.party.one'));
  protected readonly breadcrumbs = computed(() => [
    CONTEXT_ROOT_CRUMB,
    { labelKey: 'context.kinds.party.plural', link: this.listPath },
    { label: this.record()?.name ?? '' },
  ]);
  protected readonly editLink = computed<readonly unknown[]>(() => [
    this.listPath,
    this.id(),
    'edit',
  ]);

  protected readonly reviewOverdue = computed(() => {
    const r = this.record();
    return r ? (r.review_overdue ?? isPastDay(r.next_review_at)) : false;
  });

  protected readonly addressedTone = computed(
    () => ADDRESSED_TONE[this.record()?.addressed_status ?? 'not_addressed'] ?? 'neutral',
  );

  protected readonly allowed = computed<readonly HeaderAction[]>(() => {
    const r = this.record();
    if (!r) {
      return [];
    }
    const out: HeaderAction[] = [];
    if (r.status === 'active' && this.perms.canWrite()) {
      out.push('review');
    }
    if (r.can_edit) {
      out.push('edit');
    }
    return out;
  });

  protected readonly placed = computed(() => placeActions(this.allowed(), this.reviewOverdue()));

  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const r = this.record();
    if (!r || !r.can_edit) {
      return [];
    }
    const canReview = this.allowed().includes('review');
    return partyMissing(
      r,
      this.editLink(),
      this.reviewOverdue(),
      canReview ? () => this.run('review') : null,
    );
  });

  protected readonly canCreateTasks = computed(
    () => !!this.selectedOrg.currentOrg()?.permissions.includes('tasks:write'),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'context',
      entityType: this.entityType,
      entityId: this.id(),
      view: 'detail',
      title: this.record()?.name || null,
      requirements: this.confirmedRefs().length ? this.confirmedRefs() : null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    // "Kunderegisteret: N aktive kunder": only for a customer party, once per org.
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (!orgId || !this.isCustomers() || !this.customers.canRead()) {
        return;
      }
      untracked(() =>
        this.customersApi.summary(orgId).subscribe({
          next: (s) => this.activeCustomers.set(s.by_status?.active ?? null),
          error: () => this.activeCustomers.set(null),
        }),
      );
    });
  }

  protected statusOf(r: InterestedParty) {
    return statusBadge(r.status);
  }

  protected priority(r: InterestedParty) {
    return priorityBadge(r.priority);
  }

  protected frameworkNames(keys: readonly string[]): string {
    return keys.map((key) => this.language.translate(`context.frameworks.${key}`)).join(', ');
  }

  protected actionLabel(action: HeaderAction): string {
    return action === 'review' ? 'context.actions.reviewSimple' : `context.actions.${action}`;
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.confirmedRefs.set(
      links.filter((link) => link.status === 'confirmed').map((link) => link.requirement_ref),
    );
  }

  protected run(action: HeaderAction): void {
    const r = this.record();
    if (!r || this.busy()) {
      return;
    }
    if (action === 'edit') {
      void this.router.navigate(this.editLink());
    } else if (action === 'review') {
      this.reviewOpen.set(true);
    }
  }

  protected confirmReview(text: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r || this.busy()) {
      return;
    }
    this.busy.set('review');
    this.api.transition(orgId, 'party', r.id, 'review', lifecycleBody('review', text)).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.reviewOpen.set(false);
        this.record.set(updated as InterestedParty);
        this.notifications.success('context.notices.review', { code: updated.code });
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.reviewOpen.set(false);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }

  protected askAi(kind: 'summarise' | 'improve' | 'explain'): void {
    const r = this.record();
    if (!r) {
      return;
    }
    const key =
      kind === 'improve' ? 'context.ai.prompts.improve.party' : `context.ai.prompts.${kind}`;
    this.ask.askAbout(
      this.language.translate(key, { code: r.code, title: r.name, type: this.kindLabel() }),
      undefined,
      { requirements: this.confirmedRefs() },
    );
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r) {
      return;
    }
    this.busy.set('delete');
    this.api.delete(orgId, 'party', r.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.deleteOpen.set(false);
        this.notifications.success('context.notices.deleted', { code: r.code });
        void this.router.navigateByUrl(this.listPath);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.deleteOpen.set(false);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (this.record()?.id !== id) {
      this.state.set('loading');
    }
    this.request = this.api.get(orgId, 'party', id).subscribe({
      next: (record) => {
        this.record.set(record as InterestedParty);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
