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
import { Subscription } from 'rxjs';
import { GuidanceApi } from '../../../core/guidance/guidance-api';
import { GuidanceLevel, MemberLearningSummary } from '../../../core/guidance/guidance.models';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LevelPicker } from '../../../shared/guidance/level-picker';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { LESSON_SCOPES, matchesQuery } from '../lesson-catalog';

export type SummarySort = 'name' | 'completed' | 'quizzes' | 'activity';

/** Sort member rows; ties fall back to name. */
export function sortSummary(
  rows: readonly MemberLearningSummary[],
  sort: SummarySort,
): MemberLearningSummary[] {
  const name = (r: MemberLearningSummary) => r.name ?? '';
  const byName = (a: MemberLearningSummary, b: MemberLearningSummary) =>
    name(a).localeCompare(name(b));
  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'completed':
        return b.lessons_completed - a.lessons_completed || byName(a, b);
      case 'quizzes':
        return b.quizzes_passed - a.quizzes_passed || byName(a, b);
      case 'activity':
        return (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '') || byName(a, b);
      default:
        return byName(a, b);
    }
  });
}

/**
 * `/settings/guidance`: the organisation's default learning level (`org:manage`) and
 * the members' learning progress (`learning:read`), with search, sort and a scope
 * filter. Reloads when the selected org changes.
 */
