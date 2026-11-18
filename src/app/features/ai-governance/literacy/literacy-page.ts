import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { Term } from '../../../shared/guidance/term';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { startOfDay, todayDay } from '../../../shared/tasks/task-display';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Pager } from '../../../shared/ui/pager/pager';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import {
  LITERACY_SOURCES,
  LiteracyCoverage,
  LiteracyRecord,
  LiteracySource,
  LiteracyUser,
} from '../data/ai-governance.models';
import { AI_GOVERNANCE_MODULE, literacySourceKey } from '../data/ai-governance-display';
import { AiField } from '../ui/ai-field';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiUserSelect } from '../ui/user-select';

const PAGE_SIZE = 25;
/** People shown before "Vis alle (n)". */
export const PEOPLE_PREVIEW = 12;

interface Draft {
  topic: string;
  source: LiteracySource;
  completed: string;
  valid_until: string;
  notes: string;
}

const emptyDraft = (): Draft => ({
  topic: '',
  source: 'training',
  completed: todayDay(),
  valid_until: '',
  notes: '',
});

/** People matching a search (name or department), case-insensitive. */
export function filterPeople(people: readonly LiteracyUser[], q: string): LiteracyUser[] {
  const needle = q.trim().toLowerCase();
  if (!needle) {
    return [...people];
  }
  return people.filter(
    (p) =>
      p.name.toLowerCase().includes(needle) || (p.department ?? '').toLowerCase().includes(needle),
  );
}

/**
 * `/ai-governance/literacy`: AI literacy (Art. 4, ISO/IEC 42001 7.2). Coverage
 * of the people in scope (everyone, or only those who own or oversee AI
 * systems — set in the settings), who is missing or expired (name and
 * department, searchable), the Training courses tagged "AI literacy" whose
 * completions count automatically, and the records list. Briefings and
 * external courses are recorded here in a side panel.
 */
