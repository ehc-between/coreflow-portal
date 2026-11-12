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
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { PeopleApi } from './data/people-api';
import { checklistStatusTone, hasPerm } from './data/people-display';
import { peopleErrorCode, peopleErrorExtra, peopleErrorKey } from './data/people-errors';
import {
  ChecklistDetail,
  ChecklistItem,
  ITEM_CATEGORIES,
  ItemCategory,
  PERM_MANAGE,
  PERM_WRITE,
} from './data/people.models';
import { PeopleLessonLink } from './people-section-nav';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments', 'attachments'];

/**
 * An onboarding or offboarding checklist (`/people/checklists/:id`): the items by
 * category (access, equipment, confidentiality, ...), ticked off one by one, then
 * completed (blocked while required items are open) or cancelled. The work is a
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
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    ProgressBar,
    PeopleLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'people.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a
            routerLink="/people/checklists"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'people.common.backToChecklists' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (checklist(); as c) {
          <app-record-detail-layout
            entityType="people_checklist"
            [entityId]="c.id"
            [tabs]="tabs"
            [canEdit]="editable()"
            backLink="/people/checklists"
            backLabelKey="people.common.backToChecklists"
          >
            <div header>
              <p class="mb-1 text-[12.5px] text-fg-subtle">
                {{ 'people.checklistKinds.' + c.kind | transloco }} ·
                <a [routerLink]="['/people/employees', c.employee_id]" class="hover:underline"
                  >{{ c.employee_name }} ({{ c.employee_code }})</a
                >
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="checklist-heading"
              >
                {{ c.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="tone(c.status)" data-testid="checklist-status">{{
                  'people.checklistStatus.' + c.status | transloco
                }}</app-badge>
                @if (c.due_date) {
                  <span class="text-[13px] text-fg-muted">{{
                    'people.checklists.due' | transloco: { date: (c.due_date | localDay) }
                  }}</span>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button entityType="people_checklist" [entityId]="c.id" />
              <app-ask-about [prompt]="'people.ask.checklist' | transloco" />
              @if (editable()) {
                <app-button
                  size="sm"
                  (click)="complete()"
                  [loading]="busy()"
                  [disabled]="busy()"
                  data-testid="checklist-complete"
                >
                  <app-icon name="check" [size]="14" />
                  {{ 'people.checklists.complete' | transloco }}
                </app-button>
                <app-button size="sm" variant="ghost" (click)="cancelling.set(true)">
                  {{ 'people.checklists.cancel' | transloco }}
                </app-button>
              }
              @if (canManage()) {
                <app-button size="sm" variant="ghost" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  <span class="sr-only">{{ 'people.common.delete' | transloco }}</span>
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="people" page="checklistDetail" />

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

              <app-card>
                <div class="mb-3">
                  <app-progress-bar
                    [value]="c.items_total ? (c.items_done / c.items_total) * 100 : 0"
                    [label]="
                      'people.checklists.progress'
                        | transloco: { done: c.items_done, total: c.items_total }
                    "
                  />
                  <p class="mt-1 text-[12px] text-fg-subtle" data-testid="checklist-progress">
                    {{
                      'people.checklists.progress'
                        | transloco: { done: c.items_done, total: c.items_total }
                    }}
                    @if (c.required_open > 0) {
                      ·
                      {{ 'people.checklists.requiredOpen' | transloco: { count: c.required_open } }}
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
                      class="mb-1 text-[12.5px] font-semibold tracking-wide text-fg-subtle uppercase"
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
                            [disabled]="!editable() || busy()"
                            (change)="toggle(item, $any($event.target).checked)"
                            [attr.data-testid]="'item-' + item.id"
                          />
                          <div class="min-w-0 flex-1">
                            <label
                              [for]="'cf-item-' + item.id"
                              class="text-[13.5px] text-fg"
                              [class.line-through]="item.done"
                              [class.text-fg-muted]="item.done"
                            >
                              {{ item.text }}
                            </label>
                            @if (item.required) {
                              <span class="ml-1 text-[11.5px] text-fg-subtle">{{
                                'people.checklists.required' | transloco
                              }}</span>
                            }
                            @if (item.done && item.done_by) {
                              <p class="text-[11.5px] text-fg-subtle">
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
                              <p class="text-[12px] text-fg-muted">{{ item.note }}</p>
                            }
                          </div>
                          @if (editable()) {
                            <app-button size="sm" variant="ghost" (click)="openNote(item)">
                              {{ 'people.checklists.note' | transloco }}
                            </app-button>
                            <app-button size="sm" variant="ghost" (click)="removeItem(item)">
                              <app-icon name="trash" [size]="14" />
                              <span class="sr-only">{{
                                'people.checklists.removeItem' | transloco
                              }}</span>
                            </app-button>
                          }
                        </li>
                      }
                    </ul>
                  </section>
                }

                @if (editable()) {
                  <form
                    class="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end"
                    (submit)="$event.preventDefault(); addItem()"
                  >
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                      <label for="cf-new-item" class="text-[12px] font-semibold text-fg-muted">
                        {{ 'people.checklists.newItem' | transloco }}
                      </label>
                      <input
                        id="cf-new-item"
                        type="text"
                        maxlength="500"
                        class="h-9 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
                        [value]="newText()"
                        (input)="newText.set($any($event.target).value)"
                        data-testid="new-item-text"
                      />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label for="cf-new-cat" class="text-[12px] font-semibold text-fg-muted">
                        {{ 'people.fields.category' | transloco }}
                      </label>
                      <select
                        id="cf-new-cat"
                        class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
                        (change)="newCategory.set($any($event.target).value)"
                      >
                        @for (k of categories; track k) {
                          <option [value]="k" [selected]="newCategory() === k">
                            {{ 'people.itemCategories.' + k | transloco }}
                          </option>
                        }
                      </select>
                    </div>
                    <label class="flex h-9 items-center gap-2 text-[13px] text-fg">
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
                      size="sm"
                      variant="secondary"
                      [disabled]="!newText().trim() || busy()"
                    >
                      <app-icon name="plus" [size]="14" />
                      {{ 'people.checklists.addItem' | transloco }}
                    </app-button>
                  </form>
                  <app-field-help scope="people" page="checklistDetail" field="items" />
                }
              </app-card>
            </div>

            <ng-container aside>
              <app-card>
                <dl class="flex flex-col gap-2 text-[13px]">
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ c.owner?.name ?? ('people.common.none' | transloco) }}
                    </dd>
                  </div>
                  @if (c.task_id) {
                    <div>
                      <dt class="text-fg-subtle">{{ 'people.checklists.task' | transloco }}</dt>
                      <dd>
                        <a
                          [routerLink]="['/tasks', c.task_id]"
                          class="font-semibold text-accent hover:underline"
                          data-testid="checklist-task"
                          >{{ 'people.checklists.openTask' | transloco }}</a
                        >
                      </dd>
                    </div>
                  }
                </dl>
              </app-card>
              <app-supports-requirements entityType="people_checklist" [entityId]="c.id" />
              <app-why-it-matters scope="people" page="checklistDetail" />
              <app-people-lesson-link lesson="joiners-and-leavers" />
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
                class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-accent"
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
  protected readonly tone = checklistStatusTone;

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
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected toggle(item: ChecklistItem, done: boolean): void {
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
        after?.();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (peopleErrorCode(error) === 'checklist_incomplete') {
          const open = peopleErrorExtra(error, 'open_required');
          this.openRequired.set(typeof open === 'number' ? open : 1);
          return;
        }
        this.notifications.error(peopleErrorKey(error));
        if (peopleErrorCode(error) === 'checklist_closed') {
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
