import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import {
  MILESTONE_STATUSES,
  Milestone,
  MilestoneCreate,
  MilestoneKind,
  MilestoneStatus,
  isOneOf,
} from './data/project.models';
import { milestoneStatusTone } from './data/project-display';
import { projectErrorKey } from './data/project-errors';
import { datesInOrder } from './data/project-form-model';
import { ProjectsApi } from './data/projects-api';

/** Draft of the milestone form ('' = not set). */
export interface MilestoneDraft {
  readonly kind: MilestoneKind;
  readonly title: string;
  readonly description: string;
  readonly phase_id: string;
  readonly status: MilestoneStatus;
  readonly start_date: string;
  readonly due_date: string;
  readonly owner_user_id: string;
}

export function emptyMilestoneDraft(patch: Partial<MilestoneDraft> = {}): MilestoneDraft {
  return {
    kind: 'milestone',
    title: '',
    description: '',
    phase_id: '',
    status: 'planned',
    start_date: '',
    due_date: '',
    owner_user_id: '',
    ...patch,
  };
}

export function draftFromMilestone(m: Milestone): MilestoneDraft {
  return {
    kind: m.kind,
    title: m.title,
    description: m.description ?? '',
    phase_id: m.phase_id ?? '',
    status: m.status,
    start_date: m.start_date ?? '',
    due_date: m.due_date ?? '',
    owner_user_id: m.owner?.id ?? '',
  };
}

export function milestoneBody(d: MilestoneDraft): MilestoneCreate {
  return {
    kind: d.kind,
    title: d.title.trim(),
    description: d.description.trim() || null,
    phase_id: d.kind === 'milestone' ? d.phase_id || null : null,
    status: d.status,
    start_date: d.start_date || null,
    due_date: d.due_date || null,
    owner_user_id: d.owner_user_id || null,
  };
}

/** Phases, each followed by its milestones, then the milestones outside a phase. */
export function groupMilestones(items: readonly Milestone[]): {
  readonly phases: readonly {
    readonly phase: Milestone;
    readonly milestones: readonly Milestone[];
  }[];
  readonly loose: readonly Milestone[];
} {
  const phases = items.filter((m) => m.kind === 'phase');
  const ids = new Set(phases.map((p) => p.id));
  return {
    phases: phases.map((phase) => ({
      phase,
      milestones: items.filter((m) => m.kind === 'milestone' && m.phase_id === phase.id),
    })),
    loose: items.filter((m) => m.kind === 'milestone' && (!m.phase_id || !ids.has(m.phase_id))),
  };
}

/**
 * Phases and milestones of a project. Contributors add and edit them in a side
 * panel; the panel of an existing milestone also lists its tasks. `focusId`
 * (from `?milestone=`) opens that milestone.
 */
