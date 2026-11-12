import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import { Consultation } from '../data/hse.models';
import {
  consultationStatusTone,
  linesToList,
  listToLines,
  localInputToWire,
  textOrNull,
  wireToLocalInput,
} from '../hse-format';
import {
  HSE_MODULE,
  HseAskButton,
  departmentName,
  injectHsePermissions,
} from '../shared/hse-shared';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
];

/** The current local time as a `datetime-local` value. */
function nowLocalInput(): string {
  return wireToLocalInput(new Date().toISOString().slice(0, 19));
}

/**
 * `/hse/consultations/:id`: a worker consultation record — topics, participants
 * and worker representatives, then (once held) the summary and decisions; "mark
 * as held" and cancel, follow-up actions, related records, activity, comments,
 * attachments and clause evidence.
 */
@Component({
  selector: 'app-consultation-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    MarkdownPipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    SlideOver,
    RecordDetailLayout,
    EntityTasks,
    WatchButton,
    SupportsRequirements,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    HseAskButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (record(); as c) {
      <app-record-detail-layout
        entityType="worker_consultation"
        [entityId]="c.id"
        [tabs]="tabs"
        [canEdit]="perms.write()"
        backLink="/hse/consultations"
        backLabelKey="hse.consultation.list.back"
      >
        <div header>
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-fg-subtle">{{ c.code }}</span>
            <app-badge [tone]="statusTone(c.status)">{{
              'hse.consultation.status.' + c.status | transloco
            }}</app-badge>
            <app-badge tone="neutral">{{
              'hse.consultation.kind.' + c.kind | transloco
            }}</app-badge>
          </div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ c.title }}
          </h1>
        </div>

        <ng-container actions>
          <app-watch-button entityType="worker_consultation" [entityId]="c.id" />
          <app-hse-ask-button
            labelKey="hse.common.summarise"
            promptKey="hse.consultation.ai.summarisePrompt"
            [params]="{ code: c.code }"
          />
          @if (perms.write()) {
            @if (c.status === 'planned') {
              <app-button size="sm" (click)="openHold(c)" data-testid="wc-hold">{{
                'hse.consultation.actions.hold' | transloco
              }}</app-button>
              <app-button size="sm" variant="ghost" (click)="cancelOpen.set(true)">{{
                'hse.consultation.actions.cancel' | transloco
              }}</app-button>
            }
            @if (c.status !== 'cancelled') {
              <a [routerLink]="['/hse/consultations', c.id, 'edit']" tabindex="-1">
                <app-button variant="secondary" size="sm">
                  <app-icon name="sliders" [size]="14" />
                  {{ 'hse.common.edit' | transloco }}
                </app-button>
              </a>
            }
          }
          @if (perms.manage()) {
            <app-button variant="ghost" size="sm" (click)="deleteOpen.set(true)">
              <app-icon name="trash" [size]="14" />
              {{ 'hse.common.delete' | transloco }}
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="hse" page="consultation-detail" />
          @if (c.status === 'held' && !c.worker_representative_present) {
            <p
              class="rounded-tile border border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-warn"
              role="status"
            >
              {{ 'hse.consultation.detail.noRepWarning' | transloco }}
            </p>
          }
          <app-card>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.consultation.fields.scheduled_at' | transloco }}
                </dt>
                <dd class="text-fg">{{ (c.scheduled_at | localDate: 'medium') || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.consultation.fields.held_at' | transloco }}
                </dt>
                <dd class="text-fg">{{ (c.held_at | localDate: 'medium') || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.consultation.fields.location' | transloco }}
                </dt>
                <dd class="text-fg">{{ c.location || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.consultation.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">{{ c.owner?.name || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.common.department' | transloco }}
                </dt>
                <dd class="text-fg">{{ department() || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.consultation.fields.worker_representative_present' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{
                    (c.worker_representative_present ? 'hse.common.yes' : 'hse.common.no')
                      | transloco
                  }}
                </dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.consultation.fields.topics' | transloco }}
                </dt>
                <dd class="cf-prose text-fg" [innerHTML]="c.topics || '—' | appMarkdown"></dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.consultation.fields.participants' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ c.participants.length ? c.participants.join(', ') : '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.consultation.fields.worker_representatives' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ c.worker_representatives.length ? c.worker_representatives.join(', ') : '—' }}
                </dd>
              </div>
            </dl>
          </app-card>
          @if (c.status === 'held') {
            <app-card>
              <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
                {{ 'hse.consultation.fields.summary' | transloco }}
              </h2>
              <div
                class="cf-prose text-[13.5px] text-fg"
                [innerHTML]="c.summary || '—' | appMarkdown"
              ></div>
              <h2 class="mt-4 mb-2 font-display text-[16px] font-bold text-fg">
                {{ 'hse.consultation.fields.decisions' | transloco }}
              </h2>
              <div
                class="cf-prose text-[13.5px] text-fg"
                [innerHTML]="c.decisions || '—' | appMarkdown"
              ></div>
            </app-card>
          }
        </div>

        <app-entity-tasks
          tasks
          entityType="worker_consultation"
          [entityId]="c.id"
          [canCreate]="perms.write()"
          [entityLabel]="c.code + ' ' + c.title"
        />

        <ng-container aside>
          <app-why-it-matters scope="hse" page="consultation-detail" />
          <app-supports-requirements entityType="worker_consultation" [entityId]="c.id" />
        </ng-container>
      </app-record-detail-layout>

      <app-slide-over
        [open]="holdOpen()"
        [title]="'hse.consultation.hold.title' | transloco"
        [subtitle]="c.code + ' · ' + c.title"
        [closeLabel]="'hse.common.close' | transloco"
        [width]="520"
        (closed)="holdOpen.set(false)"
      >
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); hold()" novalidate>
          <app-form-field [label]="'hse.consultation.fields.held_at' | transloco" inputId="hold-at">
            <input
              id="hold-at"
              type="datetime-local"
              [value]="heldAt()"
              (input)="heldAt.set($any($event.target).value)"
            />
          </app-form-field>
          <div>
            <app-form-field
              [label]="'hse.consultation.fields.summary' | transloco"
              inputId="hold-summary"
            >
              <textarea
                id="hold-summary"
                rows="4"
                [value]="summary()"
                (input)="summary.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
            <app-field-help scope="hse" page="consultation-detail" field="summary" />
          </div>
          <div>
            <app-form-field
              [label]="'hse.consultation.fields.decisions' | transloco"
              inputId="hold-decisions"
            >
              <textarea
                id="hold-decisions"
                rows="4"
                [value]="decisions()"
                (input)="decisions.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
            <app-field-help scope="hse" page="consultation-detail" field="decisions" />
          </div>
          <app-form-field
            [label]="'hse.consultation.fields.participants' | transloco"
            inputId="hold-participants"
          >
            <textarea
              id="hold-participants"
              rows="3"
              [value]="participants()"
              (input)="participants.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <label class="flex items-center gap-2 text-[13.5px] text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="repPresent()"
              (change)="repPresent.set($any($event.target).checked)"
            />
            {{ 'hse.consultation.fields.worker_representative_present' | transloco }}
          </label>
          <div class="flex justify-end gap-2">
            <app-button variant="secondary" (click)="holdOpen.set(false)">{{
              'hse.common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="busy()" [disabled]="busy()">{{
              'hse.consultation.actions.hold' | transloco
            }}</app-button>
          </div>
        </form>
      </app-slide-over>

      <app-confirm-dialog
        [open]="cancelOpen()"
        [title]="'hse.consultation.cancelTitle' | transloco"
        [message]="'hse.consultation.cancelMessage' | transloco: { code: c.code }"
        [confirmLabel]="'hse.consultation.actions.cancel' | transloco"
        [cancelLabel]="'hse.common.keep' | transloco"
        [busy]="busy()"
        (confirmed)="cancel()"
        (cancelled)="cancelOpen.set(false)"
      />
      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'hse.consultation.deleteTitle' | transloco"
        [message]="'hse.consultation.deleteMessage' | transloco: { code: c.code }"
        [confirmLabel]="'hse.common.delete' | transloco"
        [cancelLabel]="'hse.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 py-10 text-center sm:px-8">
        <p class="text-[14px] text-fail" role="alert">{{ 'hse.common.notFound' | transloco }}</p>
        <a
          routerLink="/hse/consultations"
          class="mt-3 inline-block text-[13px] font-semibold text-accent"
          >{{ 'hse.consultation.list.back' | transloco }}</a
        >
      </div>
    } @else {
      <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
        {{ 'hse.common.loading' | transloco }}
      </p>
    }
  `,
})
export class ConsultationDetail {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly directory = inject(AssigneeOptionsService);

  protected readonly perms = injectHsePermissions();
  protected readonly tabs = TABS;
  protected readonly statusTone = consultationStatusTone;

  private readonly id = signal(inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '');
  protected readonly record = signal<Consultation | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly busy = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly deleteOpen = signal(false);

  protected readonly holdOpen = signal(false);
  protected readonly heldAt = signal('');
  protected readonly summary = signal('');
  protected readonly decisions = signal('');
  protected readonly participants = signal('');
  protected readonly repPresent = signal(false);

  protected readonly department = computed(() =>
    departmentName(this.directory, this.record()?.department_id ?? null),
  );

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'worker_consultation',
      entityId: this.id() || null,
      view: 'detail',
      title: this.record()?.title ?? null,
    }));
    this.directory.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() =>
          this.api.getConsultation(orgId, id).subscribe({
            next: (c) => {
              this.record.set(c);
              this.state.set('ready');
            },
            error: () => this.state.set('error'),
          }),
        );
      }
    });
  }

  protected openHold(c: Consultation): void {
    this.heldAt.set(nowLocalInput());
    this.summary.set(c.summary ?? '');
    this.decisions.set(c.decisions ?? '');
    this.participants.set(listToLines(c.participants));
    this.repPresent.set(c.worker_representative_present);
    this.holdOpen.set(true);
  }

  protected hold(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.record();
    if (!orgId || !c || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .holdConsultation(orgId, c.id, {
        held_at: localInputToWire(this.heldAt()),
        summary: textOrNull(this.summary()),
        decisions: textOrNull(this.decisions()),
        participants: linesToList(this.participants()),
        worker_representative_present: this.repPresent(),
      })
      .subscribe({
        next: (updated) =>
          this.done(updated, 'hse.consultation.done.held', () => this.holdOpen.set(false)),
        error: (error: unknown) => this.fail(error),
      });
  }

  protected cancel(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.record();
    if (!orgId || !c || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.cancelConsultation(orgId, c.id).subscribe({
      next: (updated) =>
        this.done(updated, 'hse.consultation.done.cancelled', () => this.cancelOpen.set(false)),
      error: (error: unknown) => this.fail(error),
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.record();
    if (!orgId || !c || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteConsultation(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('hse.common.deleted', { code: c.code });
        void this.router.navigate(['/hse/consultations']);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private done(updated: Consultation, key: string, close: () => void): void {
    this.busy.set(false);
    close();
    this.record.set(updated);
    this.notifications.success(key, { code: updated.code });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notifications.error(hseErrorKey(error));
  }
}
