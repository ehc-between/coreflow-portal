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
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { WatchButton } from '../../../shared/activity/watch-button';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { todayDay } from '../../../shared/tasks/task-display';
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
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import { InspectionResult, LinkedRef, Ppe, PpeInspection, TrainingCheck } from '../data/hse.models';
import { dayToWire, intervalText, ppeStatusValue, textOrNull } from '../hse-format';
import {
  HSE_CRUMBS,
  HSE_MODULE,
  HSE_NAV,
  HSE_ROOT_CRUMB,
  HseAskButton,
  HseDirectorySelect,
  HseField,
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

/** The header actions a PPE item offers now: one primary, Edit, the rest under "Mer". */
export type PpeAction = 'issue' | 'return' | 'inspect' | 'edit';

export function placePpeActions(
  p: Ppe,
  canWrite: boolean,
): {
  primary: PpeAction | null;
  secondary: readonly PpeAction[];
  overflow: readonly PpeAction[];
} {
  if (!canWrite) {
    return { primary: null, secondary: [], overflow: [] };
  }
  const canInspect = p.status !== 'retired';
  let primary: PpeAction | null = null;
  if (p.status === 'issued') {
    primary = 'return';
  } else if (p.status === 'in_stock' && p.issuable !== false && !p.overdue) {
    primary = 'issue';
  } else if (canInspect) {
    // Overdue or out of service: the next step is an inspection.
    primary = 'inspect';
  }
  const overflow: PpeAction[] = [];
  if (canInspect && primary !== 'inspect') {
    overflow.push('inspect');
  }
  if (p.status === 'in_stock' && primary !== 'issue') {
    overflow.push('issue');
  }
  return { primary: primary ?? 'edit', secondary: primary ? ['edit'] : [], overflow };
}

/** Which link of the item points to another module, as an entity chip. */
function chip(type: string, ref: LinkedRef) {
  return {
    entity_type: type,
    entity_id: ref.id,
    title: ref.title ?? ref.code ?? '',
    code: ref.code,
    url: ref.url,
  };
}

/**
 * `/hse/ppe/:id`: a PPE item. Follows the route id. Header: code, category,
 * status and a red badge when the inspection is overdue or it has expired; the
 * next step (issue, return, or inspect when it must not be used) as primary,
 * Edit, "Lag ny fra denne" (deviation, task) and the rest under "Mer". Body: what
 * it is (supplier and required course link to their modules), who holds it,
 * the inspection plan in plain words and the history; a failed inspection
 * offers "Opprett avvik". Issuing checks the holder's training and can split
 * part of a batch into its own record.
 */
@Component({
  selector: 'app-ppe-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    Button,
    Card,
    ConfirmDialog,
    EntityChip,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    SlideOver,
    StatusBadge,
    RecordDetailLayout,
    EntityTasks,
    SupportsRequirements,
    Term,
    WatchButton,
    WhyItMatters,
    HseAskButton,
    HseDirectorySelect,
    HseField,
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
            titleKey="hse.common.notFoundTitle"
            bodyKey="hse.common.notFound"
            (retry)="reload()"
          />
          <p class="mt-3 text-center">
            <a routerLink="/hse/ppe" class="text-ui font-semibold text-accent hover:underline">{{
              'hse.ppe.list.back' | transloco
            }}</a>
          </p>
        </div>
      }
      @case ('ready') {
        @if (ppe(); as p) {
          @let placed = actions();
          <app-record-detail-layout
            entityType="ppe_item"
            [entityId]="p.id"
            [title]="p.name"
            [breadcrumbs]="breadcrumbs()"
            [tabs]="tabs"
            [canEdit]="perms.write()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ p.code }}</span>
              <span aria-hidden="true">·</span>
              <app-term key="ppe" scope="hse">{{
                'hse.ppeCategory.' + p.category | transloco
              }}</app-term>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="statusValue(p.status)"
                [labelKey]="'hse.ppe.status.' + p.status"
              />
              @if (p.expired) {
                <app-status-badge
                  meaning="severity"
                  value="high"
                  labelKey="hse.ppe.badge.expired"
                />
              } @else if (p.inspection_overdue || p.overdue) {
                <app-status-badge
                  meaning="severity"
                  value="high"
                  labelKey="hse.ppe.badge.inspectionOverdue"
                />
              }
            </ng-container>

            @if (placed.primary; as action) {
              <app-button
                primary
                [variant]="action === 'edit' ? 'secondary' : 'primary'"
                [loading]="busy() && action === 'return'"
                [disabled]="busy()"
                (click)="run(action)"
                [attr.data-testid]="'ppe-' + action"
              >
                {{ 'hse.ppe.actions.' + action | transloco }}
              </app-button>
            }
            @for (action of placed.secondary; track action) {
              <app-button
                secondary
                variant="secondary"
                [disabled]="busy()"
                (click)="run(action)"
                [attr.data-testid]="'ppe-' + action"
              >
                {{ 'hse.ppe.actions.' + action | transloco }}
              </app-button>
            }
            @for (action of placed.overflow; track action) {
              <button
                appMenuItem
                overflow
                type="button"
                [disabled]="busy()"
                (click)="run(action)"
                [attr.data-testid]="'ppe-' + action"
              >
                {{ 'hse.ppe.actions.' + action | transloco }}
              </button>
            }
            @if (perms.manage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                [disabled]="busy()"
                (click)="deleteOpen.set(true)"
                data-testid="ppe-delete"
              >
                {{ 'hse.common.delete' | transloco }}
              </button>
            }

            <app-module-nav nav class="mb-4 block" [items]="nav" labelKey="modules.names.hse" />
            <app-help-strip
              help
              scope="hse"
              page="ppe-detail"
              lesson="ppe-last-line"
              [subject]="p.name"
            />

            <div class="flex flex-col gap-5">
              @if (p.expired || p.inspection_overdue || p.overdue) {
                <p
                  class="flex gap-2 rounded-tile border border-fail/30 bg-fail-soft px-4 py-3 text-ui text-fail"
                  role="status"
                  data-testid="ppe-do-not-use"
                >
                  <app-icon name="alert" [size]="15" class="mt-0.5 flex-none" />
                  <span>{{
                    (p.expired ? 'hse.ppe.detail.expiredNotice' : 'hse.ppe.detail.overdueNotice')
                      | transloco
                  }}</span>
                </p>
              }
              @if (lastFailed() && canDeviate()) {
                <div
                  class="flex flex-wrap items-center gap-3 rounded-tile border border-warn/40 bg-warn-soft px-4 py-3 text-ui text-warn-ink"
                  role="status"
                  data-testid="ppe-failed-callout"
                >
                  <span class="min-w-0 flex-1">{{
                    'hse.ppe.detail.failedCallout' | transloco
                  }}</span>
                  <app-button
                    size="sm"
                    variant="secondary"
                    [loading]="flowStarting()"
                    (click)="createDeviation()"
                  >
                    {{ 'hse.ppe.detail.createDeviation' | transloco }}
                  </app-button>
                </div>
              }

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'hse.ppe.detail.aboutTitle' | transloco }}
                </h2>
                <app-field-list>
                  <app-field-item
                    labelKey="hse.ppe.fields.category"
                    [value]="'hse.ppeCategory.' + p.category | transloco"
                  />
                  <app-field-item labelKey="hse.ppe.fields.standard_ref" [value]="p.standard_ref" />
                  <app-field-item labelKey="hse.ppe.fields.supplier">
                    @if (p.supplier; as s) {
                      <app-entity-chip [ref]="chipOf('supplier', s)" [showType]="false" />
                    } @else if (p.manufacturer) {
                      {{ p.manufacturer }}
                    }
                  </app-field-item>
                  @if (p.supplier && p.manufacturer) {
                    <app-field-item
                      labelKey="hse.ppe.fields.manufacturer"
                      [value]="p.manufacturer"
                    />
                  }
                  <app-field-item
                    labelKey="hse.ppe.fields.serial_number"
                    [value]="p.serial_number"
                  />
                  <app-field-item labelKey="hse.ppe.fields.quantity">
                    {{ p.quantity }}
                    @if (p.quantity > 1) {
                      <span class="block text-meta text-fg-muted">{{
                        'hse.ppe.detail.batchNote' | transloco
                      }}</span>
                    }
                    @if (p.batch_id) {
                      <a
                        [routerLink]="['/hse/ppe', p.batch_id]"
                        class="block text-meta font-semibold text-accent hover:underline"
                        >{{ 'hse.ppe.detail.fromBatch' | transloco }}</a
                      >
                    }
                  </app-field-item>
                  <app-field-item labelKey="hse.ppe.fields.location" [value]="p.location" />
                  <app-field-item
                    labelKey="hse.ppe.fields.responsible"
                    [value]="p.responsible?.name"
                  />
                  <app-field-item labelKey="hse.common.department" [value]="department()" />
                  <app-field-item labelKey="hse.ppe.detail.holder" empty="none">
                    @if (p.holder?.name || p.holder_name; as holder) {
                      {{ holder }}
                      @if (p.issued_at) {
                        <span class="block text-meta text-fg-muted">{{
                          'hse.ppe.detail.issuedOn' | transloco: { date: (p.issued_at | localDay) }
                        }}</span>
                      }
                    }
                  </app-field-item>
                  <app-field-item labelKey="hse.ppe.fields.required_course" empty="none">
                    @if (p.required_course; as c) {
                      <app-entity-chip [ref]="chipOf('course', c)" [showType]="false" />
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="hse.ppe.fields.description"
                    [value]="p.description"
                    [wide]="true"
                    [multiline]="true"
                  />
                  @if (p.notes) {
                    <app-field-item
                      labelKey="hse.ppe.fields.notes"
                      [value]="p.notes"
                      [wide]="true"
                      [multiline]="true"
                    />
                  }
                </app-field-list>
              </app-card>

              <app-card data-testid="ppe-inspection-card">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'hse.ppe.detail.inspections' | transloco }}
                  </h2>
                  @if (perms.write() && p.status !== 'retired') {
                    <app-button size="sm" variant="secondary" (click)="openInspect()">
                      <app-icon name="plus" [size]="14" />
                      {{ 'hse.ppe.actions.inspect' | transloco }}
                    </app-button>
                  }
                </div>
                <app-field-list [columns]="3">
                  <app-field-item labelKey="hse.ppe.fields.inspection_interval">
                    @if (interval(); as iv) {
                      {{ iv.key | transloco: iv.params }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="hse.ppe.fields.next_inspection_at">
                    @if (p.next_inspection_at) {
                      <span [class]="p.inspection_overdue ? 'font-semibold text-fail' : ''">
                        {{ p.next_inspection_at | localDay }}
                      </span>
                    }
                  </app-field-item>
                  <app-field-item labelKey="hse.ppe.fields.expires_at">
                    @if (p.expires_at) {
                      <span [class]="p.expired ? 'font-semibold text-fail' : ''">
                        {{ p.expires_at | localDay }}
                      </span>
                    }
                  </app-field-item>
                </app-field-list>
                @if (inspections().length) {
                  <ul class="mt-4 divide-y divide-border" data-testid="ppe-inspections">
                    @for (i of inspections(); track i.id) {
                      <li class="flex flex-wrap items-start gap-3 py-2.5 text-ui">
                        <app-status-badge
                          meaning="lifecycle"
                          [value]="i.result === 'pass' ? 'passed' : 'failed'"
                          [labelKey]="'hse.ppe.inspection.result.' + i.result"
                        />
                        <span class="min-w-0 flex-1">
                          <span class="block text-fg">
                            {{
                              'hse.ppe.detail.inspectedBy'
                                | transloco
                                  : {
                                      date: (i.inspected_at | localDay),
                                      name:
                                        i.inspected_by?.name || ('hse.common.unknown' | transloco),
                                    }
                            }}
                          </span>
                          @if (i.notes) {
                            <span class="block whitespace-pre-line text-fg-muted">{{
                              i.notes
                            }}</span>
                          }
                        </span>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="mt-3 text-ui text-fg-muted">
                    {{ 'hse.ppe.detail.noInspections' | transloco }}
                  </p>
                }
              </app-card>

              <div
                class="flex flex-wrap gap-2"
                role="group"
                [attr.aria-label]="'hse.common.askGroup' | transloco"
              >
                <app-hse-ask-button
                  labelKey="hse.common.summarise"
                  promptKey="hse.ppe.ai.summarisePrompt"
                  [params]="{ code: p.code }"
                  [requirements]="confirmedRefs()"
                />
              </div>
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="ppe_item"
                [entityId]="p.id"
                [canCreate]="perms.write()"
                [entityLabel]="p.code + ' ' + p.name"
              />
            </div>

            <app-supports-requirements
              aside-requirements
              entityType="ppe_item"
              [entityId]="p.id"
              [canEdit]="perms.write()"
              [frameworks]="frameworks"
              (linksChange)="onLinks($event)"
            />

            <div aside>
              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'hse.common.summaryTitle' | transloco }}
                  </h2>
                  <app-watch-button entityType="ppe_item" [entityId]="p.id" />
                </div>
                <app-field-list [columns]="1">
                  <app-field-item labelKey="hse.ppe.fields.last_inspected_at">
                    @if (p.last_inspected_at) {
                      {{ p.last_inspected_at | localDay }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="hse.common.createdBy">
                    {{
                      'hse.common.byOn'
                        | transloco
                          : {
                              name: p.created_by?.name || ('hse.common.unknown' | transloco),
                              date: (p.created_at | localDay),
                            }
                    }}
                  </app-field-item>
                  <app-field-item
                    labelKey="hse.common.updated"
                    [value]="p.updated_at | localDate"
                  />
                </app-field-list>
              </app-card>
            </div>

            <div aside-learn>
              <app-why-it-matters scope="hse" page="ppe-detail" />
            </div>
          </app-record-detail-layout>

          <app-slide-over
            [open]="issueOpen()"
            [title]="'hse.ppe.issue.title' | transloco"
            [subtitle]="p.code + ' · ' + p.name"
            [closeLabel]="'hse.common.close' | transloco"
            (closed)="issueOpen.set(false)"
          >
            <form
              class="flex flex-col gap-4"
              (submit)="$event.preventDefault(); issue()"
              novalidate
            >
              <app-hse-field
                labelKey="hse.ppe.issue.holderUser"
                inputId="issue-user"
                page="ppe-detail"
                help="holder"
              >
                <app-hse-directory-select
                  inputId="issue-user"
                  kind="user"
                  [value]="issueUser()"
                  (valueChange)="pickHolder($event)"
                />
              </app-hse-field>
              @if (!issueUser()) {
                <app-hse-field labelKey="hse.ppe.issue.holderName" inputId="issue-name">
                  <input
                    id="issue-name"
                    type="text"
                    maxlength="200"
                    [value]="issueName()"
                    (input)="issueName.set($any($event.target).value)"
                  />
                </app-hse-field>
              }
              @if (training(); as tc) {
                <p
                  class="rounded-tile border px-3 py-2 text-meta"
                  [class]="
                    tc.status === 'valid'
                      ? 'border-pass/30 bg-pass-soft text-pass'
                      : 'border-warn/40 bg-warn-soft text-warn-ink'
                  "
                  role="status"
                  data-testid="ppe-training-check"
                >
                  {{
                    'hse.ppe.issue.training.' + tc.status
                      | transloco
                        : {
                            course: tc.course?.title || tc.course?.code || '',
                            date: (tc.expires_at | localDay),
                          }
                  }}
                </p>
              }
              @if (p.quantity > 1) {
                <app-hse-field
                  labelKey="hse.ppe.issue.quantity"
                  inputId="issue-qty"
                  hintKey="hse.ppe.issue.quantityHint"
                  [errorKey]="quantityInvalid() ? 'hse.errors.invalid_quantity' : null"
                >
                  <input
                    id="issue-qty"
                    type="number"
                    min="1"
                    [max]="p.quantity"
                    step="1"
                    [value]="issueQty()"
                    (input)="issueQty.set($any($event.target).value)"
                    [attr.aria-invalid]="quantityInvalid()"
                    aria-describedby="issue-qty-hint"
                  />
                </app-hse-field>
              }
              <app-hse-field labelKey="hse.ppe.issue.issuedAt" inputId="issue-date">
                <input
                  id="issue-date"
                  type="date"
                  [value]="issueDate()"
                  (input)="issueDate.set($any($event.target).value)"
                />
              </app-hse-field>
              @if (issueTried() && !issueUser() && !issueName().trim()) {
                <p class="text-meta font-semibold text-fail" role="alert">
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
            <form
              class="flex flex-col gap-4"
              (submit)="$event.preventDefault(); inspect()"
              novalidate
            >
              <fieldset>
                <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
                  {{ 'hse.ppe.inspection.resultLabel' | transloco }}
                </legend>
                <div class="flex gap-4">
                  @for (r of results; track r) {
                    <label
                      class="inline-flex min-h-8 cursor-pointer items-center gap-2 text-body text-fg"
                    >
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
                  <p class="mt-2 text-meta text-warn-ink" role="status">
                    {{ 'hse.ppe.inspection.failNote' | transloco }}
                  </p>
                }
              </fieldset>
              <app-hse-field labelKey="hse.ppe.inspection.inspectedAt" inputId="inspect-date">
                <input
                  id="inspect-date"
                  type="date"
                  [value]="inspectDate()"
                  (input)="inspectDate.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field
                labelKey="hse.ppe.fields.next_inspection_at"
                inputId="inspect-next"
                page="ppe-detail"
                help="next_inspection_at"
                hintKey="hse.ppe.inspection.nextHint"
              >
                <input
                  id="inspect-next"
                  type="date"
                  [value]="inspectNext()"
                  (input)="inspectNext.set($any($event.target).value)"
                  aria-describedby="inspect-next-hint"
                />
              </app-hse-field>
              <app-hse-field labelKey="hse.ppe.inspection.notes" inputId="inspect-notes">
                <textarea
                  id="inspect-notes"
                  rows="4"
                  [value]="inspectNotes()"
                  (input)="inspectNotes.set($any($event.target).value)"
                ></textarea>
              </app-hse-field>
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
        }
      }
    }
  `,
})
export class PpeDetail {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly directory = inject(AssigneeOptionsService);
  private readonly flows = inject(CreateFlowService);

  /** Route param (component input binding): follows navigation between items. */
  readonly id = input.required<string>();

  protected readonly perms = injectHsePermissions();
  protected readonly canDeviate = this.perms.has('deviations:write');
  protected readonly nav = HSE_NAV;
  protected readonly tabs = TABS;
  protected readonly frameworks: readonly string[] = ['iso45001'];
  protected readonly results: readonly InspectionResult[] = ['pass', 'fail'];
  protected readonly statusValue = ppeStatusValue;
  protected readonly chipOf = chip;

  protected readonly ppe = signal<Ppe | null>(null);
  protected readonly inspections = signal<readonly PpeInspection[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly busy = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly confirmedRefs = signal<readonly string[]>([]);

  protected readonly issueOpen = signal(false);
  protected readonly issueUser = signal('');
  protected readonly issueName = signal('');
  protected readonly issueDate = signal('');
  protected readonly issueQty = signal('');
  protected readonly issueTried = signal(false);
  protected readonly training = signal<TrainingCheck | null>(null);

  protected readonly inspectOpen = signal(false);
  protected readonly result = signal<InspectionResult>('pass');
  protected readonly inspectDate = signal('');
  protected readonly inspectNext = signal('');
  protected readonly inspectNotes = signal('');

  protected readonly flowStarting = computed(
    () => this.flows.starting() === 'ppe_item.to_deviation',
  );
  protected readonly breadcrumbs = computed(() => [
    HSE_ROOT_CRUMB,
    HSE_CRUMBS.ppe,
    { label: this.ppe()?.code ?? '' },
  ]);
  protected readonly actions = computed(() => {
    const p = this.ppe();
    return p
      ? placePpeActions(p, this.perms.write())
      : { primary: null, secondary: [], overflow: [] };
  });
  protected readonly interval = computed(() => intervalText(this.ppe()?.inspection_interval_days));
  protected readonly department = computed(() =>
    departmentName(this.directory, this.ppe()?.department_id ?? null),
  );
  /** The newest inspection failed: offer to raise a deviation from the item. */
  protected readonly lastFailed = computed(() => this.inspections()[0]?.result === 'fail');
  protected readonly quantityInvalid = computed(() => {
    const raw = this.issueQty().toString().trim();
    if (!raw) {
      return false;
    }
    const n = Number(raw);
    return !Number.isInteger(n) || n < 1 || n > (this.ppe()?.quantity ?? 1);
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'ppe_item',
      entityId: this.id(),
      view: 'detail',
      title: this.ppe()?.name ?? null,
      requirements: this.confirmedRefs().length ? this.confirmedRefs() : null,
    }));
    this.directory.ensureLoaded();

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    if (this.ppe()?.id !== id) {
      this.ppe.set(null);
      this.inspections.set([]);
      this.confirmedRefs.set([]);
      this.state.set('loading');
    }
    this.request = this.api.getPpe(orgId, id).subscribe({
      next: (ppe) => {
        this.ppe.set(ppe);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
    this.request.add(
      this.api.listInspections(orgId, id).subscribe({
        next: (items) => this.inspections.set(items),
        error: () => this.inspections.set([]),
      }),
    );
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.confirmedRefs.set(
      links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
    );
  }

  protected run(action: 'issue' | 'return' | 'inspect' | 'edit'): void {
    const p = this.ppe();
    if (!p) {
      return;
    }
    switch (action) {
      case 'issue':
        this.openIssue();
        return;
      case 'return':
        this.returnItem();
        return;
      case 'inspect':
        this.openInspect();
        return;
      case 'edit':
        void this.router.navigate(['/hse/ppe', p.id, 'edit']);
    }
  }

  protected openIssue(): void {
    const p = this.ppe();
    if (p && (p.expired || p.inspection_overdue)) {
      // The backend refuses (409); explain instead of opening a form that cannot be saved.
      this.notifications.warning(
        p.expired ? 'hse.errors.ppe_expired' : 'hse.errors.ppe_inspection_overdue',
      );
      return;
    }
    this.issueUser.set('');
    this.issueName.set('');
    this.issueQty.set('');
    this.issueDate.set(todayDay());
    this.issueTried.set(false);
    this.training.set(null);
    this.issueOpen.set(true);
  }

  /** A member was picked: check their training for the course the item requires. */
  protected pickHolder(userId: string): void {
    this.issueUser.set(userId);
    this.training.set(null);
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.ppe();
    if (!orgId || !p || !userId || !p.required_course_id) {
      return;
    }
    this.api.trainingCheck(orgId, p.id, userId).subscribe({
      next: (check) => this.training.set(check.status === 'not_required' ? null : check),
      error: () => this.training.set(null),
    });
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
    if (!orgId || !p || this.busy() || (!user && !name) || this.quantityInvalid()) {
      return;
    }
    const qtyRaw = this.issueQty().toString().trim();
    const quantity = qtyRaw ? Number(qtyRaw) : undefined;
    this.busy.set(true);
    this.api
      .issuePpe(orgId, p.id, {
        holder_user_id: user || null,
        holder_name: user ? null : name,
        issued_at: dayToWire(this.issueDate()),
        quantity: quantity && quantity < p.quantity ? quantity : undefined,
      })
      .subscribe({
        next: (issued) => {
          this.busy.set(false);
          this.issueOpen.set(false);
          if (issued.id !== p.id) {
            // Part of a batch was split off into its own record: open it.
            this.notifications.success('hse.ppe.done.issuedPart', {
              count: issued.quantity,
              code: issued.code,
            });
            void this.router.navigate(['/hse/ppe', issued.id]);
            return;
          }
          this.ppe.set(issued);
          this.notifications.success('hse.ppe.done.issued', { code: issued.code });
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
          this.reload();
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  /** "Opprett avvik" after a failed inspection: the deviation is linked back to the item. */
  protected createDeviation(): void {
    const p = this.ppe();
    if (p) {
      void this.flows.start('ppe_item.to_deviation', 'ppe_item', p.id);
    }
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
      error: (error: unknown) => {
        this.deleteOpen.set(false);
        this.fail(error);
      },
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notifications.error(hseErrorKey(error));
  }
}
