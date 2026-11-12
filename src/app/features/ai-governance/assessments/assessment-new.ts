import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { dueAtFromDay } from '../../../shared/tasks/task-display';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { ASSESSMENT_KINDS, AiSystemSummary, AssessmentKind } from '../data/ai-governance.models';
import {
  AI_ASSESSMENT_ENTITY,
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  kindKey,
} from '../data/ai-governance-display';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiUserSelect } from '../ui/user-select';

function asKind(value: string | undefined): AssessmentKind {
  return (ASSESSMENT_KINDS as readonly string[]).includes(value ?? '')
    ? (value as AssessmentKind)
    : 'impact';
}

/**
 * `/ai-governance/assessments/new[?system=<id>&kind=impact|fria|classification]`:
 * start an assessment for an AI system. A classification continues in the
 * wizard; an impact assessment or FRIA is created as a draft and opened for
 * writing its sections.
 */
@Component({
  selector: 'app-ai-assessment-new',
  imports: [TranslocoPipe, FieldHelp, Alert, Button, Card, FormField, AiGovPage, AiUserSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.assessmentNew.title"
      page="assessmentNew"
      backLink="/ai-governance/assessments"
    >
      <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
        <app-card>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <app-form-field
                [label]="'aiGovernance.fields.system' | transloco"
                inputId="aia-system"
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
              </app-form-field>
              @if (submitted() && !systemId()) {
                <p class="mt-1 text-[12.5px] text-fail">
                  {{ 'aiGovernance.assessmentNew.systemRequired' | transloco }}
                </p>
              }
            </div>
            <fieldset>
              <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                {{ 'aiGovernance.fields.kind' | transloco }}
              </legend>
              <div class="flex flex-col gap-1.5">
                @for (k of kinds; track k) {
                  <label class="flex items-start gap-2 text-[13.5px] text-fg">
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
                      <span class="block text-[12.5px] text-fg-muted">{{
                        'aiGovernance.kindHelp.' + k | transloco
                      }}</span>
                    </span>
                  </label>
                }
              </div>
              <app-field-help [scope]="scope" page="assessmentNew" field="kind" />
            </fieldset>
            @if (chosenKind() !== 'classification') {
              <div class="md:col-span-2">
                <app-form-field
                  [label]="'aiGovernance.fields.title' | transloco"
                  inputId="aia-title"
                >
                  <input
                    id="aia-title"
                    type="text"
                    maxlength="200"
                    [placeholder]="'aiGovernance.assessmentNew.titlePlaceholder' | transloco"
                    [value]="title()"
                    (input)="title.set($any($event.target).value)"
                  />
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'aiGovernance.fields.owner' | transloco"
                  inputId="aia-owner"
                >
                  <app-ai-user-select selectId="aia-owner" [(value)]="owner" />
                </app-form-field>
              </div>
              <div>
                <app-form-field [label]="'aiGovernance.fields.dueAt' | transloco" inputId="aia-due">
                  <input
                    id="aia-due"
                    type="date"
                    [value]="due()"
                    (input)="due.set($any($event.target).value)"
                  />
                </app-form-field>
              </div>
            }
          </div>
        </app-card>
        @if (error()) {
          <app-alert tone="error">{{ error()! | transloco }}</app-alert>
        }
        <div class="flex justify-end gap-2">
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
        </div>
      </form>
    </app-ai-gov-page>
  `,
})
export class AiAssessmentNew {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Query params (component input binding). */
  readonly system = input<string | undefined>(undefined);
  readonly kind = input<string | undefined>(undefined);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly kinds = ASSESSMENT_KINDS;
  protected readonly kindKey = kindKey;

  protected readonly systems = signal<readonly AiSystemSummary[]>([]);
  protected readonly systemId = signal('');
  protected readonly chosenKind = signal<AssessmentKind>('impact');
  protected readonly title = signal('');
  protected readonly owner = signal('');
  protected readonly due = signal('');
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_ASSESSMENT_ENTITY,
      view: 'new',
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
    if (this.chosenKind() === 'classification') {
      void this.router.navigate(['/ai-governance/systems', systemId, 'classify']);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .createAssessment(orgId, {
        ai_system_id: systemId,
        kind: this.chosenKind(),
        title: this.title().trim() || null,
        owner_user_id: this.owner() || null,
        due_at: dueAtFromDay(this.due()),
        answers: {},
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