@Component({
  selector: 'app-ai-literacy-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    TeachingEmpty,
    Term,
    LocalDayPipe,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    Icon,
    KpiTile,
    LoadingState,
    Pager,
    ProgressBar,
    SlideOver,
    StatusBadge,
    AiField,
    AiGovPage,
    AiUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.literacy.title"
      descriptionKey="aiGovernance.literacy.subtitle"
      [breadcrumbs]="[{ labelKey: 'aiGovernance.literacy.title' }]"
      page="literacy"
      lesson="ai-literacy"
    >
      @if (store.canWrite()) {
        <app-button primary size="sm" (click)="openForm()" data-testid="literacy-new">
          <app-icon name="plus" [size]="14" />
          {{ 'aiGovernance.literacy.record' | transloco }}
        </app-button>
      }
      <a
        secondary
        [routerLink]="trainingLink()"
        class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2"
        data-testid="literacy-training"
      >
        {{ 'aiGovernance.literacy.toTraining' | transloco }}
      </a>

      @if (coverageError()) {
        <app-error-state (retry)="reload.update((n) => n + 1)" />
      } @else if (coverage(); as c) {
        <div class="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <app-kpi-tile
            [label]="'aiGovernance.literacy.coverage' | transloco"
            [value]="c.coverage + ' %'"
            [tone]="c.coverage >= 80 ? 'pass' : 'accent'"
          />
          <app-kpi-tile
            [label]="'aiGovernance.literacy.covered' | transloco"
            [value]="c.covered"
            tone="pass"
            [delta]="
              c.covered_by_training
                ? ('aiGovernance.literacy.viaTraining'
                  | transloco: { count: c.covered_by_training })
                : ''
            "
            deltaTone="neutral"
          />
          <app-kpi-tile
            [label]="'aiGovernance.literacy.expired' | transloco"
            [value]="c.expired"
            [tone]="c.expired ? 'warn' : 'neutral'"
          />
          <app-kpi-tile
            [label]="'aiGovernance.literacy.missing' | transloco"
            [value]="c.missing"
            [tone]="c.missing ? 'warn' : 'neutral'"
          />
        </div>

        <app-card class="mb-5" data-testid="literacy-coverage">
          <p class="mb-2 text-ui font-semibold text-fg">
            {{
              'aiGovernance.literacy.coverageOf'
                | transloco: { covered: c.covered, total: c.members_total }
            }}
          </p>
          <app-progress-bar
            [value]="c.coverage"
            [label]="
              'aiGovernance.literacy.coverageOf'
                | transloco: { covered: c.covered, total: c.members_total }
            "
          />
          <p class="mt-2 text-meta text-fg-muted" data-testid="literacy-scope">
            {{ 'aiGovernance.literacy.scope.' + (c.scope ?? 'all') | transloco }}
            @if (store.canManage()) {
              <a
                routerLink="/settings/modules/ai-governance"
                class="font-semibold text-accent hover:underline"
                >{{ 'aiGovernance.literacy.changeScope' | transloco }}</a
              >
            }
          </p>

          @if (people().length) {
            <div class="mt-4 border-t border-border pt-4">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-card font-semibold text-fg">
                  {{
                    'aiGovernance.literacy.needsAttention' | transloco: { count: people().length }
                  }}
                </h2>
                @if (people().length > preview) {
                  <label class="sr-only" for="lit-search">{{
                    'aiGovernance.literacy.searchPeople' | transloco
                  }}</label>
                  <input
                    id="lit-search"
                    type="search"
                    class="h-9 w-full max-w-[260px] rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                    [placeholder]="'aiGovernance.literacy.searchPeople' | transloco"
                    [value]="peopleQuery()"
                    (input)="peopleQuery.set($any($event.target).value)"
                  />
                }
              </div>
              <ul
                class="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3"
                data-testid="literacy-people"
              >
                @for (p of shownPeople(); track p.user.id) {
                  <li
                    class="flex min-h-10 items-center justify-between gap-2 rounded-tile border px-3 py-1.5"
                    [class]="p.expired ? 'border-warn/40 bg-warn-soft' : 'border-border'"
                  >
                    <span class="min-w-0">
                      <span class="block truncate text-ui font-semibold text-fg">{{
                        p.user.name
                      }}</span>
                      <span class="block truncate text-meta text-fg-muted">
                        {{
                          p.user.department || ('aiGovernance.literacy.noDepartment' | transloco)
                        }}
                        @if (p.expired) {
                          · {{ 'aiGovernance.literacy.expiredOne' | transloco }}
                        }
                      </span>
                    </span>
                    @if (store.canWrite()) {
                      <app-button
                        size="sm"
                        variant="ghost"
                        [attr.aria-label]="
                          'aiGovernance.literacy.recordFor' | transloco: { name: p.user.name }
                        "
                        (click)="openForm(p.user.id)"
                      >
                        <app-icon name="plus" [size]="13" />
                      </app-button>
                    }
                  </li>
                } @empty {
                  <li class="text-ui text-fg-muted">
                    {{ 'aiGovernance.picker.noResults' | transloco }}
                  </li>
                }
              </ul>
              @if (filteredPeople().length > preview && !showAll()) {
                <app-button
                  class="mt-2"
                  size="sm"
                  variant="ghost"
                  (click)="showAll.set(true)"
                  data-testid="literacy-show-all"
                >
                  {{
                    'aiGovernance.literacy.showAll' | transloco: { count: filteredPeople().length }
                  }}
                </app-button>
              }
            </div>
          }
        </app-card>

        <app-card class="mb-5" data-testid="literacy-courses">
          <h2 class="mb-1 text-card font-semibold text-fg">
            {{ 'aiGovernance.literacy.courses' | transloco }}
          </h2>
          @if (c.training_courses?.length) {
            <p class="mb-2 text-meta text-fg-muted">
              {{ 'aiGovernance.literacy.coursesHint' | transloco }}
            </p>
            <ul class="flex flex-col gap-1">
              @for (course of c.training_courses; track course.id) {
                <li>
                  <a
                    [routerLink]="course.url"
                    class="inline-flex min-h-6 items-center gap-1.5 text-ui font-semibold text-accent hover:underline"
                  >
                    <span class="font-mono text-meta text-fg-subtle">{{ course.code }}</span>
                    {{ course.title }}
                  </a>
                </li>
              }
            </ul>
          } @else {
            <p class="text-ui text-fg-muted">
              {{ 'aiGovernance.literacy.noCourses' | transloco }}
            </p>
          }
        </app-card>
      } @else {
        <app-loading-state class="mb-5" [rows]="2" />
      }

      <h2 class="mb-2 font-display text-section font-bold text-fg">
        {{ 'aiGovernance.literacy.records' | transloco }}
      </h2>
      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="4" />
          }
          @case ('error') {
            <app-error-state (retry)="reload.update((n) => n + 1)" />
          }
          @default {
            @if (records().length === 0) {
              <app-teaching-empty
                scope="ai-governance"
                page="literacy"
                [showAction]="store.canWrite()"
                (action)="openForm()"
              />
            } @else {
              <ul class="divide-y divide-border" data-testid="literacy-list">
                @for (r of records(); track r.id) {
                  <li class="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="text-body font-semibold text-fg">{{ r.user.name }}</p>
                      <p class="text-meta text-fg-muted">
                        {{ r.topic }} · {{ sourceKey(r.source) | transloco }} ·
                        {{ r.completed_at | localDay }}
                      </p>
                    </div>
                    <span class="flex items-center gap-2 text-meta text-fg-muted">
                      @if (r.valid_until) {
                        {{
                          'aiGovernance.literacy.validUntil'
                            | transloco: { date: (r.valid_until | localDay) }
                        }}
                      }
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="r.valid ? 'effective' : 'expired'"
                        [labelKey]="
                          r.valid
                            ? 'aiGovernance.literacy.valid'
                            : 'aiGovernance.literacy.expiredOne'
                        "
                      />
                      @if (store.canWrite()) {
                        <button
                          type="button"
                          class="inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-subtle hover:text-fail-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                          [attr.aria-label]="
                            'aiGovernance.literacy.delete'
                              | transloco: { name: r.user.name, topic: r.topic }
                          "
                          (click)="pendingDelete.set(r)"
                        >
                          <app-icon name="trash" [size]="14" />
                        </button>
                      }
                    </span>
                  </li>
                }
              </ul>
              <div class="border-t border-border px-4 py-2.5">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="records().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>
      <p class="mt-3 text-meta text-fg-muted">
        <app-term scope="ai-governance" key="ai-literacy">{{
          'aiGovernance.literacy.termLink' | transloco
        }}</app-term>
      </p>
    </app-ai-gov-page>

    <app-slide-over
      [open]="formOpen()"
      [title]="'aiGovernance.literacy.formTitle' | transloco"
      [closeLabel]="'aiGovernance.common.close' | transloco"
      (closed)="formOpen.set(false)"
    >
      <form
        class="flex flex-col gap-4"
        (submit)="$event.preventDefault(); save()"
        novalidate
        data-testid="literacy-form"
      >
        <app-ai-field
          inputId="lit-user"
          labelKey="aiGovernance.literacy.person"
          [required]="true"
          [plain]="true"
        >
          <app-ai-user-select
            selectId="lit-user"
            noneKey="aiGovernance.literacy.pickPerson"
            [required]="true"
            [(value)]="userId"
          />
        </app-ai-field>
        <app-ai-field
          inputId="lit-topic"
          labelKey="aiGovernance.literacy.topic"
          [required]="true"
          helpPage="literacy"
          helpField="topic"
        >
          <input
            id="lit-topic"
            type="text"
            required
            maxlength="200"
            [placeholder]="'aiGovernance.literacy.topicPlaceholder' | transloco"
            [value]="draft().topic"
            (input)="patch({ topic: $any($event.target).value })"
          />
        </app-ai-field>
        <app-ai-field inputId="lit-source" labelKey="aiGovernance.literacy.source">
          <select id="lit-source" (change)="patch({ source: $any($event.target).value })">
            @for (s of sources; track s) {
              <option [value]="s" [selected]="draft().source === s">
                {{ sourceKey(s) | transloco }}
              </option>
            }
          </select>
        </app-ai-field>
        <app-ai-field
          inputId="lit-completed"
          labelKey="aiGovernance.literacy.completedAt"
          [required]="true"
        >
          <input
            id="lit-completed"
            type="date"
            required
            [value]="draft().completed"
            (input)="patch({ completed: $any($event.target).value })"
          />
        </app-ai-field>
        <app-ai-field inputId="lit-valid" labelKey="aiGovernance.literacy.validUntilLabel">
          <input
            id="lit-valid"
            type="date"
            [value]="draft().valid_until"
            (input)="patch({ valid_until: $any($event.target).value })"
          />
          <span hint>{{ 'aiGovernance.literacy.validUntilHint' | transloco }}</span>
        </app-ai-field>
        <app-ai-field inputId="lit-notes" labelKey="aiGovernance.literacy.notes">
          <textarea
            id="lit-notes"
            rows="3"
            maxlength="4000"
            [value]="draft().notes"
            (input)="patch({ notes: $any($event.target).value })"
          ></textarea>
        </app-ai-field>
        @if (formError()) {
          <p class="text-meta font-semibold text-fail-ink" role="alert">
            {{ formError()! | transloco }}
          </p>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="secondary" (click)="formOpen.set(false)">{{
            'aiGovernance.common.cancel' | transloco
          }}</app-button>
          <app-button
            type="submit"
            [loading]="saving()"
            [disabled]="!userId() || !draft().topic.trim() || !draft().completed"
          >
            {{ 'aiGovernance.common.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>

    <app-confirm-dialog
      [open]="!!pendingDelete()"
      [title]="'aiGovernance.literacy.deleteTitle' | transloco"
      [message]="
        'aiGovernance.literacy.deleteMessage'
          | transloco: { name: pendingDelete()?.user?.name ?? '' }
      "
      [confirmLabel]="'aiGovernance.common.delete' | transloco"
      [cancelLabel]="'aiGovernance.common.cancel' | transloco"
      confirmVariant="danger"
      [busy]="deleting()"
      (confirmed)="remove()"
      (cancelled)="pendingDelete.set(null)"
    />
  `,
})
export class AiLiteracyPage {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly sources = LITERACY_SOURCES;
  protected readonly sourceKey = literacySourceKey;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly preview = PEOPLE_PREVIEW;

  protected readonly coverage = signal<LiteracyCoverage | null>(null);
  protected readonly coverageError = signal(false);
  protected readonly records = signal<readonly LiteracyRecord[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly formOpen = signal(false);
  protected readonly userId = signal('');
  protected readonly draft = signal<Draft>(emptyDraft());
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly pendingDelete = signal<LiteracyRecord | null>(null);
  protected readonly deleting = signal(false);
  protected readonly peopleQuery = signal('');
  protected readonly showAll = signal(false);
  protected readonly reload = signal(0);

  /** Missing first, then expired. */
  protected readonly people = computed(() => {
    const c = this.coverage();
    if (!c) {
      return [];
    }
    return [
      ...c.missing_users.map((user) => ({ user, expired: false })),
      ...c.expired_users.map((user) => ({ user, expired: true })),
    ];
  });
  protected readonly filteredPeople = computed(() => {
    const matching = new Set(
      filterPeople(
        this.people().map((p) => p.user),
        this.peopleQuery(),
      ).map((u) => u.id),
    );
    return this.people().filter((p) => matching.has(p.user.id));
  });
  protected readonly shownPeople = computed(() =>
    this.showAll() || this.peopleQuery().trim()
      ? this.filteredPeople()
      : this.filteredPeople().slice(0, PEOPLE_PREVIEW),
  );
  /** Deep link to the AI literacy course when there is exactly one, else Training. */
  protected readonly trainingLink = computed(() => {
    const courses = this.coverage()?.training_courses ?? [];
    return courses.length === 1 ? courses[0].url : '/training';
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      view: 'list',
      title: this.language.translate('aiGovernance.literacy.title'),
      requirements: ['eu_ai_act:4', 'iso42001:7.2'],
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const offset = this.offset();
      this.reload();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.coverageError.set(false);
        this.api.literacyCoverage(orgId).subscribe({
          next: (c) => this.coverage.set(c),
          error: () => this.coverageError.set(true),
        });
        this.api.listLiteracy(orgId, { limit: PAGE_SIZE, offset }).subscribe({
          next: (page) => {
            this.records.set(page.items);
            this.total.set(page.total);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected openForm(userId = ''): void {
    this.draft.set(emptyDraft());
    this.userId.set(userId);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !this.userId() || !d.topic.trim() || !d.completed || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    this.api
      .addLiteracy(orgId, {
        user_id: this.userId(),
        topic: d.topic.trim(),
        source: d.source,
        completed_at: startOfDay(d.completed),
        valid_until: d.valid_until ? startOfDay(d.valid_until) : null,
        notes: d.notes.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.notifications.success('aiGovernance.literacy.saved');
          this.reload.update((n) => n + 1);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.formError.set(aiGovernanceErrorKey(err));
        },
      });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const record = this.pendingDelete();
    if (!orgId || !record) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteLiteracy(orgId, record.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
