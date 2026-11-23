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
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { FieldHelp } from '../../shared/guidance/field-help';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { LanguageService } from '../../core/i18n/language.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { PeopleApi } from './data/people-api';
import { countKey, hasPerm, todayIso } from './data/people-display';
import { peopleErrorCode, peopleErrorExtra, peopleErrorKey } from './data/people-errors';
import {
  ChecklistDetail,
  ChecklistItem,
  ITEM_CATEGORIES,
  ItemCategory,
  PERM_MANAGE,
  PERM_WRITE,
} from './data/people.models';
import { EmployeeHandoverSection } from './ui/employee-training';
import { PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';
import { FormField } from '../../shared/ui/form-field/form-field';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments', 'attachments'];

/**
 * A joiner or leaver checklist (`/people/checklists/:id`, "Oppstart – Jonas Lie"):
 * the items by category, ticked off one by one, then completed (blocked while
 * required items are open) or cancelled. Items with a meaning also update the
 * person: ticking "confidentiality agreement received" records the date on the
 * person, and "equipment returned" is refused while assets are still registered to
 * them (the leaver's assets and access are listed below the items). The work is a
 * platform task, linked from here.
 */
@Component({
  selector: 'app-people-checklist-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    WatchButton,
    FieldHelp,
    WhyItMatters,
    RecordDetailLayout,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    OverflowMenu,
    ProgressBar,
    StatusBadge,
    EmployeeHandoverSection,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-empty-state
            icon="search"
            [titleKey]="errorKey()"
            bodyKey="people.detail.notFoundBody"
            ctaKey="people.common.backToChecklists"
            ctaLink="/people/checklists"
          />
        </div>
      }
      @default {
        @if (checklist(); as c) {
          <app-record-detail-layout
            entityType="people_checklist"
            [entityId]="c.id"
            [title]="c.title"
            [breadcrumbs]="[
              root,
              { labelKey: 'people.checklists.title', link: '/people/checklists' },
              { label: c.title },
            ]"
            [settingsLink]="settingsLink"
            [tabs]="tabs"
            [canEdit]="editable()"
            [requirementsPanel]="true"
          >
            <ng-container ngProjectAs="[meta]">
              <span>{{ 'people.checklistKinds.' + c.kind | transloco }}</span>
              <span aria-hidden="true">·</span>
              <a
                [routerLink]="['/people/employees', c.employee_id]"
                class="font-semibold text-accent hover:underline"
                data-testid="checklist-employee"
                >{{ c.employee_name }}</a
              >
              <app-status-badge
                meaning="lifecycle"
                [value]="c.status"
                [labelKey]="'people.checklistStatus.' + c.status"
                data-testid="checklist-status"
              />
              @if (c.due_date) {
                <span [class.font-semibold]="overdue()" [class.text-warn-ink]="overdue()">{{
                  'people.checklists.due' | transloco: { date: (c.due_date | localDay) }
                }}</span>
              }
              <span class="sr-only" data-testid="checklist-heading">{{ c.title }}</span>
            </ng-container>

            @if (editable()) {
              <ng-container ngProjectAs="[primary]">
                <app-button
                  (click)="complete()"
                  [loading]="busy()"
                  [disabled]="busy()"
                  data-testid="checklist-complete"
                >
                  <app-icon name="check" [size]="15" />
                  {{ 'people.checklists.complete' | transloco }}
                </app-button>
              </ng-container>
            }
            <ng-container ngProjectAs="[secondary]">
              <a [routerLink]="['/people/employees', c.employee_id]">
                <app-button variant="secondary">{{
                  'people.checklists.openPerson' | transloco
                }}</app-button>
              </a>
              <app-watch-button entityType="people_checklist" [entityId]="c.id" />
            </ng-container>
            <ng-container ngProjectAs="[overflow]">
              <button appMenuItem type="button" (click)="askAbout()">
                {{ 'people.checklists.ask' | transloco }}
              </button>
              @if (editable()) {
                <button appMenuItem type="button" (click)="cancelling.set(true)">
                  {{ 'people.checklists.cancel' | transloco }}
                </button>
              }
              @if (canManage()) {
                <button
                  appMenuItem
                  type="button"
                  [danger]="true"
                  (click)="deleting.set(true)"
                  data-testid="checklist-delete"
                >
                  {{ 'people.common.delete' | transloco }}
                </button>
              }
            </ng-container>

            <app-help-strip
              help
              scope="people"
              [page]="c.kind === 'offboarding' ? 'checklistOffboarding' : 'checklistOnboarding'"
              lesson="joiners-and-leavers"
            />

            <div class="flex flex-col gap-5">
              @if (c.status !== 'open') {
                <app-alert tone="info">
                  {{
                    (c.status === 'completed'
                      ? 'people.checklists.completedNotice'
                      : 'people.checklists.cancelledNotice'
                    )
                      | transloco
                        : {
                            name: c.completed_by?.name ?? '',
                            date: c.completed_at ? (c.completed_at | localDate) : '',
                          }
                  }}
                </app-alert>
              }
              @if (openRequired() !== null) {
                <app-alert tone="error">
                  {{ 'people.errors.checklist_incomplete' | transloco: { count: openRequired() } }}
                </app-alert>
              }
              @if (assetsOutstanding() !== null) {
                <app-alert tone="error" data-testid="assets-outstanding">
                  {{
                    countKey('people.checklists.assetsOutstanding', assetsOutstanding())
                      | transloco: { count: assetsOutstanding() }
                  }}
                  <a
                    [routerLink]="['/people/employees', c.employee_id]"
                    [queryParams]="{ section: 'handover' }"
                    class="ml-1 font-semibold underline"
                    >{{ 'people.checklists.seeHandover' | transloco }}</a
                  >
                </app-alert>
              }

              <app-card>
                <div class="mb-3">
                  <app-progress-bar
                    [value]="c.items_total ? (c.items_done / c.items_total) * 100 : 0"
                    [label]="
                      'people.checklists.progress'
                        | transloco: { done: c.items_done, total: c.items_total }
                    "
                  />
                  <p class="mt-1 text-meta text-fg-muted" data-testid="checklist-progress">
                    {{
                      'people.checklists.progress'
                        | transloco: { done: c.items_done, total: c.items_total }
                    }}
                    @if (c.required_open > 0) {
                      ·
                      {{
                        countKey('people.checklists.requiredOpen', c.required_open)
                          | transloco: { count: c.required_open }
                      }}
                    }
                  </p>
                </div>

                @for (group of groups(); track group.category) {
                  <section
                    class="mt-4 first:mt-0"
                    [attr.aria-labelledby]="'cf-cat-' + group.category"
                  >
                    <h2
                      [id]="'cf-cat-' + group.category"
                      class="mb-1 text-meta font-semibold tracking-wide text-fg-subtle uppercase"
                    >
                      {{ 'people.itemCategories.' + group.category | transloco }}
                    </h2>
                    <ul class="divide-y divide-border">
                      @for (item of group.items; track item.id) {
                        <li class="flex items-start gap-3 py-2">
                          <input
                            type="checkbox"
                            class="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
                            [id]="'cf-item-' + item.id"
                            [checked]="item.done"
                            [disabled]="!editable() || busy() || !!item.system_key"
                            [attr.aria-describedby]="
                              item.system_key || item.action_key ? 'cf-item-auto-' + item.id : null
                            "
                            (change)="toggle(item, $any($event.target).checked)"
                            [attr.data-testid]="'item-' + item.id"
                          />
                          <div class="min-w-0 flex-1">
                            <label
                              [for]="'cf-item-' + item.id"
                              class="text-body text-fg"
                              [class.line-through]="item.done"
                              [class.text-fg-muted]="item.done"
                            >
                              {{ item.text }}
                            </label>
                            @if (item.required) {
                              <span class="ml-1 text-meta text-fg-subtle">{{
                                'people.checklists.required' | transloco
                              }}</span>
                            }
                            @if (item.system_key) {
                              <p
                                [id]="'cf-item-auto-' + item.id"
                                class="text-meta text-fg-muted"
                                [attr.data-testid]="'item-auto-' + item.id"
                              >
                                {{
                                  (item.done
                                    ? 'people.checklists.automaticDone'
                                    : 'people.checklists.automaticPending'
                                  )
                                    | transloco
                                      : { date: item.done_at ? (item.done_at | localDate) : '' }
                                }}
                              </p>
                            } @else if (item.action_key) {
                              <p
                                [id]="'cf-item-auto-' + item.id"
                                class="text-meta text-fg-muted"
                                [attr.data-testid]="'item-action-' + item.id"
                              >
                                {{ 'people.checklists.actions.' + item.action_key | transloco }}
                              </p>
                            }
                            @if (item.done && item.done_by && !item.system_key) {
                              <p class="text-meta text-fg-subtle">
                                {{
                                  'people.checklists.doneBy'
                                    | transloco
                                      : {
                                          name: item.done_by.name ?? '',
                                          date: item.done_at ? (item.done_at | localDate) : '',
                                        }
                                }}
                              </p>
                            }
                            @if (item.note) {
                              <p class="text-meta text-fg-muted">{{ item.note }}</p>
                            }
                          </div>
                          @if (editable()) {
                            <app-overflow-menu
                              [iconOnly]="true"
                              labelKey="people.checklists.itemMenu"
                              [attr.data-testid]="'item-menu-' + item.id"
                            >
                              <button appMenuItem type="button" (click)="openNote(item)">
                                {{ 'people.checklists.note' | transloco }}
                              </button>
                              @if (!item.system_key) {
                                <button
                                  appMenuItem
                                  type="button"
                                  [danger]="true"
                                  (click)="removeItem(item)"
                                  [attr.data-testid]="'remove-' + item.id"
                                >
                                  {{ 'people.checklists.removeItem' | transloco }}
                                </button>
                              }
                            </app-overflow-menu>
                          }
                        </li>
                      }
                    </ul>
                  </section>
                }

                @if (editable()) {
                  <form
                    class="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"
                    (submit)="$event.preventDefault(); addItem()"
                  >
                    <app-form-field
                      class="flex-1"
                      [label]="'people.checklists.newItem' | transloco"
                      inputId="cf-new-item"
                    >
                      <app-field-help
                        label-suffix
                        scope="people"
                        page="checklistDetail"
                        field="items"
                        [label]="'people.checklists.newItem' | transloco"
                      />
                      <input
                        id="cf-new-item"
                        type="text"
                        maxlength="500"
                        [value]="newText()"
                        (input)="newText.set($any($event.target).value)"
                        data-testid="new-item-text"
                      />
                    </app-form-field>
                    <app-form-field
                      class="sm:w-48"
                      [label]="'people.fields.category' | transloco"
                      inputId="cf-new-cat"
                    >
                      <select id="cf-new-cat" (change)="newCategory.set($any($event.target).value)">
                        @for (k of categories; track k) {
                          <option [value]="k" [selected]="newCategory() === k">
                            {{ 'people.itemCategories.' + k | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                    <label class="flex h-10 items-center gap-2 text-ui text-fg">
                      <input
                        type="checkbox"
                        class="h-4 w-4 accent-[var(--accent)]"
                        [checked]="newRequired()"
                        (change)="newRequired.set($any($event.target).checked)"
                      />
                      {{ 'people.checklists.required' | transloco }}
                    </label>
                    <app-button
                      type="submit"
                      variant="secondary"
                      [disabled]="!newText().trim() || busy()"
                    >
                      <app-icon name="plus" [size]="14" />
                      {{ 'people.checklists.addItem' | transloco }}
                    </app-button>
                  </form>
                }
              </app-card>

              @if (c.kind === 'offboarding') {
                <app-card>
                  <app-people-employee-handover
                    [employeeId]="c.employee_id"
                    [refresh]="refreshCount()"
                  />
                </app-card>
              }
            </div>

            <ng-container ngProjectAs="[aside]">
              <app-card>
                <app-field-list [columns]="1">
                  <app-field-item labelKey="people.fields.employee">
                    <a
                      [routerLink]="['/people/employees', c.employee_id]"
                      class="font-semibold text-accent hover:underline"
                      >{{ c.employee_name }}</a
                    >
                    <span class="ml-1 font-mono text-meta text-fg-subtle">{{
                      c.employee_code
                    }}</span>
                  </app-field-item>
                  <app-field-item labelKey="people.fields.owner" [value]="c.owner?.name" />
                  @if (c.task_id) {
                    <app-field-item labelKey="people.checklists.task">
                      <a
                        [routerLink]="['/tasks', c.task_id]"
                        class="font-semibold text-accent hover:underline"
                        data-testid="checklist-task"
                        >{{ 'people.checklists.openTask' | transloco }}</a
                      >
                    </app-field-item>
                  }
                </app-field-list>
              </app-card>
            </ng-container>
            <ng-container ngProjectAs="[aside-learn]">
              <app-why-it-matters
                scope="people"
                [page]="c.kind === 'offboarding' ? 'checklistOffboarding' : 'checklistOnboarding'"
              />
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="noteFor() !== null"
            [title]="'people.checklists.noteTitle' | transloco"
            [message]="noteFor()?.text ?? ''"
            [confirmLabel]="'common.save' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="primary"
            [busy]="busy()"
            initialFocus="#cf-item-note"
            (confirmed)="saveNote()"
            (cancelled)="noteFor.set(null)"
          >
            <div class="mt-3">
              <label for="cf-item-note" class="sr-only">{{
                'people.checklists.note' | transloco
              }}</label>
              <textarea
                id="cf-item-note"
                rows="3"
                maxlength="500"
                class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                [value]="noteText()"
                (input)="noteText.set($any($event.target).value)"
              ></textarea>
            </div>
          </app-confirm-dialog>

          <app-confirm-dialog
            [open]="cancelling()"
            [title]="'people.checklists.cancelTitle' | transloco"
            [message]="'people.checklists.cancelMessage' | transloco"
            [confirmLabel]="'people.checklists.cancel' | transloco"
            [cancelLabel]="'people.common.keep' | transloco"
            [busy]="busy()"
            (confirmed)="cancelChecklist()"
            (cancelled)="cancelling.set(false)"
          />

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'people.checklists.deleteTitle' | transloco"
            [message]="'people.checklists.deleteMessage' | transloco: { title: c.title }"
            [confirmLabel]="'people.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
        }
      }
    }
  `,
})
export class ChecklistDetailPage {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly categories = ITEM_CATEGORIES;
  protected readonly countKey = countKey;
  protected readonly root = PEOPLE_ROOT;
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly today = todayIso();
  protected readonly assetsOutstanding = signal<number | null>(null);
  /** Bumped after each change so the handover card reloads. */
  protected readonly refreshCount = signal(0);
  protected readonly overdue = computed(() => {
    const c = this.checklist();
    return !!c && c.status === 'open' && !!c.due_date && c.due_date < this.today;
  });

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly checklist = signal<ChecklistDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly openRequired = signal<number | null>(null);
  protected readonly newText = signal('');
  protected readonly newCategory = signal<ItemCategory>('other');
  protected readonly newRequired = signal(true);
  protected readonly noteFor = signal<ChecklistItem | null>(null);
  protected readonly noteText = signal('');
  protected readonly cancelling = signal(false);
  protected readonly deleting = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions);
  protected readonly canManage = computed(() => hasPerm(this.permissions(), PERM_MANAGE));
  protected readonly editable = computed(
    () => hasPerm(this.permissions(), PERM_WRITE) && this.checklist()?.status === 'open',
  );

  /** Items grouped by category, in the backend's order within each group. */
  protected readonly groups = computed(() => {
    const items = [...(this.checklist()?.items ?? [])].sort((a, b) => a.position - b.position);
    return ITEM_CATEGORIES.map((category) => ({
      category,
      items: items.filter((i) => i.category === category),
    })).filter((g) => g.items.length > 0);
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'people_checklist',
      entityId: this.id(),
      view: 'detail',
      title: this.checklist()?.title ?? null,
      requirements:
        this.checklist()?.kind === 'offboarding'
          ? ['iso27001:A.5.11', 'iso27001:A.5.18', 'iso27001:A.6.5']
          : ['iso27001:A.6.2', 'iso27001:A.6.6'],
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected askAbout(): void {
    this.ask.askAbout(this.language.translate('people.ask.checklist'));
  }

  protected toggle(item: ChecklistItem, done: boolean): void {
    if (item.system_key) {
      return;
    }
    this.assetsOutstanding.set(null);
    this.mutate((orgId, id) => this.api.updateChecklistItem(orgId, id, item.id, { done }));
  }

  protected openNote(item: ChecklistItem): void {
    this.noteText.set(item.note ?? '');
    this.noteFor.set(item);
  }

  protected saveNote(): void {
    const item = this.noteFor();
    if (!item) {
      return;
    }
    const note = this.noteText().trim() || null;
    this.mutate(
      (orgId, id) => this.api.updateChecklistItem(orgId, id, item.id, { note }),
      () => this.noteFor.set(null),
    );
  }

  protected removeItem(item: ChecklistItem): void {
    if (item.system_key) {
      return;
    }
    this.mutate((orgId, id) => this.api.removeChecklistItem(orgId, id, item.id));
  }

  protected addItem(): void {
    const text = this.newText().trim();
    if (!text) {
      return;
    }
    this.mutate(
      (orgId, id) =>
        this.api.addChecklistItem(orgId, id, {
          text,
          category: this.newCategory(),
          required: this.newRequired(),
        }),
      () => this.newText.set(''),
    );
  }

  protected complete(): void {
    this.openRequired.set(null);
    this.mutate(
      (orgId, id) => this.api.completeChecklist(orgId, id),
      () => this.notifications.success('people.notices.checklistCompleted'),
    );
  }

  protected cancelChecklist(): void {
    this.mutate(
      (orgId, id) => this.api.cancelChecklist(orgId, id),
      () => {
        this.cancelling.set(false);
        this.notifications.success('people.notices.checklistCancelled');
      },
    );
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.checklist();
    if (!orgId || !c || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteChecklist(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(false);
        this.notifications.success('people.notices.checklistDeleted');
        void this.router.navigate(['/people/employees', c.employee_id]);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  private mutate(
    call: (orgId: string, id: string) => Observable<ChecklistDetail>,
    after?: () => void,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    call(orgId, this.id()).subscribe({
      next: (checklist) => {
        this.busy.set(false);
        this.checklist.set(checklist);
        this.refreshCount.update((n) => n + 1);
        after?.();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (peopleErrorCode(error) === 'assets_outstanding') {
          const assets = peopleErrorExtra(error, 'assets');
          this.assetsOutstanding.set(typeof assets === 'number' ? assets : 1);
          this.load(orgId, this.id());
          return;
        }
        if (peopleErrorCode(error) === 'checklist_incomplete') {
          const open = peopleErrorExtra(error, 'open_required');
          this.openRequired.set(typeof open === 'number' ? open : 1);
          return;
        }
        this.notifications.error(peopleErrorKey(error));
        const code = peopleErrorCode(error);
        if (code === 'checklist_closed' || code === 'item_automatic') {
          this.load(orgId, this.id());
        }
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.checklist()) {
      this.state.set('loading');
    }
    this.request = this.api.getChecklist(orgId, id).subscribe({
      next: (checklist) => {
        this.checklist.set(checklist);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(peopleErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
