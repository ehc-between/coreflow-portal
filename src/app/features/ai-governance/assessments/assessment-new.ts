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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Term } from '../../../shared/guidance/term';
import { dueAtFromDay } from '../../../shared/tasks/task-display';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { ASSESSMENT_KINDS, AiSystemSummary, AssessmentKind } from '../data/ai-governance.models';
import { AI_ASSESSMENT_ENTITY, AI_GOVERNANCE_MODULE, kindKey } from '../data/ai-governance-display';
import { AiField } from '../ui/ai-field';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiUserSelect } from '../ui/user-select';

function asKind(value: string | undefined): AssessmentKind {
  return (ASSESSMENT_KINDS as readonly string[]).includes(value ?? '')
    ? (value as AssessmentKind)
    : 'impact';
}

/**
 * `/ai-governance/assessments/new[?system=<id>&kind=impact|fria|classification]`:
 * start an assessment of an AI system. A classification opens the wizard (on a
 * draft prefilled with the current answers); an impact assessment or FRIA is
 * created as a draft and opened for writing. The FRIA is offered for every
 * system but labelled "ikke påkrevd" when the system's classification does not
 * require one (Art. 27). The next review date defaults from the settings.
 */
@Component({
  selector: 'app-ai-assessment-new',
  imports: [
    TranslocoPipe,
    Term,
    Alert,
    Button,
    DateInput,
    FormActions,
    FormSection,
    AiField,
    AiGovPage,
    AiUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.assessmentNew.title"
      [breadcrumbs]="crumbs"
      page="assessmentNew"
      [nav]="false"
      [why]="false"
      [narrow]="true"
      backLink="/ai-governance/assessments"
    >
      <form
        class="mt-5 flex flex-col gap-5"
        (submit)="$event.preventDefault(); submit()"
        novalidate
      >
        <app-form-section
          [title]="'aiGovernance.assessmentNew.sections.what' | transloco"
          [description]="'aiGovernance.assessmentNew.sections.whatHint' | transloco"
        >
          <app-ai-field
            span="full"
            inputId="aia-system"
            labelKey="aiGovernance.fields.system"
            [required]="true"
            helpPage="assessmentNew"
            helpField="system"
            [error]="
              submitted() && !systemId() ? 'aiGovernance.assessmentNew.systemRequired' : null
            "
          >
            <select id="aia-system" required (change)="systemId.set($any($event.target).value)">
              <option value="" [selected]="!systemId()">
                {{ 'aiGovernance.assessmentNew.pickSystem' | transloco }}
              </option>
              @for (s of systems(); track s.id) {
                <option [value]="s.id" [selected]="systemId() === s.id">
                  {{ s.code }} {{ s.name }}
                </option>
              }
            </select>
          </app-ai-field>
          <app-ai-field
            span="full"
            inputId="aia-kind"
            labelKey="aiGovernance.fields.kind"
            helpPage="assessmentNew"
            helpField="kind"
            [plain]="true"
            [legend]="true"
          >
            <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="aia-kind-label">
              @for (k of kinds; track k) {
                <label
                  class="flex cursor-pointer items-start gap-2.5 rounded-tile border border-border bg-bg px-3 py-2.5 text-body text-fg has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <input
                    type="radio"
                    name="aia-kind"
                    class="mt-1"
                    [value]="k"
                    [checked]="chosenKind() === k"
                    (change)="chosenKind.set(k)"
                  />
                  <span>
                    <span class="font-semibold">{{ kindKey(k) | transloco }}</span>
                    @if (k === 'fria' && systemId() && !friaRelevant()) {
                      <span class="ml-1 text-meta font-normal text-fg-subtle">{{
                        'aiGovernance.assessmentNew.friaNotRequired' | transloco
                      }}</span>
                    }
                    <span class="block text-meta text-fg-muted">{{
                      'aiGovernance.kindHelp.' + k | transloco
                    }}</span>
                  </span>
                </label>
              }
            </div>
            <span hint>
              <app-term scope="ai-governance" key="fria">{{
                'aiGovernance.assessmentNew.whatIsFria' | transloco
              }}</app-term>
            </span>
          </app-ai-field>
          @if (chosenKind() !== 'classification') {
            <app-ai-field span="full" inputId="aia-title" labelKey="aiGovernance.fields.title">
              <input
                id="aia-title"
                type="text"
                maxlength="200"
                [placeholder]="'aiGovernance.assessmentNew.titlePlaceholder' | transloco"
                [value]="title()"
                (input)="title.set($any($event.target).value)"
              />
            </app-ai-field>
            <app-ai-field
              inputId="aia-owner"
              labelKey="aiGovernance.fields.owner"
              helpPage="assessmentNew"
              helpField="owner"
              [plain]="true"
            >
              <app-ai-user-select selectId="aia-owner" [(value)]="owner" />
            </app-ai-field>
            <app-ai-field inputId="aia-due" labelKey="aiGovernance.fields.dueAt">
              <app-date-input
                inputId="aia-due"
                [value]="due()"
                (valueChange)="due.set($event ?? '')"
              />
            </app-ai-field>
            <app-ai-field
              inputId="aia-review"
              labelKey="aiGovernance.fields.nextReview"
              helpPage="assessmentNew"
              helpField="next_review"
            >
              <app-date-input
                inputId="aia-review"
                [value]="nextReview()"
                (valueChange)="nextReview.set($event ?? '')"
              />
              <span hint>{{ 'aiGovernance.assessmentNew.nextReviewHint' | transloco }}</span>
            </app-ai-field>
          }
        </app-form-section>
        @if (error()) {
          <app-alert tone="error">{{ error()! | transloco }}</app-alert>
        }
        <app-form-actions>
          <app-button variant="secondary" (click)="cancel()">{{
            'aiGovernance.common.cancel' | transloco
          }}</app-button>
          <app-button type="submit" [loading]="saving()" data-testid="assessment-create">
            {{
              (chosenKind() === 'classification'
                ? 'aiGovernance.assessmentNew.openWizard'
                : 'aiGovernance.assessmentNew.create'
              ) | transloco
            }}
          </app-button>
        </app-form-actions>
      </form>
    </app-ai-gov-page>
  `,
})
export class AiAssessmentNew {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Query params (component input binding). */
  readonly system = input<string | undefined>(undefined);
  readonly kind = input<string | undefined>(undefined);

  protected readonly kinds = ASSESSMENT_KINDS;
  protected readonly kindKey = kindKey;
  protected readonly crumbs = [
    { labelKey: 'aiGovernance.assessments.title', link: '/ai-governance/assessments' },
    { labelKey: 'aiGovernance.assessmentNew.title' },
  ];

  protected readonly systems = signal<readonly AiSystemSummary[]>([]);
  protected readonly systemId = signal('');
  protected readonly chosenKind = signal<AssessmentKind>('impact');
  protected readonly title = signal('');
  protected readonly owner = signal('');
  protected readonly due = signal('');
  protected readonly nextReview = signal('');
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** A FRIA can matter for the chosen system (it is high risk). */
  protected readonly friaRelevant = computed(() => {
    const s = this.systems().find((x) => x.id === this.systemId());
    return !s || s.risk_class === 'high';
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_ASSESSMENT_ENTITY,
      view: 'new',
      title: this.language.translate('aiGovernance.assessmentNew.title'),
    }));
    effect(() => {
      const preset = this.system();
      const kind = this.kind();
      untracked(() => {
        if (preset) {
          this.systemId.set(preset);
        }
        this.chosenKind.set(asKind(kind));
      });
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.api.listSystems(orgId, { limit: 200, sort: 'name' }).subscribe({
          next: (page) => this.systems.set(page.items),
          error: (err: unknown) => this.error.set(aiGovernanceErrorKey(err)),
        });
      });
    });
  }

  protected cancel(): void {
    void this.router.navigate(['/ai-governance/assessments']);
  }

  protected submit(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    const systemId = this.systemId();
    if (!orgId || !systemId || this.saving()) {
      return;
    }
    const lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.saving.set(true);
    this.error.set(null);
    if (this.chosenKind() === 'classification') {
      this.api.reclassify(orgId, systemId, lang).subscribe({
        next: (draft) => {
          this.saving.set(false);
          void this.router.navigate(['/ai-governance/systems', systemId, 'classify'], {
            queryParams: { assessment: draft.id },
          });
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(aiGovernanceErrorKey(err));
        },
      });
      return;
    }
    this.api
      .createAssessment(orgId, {
        ai_system_id: systemId,
        kind: this.chosenKind(),
        title: this.title().trim() || null,
        owner_user_id: this.owner() || null,
        due_at: dueAtFromDay(this.due()),
        ...(this.nextReview() ? { next_review_at: dueAtFromDay(this.nextReview()) } : {}),
        answers: {},
        lang,
      })
      .subscribe({
        next: (assessment) => {
          this.saving.set(false);
          this.notifications.success('aiGovernance.assessmentNew.created', {
            code: assessment.code,
          });
          void this.router.navigate(['/ai-governance/assessments', assessment.id, 'edit']);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(aiGovernanceErrorKey(err));
        },
      });
  }
}
