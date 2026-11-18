import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import { OrgMember } from '../../../core/org/org.models';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { GuidanceApi } from '../../../core/guidance/guidance-api';
import { GuidanceContentService } from '../../../core/guidance/guidance-content.service';
import { LearningProgressItem } from '../../../core/guidance/guidance.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { lessonStatus } from '../lesson-catalog';

/**
 * `/settings/guidance/members/:userId`: one member's lesson-by-lesson progress
 * (`learning:read`). Lesson titles come from the guidance files when the scope is known.
 */
@Component({
  selector: 'app-member-progress',
  imports: [RouterLink, TranslocoPipe, LocalDatePipe, Alert, Badge, Card, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <app-page-header
        [title]="heading()"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: 'settings.hub.cards.guidance', link: '/settings/guidance' },
          { label: displayName() || heading() },
        ]"
      >
        @if (person(); as p) {
          <a
            secondary
            [routerLink]="p.url"
            class="text-ui font-semibold text-accent hover:underline"
            >{{ 'guidance.member.openPerson' | transloco }}</a
          >
        }
      </app-page-header>
      <p class="mb-4 max-w-3xl text-ui text-fg-muted">
        {{ 'guidance.member.trainingHint' | transloco }}
        <a routerLink="/training" class="font-semibold text-accent hover:underline">{{
          'guidance.member.openTraining' | transloco
        }}</a>
      </p>

      @if (!canRead()) {
        <app-card>
          <p class="px-2 py-8 text-center text-[14px] text-fg-muted">
            {{ 'guidance.settings.noAccess' | transloco }}
          </p>
        </app-card>
      } @else if (error()) {
        <app-alert>{{ 'guidance.settings.loadError' | transloco }}</app-alert>
      } @else if (loading()) {
        <p class="text-[13.5px] text-fg-muted">{{ 'guidance.loading' | transloco }}</p>
      } @else if (rows().length === 0) {
        <app-card>
          <p
            data-testid="member-progress-empty"
            class="px-2 py-8 text-center text-[14px] text-fg-muted"
          >
            {{ 'guidance.member.empty' | transloco }}
          </p>
        </app-card>
      } @else {
        <app-card [padded]="false">
          <div class="overflow-x-auto">
            <table class="w-full min-w-[620px] text-left text-[13px]">
              <thead>
                <tr class="border-b border-border text-[12px] text-fg-subtle">
                  <th scope="col" class="px-4 py-2.5 font-semibold">
                    {{ 'guidance.member.colLesson' | transloco }}
                  </th>
                  <th scope="col" class="px-3 py-2.5 font-semibold">
                    {{ 'guidance.member.colStatus' | transloco }}
                  </th>
                  <th scope="col" class="px-3 py-2.5 font-semibold">
                    {{ 'guidance.member.colCompleted' | transloco }}
                  </th>
                  <th scope="col" class="px-3 py-2.5 font-semibold">
                    {{ 'guidance.member.colQuiz' | transloco }}
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.item.id) {
                  <tr
                    data-testid="member-progress-row"
                    class="border-b border-border last:border-b-0"
                  >
                    <td class="px-4 py-2.5">
                      <div class="font-semibold text-fg">{{ row.title }}</div>
                    </td>
                    <td class="px-3 py-2.5">
                      <app-badge [tone]="row.status === 'completed' ? 'pass' : 'info'">
                        {{ 'guidance.status.' + row.status | transloco }}
                      </app-badge>
                    </td>
                    <td class="px-3 py-2.5 text-fg-muted">
                      @if (row.item.completed_at) {
                        {{ row.item.completed_at | localDate }}
                      } @else {
                        {{ 'guidance.member.notYet' | transloco }}
                      }
                    </td>
                    <td class="px-3 py-2.5">
                      @if (row.item.attempts > 0) {
                        <app-badge [tone]="row.item.quiz_passed ? 'pass' : 'warn'">
                          {{
                            (row.item.quiz_passed
                              ? 'guidance.quiz.passedBadge'
                              : 'guidance.quiz.attempts'
                            ) | transloco: { score: row.item.quiz_score, count: row.item.attempts }
                          }}
                        </app-badge>
                      } @else {
                        <span class="text-fg-subtle">{{
                          'guidance.member.noQuiz' | transloco
                        }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </app-card>
      }
    </div>
  `,
})
export class MemberProgress {
  private readonly api = inject(GuidanceApi);
  private readonly content = inject(GuidanceContentService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly membersApi = inject(OrgMembersApi);
  private readonly language = inject(LanguageService);
  /** The org member (for the email fallback and the People-register link). */
  protected readonly member = signal<OrgMember | null>(null);
  protected readonly person = computed(() => this.member()?.person ?? null);
  /** Name, else email (never "member without a name"). */
  protected readonly displayName = computed(
    () => this.name()?.trim() || this.member()?.full_name?.trim() || this.member()?.email || '',
  );
  protected readonly heading = computed(() => {
    const name = this.displayName();
    return name
      ? this.language.translate('guidance.member.title', { name })
      : this.language.translate('guidance.member.titleUnnamed');
  });

  /** Route param (component input binding). */
  readonly userId = input.required<string>();

  protected readonly canRead = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('learning:read'),
  );
  protected readonly items = signal<readonly LearningProgressItem[]>([]);
  protected readonly name = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  protected readonly rows = computed(() =>
    this.items().map((item) => {
      const dot = item.lesson_key.indexOf('.');
      const scope = item.lesson_key.slice(0, dot);
      const key = item.lesson_key.slice(dot + 1);
      return {
        item,
        title: this.content.readLesson(scope, key)?.title ?? this.humanKey(key),
        status: lessonStatus(item),
      };
    }),
  );

  private subs: Subscription[] = [];

  constructor() {
    providePageContext(() => ({
      module: null,
      entityType: 'learning_progress',
      view: 'detail',
      title: this.heading(),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const userId = this.userId();
      const canRead = this.canRead();
      untracked(() => this.load(orgId, userId, canRead));
    });
  }

  private load(orgId: string | null, userId: string, canRead: boolean): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.items.set([]);
    this.name.set(null);
    this.error.set(false);
    this.loading.set(true);
    if (!orgId || !canRead) {
      this.loading.set(false);
      return;
    }
    this.subs = [
      this.api.listProgress(orgId, { userId }).subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      }),
      this.api.summary(orgId).subscribe({
        next: (res) => this.name.set(res.items.find((r) => r.user_id === userId)?.name ?? null),
        error: () => undefined,
      }),
      this.membersApi
        .listMembers(orgId)
        .pipe(catchError(() => of([] as OrgMember[])))
        .subscribe((members) => this.member.set(members.find((m) => m.user_id === userId) ?? null)),
    ];
  }

  /** A lesson whose guidance file is not loaded yet: "first-document" → "First document". */
  private humanKey(key: string): string {
    const text = key.replace(/[-_]/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}
