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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import {
  AcceptedSuggestion,
  FormSuggest,
  FormSuggestFieldDef,
} from '../../../shared/ask/form-suggest';
import { AskAbout } from '../../../shared/ask/ask-about';
import { dayOf, dueAtFromDay } from '../../../shared/tasks/task-display';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { Assessment, DraftedAssessment } from '../data/ai-governance.models';
import {
  AI_ASSESSMENT_ENTITY,
  AI_GOVERNANCE_MODULE,
  assessmentSectionHintKey,
  assessmentSectionKey,
  kindKey,
  sectionAnswers,
} from '../data/ai-governance-display';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiUserSelect } from '../ui/user-select';

/**
 * Merge drafted sections into the current answers: only empty sections are
 * filled, so nothing a person wrote is overwritten. Returns the merged map and
 * how many sections were filled.
 */
export function mergeDraft(
  current: Readonly<Record<string, string>>,
  drafted: unknown,
  allowed: readonly string[],
): { readonly sections: Record<string, string>; readonly filled: number } {
  const sections = { ...current };
  let filled = 0;
  const src = (drafted as DraftedAssessment | null)?.sections;
  if (src && typeof src === 'object') {
    for (const key of allowed) {
      const text = (src as Record<string, unknown>)[key];
      if (typeof text === 'string' && text.trim() && !sections[key]?.trim()) {
        sections[key] = text.trim();
        filled++;
      }
    }
  }
  return { sections, filled };
}

/**
 * `/ai-governance/assessments/:id/edit`: write a draft impact assessment
 * (ISO/IEC 42001 6.1.4) or FRIA (Art. 27(1)(a)-(f)) section by section, with
 * the title, owner and due date. The assistant can draft empty sections from
 * the system's description. A classification draft opens the wizard instead.
 */
