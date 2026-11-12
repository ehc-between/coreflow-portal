import { DOCUMENT } from '@angular/common';
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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ThemeService } from '../../../core/theme/theme.service';
import { LanguageSwitcher } from '../../../shared/language-switcher/language-switcher';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { PublicSurveyApi } from '../data/feedback-api';
import { feedbackErrorCode, feedbackErrorKey } from '../data/feedback-errors';
import { AnswerValue, PublicSurvey } from '../data/feedback.models';
import { AnswerMap, cleanAnswers, missingRequired } from '../data/survey-form-model';
import { SurveyQuestion } from '../surveys/survey-question';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The public survey page (`/survey/:token`), outside the signed-in shell: anyone
 * with the link can answer. Required questions are checked before sending; for
 * anonymous surveys no contact details are asked for. A closed, draft or unknown
 * survey shows a neutral "not available" message.
 */
@Component({
  selector: 'app-public-survey',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    LanguageSwitcher,
    Alert,
    Button,
    Card,
    Icon,
    SurveyQuestion,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative min-h-screen bg-bg px-4 pt-16 pb-16 text-fg">
      <div class="absolute top-4 right-4 flex items-center gap-1.5">
        <button
          type="button"
          (click)="theme.toggle()"
          [attr.aria-label]="'theme.toggle' | transloco"
          class="flex h-9 w-9 items-center justify-center rounded-[9px] text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="18" />
        </button>
        <app-language-switcher />
      </div>

      <main class="mx-auto w-full max-w-[680px]">
        @switch (state()) {
          @case ('loading') {
            <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
              {{ 'feedback.public.loading' | transloco }}
            </p>
          }
          @case ('unavailable') {
            <app-card>
              <div class="p-2 text-center" data-testid="survey-unavailable">
                <h1 class="font-display text-[22px] font-bold text-fg">
                  {{ 'feedback.public.unavailableTitle' | transloco }}
                </h1>
                <p class="mt-2 text-[13.5px] text-fg-muted">
                  {{ 'feedback.public.unavailableBody' | transloco }}
                </p>
              </div>
            </app-card>
          }
          @case ('error') {
            <app-alert tone="error">{{ 'feedback.public.loadFailed' | transloco }}</app-alert>
          }
          @case ('done') {
            <app-card>
              <div class="p-2 text-center" role="status" data-testid="survey-thanks">
                <span
                  class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-pass-soft text-pass"
                >
                  <app-icon name="check" [size]="22" />
                </span>
                <h1 class="font-display text-[22px] font-bold text-fg">
                  {{ 'feedback.public.thanksTitle' | transloco }}
                </h1>
                <p class="mt-2 text-[14px] whitespace-pre-line text-fg-muted">
                  {{ thankYou() || ('feedback.public.thanksBody' | transloco) }}
                </p>
              </div>
            </app-card>
          }
          @default {
            @if (survey(); as s) {
              <p class="mb-1 text-[13px] font-semibold text-fg-subtle">{{ s.organisation_name }}</p>
              <h1
                class="font-display text-[26px] font-bold tracking-[-0.03em] text-fg"
                data-testid="public-survey-title"
              >
                {{ s.title }}
              </h1>
              @if (s.description) {
                <p class="mt-2 text-[14px] whitespace-pre-line text-fg-muted">
                  {{ s.description }}
                </p>
              }
              <p class="mt-2 text-[12.5px] text-fg-subtle">
                {{
                  (s.anonymous ? 'feedback.public.anonymous' : 'feedback.public.named') | transloco
                }}
                @if (s.closes_on) {
                  · {{ 'feedback.public.closesOn' | transloco: { date: (s.closes_on | localDay) } }}
                }
              </p>

              <form
                class="mt-6 flex flex-col gap-5"
                (submit)="$event.preventDefault(); submit()"
                novalidate
              >
                <app-card>
                  <div class="flex flex-col gap-6">
                    @for (q of s.questions; track q.id; let i = $index) {
                      <app-survey-question
                        [question]="q"
                        [position]="i + 1"
                        [value]="answers()[q.id] ?? null"
                        [invalid]="attempted() && missing().includes(q.id)"
                        [disabled]="sending()"
                        (valueChange)="setAnswer(q.id, $event)"
                      />
                    }
                  </div>
                </app-card>

                @if (!s.anonymous) {
                  <app-card>
                    <h2 class="mb-1 font-display text-[15px] font-bold text-fg">
                      {{ 'feedback.public.aboutYou' | transloco }}
                    </h2>
                    <p class="mb-3 text-[12.5px] text-fg-muted">
                      {{ 'feedback.public.aboutYouHint' | transloco }}
                    </p>
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          for="cf-ps-name"
                          class="mb-1 block text-[13px] font-semibold text-fg-muted"
                        >
                          {{ 'feedback.public.name' | transloco }}
                        </label>
                        <input
                          id="cf-ps-name"
                          type="text"
                          maxlength="255"
                          autocomplete="name"
                          class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
                          [value]="name()"
                          (input)="name.set($any($event.target).value)"
                        />
                      </div>
                      <div>
                        <label
                          for="cf-ps-email"
                          class="mb-1 block text-[13px] font-semibold text-fg-muted"
                        >
                          {{ 'feedback.public.email' | transloco }}
                        </label>
                        <input
                          id="cf-ps-email"
                          type="email"
                          autocomplete="email"
                          class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
                          [value]="email()"
                          (input)="email.set($any($event.target).value)"
                          [attr.aria-invalid]="emailInvalid() || null"
                        />
                        @if (emailInvalid()) {
                          <p class="mt-1 text-[12px] text-fail">
                            {{ 'feedback.form.errors.email' | transloco }}
                          </p>
                        }
                      </div>
                    </div>
                  </app-card>
                }

                @if (attempted() && missing().length) {
                  <app-alert tone="error">
                    {{ 'feedback.public.missing' | transloco: { count: missing().length } }}
                  </app-alert>
                }
                @if (errorKey(); as key) {
                  <app-alert tone="error">{{ key | transloco }}</app-alert>
                }

                <div class="flex justify-end">
                  <app-button
                    type="submit"
                    [loading]="sending()"
                    [disabled]="sending()"
                    data-testid="public-submit"
                  >
                    {{ 'feedback.public.submit' | transloco }}
                  </app-button>
                </div>
              </form>
            }
          }
        }
        <p class="mt-10 text-center text-[11.5px] text-fg-subtle">
          {{ 'feedback.public.privacy' | transloco }}
        </p>
      </main>
    </div>
  `,
})
export class PublicSurveyPage {
  private readonly api = inject(PublicSurveyApi);
  private readonly document = inject(DOCUMENT);
  protected readonly theme = inject(ThemeService);

  readonly token = input.required<string>();

  protected readonly state = signal<'loading' | 'unavailable' | 'error' | 'ready' | 'done'>(
    'loading',
  );
  protected readonly survey = signal<PublicSurvey | null>(null);
  protected readonly answers = signal<AnswerMap>({});
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly attempted = signal(false);
  protected readonly sending = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly thankYou = signal<string | null>(null);

  protected readonly missing = computed(() =>
    missingRequired(this.survey()?.questions ?? [], this.answers()),
  );
  protected readonly emailInvalid = computed(
    () => !!this.email().trim() && !EMAIL.test(this.email().trim()),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const token = this.token();
      untracked(() => this.load(token));
    });
  }

  protected setAnswer(id: string, value: AnswerValue | null): void {
    this.answers.update((a) => ({ ...a, [id]: value }));
  }

  protected submit(): void {
    const s = this.survey();
    if (!s || this.sending()) {
      return;
    }
    this.attempted.set(true);
    this.errorKey.set(null);
    if (this.missing().length || this.emailInvalid()) {
      this.focusFirstInvalid();
      return;
    }
    this.sending.set(true);
    this.request = this.api
      .submit(this.token(), {
        answers: cleanAnswers(s.questions, this.answers()),
        ...(s.anonymous
          ? {}
          : {
              respondent_name: this.name().trim() || null,
              respondent_email: this.email().trim() || null,
            }),
      })
      .subscribe({
        next: (res) => {
          this.sending.set(false);
          this.thankYou.set(res.thank_you_message);
          this.state.set('done');
        },
        error: (error: unknown) => {
          this.sending.set(false);
          if (feedbackErrorCode(error) === 'survey_not_available') {
            this.state.set('unavailable');
            return;
          }
          this.errorKey.set(feedbackErrorKey(error));
        },
      });
  }

  private focusFirstInvalid(): void {
    const first = this.missing()[0];
    if (first) {
      queueMicrotask(() =>
        this.document
          .querySelector<HTMLElement>(
            `[data-testid="question-${first}"] input, [data-testid="question-${first}"] textarea`,
          )
          ?.focus(),
      );
    }
  }

  private load(token: string): void {
    this.request.unsubscribe();
    this.state.set('loading');
    this.request = this.api.get(token).subscribe({
      next: (survey) => {
        this.survey.set(survey);
        this.answers.set({});
        this.state.set('ready');
      },
      error: (error: unknown) => {
        const code = feedbackErrorCode(error);
        const status = (error as { status?: number } | null)?.status;
        this.state.set(
          code === 'survey_not_available' || status === 404 || status === 422
            ? 'unavailable'
            : 'error',
        );
      },
    });
  }
}
