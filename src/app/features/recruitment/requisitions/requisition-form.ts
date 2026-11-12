import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { RecruitmentApi } from '../data/recruitment-api';
import { isRequisitionLocked } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import { RecruitmentPeople } from '../data/recruitment-people';
import {
  EMPLOYMENT_TYPES,
  ENTITY_REQUISITION,
  MODULE_KEY,
  ROLE_RISKS,
  RequisitionDetail,
  SuggestedCriterion,
} from '../data/recruitment.models';
import {
  RequisitionDraft,
  draftFromRequisition,
  emptyRequisitionDraft,
  hasChanges,
  requisitionChanges,
  requisitionPayload,
} from '../data/requisition-form-model';
import { RecruitmentAiOutput } from '../shared/ai-output';
import { CriteriaEditor, CriterionDraft } from '../shared/criteria-editor';

const DEFAULT_CHECKS: Record<string, readonly string[]> = {
  low: ['identity', 'right_to_work', 'reference'],
  medium: ['identity', 'right_to_work', 'reference', 'employment_history', 'education'],
  high: [
    'identity',
    'right_to_work',
    'reference',
    'employment_history',
    'education',
    'criminal_record',
  ],
};

/** Create (`/recruitment/requisitions/new`) or edit (`/:id/edit`) a job requisition. */
@Component({
  selector: 'app-requisition-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    CriteriaEditor,
    RecruitmentAiOutput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[920px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="backLink()"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'recruitment.common.back' | transloco }}
      </a>
      <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{
          (editId()
            ? 'recruitment.requisitionForm.editTitle'
            : 'recruitment.requisitionForm.newTitle'
          ) | transloco
        }}
        @if (original(); as req) {
          <span class="ml-2 font-mono text-[14px] font-normal text-fg-subtle">{{ req.code }}</span>
        }
      </h1>
      <app-guide-intro class="mt-4" scope="recruitment" page="requisitionForm" />

      @if (loadError(); as key) {
        <app-alert class="mt-4 block">{{ key | transloco }}</app-alert>
      } @else if (editId() && !original()) {
        <p class="mt-6 text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else {
        @if (original(); as req) {
          @if (!req.can_edit) {
            <app-alert class="mt-4 block" tone="info">{{
              'recruitment.requisitionForm.noRights' | transloco
            }}</app-alert>
          } @else if (locked()) {
            <app-alert class="mt-4 block" tone="info">{{
              'recruitment.requisitionForm.lockedNotice' | transloco
            }}</app-alert>
          }
        }
        <form class="mt-5 flex flex-col gap-5" (submit)="$event.preventDefault(); save()">
          <app-card>
            <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
              {{ 'recruitment.requisitionForm.roleSection' | transloco }}
            </h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'recruitment.fields.title' | transloco"
                  inputId="req-title"
                >
                  <input
                    id="req-title"
                    required
                    maxlength="255"
                    [value]="draft().title"
                    (input)="set('title', $any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="recruitment" page="requisitionForm" field="title" />
              </div>
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'recruitment.fields.description' | transloco"
                  inputId="req-description"
                >
                  <textarea
                    id="req-description"
                    rows="4"
                    maxlength="20000"
                    [value]="draft().description"
                    (input)="set('description', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'recruitment.fields.justification' | transloco"
                  inputId="req-justification"
                >
                  <textarea
                    id="req-justification"
                    rows="3"
                    maxlength="5000"
                    [disabled]="locked()"
                    [value]="draft().justification"
                    (input)="set('justification', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help scope="recruitment" page="requisitionForm" field="justification" />
              </div>
              <app-form-field
                [label]="'recruitment.fields.department' | transloco"
                inputId="req-department"
              >
                <select
                  id="req-department"
                  [disabled]="locked()"
                  [value]="draft().department_id"
                  (change)="set('department_id', $any($event.target).value)"
                >
                  <option value="">{{ 'recruitment.common.none' | transloco }}</option>
                  @for (d of people.departments(); track d.id) {
                    <option [value]="d.id" [selected]="d.id === draft().department_id">
                      {{ d.name }}
                    </option>
                  }
                </select>
              </app-form-field>
              <app-form-field
                [label]="'recruitment.fields.location' | transloco"
                inputId="req-location"
              >
                <input
                  id="req-location"
                  maxlength="200"
                  [value]="draft().location"
                  (input)="set('location', $any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'recruitment.fields.employmentType' | transloco"
                inputId="req-type"
              >
                <select
                  id="req-type"
                  [disabled]="locked()"
                  [value]="draft().employment_type"
                  (change)="set('employment_type', $any($event.target).value)"
                >
                  @for (t of employmentTypes; track t) {
                    <option [value]="t" [selected]="t === draft().employment_type">
                      {{ 'recruitment.employmentType.' + t | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
              <app-form-field
                [label]="'recruitment.fields.headcount' | transloco"
                inputId="req-headcount"
              >
                <input
                  id="req-headcount"
                  type="number"
                  min="1"
                  max="500"
                  [disabled]="locked()"
                  [value]="draft().headcount"
                  (input)="set('headcount', +$any($event.target).value)"
                />
              </app-form-field>
              <div>
                <app-form-field
                  [label]="'recruitment.fields.roleRisk' | transloco"
                  inputId="req-risk"
                >
                  <select
                    id="req-risk"
                    [disabled]="locked()"
                    [value]="draft().role_risk"
                    (change)="set('role_risk', $any($event.target).value)"
                  >
                    @for (r of risks; track r) {
                      <option [value]="r" [selected]="r === draft().role_risk">
                        {{ 'recruitment.roleRisk.' + r | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="recruitment" page="requisitionForm" field="role_risk" />
                <p class="mt-1 text-[12px] text-fg-muted" data-testid="required-checks">
                  {{ 'recruitment.requisitionForm.checksForRisk' | transloco }}
                  @for (c of checksForRisk(); track c; let last = $last) {
                    {{ 'recruitment.checkType.' + c | transloco }}{{ last ? '' : ', ' }}
                  }
                </p>
              </div>
              <app-form-field
                [label]="'recruitment.fields.targetStartDate' | transloco"
                inputId="req-start"
              >
                <input
                  id="req-start"
                  type="date"
                  [value]="draft().target_start_date"
                  (input)="set('target_start_date', $any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'recruitment.fields.hiringManager' | transloco"
                inputId="req-manager"
              >
                <select
                  id="req-manager"
                  [value]="draft().hiring_manager_user_id"
                  (change)="set('hiring_manager_user_id', $any($event.target).value)"
                >
                  <option value="">{{ 'recruitment.common.none' | transloco }}</option>
                  @for (u of people.users(); track u.id) {
                    <option [value]="u.id" [selected]="u.id === draft().hiring_manager_user_id">
                      {{ u.name }}
                    </option>
                  }
                </select>
              </app-form-field>
              <app-form-field
                [label]="'recruitment.fields.recruiter' | transloco"
                inputId="req-recruiter"
              >
                <select
                  id="req-recruiter"
                  [value]="draft().recruiter_user_id"
                  (change)="set('recruiter_user_id', $any($event.target).value)"
                >
                  <option value="">{{ 'recruitment.common.none' | transloco }}</option>
                  @for (u of people.users(); track u.id) {
                    <option [value]="u.id" [selected]="u.id === draft().recruiter_user_id">
                      {{ u.name }}
                    </option>
                  }
                </select>
              </app-form-field>
            </div>
          </app-card>

          <app-card>
            <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 class="flex items-center gap-1 font-display text-[16px] font-bold text-fg">
                {{ 'recruitment.requisitionForm.criteriaSection' | transloco }}
                <app-ask-about
                  field="screening_criteria"
                  [prompt]="'recruitment.ask.criteria' | transloco"
                />
              </h2>
              @if (canWrite()) {
                <app-ai-assist-button
                  assist="recruitment.suggest_criteria"
                  labelKey="recruitment.ai.suggestCriteria"
                  [input]="{ title: draft().title, description: draft().description }"
                  [disabled]="!draft().title.trim()"
                  (result)="onCriteria($event)"
                />
              }
            </div>
            <app-field-help scope="recruitment" page="requisitionForm" field="screening_criteria" />
            @if (suggestions().length > 0) {
              <app-recruitment-ai-output
                class="my-3"
                useLabelKey="recruitment.ai.addAll"
                (used)="addSuggestions(suggestions())"
                (dismissed)="suggestions.set([])"
              >
                <ul class="flex flex-col gap-1.5">
                  @for (s of suggestions(); track $index) {
                    <li class="flex items-start justify-between gap-2 text-[13px]">
                      <span>
                        <span class="font-semibold text-fg">{{ s.label }}</span>
                        @if (s.description) {
                          <span class="block text-fg-muted">{{ s.description }}</span>
                        }
                      </span>
                      <button
                        type="button"
                        class="flex-none rounded-[6px] px-2 py-0.5 text-[12.5px] font-semibold text-accent hover:bg-accent-soft"
                        (click)="addSuggestions([s])"
                      >
                        {{ 'recruitment.ai.add' | transloco }}
                      </button>
                    </li>
                  }
                </ul>
              </app-recruitment-ai-output>
            }
            <app-criteria-editor
              class="mt-3"
              [criteria]="draft().screening_criteria"
              (criteriaChange)="set('screening_criteria', $event)"
              [disabled]="!canWrite()"
            />
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[16px] font-bold text-fg">
                {{ 'recruitment.requisitionForm.postingSection' | transloco }}
              </h2>
              @if (canWrite()) {
                <app-ai-assist-button
                  assist="recruitment.draft_job_ad"
                  labelKey="recruitment.ai.draftJobAd"
                  [input]="jobAdInput()"
                  [disabled]="!draft().title.trim()"
                  (text)="jobAd.set($event)"
                />
              }
            </div>
            @if (jobAd()) {
              <app-recruitment-ai-output
                class="mb-3"
                [text]="jobAd()"
                useLabelKey="recruitment.ai.useAsPosting"
                (used)="usePosting()"
                (dismissed)="jobAd.set(null)"
              />
            }
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'recruitment.fields.postingTitle' | transloco"
                  inputId="req-posting-title"
                >
                  <input
                    id="req-posting-title"
                    maxlength="255"
                    [value]="draft().posting_title"
                    (input)="set('posting_title', $any($event.target).value)"
                  />
                </app-form-field>
              </div>
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'recruitment.fields.postingText' | transloco"
                  inputId="req-posting-text"
                >
                  <textarea
                    id="req-posting-text"
                    rows="8"
                    maxlength="20000"
                    [value]="draft().posting_text"
                    (input)="set('posting_text', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help scope="recruitment" page="requisitionForm" field="posting_text" />
              </div>
              <app-form-field
                [label]="'recruitment.fields.postingClosesAt' | transloco"
                inputId="req-closes"
              >
                <input
                  id="req-closes"
                  type="datetime-local"
                  [value]="draft().posting_closes_at"
                  (input)="set('posting_closes_at', $any($event.target).value)"
                />
              </app-form-field>
            </div>
          </app-card>

          @if (editId()) {
            <app-card>
              <app-form-field
                [label]="'recruitment.fields.changeReason' | transloco"
                inputId="req-reason"
              >
                <input
                  id="req-reason"
                  maxlength="500"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
              </app-form-field>
              <app-field-help scope="recruitment" page="requisitionForm" field="change_reason" />
            </app-card>
          }

          @if (saveError(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div class="flex flex-wrap justify-end gap-2">
            <a [routerLink]="backLink()">
              <app-button variant="secondary">{{ 'common.cancel' | transloco }}</app-button>
            </a>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="!canWrite() || !draft().title.trim()"
            >
              {{ 'recruitment.common.save' | transloco }}
            </app-button>
          </div>
        </form>
        <app-why-it-matters class="mt-6 block" scope="recruitment" page="requisitionForm" />
      }
    </div>
  `,
})
export class RequisitionForm {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly people = inject(RecruitmentPeople);

  protected readonly employmentTypes = EMPLOYMENT_TYPES;
  protected readonly risks = ROLE_RISKS;

  protected readonly editId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))),
    { initialValue: null },
  );
  protected readonly original = signal<RequisitionDetail | null>(null);
  protected readonly draft = signal<RequisitionDraft>(emptyRequisitionDraft());
  protected readonly changeReason = signal('');
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly suggestions = signal<readonly SuggestedCriterion[]>([]);
  protected readonly jobAd = signal<string | null>(null);

  protected readonly locked = computed(() => {
    const req = this.original();
    return req !== null && isRequisitionLocked(req.status);
  });
  protected readonly canWrite = computed(() => this.original()?.can_edit ?? true);
  protected readonly checksForRisk = computed(() => DEFAULT_CHECKS[this.draft().role_risk] ?? []);
  protected readonly backLink = computed(() => {
    const id = this.editId();
    return id ? ['/recruitment/requisitions', id] : ['/recruitment/requisitions'];
  });
  protected readonly jobAdInput = computed(() => {
    const d = this.draft();
    return {
      title: d.title,
      description: d.description,
      location: d.location,
      employment_type: d.employment_type,
      criteria: d.screening_criteria.filter((c) => c.label.trim()).map((c) => c.label),
    };
  });

  constructor() {
    this.people.ensureLoaded();
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_REQUISITION,
      entityId: this.editId(),
      view: this.editId() ? 'edit' : 'new',
      title: this.draft().title || null,
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const id = this.editId();
      if (!orgId || !id) {
        return;
      }
      const sub = this.api.getRequisition(orgId, id).subscribe({
        next: (req) => {
          this.original.set(req);
          this.draft.set(draftFromRequisition(req));
        },
        error: (err) => this.loadError.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected set<K extends keyof RequisitionDraft>(key: K, value: RequisitionDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected onCriteria(result: unknown): void {
    const list = (result as { criteria?: unknown } | null)?.criteria;
    if (!Array.isArray(list)) {
      return;
    }
    this.suggestions.set(
      list
        .filter((c): c is SuggestedCriterion => !!c && typeof c.label === 'string')
        .map((c) => ({ label: c.label, description: c.description ?? null })),
    );
  }

  protected addSuggestions(items: readonly SuggestedCriterion[]): void {
    const added: CriterionDraft[] = items.map((s) => ({
      id: null,
      label: s.label,
      description: s.description ?? '',
    }));
    this.set('screening_criteria', [...this.draft().screening_criteria, ...added].slice(0, 30));
    this.suggestions.update((list) => list.filter((s) => !items.includes(s)));
  }

  protected usePosting(): void {
    const text = this.jobAd();
    if (text) {
      this.set('posting_text', text);
      if (!this.draft().posting_title.trim()) {
        this.set('posting_title', this.draft().title);
      }
    }
    this.jobAd.set(null);
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId || this.saving() || !this.draft().title.trim()) {
      return;
    }
    this.saveError.set(null);
    const original = this.original();
    if (original) {
      const changes = requisitionChanges(original, this.draft(), this.changeReason());
      if (!hasChanges(changes)) {
        void this.router.navigate(['/recruitment/requisitions', original.id]);
        return;
      }
      this.saving.set(true);
      this.api.updateRequisition(orgId, original.id, changes).subscribe({
        next: (req) => this.done(req, 'recruitment.requisitionForm.saved'),
        error: (err) => this.fail(err),
      });
      return;
    }
    this.saving.set(true);
    this.api.createRequisition(orgId, requisitionPayload(this.draft())).subscribe({
      next: (req) => this.done(req, 'recruitment.requisitionForm.created'),
      error: (err) => this.fail(err),
    });
  }

  private done(req: RequisitionDetail, messageKey: string): void {
    this.saving.set(false);
    this.toasts.success(messageKey, { code: req.code });
    void this.router.navigate(['/recruitment/requisitions', req.id]);
  }

  private fail(err: unknown): void {
    this.saving.set(false);
    this.saveError.set(recruitmentError(err).key);
  }
}