@Component({
  selector: 'app-ai-assessment-edit',
  imports: [
    RouterLink,
    ErrorState,
    LoadingState,
    TranslocoPipe,
    FormSuggest,
    AskAbout,
    Alert,
    Button,
    Card,
    FormField,
    AiGovPage,
    AiUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.assessmentEdit.title"
      [titleParams]="{ code: assessment()?.code ?? '' }"
      [breadcrumbs]="crumbs()"
      page="assessmentEdit"
      [nav]="false"
      [why]="false"
      [backLink]="['/ai-governance/assessments', id()]"
      backLabelKey="aiGovernance.assessmentEdit.back"
    >
      @if (loadError()) {
        <app-error-state (retry)="reload.update((n) => n + 1)" />
      } @else if (assessment(); as a) {
        @if (a.kind === 'classification') {
          <app-alert tone="info" data-testid="assessment-edit-wizard">
            {{ 'aiGovernance.assessmentEdit.inWizard' | transloco }}
          </app-alert>
          <div class="mt-3 flex flex-wrap gap-2">
            <a
              [routerLink]="['/ai-governance/systems', a.ai_system.id, 'classify']"
              [queryParams]="{ assessment: a.id }"
              class="inline-flex h-9 items-center rounded-tile bg-accent px-3.5 text-ui font-semibold text-white hover:opacity-90"
            >
              {{ 'aiGovernance.assessmentDetail.openWizard' | transloco }}
            </a>
          </div>
        } @else if (a.status !== 'draft') {
          <app-alert tone="info">{{ 'aiGovernance.assessmentEdit.locked' | transloco }}</app-alert>
        } @else {
          <form
            class="flex max-w-[760px] flex-col gap-5"
            (submit)="$event.preventDefault(); save()"
            novalidate
          >
            <app-form-suggest
              [suggestKey]="'ai_governance.' + a.kind"
              labelKey="ask.formSuggest.labels.assessment"
              [fields]="suggestFields()"
              [values]="suggestValues()"
              [context]="{ from: 'ai_governance', assessment_id: a.id }"
              [editing]="hasAnswers()"
              (applied)="applySuggestion($event)"
            />
            <app-card>
              <p class="mb-3 text-ui text-fg-muted">
                {{ kindKey(a.kind) | transloco }} · {{ a.ai_system.code }} {{ a.ai_system.name }}
              </p>
              <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div class="md:col-span-3">
                  <app-form-field
                    [label]="'aiGovernance.fields.title' | transloco"
                    inputId="aie-title"
                  >
                    <input
                      id="aie-title"
                      type="text"
                      maxlength="200"
                      required
                      [value]="title()"
                      (input)="title.set($any($event.target).value)"
                    />
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'aiGovernance.fields.owner' | transloco"
                    inputId="aie-owner"
                  >
                    <app-ai-user-select
                      selectId="aie-owner"
                      [currentName]="a.owner?.name ?? null"
                      [(value)]="owner"
                    />
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'aiGovernance.fields.dueAt' | transloco"
                    inputId="aie-due"
                  >
                    <input
                      id="aie-due"
                      type="date"
                      [value]="due()"
                      (input)="due.set($any($event.target).value)"
                    />
                  </app-form-field>
                </div>
                <div>
                  <app-form-field
                    [label]="'aiGovernance.fields.nextReview' | transloco"
                    inputId="aie-review"
                  >
                    <input
                      id="aie-review"
                      type="date"
                      [value]="nextReview()"
                      (input)="nextReview.set($any($event.target).value)"
                    />
                  </app-form-field>
                </div>
                <div class="md:col-span-3">
                  <app-form-field
                    [label]="'aiGovernance.fields.changeReason' | transloco"
                    inputId="aie-reason"
                  >
                    <input
                      id="aie-reason"
                      type="text"
                      maxlength="1000"
                      [value]="reason()"
                      (input)="reason.set($any($event.target).value)"
                    />
                  </app-form-field>
                </div>
              </div>
            </app-card>

            @for (key of sectionKeys(); track key) {
              <app-card>
                <div class="mb-1 flex items-start justify-between gap-2">
                  <label [for]="'aie-s-' + key" class="text-card font-bold text-fg">
                    {{ sectionKey(a.kind, key) | transloco }}
                    @if (required().has(key)) {
                      <span class="ml-1 text-meta font-semibold text-warn">{{
                        'aiGovernance.assessmentEdit.required' | transloco
                      }}</span>
                    }
                  </label>
                  <app-ask-about
                    [prompt]="
                      'aiGovernance.assessmentEdit.ask'
                        | transloco: { section: (sectionKey(a.kind, key) | transloco) }
                    "
                    [field]="key"
                    labelKey="aiGovernance.wizard.askAbout"
                  />
                </div>
                <p [id]="'aie-h-' + key" class="mb-2 text-meta text-fg-muted">
                  {{ sectionHintKey(a.kind, key) | transloco }}
                </p>
                <textarea
                  [id]="'aie-s-' + key"
                  rows="5"
                  maxlength="20000"
                  [attr.aria-describedby]="'aie-h-' + key"
                  class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg"
                  [class.border-fail]="missing().has(key)"
                  [value]="sections()[key] ?? ''"
                  (input)="setSection(key, $any($event.target).value)"
                ></textarea>
              </app-card>
            }

            @if (error()) {
              <app-alert tone="error">{{ error()! | transloco }}</app-alert>
            }
            <div
              class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            >
              <app-button variant="secondary" (click)="back()">{{
                'aiGovernance.common.cancel' | transloco
              }}</app-button>
              <app-button
                type="submit"
                [loading]="saving()"
                [disabled]="!title().trim()"
                data-testid="assessment-save"
              >
                {{ 'aiGovernance.common.save' | transloco }}
              </app-button>
            </div>
          </form>
        }
      } @else {
        <app-loading-state [rows]="6" />
      }
    </app-ai-gov-page>
  `,
})
export class AiAssessmentEdit {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly store = inject(AiGovernanceStore);

  readonly id = input.required<string>();

  protected readonly kindKey = kindKey;
  protected readonly sectionKey = assessmentSectionKey;
  protected readonly sectionHintKey = assessmentSectionHintKey;

  protected readonly assessment = signal<Assessment | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly title = signal('');
  protected readonly owner = signal('');
  protected readonly due = signal('');
  protected readonly nextReview = signal('');
  protected readonly reload = signal(0);
  protected readonly crumbs = computed(() => {
    const a = this.assessment();
    return [
      { labelKey: 'aiGovernance.assessments.title', link: '/ai-governance/assessments' },
      { label: a?.code ?? '…', link: ['/ai-governance/assessments', this.id()] },
      { labelKey: 'aiGovernance.common.edit' },
    ];
  });
  protected readonly reason = signal('');
  protected readonly sections = signal<Record<string, string>>({});
  protected readonly missing = signal<ReadonlySet<string>>(new Set());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly sectionKeys = computed<readonly string[]>(() => {
    const a = this.assessment();
    const catalog = this.store.catalog();
    if (!a || !catalog) {
      return [];
    }
    return a.kind === 'fria' ? catalog.fria_sections : catalog.impact_sections;
  });
  protected readonly required = computed(() => new Set(this.assessment()?.required_sections ?? []));

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_ASSESSMENT_ENTITY,
      entityId: this.id(),
      view: 'edit',
      title: this.assessment()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      this.reload();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.store.ensureCatalog();
        this.api.getAssessment(orgId, id).subscribe({
          next: (a) => {
            this.assessment.set(a);
            this.nextReview.set(dayOf(a.next_review_at ?? null));
            this.title.set(a.title);
            this.owner.set(a.owner?.id ?? '');
            this.due.set(dayOf(a.due_at));
            this.sections.set(sectionAnswers(a.answers));
          },
          error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
        });
      });
    });
  }

  protected setSection(key: string, text: string): void {
    this.sections.update((s) => ({ ...s, [key]: text }));
    if (this.missing().has(key) && text.trim()) {
      const next = new Set(this.missing());
      next.delete(key);
      this.missing.set(next);
    }
  }

  protected readonly suggestFields = computed((): readonly FormSuggestFieldDef[] => {
    const kind = this.assessment()?.kind ?? 'impact';
    return [
      { name: 'title', labelKey: 'aiGovernance.fields.title' },
      ...this.sectionKeys().map((key) => ({
        name: key,
        labelKey: this.sectionKey(kind, key),
        long: true,
      })),
    ];
  });
  protected readonly suggestValues = computed(() => ({
    title: this.title(),
    ...this.sections(),
  }));
  protected readonly hasAnswers = computed(() =>
    Object.values(this.sections()).some((text) => text.trim()),
  );

  /** Accepted suggestions fill the sections; nothing is saved until "Save". */
  protected applySuggestion(accepted: AcceptedSuggestion): void {
    const title = accepted['title']?.value;
    if (typeof title === 'string') {
      this.title.set(title.slice(0, 200));
    }
    for (const key of this.sectionKeys()) {
      const text = accepted[key]?.value;
      if (typeof text === 'string') {
        this.setSection(key, text);
      }
    }
  }

  protected back(): void {
    void this.router.navigate(['/ai-governance/assessments', this.id()]);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const a = this.assessment();
    if (!orgId || !a || this.saving() || !this.title().trim()) {
      return;
    }
    const answers: Record<string, string> = {};
    for (const [key, text] of Object.entries(this.sections())) {
      if (text.trim()) {
        answers[key] = text.trim();
      }
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .updateAssessment(orgId, a.id, {
        title: this.title().trim(),
        owner_user_id: this.owner() || null,
        due_at: dueAtFromDay(this.due()),
        next_review_at: dueAtFromDay(this.nextReview()),
        answers,
        change_reason: this.reason().trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notifications.success('aiGovernance.assessmentEdit.saved');
          this.back();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(aiGovernanceErrorKey(err));
        },
      });
  }
}
