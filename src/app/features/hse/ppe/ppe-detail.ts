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
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { todayDay } from '../../../shared/tasks/task-display';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import { InspectionResult, Ppe, PpeInspection } from '../data/hse.models';
import { dayToWire, ppeStatusTone, textOrNull } from '../hse-format';
import {
  HSE_MODULE,
  HseAskButton,
  HseDirectorySelect,
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

/**
 * `/hse/ppe/:id`: a PPE item — what it is, where it is, who holds it and when it
 * is due (the earlier of the next inspection and expiry); issue / return, the
 * inspection history and recording an inspection (a failed one takes the item out
 * of service), follow-up actions, related records, activity, comments, attachments
 * and clause evidence.
 */
@Component({
  selector: 'app-ppe-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
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
    HseDirectorySelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ppe(); as p) {
      <app-record-detail-layout
        entityType="ppe_item"
        [entityId]="p.id"
        [tabs]="tabs"
        [canEdit]="perms.write()"
        backLink="/hse/ppe"
        backLabelKey="hse.ppe.list.back"
      >
        <div header>
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-fg-subtle">{{ p.code }}</span>
            <app-badge [tone]="statusTone(p.status)">{{
              'hse.ppe.status.' + p.status | transloco
            }}</app-badge>
            @if (p.overdue) {
              <app-badge tone="fail">{{ 'hse.ppe.detail.overdue' | transloco }}</app-badge>
            }
          </div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ p.name }}
          </h1>
        </div>

        <ng-container actions>
          <app-watch-button entityType="ppe_item" [entityId]="p.id" />
          <app-hse-ask-button
            labelKey="hse.common.summarise"
            promptKey="hse.ppe.ai.summarisePrompt"
            [params]="{ code: p.code }"
          />
          @if (perms.write()) {
            @if (p.status === 'in_stock') {
              <app-button size="sm" (click)="openIssue()" data-testid="ppe-issue">{{
                'hse.ppe.actions.issue' | transloco
              }}</app-button>
            }
            @if (p.status === 'issued') {
              <app-button
                size="sm"
                variant="secondary"
                [disabled]="busy()"
                (click)="returnItem()"
                data-testid="ppe-return"
              >
                {{ 'hse.ppe.actions.return' | transloco }}
              </app-button>
            }
            @if (p.status !== 'retired') {
              <app-button
                size="sm"
                variant="secondary"
                (click)="openInspect()"
                data-testid="ppe-inspect"
              >
                {{ 'hse.ppe.actions.inspect' | transloco }}
              </app-button>
            }
            <a [routerLink]="['/hse/ppe', p.id, 'edit']" tabindex="-1">
              <app-button variant="secondary" size="sm">
                <app-icon name="sliders" [size]="14" />
                {{ 'hse.common.edit' | transloco }}
              </app-button>
            </a>
          }
          @if (perms.manage()) {
            <app-button variant="ghost" size="sm" (click)="deleteOpen.set(true)">
              <app-icon name="trash" [size]="14" />
              {{ 'hse.common.delete' | transloco }}
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="hse" page="ppe-detail" />
          <app-card>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.ppe.fields.category' | transloco }}
                </dt>
                <dd class="text-fg">{{ 'hse.ppeCategory.' + p.category | transloco }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.ppe.fields.standard_ref' | transloco }}
                </dt>
                <dd class="text-fg">{{ p.standard_ref || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.ppe.fields.manufacturer' | transloco }}
                </dt>
                <dd class="text-fg">{{ p.manufacturer || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.ppe.fields.serial_number' | transloco }}
                </dt>
                <dd class="text-fg">{{ p.serial_number || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.ppe.fields.quantity' | transloco }}
                </dt>
                <dd class="text-fg">{{ p.quantity }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.ppe.fields.location' | transloco }}
                </dt>
                <dd class="text-fg">{{ p.location || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.ppe.fields.responsible' | transloco }}
                </dt>
                <dd class="text-fg">{{ p.responsible?.name || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.common.department' | transloco }}
                </dt>
                <dd class="text-fg">{{ department() || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.ppe.detail.holder' | transloco }}
                </dt>
                <dd class="text-fg">
                  @if (p.holder?.name || p.holder_name; as holder) {
                    {{ holder }}
                    @if (p.issued_at) {
                      <span class="text-fg-muted"
                        >·
                        {{
                          'hse.ppe.detail.issuedOn' | transloco: { date: (p.issued_at | localDay) }
                        }}</span
                      >
                    }
                  } @else {
                    —
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.ppe.fields.description' | transloco }}
                </dt>
                <dd class="text-fg whitespace-pre-line">{{ p.description || '—' }}</dd>
              </div>
              @if (p.notes) {
                <div class="sm:col-span-2">
                  <dt class="text-[12px] font-semibold text-fg-subtle">
                    {{ 'hse.ppe.fields.notes' | transloco }}
                  </dt>
                  <dd class="text-fg whitespace-pre-line">{{ p.notes }}</dd>
                </div>
              }
            </dl>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[16px] font-bold text-fg">
                {{ 'hse.ppe.detail.inspections' | transloco }}
              </h2>
              @if (perms.write() && p.status !== 'retired') {
                <app-button size="sm" variant="secondary" (click)="openInspect()">
                  <app-icon name="plus" [size]="14" />
                  {{ 'hse.ppe.actions.inspect' | transloco }}
                </app-button>
              }
            </div>
            <dl class="mb-3 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
              <div>
                <dt class="text-fg-subtle">
                  {{ 'hse.ppe.fields.inspection_interval_days' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{
                    p.inspection_interval_days
                      ? ('hse.ppe.detail.everyDays'
                        | transloco: { days: p.inspection_interval_days })
                      : '—'
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-fg-subtle">
                  {{ 'hse.ppe.fields.next_inspection_at' | transloco }}
                </dt>
                <dd class="text-fg">{{ (p.next_inspection_at | localDay) || '—' }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'hse.ppe.fields.expires_at' | transloco }}</dt>
                <dd class="text-fg">{{ (p.expires_at | localDay) || '—' }}</dd>
              </div>
            </dl>
            @if (inspections().length) {
              <ul class="divide-y divide-border" data-testid="ppe-inspections">
                @for (i of inspections(); track i.id) {
                  <li class="flex flex-wrap items-start gap-3 py-2.5 text-[13px]">
                    <app-badge [tone]="i.result === 'pass' ? 'pass' : 'fail'">{{
                      'hse.ppe.inspection.result.' + i.result | transloco
                    }}</app-badge>
                    <span class="min-w-0 flex-1">
                      <span class="block text-fg"
                        >{{ i.inspected_at | localDate: 'mediumDate' }} ·
                        {{ i.inspected_by?.name || '—' }}</span
                      >
                      @if (i.notes) {
                        <span class="block whitespace-pre-line text-fg-muted">{{ i.notes }}</span>
                      }
                    </span>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-[13.5px] text-fg-muted">
                {{ 'hse.ppe.detail.noInspections' | transloco }}
              </p>
            }
          </app-card>
        </div>

        <app-entity-tasks
          tasks
          entityType="ppe_item"
          [entityId]="p.id"
          [canCreate]="perms.write()"
          [entityLabel]="p.code + ' ' + p.name"
        />

        <ng-container aside>
          <app-why-it-matters scope="hse" page="ppe-detail" />
          <app-supports-requirements entityType="ppe_item" [entityId]="p.id" />
        </ng-container>
      </app-record-detail-layout>

      <app-slide-over
        [open]="issueOpen()"
        [title]="'hse.ppe.issue.title' | transloco"
        [subtitle]="p.code + ' · ' + p.name"
        [closeLabel]="'hse.common.close' | transloco"
        (closed)="issueOpen.set(false)"
      >
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); issue()" novalidate>
          <div>
            <app-form-field [label]="'hse.ppe.issue.holderUser' | transloco" inputId="issue-user">
              <app-hse-directory-select
                inputId="issue-user"
                kind="user"
                [value]="issueUser()"
                (valueChange)="issueUser.set($event)"
              />
            </app-form-field>
            <app-field-help scope="hse" page="ppe-detail" field="holder" />
          </div>
          <app-form-field [label]="'hse.ppe.issue.holderName' | transloco" inputId="issue-name">
            <input
              id="issue-name"
              type="text"
              maxlength="200"
              [value]="issueName()"
              (input)="issueName.set($any($event.target).value)"
              [disabled]="!!issueUser()"
            />
          </app-form-field>
          <app-form-field [label]="'hse.ppe.issue.issuedAt' | transloco" inputId="issue-date">
            <input
              id="issue-date"
              type="date"
              [value]="issueDate()"
              (input)="issueDate.set($any($event.target).value)"
            />
          </app-form-field>
          @if (issueTried() && !issueUser() && !issueName().trim()) {
            <p class="text-[12.5px] text-fail" role="alert">
              {{ 'hse.errors.holder_required' | transloco }}
            </p>
          }
          <div class="flex justify-end gap-2">
            <app-button variant="secondary" (click)="issueOpen.set(false)">{{
              'hse.common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="busy()" [disabled]="busy()">{{
              'hse.ppe.actions.issue' | transloco
            }}</app-button>
          </div>
        </form>
      </app-slide-over>

      <app-slide-over
        [open]="inspectOpen()"
        [title]="'hse.ppe.inspection.title' | transloco"
        [subtitle]="p.code + ' · ' + p.name"
        [closeLabel]="'hse.common.close' | transloco"
        (closed)="inspectOpen.set(false)"
      >
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); inspect()" novalidate>
          <fieldset>
            <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
              {{ 'hse.ppe.inspection.resultLabel' | transloco }}
            </legend>
            <div class="flex gap-3">
              @for (r of results; track r) {
                <label class="inline-flex cursor-pointer items-center gap-2 text-[13.5px] text-fg">
                  <input
                    type="radio"
                    name="inspection-result"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="result() === r"
                    (change)="result.set(r)"
                  />
                  {{ 'hse.ppe.inspection.result.' + r | transloco }}
                </label>
              }
            </div>
            @if (result() === 'fail') {
              <p class="mt-2 text-[12.5px] text-warn" role="status">
                {{ 'hse.ppe.inspection.failNote' | transloco }}
              </p>
            }
          </fieldset>
          <app-form-field
            [label]="'hse.ppe.inspection.inspectedAt' | transloco"
            inputId="inspect-date"
          >
            <input
              id="inspect-date"
              type="date"
              [value]="inspectDate()"
              (input)="inspectDate.set($any($event.target).value)"
            />
          </app-form-field>
          <div>
            <app-form-field
              [label]="'hse.ppe.fields.next_inspection_at' | transloco"
              inputId="inspect-next"
            >
              <input
                id="inspect-next"
                type="date"
                [value]="inspectNext()"
                (input)="inspectNext.set($any($event.target).value)"
              />
            </app-form-field>
            <app-field-help scope="hse" page="ppe-detail" field="next_inspection_at" />
          </div>
          <app-form-field [label]="'hse.ppe.inspection.notes' | transloco" inputId="inspect-notes">
            <textarea
              id="inspect-notes"
              rows="4"
              [value]="inspectNotes()"
              (input)="inspectNotes.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <div class="flex justify-end gap-2">
            <app-button variant="secondary" (click)="inspectOpen.set(false)">{{
              'hse.common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="busy()" [disabled]="busy()">{{
              'hse.ppe.inspection.save' | transloco
            }}</app-button>
          </div>
        </form>
      </app-slide-over>

      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'hse.ppe.deleteTitle' | transloco"
        [message]="'hse.ppe.deleteMessage' | transloco: { code: p.code }"
        [confirmLabel]="'hse.common.delete' | transloco"
        [cancelLabel]="'hse.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 py-10 text-center sm:px-8">
        <p class="text-[14px] text-fail" role="alert">{{ 'hse.common.notFound' | transloco }}</p>
        <a routerLink="/hse/ppe" class="mt-3 inline-block text-[13px] font-semibold text-accent">{{
          'hse.ppe.list.back' | transloco
        }}</a>
      </div>
    } @else {
      <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
        {{ 'hse.common.loading' | transloco }}
      </p>
    }
  `,
})
export class PpeDetail {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly directory = inject(AssigneeOptionsService);

  protected readonly perms = injectHsePermissions();
  protected readonly tabs = TABS;
  protected readonly statusTone = ppeStatusTone;
  protected readonly results: readonly InspectionResult[] = ['pass', 'fail'];

  private readonly id = signal(inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '');
  protected readonly ppe = signal<Ppe | null>(null);
  protected readonly inspections = signal<readonly PpeInspection[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly busy = signal(false);
  protected readonly deleteOpen = signal(false);

  protected readonly issueOpen = signal(false);
  protected readonly issueUser = signal('');
  protected readonly issueName = signal('');
  protected readonly issueDate = signal('');
  protected readonly issueTried = signal(false);

  protected readonly inspectOpen = signal(false);
  protected readonly result = signal<InspectionResult>('pass');
  protected readonly inspectDate = signal('');
  protected readonly inspectNext = signal('');
  protected readonly inspectNotes = signal('');

  protected readonly department = computed(() =>
    departmentName(this.directory, this.ppe()?.department_id ?? null),
  );

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'ppe_item',
      entityId: this.id() || null,
      view: 'detail',
      title: this.ppe()?.name ?? null,
    }));
    this.directory.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() => this.load(orgId, id));
      }
    });
  }

  private load(orgId: string, id: string): void {
    this.api.getPpe(orgId, id).subscribe({
      next: (ppe) => {
        this.ppe.set(ppe);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
    this.loadInspections(orgId, id);
  }

  private loadInspections(orgId: string, id: string): void {
    this.api.listInspections(orgId, id).subscribe({
      next: (items) => this.inspections.set(items),
      error: () => this.inspections.set([]),
    });
  }

  protected openIssue(): void {
    this.issueUser.set('');
    this.issueName.set('');
    this.issueDate.set(todayDay());
    this.issueTried.set(false);
    this.issueOpen.set(true);
  }

  protected openInspect(): void {
    this.result.set('pass');
    this.inspectDate.set(todayDay());
    this.inspectNext.set('');
    this.inspectNotes.set('');
    this.inspectOpen.set(true);
  }

  protected issue(): void {
    this.issueTried.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.ppe();
    const user = this.issueUser();
    const name = this.issueName().trim();
    if (!orgId || !p || this.busy() || (!user && !name)) {
      return;
    }
    this.busy.set(true);
    this.api
      .issuePpe(orgId, p.id, {
        holder_user_id: user || null,
        holder_name: user ? null : name,
        issued_at: dayToWire(this.issueDate()),
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.issueOpen.set(false);
          this.ppe.set(updated);
          this.notifications.success('hse.ppe.done.issued', { code: updated.code });
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  protected returnItem(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.ppe();
    if (!orgId || !p || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.returnPpe(orgId, p.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.ppe.set(updated);
        this.notifications.success('hse.ppe.done.returned', { code: updated.code });
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected inspect(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.ppe();
    if (!orgId || !p || this.busy()) {
      return;
    }
    this.busy.set(true);
    const result = this.result();
    this.api
      .recordInspection(orgId, p.id, {
        result,
        notes: textOrNull(this.inspectNotes()),
        inspected_at: dayToWire(this.inspectDate()),
        next_inspection_at: dayToWire(this.inspectNext()),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.inspectOpen.set(false);
          this.notifications.success(
            result === 'pass' ? 'hse.ppe.done.inspected' : 'hse.ppe.done.inspectionFailed',
            { code: p.code },
          );
          // The item's status and due dates follow from the inspection.
          this.load(orgId, p.id);
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.ppe();
    if (!orgId || !p || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deletePpe(orgId, p.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('hse.common.deleted', { code: p.code });
        void this.router.navigate(['/hse/ppe']);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notifications.error(hseErrorKey(error));
  }
}
