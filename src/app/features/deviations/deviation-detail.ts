import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import {
  AccessGrant,
  Action,
  DeviationAccess,
  DeviationDetail as DeviationDetailModel,
  DeviationEvent,
  DeviationStatus,
  DeviationType,
  DeviationVisibility,
  FieldDef,
  Severity,
  Source,
  UpdateDeviationRequest,
} from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Attachments } from '../../shared/attachments/attachments';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { Icon } from '../../shared/ui/icon/icon';
import { DeviationAccessEditor } from './access/deviation-access-editor';
import { DeviationActions } from './actions/deviation-actions';
import {
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  isOverdue,
  severityLabelKey,
  severityTone,
  sourceLabelKey,
  standardLabelKey,
  statusLabelKey,
  statusTone,
} from './deviation-enums';
import { DynamicField, DynamicFieldOption } from './dynamic-field';
import { groupFieldsIntoSections } from './types/type-schema';

/**
 * Deviation detail, scoped to the currently selected org. A header band (code,
 * title, type, status / severity badges, standards + clauses, owner, raised /
 * due / closed dates) over the body — core fields plus the type's dynamic `data`
 * rendered read-only, switchable into an inline editor (reusing
 * {@link DynamicField}). Alongside: the CAPA actions panel, the audit-trail
 * timeline and the access / sharing panel. Status changes and delete are inline.
 * 404 / no-access shows a not-found card; navigates back to the list on org switch.
 */
