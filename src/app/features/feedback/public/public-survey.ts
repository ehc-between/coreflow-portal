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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ThemeService } from '../../../core/theme/theme.service';
import { LanguageSwitcher } from '../../../shared/language-switcher/language-switcher';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
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
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative min-h-screen bg-bg px-4 pt-16 pb-16 text-fg">
      <div class="absolute top-4 right-4 flex items-center gap-1.5">
        <button
          type="button"
          (click)="theme.toggle()"
          [attr.aria-label]="'theme.toggle' | transloco"
          class="flex h-9 w-9 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="18" />
        </button>
        <app-language-switcher />
      </div>

      <main class="mx-auto w-full max-w-[680px]">
        @switch (state()) {
          @case ('loading') {
            <p class="py-16 text-center text-body text-fg-muted" role="status">
              {{ 'feedback.public.loading' | transloco }}
            </p>
          }
          @case ('unavailable') {
            <app-card>
              <div class="p-2 text-center" data-testid="survey-unavailable">
                <h1 class="font-display text-page font-bold text-fg">
                  {{ 'feedback.public.unavailableTitle' | transloco }}
                </h1>
                <p class="mt-2 text-body text-fg-muted">
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
                <h1 class="font-display text-page font-bold text-fg">
                  {{ 'feedback.public.thanksTitle' | transloco }}
                </h1>
                <p class="mt-2 text-body whitespace-pre-line text-fg-muted">
                  {{ thankYou() || ('feedback.public.thanksBody' | transloco) }}
                </p>
              </div>
            </app-card>
          }
          @default {
            @if (survey(); as s) {
              <p class="mb-1 text-ui font-semibold text-fg-subtle">{{ s.organisation_name }}</p>
              <h1
                class="font-display text-page font-bold tracking-[-0.03em] text-fg"
                data-testid="public-survey-title"
              >
                {{ s.title }}
              </h1>
              @if (s.description) {
                <p class="mt-2 text-body whitespace-pre-line text-fg-muted">
                  {{ s.description }}
                </p>
              }
              <p class="mt-2 text-meta text-fg-subtle">
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
                    <h2 class="mb-1 font-display text-card font-bold text-fg">
                      {{ 'feedback.public.aboutYou' | transloco }}
                    </h2>
                    <p class="mb-3 text-meta text-fg-muted">
                      {{ 'feedback.public.aboutYouHint' | transloco }}
                    </p>
                    <div class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
                      <app-form-field
                        [label]="'feedback.public.name' | transloco"
                        inputId="cf-ps-name"
                      >
                        <input
                          id="cf-ps-name"
                          type="text"
                          maxlength="255"
                          autocomplete="name"
                          [value]="name()"
                          (input)="name.set($any($event.target).value)"
                        />
                      </app-form-field>
                      <app-form-field
                        [label]="'feedback.public.email' | transloco"
                        inputId="cf-ps-email"
                        [error]="emailInvalid() ? ('feedback.form.errors.email' | transloco) : ''"
                      >
                        <input
                          id="cf-ps-email"
                          type="email"
                          autocomplete="email"
                          [value]="email()"
                          (input)="email.set($any($event.target).value)"
                        />
                      </app-form-field>
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
        <div class="mt-10 text-center text-meta text-fg-muted" data-testid="survey-privacy">
          @if (survey()?.collects_contact || survey()?.anonymous === false) {
            <p>
              {{
                'feedback.public.privacyNamed'
                  | transloco
                    : { controller: survey()?.controller_name || survey()?.organisation_name || '' }
              }}
            </p>
          } @else {
            <p>{{ 'feedback.public.privacy' | transloco }}</p>
          }
          @if (survey()?.privacy_notice_url; as url) {
            <p class="mt-1">
              <a
                [href]="url"
                target="_blank"
                rel="noopener noreferrer"
                class="font-semibold text-accent hover:underline"
                data-testid="privacy-link"
                >{{ 'feedback.public.privacyLink' | transloco }}</a
              >
            </p>
          }
        </div>
      </main>
    </div>
  `,
})
export class PublicSurveyPage {
  private readonly api = inject(PublicSurveyApi);
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
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
        // Show the page in the survey's own language (the questions are written in
        // it); the respondent can still switch. Not stored as a preference.
        const lang = survey.language;
        if (lang && lang !== this.transloco.getActiveLang()) {
          const available = this.transloco
            .getAvailableLangs()
            .map((l) => (typeof l === 'string' ? l : l.id));
          if (available.includes(lang)) {
            this.transloco.setActiveLang(lang);
          }
        }
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