@Component({
  selector: 'app-project-milestones',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    LocalDayPipe,
    FieldHelp,
    EntityTasks,
    Badge,
    Button,
    ConfirmDialog,
    FormField,
    Icon,
    SlideOver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-display text-[15px] font-bold text-fg">
        {{ 'projects.milestones.title' | transloco }}
      </h2>
      @if (canContribute()) {
        <div class="flex flex-wrap gap-2">
          <app-button
            size="sm"
            variant="secondary"
            (click)="openNew('phase')"
            data-testid="add-phase"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'projects.milestones.addPhase' | transloco }}
          </app-button>
          <app-button size="sm" (click)="openNew('milestone')" data-testid="add-milestone">
            <app-icon name="flag" [size]="14" />
            {{ 'projects.milestones.addMilestone' | transloco }}
          </app-button>
        </div>
      }
    </div>
    <app-field-help scope="projects" page="detail" field="milestones" />

    @switch (state()) {
      @case ('loading') {
        <p class="py-4 text-[13px] text-fg-muted" role="status">
          {{ 'projects.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <p class="py-4 text-[13px] text-fail" role="alert">
          {{ 'projects.common.loadFailed' | transloco }}
        </p>
      }
      @default {
        @if (items().length === 0) {
          <p class="py-4 text-[13px] text-fg-muted" data-testid="milestones-empty">
            {{ 'projects.milestones.empty' | transloco }}
          </p>
        } @else {
          <div class="mt-2 flex flex-col gap-3" data-testid="milestones">
            @for (g of groups().phases; track g.phase.id) {
              <section class="rounded-tile border border-border">
                <ng-container
                  *ngTemplateOutlet="row; context: { $implicit: g.phase, phase: true }"
                />
                @if (g.milestones.length) {
                  <ul class="divide-y divide-border border-t border-border">
                    @for (m of g.milestones; track m.id) {
                      <li class="pl-4">
                        <ng-container
                          *ngTemplateOutlet="row; context: { $implicit: m, phase: false }"
                        />
                      </li>
                    }
                  </ul>
                }
              </section>
            }
            @if (groups().loose.length) {
              <ul class="divide-y divide-border rounded-tile border border-border">
                @for (m of groups().loose; track m.id) {
                  <li>
                    <ng-container
                      *ngTemplateOutlet="row; context: { $implicit: m, phase: false }"
                    />
                  </li>
                }
              </ul>
            }
          </div>
        }
      }
    }

    <ng-template #row let-m let-phase="phase">
      <div
        class="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
        [class.bg-accent-soft]="highlight() === m.id"
        [attr.data-testid]="'milestone-' + m.id"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 text-left text-[13.5px] text-fg hover:underline"
          [class.font-semibold]="phase"
          (click)="openEdit(m)"
        >
          <app-icon
            [name]="phase ? 'template' : 'flag'"
            [size]="14"
            class="flex-none text-fg-subtle"
          />
          <span class="truncate">{{ m.title }}</span>
          <span class="sr-only">{{ 'projects.plan.kinds.' + m.kind | transloco }}</span>
        </button>
        <span class="flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
          @if (m.owner?.name; as name) {
            <span>{{ name }}</span>
          }
          @if (m.start_date && m.due_date) {
            <span>{{ m.start_date | localDay }} – {{ m.due_date | localDay }}</span>
          } @else if (m.due_date) {
            <span [class.text-fail]="m.is_overdue" [class.font-semibold]="m.is_overdue">
              {{ 'projects.milestones.due' | transloco: { date: (m.due_date | localDay) } }}
            </span>
          }
          @if (m.is_overdue) {
            <app-badge tone="fail">{{ 'projects.common.overdue' | transloco }}</app-badge>
          }
          <app-badge [tone]="statusTone(m.status)">{{
            'projects.milestoneStatus.' + m.status | transloco
          }}</app-badge>
          @if (canContribute() && m.status !== 'done' && m.status !== 'cancelled') {
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 font-semibold text-accent hover:bg-accent-soft"
              (click)="markDone(m)"
              [disabled]="busy()"
              [attr.data-testid]="'done-' + m.id"
            >
              <app-icon name="check" [size]="13" />
              {{ 'projects.milestones.markDone' | transloco }}
            </button>
          }
        </span>
      </div>
    </ng-template>

    <app-slide-over
      [open]="panelOpen()"
      [title]="panelTitle()"
      [closeLabel]="'projects.common.close' | transloco"
      [width]="520"
      (closed)="closePanel()"
    >
      @if (draft(); as d) {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
          <fieldset class="flex flex-col gap-4" [disabled]="!canContribute()">
            <app-form-field [label]="'projects.fields.title' | transloco" inputId="cf-ms-title">
              <input
                id="cf-ms-title"
                type="text"
                maxlength="255"
                required
                [value]="d.title"
                (input)="patch({ title: $any($event.target).value })"
                data-testid="milestone-title"
              />
            </app-form-field>
            @if (d.kind === 'milestone' && phases().length) {
              <app-form-field
                [label]="'projects.milestones.phase' | transloco"
                inputId="cf-ms-phase"
              >
                <select id="cf-ms-phase" (change)="patch({ phase_id: $any($event.target).value })">
                  <option value="" [selected]="!d.phase_id">
                    {{ 'projects.milestones.noPhase' | transloco }}
                  </option>
                  @for (p of phases(); track p.id) {
                    <option [value]="p.id" [selected]="d.phase_id === p.id">{{ p.title }}</option>
                  }
                </select>
              </app-form-field>
            }
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-form-field
                [label]="'projects.fields.startDate' | transloco"
                inputId="cf-ms-start"
              >
                <input
                  id="cf-ms-start"
                  type="date"
                  [value]="d.start_date"
                  (change)="patch({ start_date: $any($event.target).value })"
                />
              </app-form-field>
              <app-form-field [label]="'projects.fields.dueDate' | transloco" inputId="cf-ms-due">
                <input
                  id="cf-ms-due"
                  type="date"
                  [value]="d.due_date"
                  (change)="patch({ due_date: $any($event.target).value })"
                  data-testid="milestone-due"
                />
              </app-form-field>
            </div>
            @if (!datesOk()) {
              <p class="text-[12px] text-fail" role="alert">
                {{ 'projects.form.errors.dueBeforeStart' | transloco }}
              </p>
            }
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-form-field [label]="'projects.fields.status' | transloco" inputId="cf-ms-status">
                <select id="cf-ms-status" (change)="setStatus($any($event.target).value)">
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="d.status === s">
                      {{ 'projects.milestoneStatus.' + s | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
              <app-form-field [label]="'projects.fields.owner' | transloco" inputId="cf-ms-owner">
                <select
                  id="cf-ms-owner"
                  (change)="patch({ owner_user_id: $any($event.target).value })"
                >
                  <option value="" [selected]="!d.owner_user_id">
                    {{ 'projects.common.nobody' | transloco }}
                  </option>
                  @if (ownerOrphan()) {
                    <option [value]="d.owner_user_id" selected>
                      {{ editing()?.owner?.name ?? d.owner_user_id }}
                    </option>
                  }
                  @for (u of users(); track u.id) {
                    <option [value]="u.id" [selected]="d.owner_user_id === u.id">
                      {{ u.label }}
                    </option>
                  }
                </select>
              </app-form-field>
            </div>
            <app-form-field
              [label]="'projects.fields.description' | transloco"
              inputId="cf-ms-desc"
            >
              <textarea
                id="cf-ms-desc"
                rows="3"
                maxlength="20000"
                [value]="d.description"
                (input)="patch({ description: $any($event.target).value })"
              ></textarea>
            </app-form-field>
          </fieldset>
          @if (canContribute()) {
            <div class="flex flex-wrap justify-between gap-2">
              @if (editing(); as m) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(m)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'projects.common.delete' | transloco }}
                </app-button>
              } @else {
                <span></span>
              }
              <app-button
                type="submit"
                size="sm"
                [loading]="busy()"
                [disabled]="busy() || !d.title.trim() || !datesOk()"
                data-testid="milestone-save"
              >
                {{ 'common.save' | transloco }}
              </app-button>
            </div>
          }
        </form>
        @if (editing(); as m) {
          <div class="mt-6 border-t border-border pt-4">
            <app-entity-tasks
              entityType="project_milestone"
              [entityId]="m.id"
              [canCreate]="canContribute()"
              [entityLabel]="m.title"
            />
          </div>
        }
      }
    </app-slide-over>

    <app-confirm-dialog
      [open]="!!deleting()"
      [title]="'projects.milestones.deleteTitle' | transloco"
      [message]="
        'projects.milestones.deleteMessage' | transloco: { title: deleting()?.title ?? '' }
      "
      [confirmLabel]="'projects.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class ProjectMilestones {
  private readonly api = inject(ProjectsApi);
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly projectId = input.required<string>();
  readonly canContribute = input(false);
  /** Bump to re-fetch (e.g. after a close-out or a plan change elsewhere). */
  readonly refresh = input(0);
  /** A milestone to open (deep link `?milestone=`). */
  readonly focusId = input<string | null>(null);
  readonly changed = output<void>();

  protected readonly statuses = MILESTONE_STATUSES;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Milestone[]>([]);
  protected readonly groups = computed(() => groupMilestones(this.items()));
  protected readonly phases = computed(() => this.items().filter((m) => m.kind === 'phase'));
  protected readonly busy = signal(false);
  protected readonly panelOpen = signal(false);
  protected readonly draft = signal<MilestoneDraft | null>(null);
  protected readonly editing = signal<Milestone | null>(null);
  protected readonly deleting = signal<Milestone | null>(null);
  protected readonly highlight = signal<string | null>(null);
  protected readonly datesOk = computed(() => {
    const d = this.draft();
    return !d || datesInOrder(d.start_date, d.due_date);
  });

  protected readonly users = computed(() =>
    this.assignees.options().users.map((o) => ({ id: o.value.slice(5), label: o.label })),
  );
  protected readonly ownerOrphan = computed(() => {
    const id = this.draft()?.owner_user_id;
    return !!id && !this.users().some((u) => u.id === id);
  });
  protected readonly panelTitle = computed(() => {
    const m = this.editing();
    const kind = m?.kind ?? this.draft()?.kind ?? 'milestone';
    return this.language.translate(
      m ? `projects.milestones.edit.${kind}` : `projects.milestones.new.${kind}`,
    );
  });

  private request = new Subscription();
  private focused: string | null = null;

  constructor() {
    this.assignees.ensureLoaded();
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.projectId();
      this.refresh();
      untracked(() => this.load(orgId, id));
    });
    effect(() => {
      const focus = this.focusId();
      const items = this.items();
      if (focus && focus !== this.focused) {
        const m = items.find((i) => i.id === focus);
        if (m) {
          this.focused = focus;
          untracked(() => {
            this.highlight.set(m.id);
            this.openEdit(m);
          });
        }
      }
    });
  }

  protected statusTone(status: string) {
    return milestoneStatusTone(status);
  }

  protected openNew(kind: MilestoneKind): void {
    this.editing.set(null);
    this.draft.set(emptyMilestoneDraft({ kind }));
    this.panelOpen.set(true);
  }

  protected openEdit(m: Milestone): void {
    this.editing.set(m);
    this.draft.set(draftFromMilestone(m));
    this.panelOpen.set(true);
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
    this.editing.set(null);
    this.draft.set(null);
  }

  protected patch(p: Partial<MilestoneDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }

  protected setStatus(value: string): void {
    if (isOneOf(MILESTONE_STATUSES, value)) {
      this.patch({ status: value });
    }
  }

  protected markDone(m: Milestone): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateMilestone(orgId, this.projectId(), m.id, { status: 'done' }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.replace(updated);
        this.notifications.success('projects.notices.milestoneDone', { title: m.title });
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || !d.title.trim() || !this.datesOk() || this.busy()) {
      return;
    }
    const body = milestoneBody(d);
    const existing = this.editing();
    this.busy.set(true);
    const call = existing
      ? this.api.updateMilestone(orgId, this.projectId(), existing.id, {
          title: body.title,
          description: body.description,
          phase_id: body.phase_id,
          status: body.status,
          start_date: body.start_date,
          due_date: body.due_date,
          owner_user_id: body.owner_user_id,
        })
      : this.api.addMilestone(orgId, this.projectId(), body);
    call.subscribe({
      next: (saved) => {
        this.busy.set(false);
        if (existing) {
          this.replace(saved);
        } else {
          this.items.update((list) => [...list, saved]);
        }
        this.notifications.success('projects.notices.milestoneSaved', { title: saved.title });
        this.closePanel();
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const m = this.deleting();
    if (!orgId || !m || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteMilestone(orgId, this.projectId(), m.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.closePanel();
        this.notifications.success('projects.notices.milestoneDeleted', { title: m.title });
        this.load(orgId, this.projectId());
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  private replace(m: Milestone): void {
    this.items.update((list) => list.map((i) => (i.id === m.id ? m : i)));
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.items().length) {
      this.state.set('loading');
    }
    this.request = this.api.milestones(orgId, id).subscribe({
      next: (items) => {
        this.items.set(items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