@Component({
  selector: 'app-deviation-detail',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Card,
    Badge,
    Button,
    Icon,
    DynamicField,
    DeviationActions,
    DeviationAccessEditor,
    Attachments,
    SupportsRequirements,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-8 pt-7 pb-12">
      <a
        routerLink="/deviations"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.backToList' | transloco }}
      </a>

      @if (loading()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      } @else if (deviation(); as dev) {
        <div class="mb-[18px] flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="mb-1 flex flex-wrap items-center gap-2">
              <span class="font-mono text-[12.5px] text-fg-subtle">{{ dev.code }}</span>
              @if (dev.type_name) {
                <app-badge tone="neutral">{{ dev.type_name }}</app-badge>
              }
              <app-badge [tone]="statusTone(dev.status)">{{
                statusLabelKey(dev.status) | transloco
              }}</app-badge>
              <app-badge [tone]="severityTone(dev.severity)">{{
                severityLabelKey(dev.severity) | transloco
              }}</app-badge>
            </div>
            <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
              {{ dev.title }}
            </h1>
          </div>

          <div class="flex flex-none items-center gap-2">
            @if (!editing()) {
              <div *appHasPermission="'deviations:write'" class="relative">
                <app-button variant="secondary" (click)="toggleStatusMenu($event)">
                  <app-icon name="flag" [size]="15" />
                  {{ 'deviations.detail.changeStatus' | transloco }}
                  <app-icon name="chevron" [size]="14" />
                </app-button>
                @if (statusMenuOpen()) {
                  <div
                    class="animate-cf-pop absolute right-0 z-30 mt-1.5 w-52 rounded-tile border border-border bg-surface p-1 shadow-pop"
                  >
                    @for (option of statusOptions; track option) {
                      <button
                        type="button"
                        [disabled]="savingStatus() || option === dev.status"
                        (click)="changeStatus(option)"
                        class="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] text-fg hover:bg-surface-2 disabled:opacity-50"
                      >
                        @if (option === dev.status) {
                          <app-icon name="check" [size]="15" class="text-accent" />
                        } @else {
                          <span class="w-[15px]"></span>
                        }
                        {{ statusLabelKey(option) | transloco }}
                      </button>
                    }
                  </div>
                }
              </div>

              <app-button
                *appHasPermission="'deviations:write'"
                variant="secondary"
                (click)="startEdit(dev)"
              >
                <app-icon name="procedures" [size]="15" />
                {{ 'deviations.detail.edit' | transloco }}
              </app-button>

              <app-button
                *appHasPermission="'deviations:manage'"
                variant="secondary"
                [loading]="deleting()"
                (click)="remove()"
              >
                <app-icon name="x" [size]="15" />
                {{ 'deviations.detail.delete' | transloco }}
              </app-button>
            } @else {
              <app-button variant="ghost" (click)="cancelEdit()">
                {{ 'deviations.detail.cancel' | transloco }}
              </app-button>
              <app-button [loading]="savingEdit()" (click)="saveEdit()">
                <app-icon name="check" [size]="15" />
                {{ 'deviations.detail.save' | transloco }}
              </app-button>
            }
          </div>
        </div>

        <div class="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div class="flex flex-col gap-5">
            <app-card>
              <div class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <div>
                  <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                    {{ 'deviations.detail.meta.raised' | transloco }}
                  </div>
                  <div class="mt-0.5 text-[13px] text-fg">
                    {{ dev.raised_at | date: 'mediumDate' }}
                  </div>
                </div>
                <div>
                  <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                    {{ 'deviations.detail.meta.due' | transloco }}
                  </div>
                  <div class="mt-0.5 text-[13px]">
                    @if (dev.due_at) {
                      <span
                        [class.text-fail]="overdue(dev)"
                        [class.font-semibold]="overdue(dev)"
                        [class.text-fg]="!overdue(dev)"
                      >
                        {{ dev.due_at | date: 'mediumDate' }}
                      </span>
                    } @else {
                      <span class="text-fg-subtle">—</span>
                    }
                  </div>
                </div>
                <div>
                  <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                    {{ 'deviations.detail.meta.closed' | transloco }}
                  </div>
                  <div class="mt-0.5 text-[13px] text-fg">
                    {{ dev.closed_at ? (dev.closed_at | date: 'mediumDate') : '—' }}
                  </div>
                </div>
                <div>
                  <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                    {{ 'deviations.detail.meta.source' | transloco }}
                  </div>
                  <div class="mt-0.5 text-[13px] text-fg">
                    {{ sourceLabelKey(dev.source) | transloco }}
                  </div>
                </div>
              </div>

              @if (dev.standards.length || dev.clauses.length || dev.tags.length) {
                <div class="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
                  @if (dev.standards.length) {
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="text-[12px] font-semibold text-fg-subtle">{{
                        'deviations.create.fields.standards' | transloco
                      }}</span>
                      @for (std of dev.standards; track std) {
                        <app-badge tone="neutral">{{
                          standardLabelKey(std) | transloco
                        }}</app-badge>
                      }
                    </div>
                  }
                  @if (dev.clauses.length) {
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="text-[12px] font-semibold text-fg-subtle">{{
                        'deviations.create.fields.clauses' | transloco
                      }}</span>
                      @for (c of dev.clauses; track c.standard + c.clause) {
                        <app-badge tone="neutral"
                          >{{ standardLabelKey(c.standard) | transloco }} {{ c.clause }}</app-badge
                        >
                      }
                    </div>
                  }
                  @if (dev.tags.length) {
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="text-[12px] font-semibold text-fg-subtle">{{
                        'deviations.create.fields.tags' | transloco
                      }}</span>
                      @for (t of dev.tags; track t) {
                        <span
                          class="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[12px] font-medium text-fg"
                          >{{ t }}</span
                        >
                      }
                    </div>
                  }
                </div>
              }
            </app-card>

            <!-- Core fields + dynamic data -->
            <app-card>
              @if (!editing()) {
                <dl class="flex flex-col gap-4">
                  <div>
                    <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                      {{ 'deviations.create.fields.description' | transloco }}
                    </dt>
                    <dd class="mt-1 text-[13.5px] whitespace-pre-line text-fg">
                      {{ dev.description || ('deviations.detail.notProvided' | transloco) }}
                    </dd>
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                        {{ 'deviations.create.fields.rootCause' | transloco }}
                      </dt>
                      <dd class="mt-1 text-[13.5px] whitespace-pre-line text-fg">
                        {{ dev.root_cause || ('deviations.detail.notProvided' | transloco) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                        {{ 'deviations.create.fields.rootCauseMethod' | transloco }}
                      </dt>
                      <dd class="mt-1 text-[13.5px] text-fg">
                        {{ dev.root_cause_method || ('deviations.detail.notProvided' | transloco) }}
                      </dd>
                    </div>
                  </div>

                  @for (section of schemaSections(); track section.title) {
                    <div class="flex flex-col gap-3">
                      @if (!section.isDefault) {
                        <p class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                          {{ section.title }}
                        </p>
                      }
                      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        @for (def of section.fields; track def.key) {
                          <div [class.sm:col-span-2]="def.width === 'full'">
                            <dt
                              class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
                            >
                              {{ def.label }}
                            </dt>
                            <dd class="mt-1 text-[13.5px] whitespace-pre-line text-fg">
                              {{ displayValue(def) }}
                            </dd>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </dl>
              } @else {
                <div class="flex flex-col gap-4">
                  <div class="flex flex-col gap-1.5">
                    <label for="edit-title" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.title' | transloco }}
                      <span class="text-fail" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="edit-title"
                      type="text"
                      [ngModel]="title()"
                      (ngModelChange)="title.set($event)"
                      autocomplete="off"
                      class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                    />
                    @if (titleError()) {
                      <p class="text-[12px] font-medium text-fail">
                        {{ 'deviations.create.titleRequired' | transloco }}
                      </p>
                    }
                  </div>

                  <div class="flex flex-col gap-1.5">
                    <label for="edit-desc" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.create.fields.description' | transloco }}
                    </label>
                    <textarea
                      id="edit-desc"
                      [ngModel]="description()"
                      (ngModelChange)="description.set($event)"
                      rows="3"
                      class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                    ></textarea>
                  </div>

                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="flex flex-col gap-1.5">
                      <label for="edit-severity" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.create.fields.severity' | transloco }}
                      </label>
                      <div class="cf-select">
                        <select
                          id="edit-severity"
                          [ngModel]="severity()"
                          (ngModelChange)="severity.set($event)"
                        >
                          @for (option of severityOptions; track option) {
                            <option [value]="option">
                              {{ severityLabelKey(option) | transloco }}
                            </option>
                          }
                        </select>
                      </div>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label for="edit-source" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.create.fields.source' | transloco }}
                      </label>
                      <div class="cf-select">
                        <select
                          id="edit-source"
                          [ngModel]="source()"
                          (ngModelChange)="source.set($event)"
                        >
                          @for (option of sourceOptions; track option) {
                            <option [value]="option">
                              {{ sourceLabelKey(option) | transloco }}
                            </option>
                          }
                        </select>
                      </div>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label for="edit-due" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.create.fields.due' | transloco }}
                      </label>
                      <input
                        id="edit-due"
                        type="date"
                        [ngModel]="dueAt()"
                        (ngModelChange)="dueAt.set($event)"
                        class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                      />
                    </div>
                  </div>

                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="flex flex-col gap-1.5">
                      <label for="edit-rc" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.create.fields.rootCause' | transloco }}
                      </label>
                      <textarea
                        id="edit-rc"
                        [ngModel]="rootCause()"
                        (ngModelChange)="rootCause.set($event)"
                        rows="2"
                        class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                      ></textarea>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label for="edit-rcm" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.create.fields.rootCauseMethod' | transloco }}
                      </label>
                      <input
                        id="edit-rcm"
                        type="text"
                        [ngModel]="rootCauseMethod()"
                        (ngModelChange)="rootCauseMethod.set($event)"
                        autocomplete="off"
                        class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                      />
                    </div>
                  </div>

                  @if (schemaSections().length) {
                    <div class="flex flex-col gap-6 border-t border-border pt-4">
                      @for (section of schemaSections(); track section.title) {
                        <div class="flex flex-col gap-4">
                          @if (!section.isDefault) {
                            <p class="text-[13px] font-semibold text-fg-muted">
                              {{ section.title }}
                            </p>
                          }
                          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            @for (def of section.fields; track def.key) {
                              <div [class.sm:col-span-2]="def.width === 'full'">
                                <app-dynamic-field
                                  [field]="def"
                                  [value]="data()[def.key]"
                                  [options]="optionsFor(def.type)"
                                  [error]="dataErrors()[def.key] ?? null"
                                  (valueChange)="setData(def.key, $event)"
                                />
                              </div>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </app-card>

            <app-card>
              <app-deviation-actions
                [deviationId]="dev.id"
                [actions]="actions()"
                [owners]="owners()"
                [canEdit]="canWrite()"
                (actionsChange)="actions.set($event)"
                (changed)="reloadEvents()"
              />
            </app-card>

            <app-card>
              <app-attachments entityType="deviation" [entityId]="dev.id" [canEdit]="canWrite()" />
            </app-card>
          </div>

          <div class="flex flex-col gap-5">
            <app-card [padded]="false">
              <h2
                class="px-4 pt-3.5 pb-1 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'deviations.detail.owner' | transloco }}
              </h2>
              <p class="px-4 pb-3.5 text-[13.5px] text-fg">
                {{ dev.owner_name || ('deviations.access.unassigned' | transloco) }}
              </p>
            </app-card>

            <app-card *appHasPermission="'standards:read'">
              <app-supports-requirements entityType="deviation" [entityId]="dev.id" />
            </app-card>

            <app-card [padded]="false">
              <h2
                class="px-4 pt-3.5 pb-2 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'deviations.detail.auditTrail' | transloco }}
              </h2>
              @if (events().length === 0) {
                <p class="px-4 pb-4 text-[13.5px] text-fg-muted">
                  {{ 'deviations.detail.noEvents' | transloco }}
                </p>
              } @else {
                <ul class="px-4 pb-4">
                  @for (event of events(); track event.id) {
                    <li class="flex gap-2.5 pb-3 last:pb-0">
                      <span class="mt-0.5 flex flex-none text-fg-subtle">
                        <app-icon [name]="eventIcon(event.kind)" [size]="15" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-[13px] font-medium text-fg">{{
                          event.summary
                        }}</span>
                        @if (event.detail) {
                          <span class="block text-[12.5px] text-fg-muted">{{ event.detail }}</span>
                        }
                        <span class="block text-[12px] text-fg-subtle">
                          {{ event.actor_name ? event.actor_name + ' · ' : ''
                          }}{{ event.created_at | date: 'medium' }}
                        </span>
                      </span>
                    </li>
                  }
                </ul>
              }
            </app-card>

            @if (access(); as acc) {
              <app-card *appHasPermission="'deviations:manage'" [padded]="false">
                <h2
                  class="px-4 pt-3.5 pb-3 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
                >
                  {{ 'deviations.access.sharingTitle' | transloco }}
                </h2>
                <div class="px-4 pb-4">
                  <app-deviation-access-editor
                    [deviationId]="dev.id"
                    [canManage]="true"
                    [owner]="acc.owner_user_id ?? ''"
                    [ownerName]="acc.owner_name ?? ''"
                    [visibility]="acc.visibility"
                    [grants]="grants()"
                    (ownerChange)="onOwnerChange($event)"
                    (visibilityChange)="onVisibilityChange($event)"
                    (grantsChange)="grants.set($event)"
                  />
                </div>
              </app-card>
            }
          </div>
        </div>
      } @else {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'deviations.detail.notFound' | transloco }}
          </div>
        </app-card>
      }
    </div>
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
  host: { '(document:click)': 'closeStatusMenu()' },
})
export class DeviationDetail {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly sourceOptions = SOURCE_OPTIONS;
  protected readonly statusTone = statusTone;
  protected readonly severityTone = severityTone;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly severityLabelKey = severityLabelKey;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly standardLabelKey = standardLabelKey;

  protected readonly deviation = signal<DeviationDetailModel | null>(null);
  protected readonly type = signal<DeviationType | null>(null);
  protected readonly actions = signal<readonly Action[]>([]);
  protected readonly events = signal<readonly DeviationEvent[]>([]);
  protected readonly loading = signal(true);

  protected readonly access = signal<DeviationAccess | null>(null);
  protected readonly grants = signal<readonly AccessGrant[]>([]);

  protected readonly owners = signal<readonly DynamicFieldOption[]>([]);
  protected readonly departments = signal<readonly DynamicFieldOption[]>([]);

  protected readonly statusMenuOpen = signal(false);
  protected readonly savingStatus = signal(false);
  protected readonly deleting = signal(false);

  // Edit mode state
  protected readonly editing = signal(false);
  protected readonly savingEdit = signal(false);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly severity = signal<Severity>('medium');
  protected readonly source = signal<Source>('internal');
  protected readonly dueAt = signal('');
  protected readonly rootCause = signal('');
  protected readonly rootCauseMethod = signal('');
  protected readonly data = signal<Record<string, unknown>>({});
  protected readonly dataErrors = signal<Record<string, string>>({});
  protected readonly titleError = signal(false);

  /** The type's dynamic field schema, for read-only and edit rendering. */
  protected readonly schema = computed<readonly FieldDef[]>(() => this.type()?.schema ?? []);

  /** The schema grouped into render sections for the 2-col grid (read + edit). */
  protected readonly schemaSections = computed(() =>
    groupFieldsIntoSections(
      this.schema(),
      this.transloco.translate('deviations.create.detailsSection'),
    ),
  );

  /** Whether the current user can edit (drives the actions panel controls too). */
  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('deviations:write'),
  );

  private currentOrgId: string | null = null;

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      const id = this.id();
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigateByUrl('/deviations');
        return;
      }
      this.currentOrgId = orgId;
      if (orgId) {
        this.load(orgId, id);
        this.loadSubjects(orgId);
      }
    });
  }

  protected overdue(dev: DeviationDetailModel): boolean {
    return isOverdue(dev.due_at, dev.status);
  }

  protected optionsFor(type: string): readonly DynamicFieldOption[] {
    if (type === 'user') {
      return this.owners();
    }
    if (type === 'department') {
      return this.departments();
    }
    return [];
  }

  /** Human-readable display for a dynamic field's stored value. */
  protected displayValue(def: FieldDef): string {
    const value = this.data()[def.key];
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    if (typeof value === 'boolean') {
      return value ? '✓' : '—';
    }
    if (Array.isArray(value)) {
      return value.length ? value.map((v) => String(v)).join(', ') : '—';
    }
    if (def.type === 'user') {
      return this.owners().find((o) => o.id === value)?.name ?? String(value);
    }
    if (def.type === 'department') {
      return this.departments().find((o) => o.id === value)?.name ?? String(value);
    }
    return String(value);
  }

  protected eventIcon(kind: string): string {
    switch (kind) {
      case 'status':
      case 'status_change':
        return 'flag';
      case 'action':
      case 'action_added':
      case 'action_updated':
        return 'checkcircle';
      case 'comment':
        return 'comment';
      case 'created':
        return 'spark';
      default:
        return 'history';
    }
  }

  protected toggleStatusMenu(event: Event): void {
    event.stopPropagation();
    this.statusMenuOpen.update((open) => !open);
  }

  protected closeStatusMenu(): void {
    if (this.statusMenuOpen()) {
      this.statusMenuOpen.set(false);
    }
  }

  protected changeStatus(status: DeviationStatus): void {
    const orgId = this.orgId();
    const dev = this.deviation();
    if (!orgId || !dev || this.savingStatus() || status === dev.status) {
      return;
    }
    this.statusMenuOpen.set(false);
    this.savingStatus.set(true);
    this.api.updateDeviation(orgId, dev.id, { status }).subscribe({
      next: (updated) => {
        this.savingStatus.set(false);
        this.applyUpdated(updated);
        this.notifications.success('deviations.detail.statusChangedToast');
      },
      error: () => this.savingStatus.set(false),
    });
  }

  protected remove(): void {
    const orgId = this.orgId();
    const dev = this.deviation();
    if (!orgId || !dev || this.deleting()) {
      return;
    }
    const message = this.transloco.translate('deviations.detail.deleteConfirm', { code: dev.code });
    if (!globalThis.confirm(message)) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteDeviation(orgId, dev.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.notifications.info('deviations.detail.deletedToast');
        void this.router.navigateByUrl('/deviations');
      },
      error: () => this.deleting.set(false),
    });
  }

  protected startEdit(dev: DeviationDetailModel): void {
    this.title.set(dev.title);
    this.description.set(dev.description ?? '');
    this.severity.set(dev.severity);
    this.source.set(dev.source);
    this.dueAt.set(dev.due_at ? dev.due_at.slice(0, 10) : '');
    this.rootCause.set(dev.root_cause ?? '');
    this.rootCauseMethod.set(dev.root_cause_method ?? '');
    this.data.set({ ...dev.data });
    this.dataErrors.set({});
    this.titleError.set(false);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.dataErrors.set({});
  }

  protected setData(key: string, value: unknown): void {
    this.data.set({ ...this.data(), [key]: value });
    const errors = this.dataErrors();
    if (errors[key]) {
      const next = { ...errors };
      delete next[key];
      this.dataErrors.set(next);
    }
  }

  protected saveEdit(): void {
    const orgId = this.orgId();
    const dev = this.deviation();
    if (!orgId || !dev || this.savingEdit()) {
      return;
    }
    const title = this.title().trim();
    if (!title) {
      this.titleError.set(true);
      return;
    }
    this.titleError.set(false);

    const patch = this.buildPatch(dev);
    if (Object.keys(patch).length === 0) {
      this.editing.set(false);
      return;
    }

    this.savingEdit.set(true);
    this.dataErrors.set({});
    this.api.updateDeviation(orgId, dev.id, patch).subscribe({
      next: (updated) => {
        this.savingEdit.set(false);
        this.editing.set(false);
        this.applyUpdated(updated);
        this.notifications.success('deviations.detail.savedToast');
      },
      error: (error: unknown) => {
        this.savingEdit.set(false);
        this.handleEditError(error);
      },
    });
  }

  /** Only send fields that actually changed (data is sent whole if any key differs). */
  private buildPatch(dev: DeviationDetailModel): UpdateDeviationRequest {
    const patch: Record<string, unknown> = {};
    const title = this.title().trim();
    if (title !== dev.title) {
      patch['title'] = title;
    }
    const description = this.description().trim();
    if (description !== (dev.description ?? '')) {
      patch['description'] = description;
    }
    if (this.severity() !== dev.severity) {
      patch['severity'] = this.severity();
    }
    if (this.source() !== dev.source) {
      patch['source'] = this.source();
    }
    const due = this.dueAt() || undefined;
    const currentDue = dev.due_at ? dev.due_at.slice(0, 10) : undefined;
    if (due !== currentDue) {
      patch['due_at'] = this.dueAt() || null;
    }
    const rootCause = this.rootCause().trim();
    if (rootCause !== (dev.root_cause ?? '')) {
      patch['root_cause'] = rootCause;
    }
    const rootCauseMethod = this.rootCauseMethod().trim();
    if (rootCauseMethod !== (dev.root_cause_method ?? '')) {
      patch['root_cause_method'] = rootCauseMethod;
    }
    if (this.dataChanged(dev.data)) {
      patch['data'] = this.data();
    }
    return patch as UpdateDeviationRequest;
  }

  private dataChanged(original: Record<string, unknown>): boolean {
    return JSON.stringify(original) !== JSON.stringify(this.data());
  }

  private handleEditError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      return;
    }
    if (error.status === 422) {
      const fieldErrors = (error.error as { detail?: { data?: Record<string, string> } } | null)
        ?.detail?.data;
      if (fieldErrors && typeof fieldErrors === 'object') {
        this.dataErrors.set({ ...fieldErrors });
        this.notifications.error('deviations.create.validationToast');
        return;
      }
    }
    if (error.status === 400) {
      this.notifications.error('deviations.create.badReferenceToast');
    }
  }

  protected onOwnerChange(ownerUserId: string): void {
    const acc = this.access();
    if (acc) {
      this.access.set({ ...acc, owner_user_id: ownerUserId || undefined });
    }
    const dev = this.deviation();
    if (dev) {
      const owner = this.owners().find((o) => o.id === ownerUserId);
      this.deviation.set({
        ...dev,
        owner_user_id: ownerUserId || undefined,
        owner_name: owner?.name,
      });
    }
  }

  protected onVisibilityChange(visibility: DeviationVisibility): void {
    const acc = this.access();
    if (acc) {
      this.access.set({ ...acc, visibility });
    }
    const dev = this.deviation();
    if (dev) {
      this.deviation.set({ ...dev, visibility });
    }
  }

  protected reloadEvents(): void {
    const orgId = this.orgId();
    const id = this.id();
    if (!orgId) {
      return;
    }
    this.api.getDeviation(orgId, id).subscribe({
      next: (dev) => {
        this.events.set(dev.events);
        this.actions.set(dev.actions);
      },
    });
  }

  /** Replace the deviation, keeping the live actions/events in sync. */
  private applyUpdated(updated: DeviationDetailModel): void {
    this.deviation.set(updated);
    this.actions.set(updated.actions);
    this.events.set(updated.events);
  }

  private load(orgId: string, id: string): void {
    this.loading.set(true);
    this.editing.set(false);
    this.access.set(null);
    this.api.getDeviation(orgId, id).subscribe({
      next: (dev) => {
        this.deviation.set(dev);
        this.actions.set(dev.actions);
        this.events.set(dev.events);
        this.loading.set(false);
        this.loadType(orgId, dev.type_id);
        this.loadAccess(orgId, id);
      },
      error: () => {
        this.deviation.set(null);
        this.loading.set(false);
      },
    });
  }

  private loadType(orgId: string, typeId: string): void {
    this.api.getType(orgId, typeId).subscribe({
      next: (type) => this.type.set(type),
    });
  }

  private loadAccess(orgId: string, id: string): void {
    this.api.getAccess(orgId, id).subscribe({
      next: (access) => {
        this.access.set(access);
        this.grants.set(access.grants);
      },
    });
  }

  private loadSubjects(orgId: string): void {
    this.api.listAccessSubjects(orgId).subscribe({
      next: (subjects) => {
        this.owners.set(subjects.users.map((u) => ({ id: u.id, name: u.name })));
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name })));
      },
    });
  }
}
