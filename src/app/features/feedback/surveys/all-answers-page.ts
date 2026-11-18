import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { formatLocalDay } from '../../../shared/locale/locale-pipes';
import { Card } from '../../../shared/ui/card/card';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import {
  NPS_GROUPS,
  NpsGroup,
  PERM_MANAGE,
  PERM_WRITE,
  SURVEY_ENTITY,
} from '../data/feedback.models';
import { FEEDBACK_NAV, FEEDBACK_SETTINGS_LINK } from '../feedback-nav';
import { AnswerScope, SurveyAnswers } from './survey-answers';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The answers scope a link opened the page with (`?submitted_from=…&submitted_to=…`
 * from the statistics' survey answers, `?survey=<id>`, `?nps_group=promoter`).
 */
export function answersScopeFromParams(
  params: ParamMap,
  t: (key: string, params?: Record<string, unknown>) => string,
  day: (iso: string) => string = (iso) => iso,
): AnswerScope | null {
  const from = params.get('submitted_from') ?? '';
  const to = params.get('submitted_to') ?? '';
  const survey = params.get('survey') ?? '';
  const group = params.get('nps_group') ?? '';
  const scope = {
    submitted_from: ISO_DAY.test(from) ? from : undefined,
    submitted_to: ISO_DAY.test(to) ? to : undefined,
    survey_id: UUID.test(survey) ? survey : undefined,
    nps_group: (NPS_GROUPS as readonly string[]).includes(group) ? (group as NpsGroup) : undefined,
  };
  const words: string[] = [];
  if (scope.survey_id) {
    words.push(t('feedback.answers.scopeSurvey'));
  }
  if (scope.submitted_from || scope.submitted_to) {
    words.push(
      t('feedback.answers.scopePeriod', {
        from: scope.submitted_from ? day(scope.submitted_from) : '…',
        to: scope.submitted_to ? day(scope.submitted_to) : '…',
      }),
    );
  }
  if (scope.nps_group) {
    words.push(t(`feedback.answers.scopeNps.${scope.nps_group}`));
  }
  return words.length ? { ...scope, label: words.join(' · ') } : null;
}

/**
 * "Svar fra undersøkelser" (`/feedback/answers`): every survey's answers in one
 * table, newest first, each row naming its survey, with the same search, low-score
 * and follow-up filters and per-answer actions as a survey's own Svar view. Reached
 * in one click from the register (its tab), and from the statistics' answer count.
 */
@Component({
  selector: 'app-all-answers-page',
  imports: [Card, ModuleNav, PageHeader, SurveyAnswers],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      titleKey="feedback.allAnswers.title"
      descriptionKey="feedback.allAnswers.subtitle"
      [breadcrumbs]="crumbs"
      [settingsLink]="settingsLink"
    />
    <app-module-nav labelKey="modules.names.feedback" [items]="nav" />
    <app-card>
      <app-survey-answers
        [scope]="scope()"
        [canWrite]="canWrite()"
        [canManage]="canManage()"
        [canDeviate]="canDeviate()"
        (scopeCleared)="clearScope()"
      />
    </app-card>
  `,
})
export class AllAnswersPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly nav = FEEDBACK_NAV;
  protected readonly settingsLink = FEEDBACK_SETTINGS_LINK;
  protected readonly crumbs = [
    { labelKey: 'modules.names.feedback', link: '/feedback' },
    { labelKey: 'feedback.tabs.answers' },
  ];

  private readonly params = toSignal(this.route.queryParamMap.pipe(takeUntilDestroyed()), {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly scope = computed(() =>
    answersScopeFromParams(
      this.params(),
      (key, params) => this.language.translate(key, params),
      (iso) => formatLocalDay(iso, 'mediumDate', this.language.locale()),
    ),
  );

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes(PERM_WRITE));
  protected readonly canManage = computed(() => this.permissions().includes(PERM_MANAGE));
  protected readonly canDeviate = computed(() => this.permissions().includes('deviations:write'));

  constructor() {
    providePageContext(() => ({
      module: 'feedback',
      entityType: SURVEY_ENTITY,
      view: 'list',
      title: this.language.translate('feedback.allAnswers.title'),
    }));
  }

  protected clearScope(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }
}