@Component({
  selector: 'app-guidance-settings',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    GuideIntro,
    LevelPicker,
    TeachingEmpty,
    WhyItMatters,
    LocalDatePipe,
    Alert,
    Button,
    Card,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/settings"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="15" />
        {{ 'guidance.settings.backToSettings' | transloco }}
      </a>
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'guidance.settings.title' | transloco }}
        </h1>
        <div class="mt-1.5 text-[14px] text-fg-muted">
          {{ 'guidance.settings.subtitle' | transloco }}
        </div>
      </div>

      <div class="mb-5 flex flex-col gap-3">
        <app-guide-intro scope="platform" page="guidance-settings" />
        <app-why-it-matters scope="platform" page="guidance-settings" />
      </div>

      @if (!orgId()) {
        <app-card>
          <p class="px-2 py-8 text-center text-[14px] text-fg-muted">
            {{ 'guidance.settings.noOrg' | transloco }}
          </p>
        </app-card>
      } @else if (!canManage() && !canReadLearning()) {
        <app-card>
          <p
            data-testid="guidance-no-access"
            class="px-2 py-8 text-center text-[14px] text-fg-muted"
          >
            {{ 'guidance.settings.noAccess' | transloco }}
          </p>
        </app-card>
      } @else {
        <div class="grid gap-5 lg:grid-cols-[340px_1fr]">
          <section data-testid="org-default-level" aria-labelledby="org-default-title">
            <div class="mb-1 flex items-center gap-2">
              <h2
                id="org-default-title"
                class="font-display text-[18px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'guidance.settings.defaultTitle' | transloco }}
              </h2>
              <app-field-help scope="platform" page="guidance-settings" field="default_level" />
            </div>
            <p class="mb-3 text-[13px] text-fg-muted">
              {{ 'guidance.settings.defaultHint' | transloco }}
            </p>
            @if (defaultError()) {
              <app-alert>{{ 'guidance.settings.loadError' | transloco }}</app-alert>
            } @else {
              <app-level-picker
                legendKey="guidance.settings.defaultTitle"
                [value]="draftDefault()"
                [disabled]="!canManage() || savingDefault() || draftDefault() === null"
                (valueChange)="draftDefault.set($event)"
              />
              @if (canManage()) {
                <div class="mt-3 flex items-center gap-2">
                  <app-button
                    data-testid="save-default"
                    [loading]="savingDefault()"
                    [disabled]="!defaultDirty()"
                    (click)="saveDefault()"
                  >
                    {{ 'guidance.settings.save' | transloco }}
                  </app-button>
                </div>
              } @else {
                <p class="mt-2 text-[12.5px] text-fg-subtle">
                  {{ 'guidance.settings.readOnly' | transloco }}
                </p>
              }
            }
          </section>

          @if (canReadLearning()) {
            <section data-testid="member-learning" aria-labelledby="member-learning-title">
              <h2
                id="member-learning-title"
                class="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'guidance.settings.membersTitle' | transloco }}
              </h2>
              <div class="mb-3 flex flex-wrap gap-2">
                <input
                  type="search"
                  data-testid="member-search"
                  class="h-9 min-w-0 flex-1 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
                  [attr.aria-label]="'guidance.settings.searchMembers' | transloco"
                  [placeholder]="'guidance.settings.searchMembers' | transloco"
                  [value]="query()"
                  (input)="query.set($any($event.target).value)"
                />
                <select
                  data-testid="member-scope"
                  class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13.5px] text-fg outline-none focus:border-accent"
                  [attr.aria-label]="'guidance.settings.filterScope' | transloco"
                  [value]="scopeFilter()"
                  (change)="setScope($any($event.target).value)"
                >
                  <option value="">{{ 'guidance.settings.allScopes' | transloco }}</option>
                  @for (scope of scopes; track scope) {
                    <option [value]="scope">{{ 'guidance.scopes.' + scope | transloco }}</option>
                  }
                </select>
                <select
                  data-testid="member-sort"
                  class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13.5px] text-fg outline-none focus:border-accent"
                  [attr.aria-label]="'guidance.centre.sort' | transloco"
                  [value]="sort()"
                  (change)="sort.set($any($event.target).value)"
                >
                  <option value="name">{{ 'guidance.settings.sortName' | transloco }}</option>
                  <option value="completed">
                    {{ 'guidance.settings.sortCompleted' | transloco }}
                  </option>
                  <option value="quizzes">{{ 'guidance.settings.sortQuizzes' | transloco }}</option>
                  <option value="activity">
                    {{ 'guidance.settings.sortActivity' | transloco }}
                  </option>
                </select>
              </div>

              <app-card [padded]="false">
                @if (summaryLoading()) {
                  <p class="px-4 py-8 text-center text-[13.5px] text-fg-muted">
                    {{ 'guidance.loading' | transloco }}
                  </p>
                } @else if (summaryError()) {
                  <div class="p-4">
                    <app-alert>{{ 'guidance.settings.loadError' | transloco }}</app-alert>
                  </div>
                } @else if (summary().length === 0) {
                  <app-teaching-empty
                    scope="platform"
                    page="guidance-settings"
                    [showAction]="false"
                  />
                } @else if (rows().length === 0) {
                  <p class="px-4 py-8 text-center text-[13.5px] text-fg-muted">
                    {{ 'guidance.settings.noMatches' | transloco }}
                  </p>
                } @else {
                  <div class="overflow-x-auto">
                    <table class="w-full min-w-[560px] text-left text-[13px]">
                      <thead>
                        <tr class="border-b border-border text-[12px] text-fg-subtle">
                          <th scope="col" class="px-4 py-2.5 font-semibold">
                            {{ 'guidance.settings.colMember' | transloco }}
                          </th>
                          <th scope="col" class="px-3 py-2.5 text-right font-semibold">
                            {{ 'guidance.settings.colSeen' | transloco }}
                          </th>
                          <th scope="col" class="px-3 py-2.5 text-right font-semibold">
                            {{ 'guidance.settings.colCompleted' | transloco }}
                          </th>
                          <th scope="col" class="px-3 py-2.5 text-right font-semibold">
                            {{ 'guidance.settings.colQuizzes' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-2.5 font-semibold">
                            {{ 'guidance.settings.colLastActivity' | transloco }}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (row of rows(); track row.user_id) {
                          <tr
                            data-testid="member-row"
                            class="border-b border-border last:border-b-0 hover:bg-surface-2"
                          >
                            <td class="px-4 py-2.5">
                              <a
                                [routerLink]="['/settings/guidance/members', row.user_id]"
                                class="font-semibold text-accent hover:underline"
                              >
                                {{ row.name || ('guidance.settings.unnamed' | transloco) }}
                              </a>
                            </td>
                            <td class="px-3 py-2.5 text-right tabular-nums">
                              {{ row.lessons_seen }}
                            </td>
                            <td class="px-3 py-2.5 text-right tabular-nums">
                              {{ row.lessons_completed }}
                            </td>
                            <td class="px-3 py-2.5 text-right tabular-nums">
                              {{ row.quizzes_passed }}
                            </td>
                            <td class="px-4 py-2.5 text-fg-muted">
                              @if (row.last_activity_at) {
                                {{ row.last_activity_at | localDate: 'medium' }}
                              } @else {
                                {{ 'guidance.settings.never' | transloco }}
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </app-card>
            </section>
          }
        </div>
      }
    </div>
  `,
})
export class GuidanceSettings {
  private readonly api = inject(GuidanceApi);
  private readonly guidance = inject(GuidanceService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);

  protected readonly scopes = LESSON_SCOPES;
  protected readonly orgId = this.selectedOrg.currentOrgId;
  private readonly permissions = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );
  protected readonly canManage = computed(() => this.permissions().has('org:manage'));
  protected readonly canReadLearning = computed(() => this.permissions().has('learning:read'));

  /** Saved default; `draftDefault` is the picker's current choice. */
  private readonly savedDefault = signal<GuidanceLevel | null>(null);
  protected readonly draftDefault = signal<GuidanceLevel | null>(null);
  protected readonly defaultError = signal(false);
  protected readonly savingDefault = signal(false);
  protected readonly defaultDirty = computed(
    () => this.draftDefault() !== null && this.draftDefault() !== this.savedDefault(),
  );

  protected readonly summary = signal<readonly MemberLearningSummary[]>([]);
  protected readonly summaryLoading = signal(false);
  protected readonly summaryError = signal(false);
  protected readonly query = signal('');
  protected readonly scopeFilter = signal('');
  protected readonly sort = signal<SummarySort>('name');
  protected readonly rows = computed(() =>
    sortSummary(
      this.summary().filter((r) => matchesQuery(r.name ?? '', this.query())),
      this.sort(),
    ),
  );

  private subs: Subscription[] = [];

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      const canRead = this.canReadLearning();
      untracked(() => this.load(orgId, canRead));
    });
  }

  protected setScope(scope: string): void {
    this.scopeFilter.set(scope);
    const orgId = this.orgId();
    if (orgId && this.canReadLearning()) {
      this.loadSummary(orgId);
    }
  }

  protected saveDefault(): void {
    const orgId = this.orgId();
    const level = this.draftDefault();
    if (!orgId || !level || !this.defaultDirty() || this.savingDefault()) {
      return;
    }
    this.savingDefault.set(true);
    this.api.updateOrgGuidance(orgId, level).subscribe({
      next: (res) => {
        this.savingDefault.set(false);
        this.savedDefault.set(res.default_level);
        this.draftDefault.set(res.default_level);
        this.guidance.reload();
        this.toasts.success('guidance.settings.saved');
      },
      error: () => {
        this.savingDefault.set(false);
        this.toasts.error('guidance.settings.saveFailed');
      },
    });
  }

  private load(orgId: string | null, canRead: boolean): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.subs = [];
    this.savedDefault.set(null);
    this.draftDefault.set(null);
    this.defaultError.set(false);
    this.summary.set([]);
    this.summaryError.set(false);
    if (!orgId) {
      return;
    }
    this.subs.push(
      this.api.getOrgGuidance(orgId).subscribe({
        next: (res) => {
          this.savedDefault.set(res.default_level);
          this.draftDefault.set(res.default_level);
        },
        error: () => this.defaultError.set(true),
      }),
    );
    if (canRead) {
      this.loadSummary(orgId);
    }
  }

  private loadSummary(orgId: string): void {
    this.summaryLoading.set(true);
    this.summaryError.set(false);
    this.subs.push(
      this.api.summary(orgId, this.scopeFilter() || null).subscribe({
        next: (res) => {
          this.summary.set(res.items);
          this.summaryLoading.set(false);
        },
        error: () => {
          this.summaryLoading.set(false);
          this.summaryError.set(true);
        },
      }),
    );
  }
}
