import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, concatMap, from, toArray } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { pluralKey } from '../../../shared/i18n/plural';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ContextApi } from '../data/context-api';
import { PartyCategory } from '../data/context.models';
import {
  INTERVIEW_PARTIES,
  InterviewAnswers,
  PlannedRecord,
  emptyAnswers,
  interviewPlan,
} from './interview-plan';

/**
 * `/context/interview` (U34): four plain questions that draft the context analysis,
 * the interested parties and the scope. The person sees every record before it is
 * made, and everything is created as a draft that still needs their approval.
 */
@Component({
  selector: 'app-context-interview',
  imports: [TranslocoPipe, Button, Card, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[820px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="context.interview.title"
        descriptionKey="context.interview.intro"
        [breadcrumbs]="crumbs"
      />
      <form
        class="flex flex-col gap-5"
        data-testid="context-interview"
        (submit)="$event.preventDefault(); create()"
      >
        <app-card>
          <label for="ci-what" class="block font-display text-card font-bold text-fg">
            1. {{ 'context.interview.q1' | transloco }}
          </label>
          <p class="mt-1 text-meta text-fg-muted">{{ 'context.interview.q1Hint' | transloco }}</p>
          <textarea
            id="ci-what"
            rows="3"
            class="mt-2 w-full rounded-tile border border-border bg-bg p-2 text-ui text-fg"
            [value]="answers().what"
            (input)="patch({ what: $any($event.target).value })"
            data-testid="ci-what"
          ></textarea>
        </app-card>

        <app-card>
          <fieldset>
            <legend class="font-display text-card font-bold text-fg">
              2. {{ 'context.interview.q2' | transloco }}
            </legend>
            <p class="mt-1 text-meta text-fg-muted">{{ 'context.interview.q2Hint' | transloco }}</p>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              @for (category of partyOptions; track category) {
                <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
                  <input
                    type="checkbox"
                    [checked]="answers().parties.includes(category)"
                    (change)="toggleParty(category)"
                    [attr.data-testid]="'ci-party-' + category"
                  />
                  {{ 'context.partyCategories.' + category | transloco }}
                </label>
              }
            </div>
            <label for="ci-other" class="mt-3 block text-ui font-semibold text-fg">
              {{ 'context.interview.otherParties' | transloco }}
            </label>
            <textarea
              id="ci-other"
              rows="2"
              class="mt-1 w-full rounded-tile border border-border bg-bg p-2 text-ui text-fg"
              [placeholder]="'context.interview.onePerLine' | transloco"
              [value]="answers().otherParties"
              (input)="patch({ otherParties: $any($event.target).value })"
            ></textarea>
          </fieldset>
        </app-card>

        <app-card>
          <fieldset>
            <legend class="font-display text-card font-bold text-fg">
              3. {{ 'context.interview.q3' | transloco }}
            </legend>
            <p class="mt-1 text-meta text-fg-muted">{{ 'context.interview.q3Hint' | transloco }}</p>
            <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label for="ci-helps" class="block text-ui font-semibold text-fg">
                  {{ 'context.interview.helps' | transloco }}
                </label>
                <textarea
                  id="ci-helps"
                  rows="4"
                  class="mt-1 w-full rounded-tile border border-border bg-bg p-2 text-ui text-fg"
                  [placeholder]="'context.interview.onePerLine' | transloco"
                  [value]="answers().helps"
                  (input)="patch({ helps: $any($event.target).value })"
                  data-testid="ci-helps"
                ></textarea>
              </div>
              <div>
                <label for="ci-hinders" class="block text-ui font-semibold text-fg">
                  {{ 'context.interview.hinders' | transloco }}
                </label>
                <textarea
                  id="ci-hinders"
                  rows="4"
                  class="mt-1 w-full rounded-tile border border-border bg-bg p-2 text-ui text-fg"
                  [placeholder]="'context.interview.onePerLine' | transloco"
                  [value]="answers().hinders"
                  (input)="patch({ hinders: $any($event.target).value })"
                ></textarea>
              </div>
            </div>
          </fieldset>
        </app-card>

        <app-card>
          <label for="ci-covers" class="block font-display text-card font-bold text-fg">
            4. {{ 'context.interview.q4' | transloco }}
          </label>
          <p class="mt-1 text-meta text-fg-muted">{{ 'context.interview.q4Hint' | transloco }}</p>
          <textarea
            id="ci-covers"
            rows="3"
            class="mt-2 w-full rounded-tile border border-border bg-bg p-2 text-ui text-fg"
            [value]="answers().covers"
            (input)="patch({ covers: $any($event.target).value })"
          ></textarea>
        </app-card>

        <app-card>
          <section aria-labelledby="ci-review-title" data-testid="ci-review">
            <h2 id="ci-review-title" class="font-display text-card font-bold text-fg">
              {{ 'context.interview.reviewTitle' | transloco }}
            </h2>
            @if (plan().length) {
              <p class="mt-1 text-meta text-fg-muted">
                {{ 'context.interview.reviewIntro' | transloco }}
              </p>
              <ul class="mt-2 flex flex-col gap-1 text-ui text-fg">
                @for (record of plan(); track $index) {
                  <li>
                    <span class="text-fg-muted"
                      >{{ 'context.kinds.' + record.kind + '.one' | transloco }}:</span
                    >
                    {{ record.title }}
                  </li>
                }
              </ul>
            } @else {
              <p class="mt-1 text-meta text-fg-muted">
                {{ 'context.interview.reviewEmpty' | transloco }}
              </p>
            }
            <div class="mt-4">
              <app-button
                type="submit"
                [disabled]="!plan().length || saving()"
                [loading]="saving()"
                data-testid="ci-create"
              >
                {{ createKey() | transloco: { count: plan().length } }}
              </app-button>
            </div>
          </section>
        </app-card>
      </form>
    </div>
  `,
})
export class ContextInterviewPage {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly crumbs = [{ labelKey: 'modules.names.context', link: '/context' }];
  protected readonly partyOptions = INTERVIEW_PARTIES;
  protected readonly answers = signal<InterviewAnswers>(emptyAnswers());
  protected readonly saving = signal(false);
  private readonly frameworksWithoutScope = signal<readonly string[]>([]);
  private request = new Subscription();

  protected readonly plan = computed<PlannedRecord[]>(() => {
    return interviewPlan(
      this.answers(),
      this.frameworksWithoutScope(),
      (key, params) => this.language.translate(key, params),
      new Date().getFullYear(),
    );
  });

  protected readonly createKey = computed(() =>
    pluralKey('context.interview.create', this.plan().length),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        if (orgId) {
          this.api.overview(orgId).subscribe({
            next: (o) => this.frameworksWithoutScope.set(o.frameworks_without_scope ?? []),
            error: () => this.frameworksWithoutScope.set([]),
          });
        }
      });
    });
  }

  protected patch(change: Partial<InterviewAnswers>): void {
    this.answers.update((a) => ({ ...a, ...change }));
  }

  protected toggleParty(category: PartyCategory): void {
    const parties = this.answers().parties;
    this.patch({
      parties: parties.includes(category)
        ? parties.filter((p) => p !== category)
        : [...parties, category],
    });
  }

  protected create(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const plan = this.plan();
    if (!orgId || !plan.length || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.request = from(plan)
      .pipe(
        concatMap((record) => this.api.create(orgId, record.kind, record.body)),
        toArray(),
      )
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          this.notifications.success(pluralKey('context.interview.created', created.length), {
            count: created.length,
          });
          void this.router.navigate(['/context']);
        },
        error: () => {
          // Some drafts may already exist: send the person to the overview rather than
          // letting a second click create them twice.
          this.saving.set(false);
          this.notifications.error('context.interview.failed');
          void this.router.navigate(['/context']);
        },
      });
  }
}
