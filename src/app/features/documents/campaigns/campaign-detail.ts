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
import { Observable, Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { DocumentControlApi } from '../data/document-control-api';
import { documentControlErrorKey } from '../data/document-control-errors';
import { AudienceEntry, CampaignDetail, CampaignUpdate } from '../data/document-control.models';
import {
  campaignStatusTone,
  endOfDay,
  portalLink,
  textOrNull,
  toDateInput,
} from '../shared/document-control-display';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';
import { AudienceEditor } from './audience-editor';

const TABS: readonly RecordTab[] = ['details', 'activity', 'related', 'comments'];

/** Recipients filter on the detail page. */
export type RecipientFilter = 'all' | 'pending' | 'acknowledged' | 'overdue';
export const RECIPIENT_FILTERS: readonly RecipientFilter[] = [
  'all',
  'pending',
  'acknowledged',
  'overdue',
];

/**
 * One distribution campaign: progress, recipients (who has acknowledged, who is
 * overdue), and the lifecycle actions — launch, add recipients, remind, close,
 * delete. While a draft, the audience, due date and acknowledgement switch can
 * still change; title and message can change until it is closed.
 */
@Component({
  selector: 'app-campaign-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    ProgressBar,
    DocumentsPageGuide,
    AudienceEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (campaign(); as c) {
      <app-record-detail-layout
        entityType="distribution_campaign"
        [entityId]="c.id"
        [tabs]="tabs"
        [canEdit]="c.status !== 'closed'"
        [includeAudit]="perms.canReadAudit()"
        backLink="/documents/campaigns"
        backLabelKey="documents.control.campaigns.back"
      >
        <div header>
          <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
            @if (docLink(); as href) {
              <a [routerLink]="href" class="hover:underline">
                <span class="font-mono">{{ c.document.code }}</span> {{ c.document.title }}
              </a>
            }
            @if (c.revision) {
              <span>{{
                'documents.control.campaigns.revisionShort' | transloco: { rev: c.revision }
              }}</span>
            }
          </p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ c.title }}
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <app-badge [tone]="tone()">{{
              'documents.control.campaigns.status.' + c.status | transloco
            }}</app-badge>
            <app-badge tone="neutral">{{
              (c.require_acknowledgement
                ? 'documents.control.campaigns.kindAck'
                : 'documents.control.campaigns.kindDistribution'
              ) | transloco
            }}</app-badge>
          </div>
        </div>

        <ng-container actions>
          <app-watch-button entityType="distribution_campaign" [entityId]="c.id" />
          @if (c.status === 'draft') {
            <app-button
              size="sm"
              [disabled]="c.audience.length === 0"
              [loading]="busy()"
              (click)="launch()"
              data-testid="campaign-launch"
            >
              {{ 'documents.control.campaigns.launch' | transloco }}
            </app-button>
          }
          @if (c.status === 'active') {
            <app-button
              size="sm"
              variant="secondary"
              [disabled]="c.stats.pending === 0"
              [loading]="busy()"
              (click)="remind()"
              data-testid="campaign-remind"
            >
              <app-icon name="bell" [size]="14" />
              {{ 'documents.control.campaigns.remind' | transloco }}
            </app-button>
          }
          @if (c.status !== 'closed') {
            <app-button size="sm" variant="secondary" (click)="startEdit()">
              {{ 'documents.control.common.edit' | transloco }}
            </app-button>
          }
          @if (c.status === 'active' || c.status === 'completed') {
            <app-button size="sm" variant="secondary" (click)="closeOpen.set(true)">
              {{ 'documents.control.campaigns.close' | transloco }}
            </app-button>
          }
          <app-button size="sm" variant="ghost" (click)="deleteOpen.set(true)">
            <app-icon name="trash" [size]="14" />
            <span class="sr-only sm:not-sr-only">{{
              'documents.control.common.delete' | transloco
            }}</span>
          </app-button>
        </ng-container>

        <div class="flex flex-col gap-5">
          <app-documents-page-guide page="campaignDetail" lesson="read-and-acknowledge" />

          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }

          @if (editing()) {
            <app-card>
              <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                {{ 'documents.control.campaigns.editTitle' | transloco }}
              </h2>
              <div class="flex flex-col gap-4">
                <app-form-field
                  inputId="camp-edit-title"
                  [label]="'documents.control.campaigns.fields.title' | transloco"
                >
                  <input
                    id="camp-edit-title"
                    type="text"
                    maxlength="255"
                    [value]="editTitle()"
                    (input)="editTitle.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field
                  inputId="camp-edit-message"
                  [label]="'documents.control.campaigns.fields.message' | transloco"
                >
                  <textarea
                    id="camp-edit-message"
                    rows="3"
                    maxlength="4000"
                    [value]="editMessage()"
                    (input)="editMessage.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                @if (c.status === 'draft') {
                  <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
                    <input
                      type="checkbox"
                      [checked]="editAck()"
                      (change)="editAck.set($any($event.target).checked)"
                    />
                    {{ 'documents.control.campaigns.fields.requireAck' | transloco }}
                  </label>
                  <app-form-field
                    inputId="camp-edit-due"
                    [label]="'documents.control.campaigns.fields.due' | transloco"
                  >
                    <input
                      id="camp-edit-due"
                      type="date"
                      [value]="editDue()"
                      (input)="editDue.set($any($event.target).value)"
                    />
                  </app-form-field>
                  <app-audience-editor
                    [value]="editAudience()"
                    (valueChange)="editAudience.set($event)"
                  />
                } @else {
                  <p class="text-[12.5px] text-fg-subtle">
                    {{ 'documents.control.campaigns.lockedAfterLaunch' | transloco }}
                  </p>
                }
                <div class="flex gap-2">
                  <app-button
                    size="sm"
                    [disabled]="!editTitle().trim()"
                    [loading]="busy()"
                    (click)="saveEdit()"
                  >
                    {{ 'documents.control.common.save' | transloco }}
                  </app-button>
                  <app-button size="sm" variant="ghost" (click)="editing.set(false)">
                    {{ 'documents.control.common.cancel' | transloco }}
                  </app-button>
                </div>
              </div>
            </app-card>
          }

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'documents.control.campaigns.progressTitle' | transloco }}
            </h2>
            @if (c.status === 'draft') {
              <p class="text-[13.5px] text-fg-muted">
                {{ 'documents.control.campaigns.draftHint' | transloco }}
              </p>
            } @else {
              <app-progress-bar
                [value]="c.stats.percent"
                [label]="
                  'documents.control.campaigns.progress'
                    | transloco: { done: c.stats.acknowledged, total: c.stats.total }
                "
              />
              <dl class="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
                <div>
                  <dt class="text-[12px] text-fg-muted">
                    {{ 'documents.control.campaigns.stats.total' | transloco }}
                  </dt>
                  <dd class="text-[18px] font-bold text-fg">{{ c.stats.total }}</dd>
                </div>
                <div>
                  <dt class="text-[12px] text-fg-muted">
                    {{ 'documents.control.campaigns.stats.acknowledged' | transloco }}
                  </dt>
                  <dd class="text-[18px] font-bold text-pass">{{ c.stats.acknowledged }}</dd>
                </div>
                <div>
                  <dt class="text-[12px] text-fg-muted">
                    {{ 'documents.control.campaigns.stats.pending' | transloco }}
                  </dt>
                  <dd class="text-[18px] font-bold text-fg">{{ c.stats.pending }}</dd>
                </div>
                <div>
                  <dt class="text-[12px] text-fg-muted">
                    {{ 'documents.control.campaigns.stats.overdue' | transloco }}
                  </dt>
                  <dd class="text-[18px] font-bold" [class.text-fail]="c.stats.overdue > 0">
                    {{ c.stats.overdue }}
                  </dd>
                </div>
              </dl>
            }
            @if (c.message) {
              <p class="mt-3 border-t border-border pt-3 text-[13.5px] whitespace-pre-line text-fg">
                {{ c.message }}
              </p>
            }
          </app-card>

          @if (c.status === 'active') {
            <app-card>
              <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
                {{ 'documents.control.campaigns.addRecipients' | transloco }}
              </h2>
              <app-audience-editor [value]="extra()" (valueChange)="extra.set($event)" />
              <app-button
                class="mt-3 inline-block"
                size="sm"
                variant="secondary"
                [disabled]="extra().length === 0"
                [loading]="busy()"
                (click)="addRecipients()"
                data-testid="campaign-add-recipients"
              >
                {{ 'documents.control.campaigns.addRecipientsButton' | transloco }}
              </app-button>
            </app-card>
          }

          <app-card [padded]="false">
            <div class="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2">
              <h2 class="font-display text-[16px] font-bold text-fg">
                {{ 'documents.control.campaigns.recipients' | transloco }}
              </h2>
              @if (c.recipients.length) {
                <label class="sr-only" for="camp-rec-filter">{{
                  'documents.control.campaigns.recipientFilter' | transloco
                }}</label>
                <select
                  id="camp-rec-filter"
                  class="h-8 rounded-tile border border-border bg-bg px-2 text-[12.5px] text-fg"
                  (change)="recipientFilter.set($any($event.target).value)"
                >
                  @for (f of recipientFilters; track f) {
                    <option [value]="f" [selected]="f === recipientFilter()">
                      {{ 'documents.control.campaigns.recipientFilters.' + f | transloco }}
                    </option>
                  }
                </select>
              }
            </div>
            @if (c.status === 'draft') {
              <div class="px-4 pb-4">
                <app-audience-editor [value]="c.audience" [readOnly]="true" />
              </div>
            } @else if (visibleRecipients().length === 0) {
              <p class="px-4 pb-4 text-[13px] text-fg-muted">
                {{ 'documents.control.campaigns.noRecipients' | transloco }}
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full min-w-[560px] text-left text-[13px]">
                  <caption class="sr-only">
                    {{
                      'documents.control.campaigns.recipients' | transloco
                    }}
                  </caption>
                  <thead class="border-y border-border text-[12px] text-fg-muted">
                    <tr>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'documents.control.campaigns.fields.person' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.campaigns.fields.notified' | transloco }}
                      </th>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'documents.control.campaigns.fields.acknowledged' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (r of visibleRecipients(); track r.user_id) {
                      <tr data-testid="recipient-row">
                        <td class="px-4 py-2 text-fg">
                          {{ r.name ?? ('documents.control.common.unknown' | transloco) }}
                          @if (r.task_id) {
                            <a
                              [routerLink]="['/tasks', r.task_id]"
                              class="ml-2 text-[12px] text-accent hover:underline"
                              >{{ 'documents.control.campaigns.task' | transloco }}</a
                            >
                          }
                        </td>
                        <td class="px-2 py-2 whitespace-nowrap text-fg-muted">
                          {{ r.notified_at ? (r.notified_at | localDate: 'short') : '—' }}
                        </td>
                        <td class="px-4 py-2 whitespace-nowrap">
                          @if (r.acknowledged_at) {
                            <span class="text-pass">{{
                              r.acknowledged_at | localDate: 'short'
                            }}</span>
                          } @else if (r.overdue) {
                            <app-badge tone="fail">{{
                              'documents.control.campaigns.overdue' | transloco
                            }}</app-badge>
                          } @else {
                            <span class="text-fg-muted">{{
                              'documents.control.campaigns.pending' | transloco
                            }}</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-card>
        </div>

        <ng-container aside>
          <app-card>
            <dl class="flex flex-col gap-3 text-[13px]">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.campaigns.fields.due' | transloco }}
                </dt>
                <dd class="text-fg">{{ c.due_at ? (c.due_at | localDay) : '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.campaigns.fields.launched' | transloco }}
                </dt>
                <dd class="text-fg">
                  @if (c.launched_at) {
                    {{ c.launched_at | localDate: 'medium' }}
                    @if (c.launched_by?.name; as who) {
                      <span class="block text-[12px] text-fg-subtle">{{ who }}</span>
                    }
                  } @else {
                    —
                  }
                </dd>
              </div>
              @if (c.completed_at) {
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'documents.control.campaigns.fields.completed' | transloco }}
                  </dt>
                  <dd class="text-fg">{{ c.completed_at | localDate: 'medium' }}</dd>
                </div>
              }
              @if (c.closed_at) {
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'documents.control.campaigns.fields.closed' | transloco }}
                  </dt>
                  <dd class="text-fg">{{ c.closed_at | localDate: 'medium' }}</dd>
                </div>
              }
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.fields.createdBy' | transloco }}
                </dt>
                <dd class="text-fg">{{ c.created_by?.name ?? '—' }}</dd>
              </div>
            </dl>
          </app-card>
          @if (perms.canReadStandards()) {
            <app-card>
              <app-supports-requirements entityType="distribution_campaign" [entityId]="c.id" />
            </app-card>
          }
        </ng-container>
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="closeOpen()"
        [title]="'documents.control.campaigns.closeTitle' | transloco"
        [message]="'documents.control.campaigns.closeMessage' | transloco"
        confirmVariant="primary"
        [confirmLabel]="'documents.control.campaigns.close' | transloco"
        [cancelLabel]="'documents.control.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="close()"
        (cancelled)="closeOpen.set(false)"
      />
      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'documents.control.campaigns.deleteTitle' | transloco"
        [message]="'documents.control.campaigns.deleteMessage' | transloco: { title: c.title }"
        [confirmLabel]="'documents.control.common.delete' | transloco"
        [cancelLabel]="'documents.control.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-alert tone="error">{{ loadErrorKey() | transloco }}</app-alert>
        <a
          routerLink="/documents/campaigns"
          class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline"
        >
          {{ 'documents.control.campaigns.back' | transloco }}
        </a>
      </div>
    } @else {
      <p class="py-16 text-center text-[14px] text-fg-muted">
        {{ 'documents.control.common.loading' | transloco }}
      </p>
    }
  `,
})
export class CampaignDetailPage {
  private readonly api = inject(DocumentControlApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  protected readonly perms = inject(DocumentControlPermissions);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly recipientFilters = RECIPIENT_FILTERS;

  protected readonly campaign = signal<CampaignDetail | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadErrorKey = signal('documents.control.common.loadFailed');
  protected readonly errorKey = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly closeOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly editing = signal(false);
  protected readonly editTitle = signal('');
  protected readonly editMessage = signal('');
  protected readonly editAck = signal(true);
  protected readonly editDue = signal('');
  protected readonly editAudience = signal<readonly AudienceEntry[]>([]);
  protected readonly extra = signal<readonly AudienceEntry[]>([]);
  protected readonly recipientFilter = signal<RecipientFilter>('all');
  private sub: Subscription | null = null;

  protected readonly tone = computed(() => campaignStatusTone(this.campaign()?.status ?? 'draft'));
  protected readonly docLink = computed(() => portalLink(this.campaign()?.document.url));

  protected readonly visibleRecipients = computed(() => {
    const all = this.campaign()?.recipients ?? [];
    switch (this.recipientFilter()) {
      case 'pending':
        return all.filter((r) => !r.acknowledged_at);
      case 'acknowledged':
        return all.filter((r) => !!r.acknowledged_at);
      case 'overdue':
        return all.filter((r) => r.overdue);
      default:
        return all;
    }
  });

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'distribution_campaign',
      entityId: this.id(),
      view: 'detail',
      title: this.campaign()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, id: string): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = this.api.getCampaign(orgId, id).subscribe({
      next: (c) => {
        this.campaign.set(c);
        this.state.set('ready');
      },
      error: (e: unknown) => {
        this.campaign.set(null);
        this.loadErrorKey.set(documentControlErrorKey(e));
        this.state.set('error');
      },
    });
  }

  /** Run a mutation that returns the updated campaign. */
  private mutate(
    request: (orgId: string) => Observable<CampaignDetail>,
    notice: (c: CampaignDetail) => [string, Record<string, unknown>?],
    done?: () => void,
  ): void {
    const orgId = this.perms.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    request(orgId).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.campaign.set(c);
        done?.();
        const [key, params] = notice(c);
        this.toasts.success(key, params);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        done?.();
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }

  protected launch(): void {
    this.mutate(
      (orgId) => this.api.launchCampaign(orgId, this.id()),
      (c) => [
        'documents.control.campaigns.launchedToast',
        { count: c.stats.total, skipped: c.skipped },
      ],
    );
  }

  protected addRecipients(): void {
    const audience = this.extra();
    this.mutate(
      (orgId) => this.api.addRecipients(orgId, this.id(), audience),
      (c) => [
        'documents.control.campaigns.addedToast',
        { count: c.added ?? 0, skipped: c.skipped },
      ],
      () => this.extra.set([]),
    );
  }

  protected close(): void {
    this.mutate(
      (orgId) => this.api.closeCampaign(orgId, this.id()),
      () => ['documents.control.campaigns.closedToast'],
      () => this.closeOpen.set(false),
    );
  }

  protected startEdit(): void {
    const c = this.campaign();
    if (!c) {
      return;
    }
    this.editTitle.set(c.title);
    this.editMessage.set(c.message ?? '');
    this.editAck.set(c.require_acknowledgement);
    this.editDue.set(toDateInput(c.due_at));
    this.editAudience.set(c.audience);
    this.editing.set(true);
  }

  protected saveEdit(): void {
    const c = this.campaign();
    if (!c) {
      return;
    }
    const body: CampaignUpdate =
      c.status === 'draft'
        ? {
            title: this.editTitle().trim(),
            message: textOrNull(this.editMessage()),
            require_acknowledgement: this.editAck(),
            due_at: endOfDay(this.editDue()),
            audience: this.editAudience(),
          }
        : { title: this.editTitle().trim(), message: textOrNull(this.editMessage()) };
    this.mutate(
      (orgId) => this.api.updateCampaign(orgId, this.id(), body),
      () => ['documents.control.common.savedToast'],
      () => this.editing.set(false),
    );
  }

  protected remind(): void {
    const orgId = this.perms.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    this.api.remindCampaign(orgId, this.id()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.toasts.success('documents.control.campaigns.remindedToast', { count: r.reminded });
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.api.deleteCampaign(orgId, this.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.toasts.success('documents.control.campaigns.deletedToast');
        void this.router.navigateByUrl('/documents/campaigns');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }
}
