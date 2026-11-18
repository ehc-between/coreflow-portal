import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchItem } from '../../../core/search/search.models';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip, EntityChipRef } from '../../../shared/kit/entity-chip';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { RecruitmentApi } from '../data/recruitment-api';
import { isRequisitionLocked } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import { RecruitmentPeople } from '../data/recruitment-people';
import {
  CheckPolicy,
  EMPLOYMENT_TYPES,
  ENTITY_REQUISITION,
  MODULE_KEY,
  ROLE_RISKS,
  RequisitionDetail,
  SuggestedCriterion,
} from '../data/recruitment.models';
import {
  RequisitionDraft,
  RequisitionFormError,
  draftFromRequisition,
  emptyRequisitionDraft,
  hasChanges,
  requisitionChanges,
  requisitionErrors,
  requisitionPayload,
} from '../data/requisition-form-model';
import { RecruitmentAiOutput } from '../shared/ai-output';
import { CriteriaEditor, CriterionDraft } from '../shared/criteria-editor';
import { RecordSearchPicker } from '../shared/record-search-picker';
import { RECRUITMENT_CRUMB } from '../shared/recruitment-nav';
import { RecruitmentField } from '../shared/recruitment-field';

/** The table used until the org's own check policy has loaded (backend default). */
const DEFAULT_CHECKS: CheckPolicy = {
  low: ['identity', 'right_to_work', 'reference'],
  medium: ['identity', 'right_to_work', 'reference', 'employment_history', 'education'],
  high: ['identity', 'right_to_work', 'reference', 'employment_history', 'education'],
};

/**
 * Create (`/recruitment/requisitions/new`) or edit (`/:id/edit`) a job requisition.
 * Picking a People position fills in the title, department, risk level and one
 * criterion per required competence; the checks shown for the risk level follow
 * the organisation's own table.
 */
@Component({
  selector: 'app-requisition-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    WhyItMatters,
    EntityChip,
    Alert,
    Button,
    Card,
    HelpStrip,
    LoadingState,
    PageHeader,
    CriteriaEditor,
    RecordSearchPicker,
    RecruitmentAiOutput,
    RecruitmentField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="
          editId()
            ? 'recruitment.requisitionForm.editTitle'
            : 'recruitment.requisitionForm.newTitle'
        "
        [breadcrumbs]="breadcrumbs()"
        [backLink]="backLink()"
        backLabelKey="recruitment.common.back"
      >
        @if (original(); as req) {
          <span meta class="font-mono">{{ req.code }}</span>
        }
      </app-page-header>
      <app-help-strip scope="recruitment" page="requisitionForm" lesson="fair-screening" />

      @if (loadError(); as key) {
        <app-alert class="mt-4 block">{{ key | transloco }}</app-alert>
      } @else if (editId() && !original()) {
        <app-loading-state [rows]="6" />
      } @else {
        @if (original(); as req) {
          @if (!req.can_edit) {
            <app-alert class="mb-4 block" tone="info">{{
              'recruitment.requisitionForm.noRights' | transloco
            }}</app-alert>
          } @else if (locked()) {
            <app-alert class="mb-4 block" tone="info">{{
              'recruitment.requisitionForm.lockedNotice' | transloco
            }}</app-alert>
          }
        }
        <form
          class="flex flex-col gap-5"
          novalidate
          (submit)="$event.preventDefault(); save()"
          data-testid="requisition-form"
        >
          <p class="text-meta text-fg-muted">{{ 'recruitment.form.requiredNote' | transloco }}</p>
          <app-card>
            <h2 class="mb-1 text-section font-bold text-fg">
              {{ 'recruitment.requisitionForm.roleSection' | transloco }}
            </h2>
            <p class="mb-4 text-meta text-fg-muted">
              {{ 'recruitment.requisitionForm.positionIntro' | transloco }}
            </p>
            <div class="mb-4">
              <div class="mb-1.5 text-ui font-semibold text-fg-muted">
                {{ 'recruitment.fields.position' | transloco }}
              </div>
              @if (positionRef(); as ref) {
                <div class="flex flex-wrap items-center gap-2" data-testid="req-form-position">
                  <app-entity-chip [ref]="ref" [showType]="false" />
                  @if (!locked()) {
                    <button
                      type="button"
                      class="text-ui font-semibold text-fg-muted hover:text-fg"
                      (click)="clearPosition()"
                    >
                      {{ 'recruitment.requisitionForm.removePosition' | transloco }}
                    </button>
                  }
                </div>
              } @else {
                <app-record-search-picker
                  [types]="positionTypes"
                  labelKey="recruitment.fields.position"
                  placeholderKey="recruitment.requisitionForm.findPosition"
                  testId="req-position-search"
                  (picked)="pickPosition($event)"
                />
              }
              @if (prefilled()) {
                <p class="mt-1.5 text-meta text-pass-ink" role="status">
                  {{ 'recruitment.requisitionForm.prefilled' | transloco }}
                </p>
              }
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-recruitment-field
                class="sm:col-span-2"
                labelKey="recruitment.fields.title"
                inputId="req-title"
                help="title"
                [required]="true"
                [error]="shown()['title']"
              >
                <input
                  id="req-title"
                  required
                  maxlength="255"
                  [value]="draft().title"
                  (input)="set('title', $any($event.target).value)"
                  [attr.aria-invalid]="!!shown()['title']"
                  [attr.aria-describedby]="shown()['title'] ? 'req-title-err' : null"
                  data-testid="req-title"
                />
              </app-recruitment-field>
              <app-recruitment-field
                class="sm:col-span-2"
                labelKey="recruitment.fields.description"
                inputId="req-description"
              >
                <textarea
                  id="req-description"
                  rows="4"
                  maxlength="20000"
                  [value]="draft().description"
                  (input)="set('description', $any($event.target).value)"
                ></textarea>
              </app-recruitment-field>
              <app-recruitment-field
                class="sm:col-span-2"
                labelKey="recruitment.fields.justification"
                inputId="req-justification"
                help="justification"
                [ask]="'recruitment.ask.justification' | transloco"
                [requirements]="justificationRefs"
              >
                <textarea
                  id="req-justification"
                  rows="3"
                  maxlength="5000"
                  [disabled]="locked()"
                  [value]="draft().justification"
                  (input)="set('justification', $any($event.target).value)"
                ></textarea>
              </app-recruitment-field>
              <app-recruitment-field
                labelKey="recruitment.fields.department"
                inputId="req-department"
              >
                <select
                  id="req-department"
                  [disabled]="locked()"
                  (change)="set('department_id', $any($event.target).value)"
                >
                  <option value="" [selected]="!draft().department_id">
                    {{ 'common.empty.notSet' | transloco }}
                  </option>
                  @for (d of people.departments(); track d.id) {
                    <option [value]="d.id" [selected]="d.id === draft().department_id">
                      {{ d.name }}
                    </option>
                  }
                </select>
              </app-recruitment-field>
              <app-recruitment-field labelKey="recruitment.fields.location" inputId="req-location">
                <input
                  id="req-location"
                  maxlength="200"
                  [value]="draft().location"
                  (input)="set('location', $any($event.target).value)"
                />
              </app-recruitment-field>
              <app-recruitment-field
                labelKey="recruitment.fields.employmentType"
                inputId="req-type"
                [required]="true"
              >
                <select
                  id="req-type"
                  [disabled]="locked()"
                  (change)="set('employment_type', $any($event.target).value)"
                >
                  @for (t of employmentTypes; track t) {
                    <option [value]="t" [selected]="t === draft().employment_type">
                      {{ 'recruitment.employmentType.' + t | transloco }}
                    </option>
                  }
                </select>
              </app-recruitment-field>
              <app-recruitment-field
                labelKey="recruitment.fields.headcount"
                inputId="req-headcount"
                [required]="true"
                [error]="shown()['headcount']"
              >
                <input
                  id="req-headcount"
                  type="number"
                  min="1"
                  max="500"
                  [disabled]="locked()"
                  [value]="draft().headcount"
                  (input)="set('headcount', +$any($event.target).value)"
                  [attr.aria-invalid]="!!shown()['headcount']"
                />
              </app-recruitment-field>
              <app-recruitment-field
                class="sm:col-span-2"
                labelKey="recruitment.fields.roleRisk"
                inputId="req-risk"
                help="role_risk"
                [required]="true"
                [ask]="'recruitment.ask.roleRisk' | transloco"
                [requirements]="riskRefs"
              >
                <select
                  id="req-risk"
                  [disabled]="locked()"
                  (change)="set('role_risk', $any($event.target).value)"
                >
                  @for (r of risks; track r) {
                    <option [value]="r" [selected]="r === draft().role_risk">
                      {{ 'recruitment.roleRisk.' + r | transloco }}
                    </option>
                  }
                </select>
              </app-recruitment-field>
              <p class="-mt-2 text-meta text-fg-muted sm:col-span-2" data-testid="required-checks">
                {{ 'recruitment.requisitionForm.checksForRisk' | transloco }}
                {{ checksText() }}
                @if (draft().role_risk === 'high') {
                  <span class="block">{{
                    'recruitment.requisition.legalBasisNote' | transloco
                  }}</span>
                }
              </p>
              <app-recruitment-field
                labelKey="recruitment.fields.targetStartDate"
                inputId="req-start"
              >
                <input
                  id="req-start"
                  type="date"
                  [value]="draft().target_start_date"
                  (input)="set('target_start_date', $any($event.target).value)"
                />
              </app-recruitment-field>
              <app-recruitment-field
                labelKey="recruitment.fields.hiringManager"
                inputId="req-manager"
              >
                <select
                  id="req-manager"
                  (change)="set('hiring_manager_user_id', $any($event.target).value)"
                >
                  <option value="" [selected]="!draft().hiring_manager_user_id">
                    {{ 'common.empty.notSet' | transloco }}
                  </option>
                  @for (u of people.users(); track u.id) {
                    <option [value]="u.id" [selected]="u.id === draft().hiring_manager_user_id">
                      {{ u.name }}
                    </option>
                  }
                </select>
              </app-recruitment-field>
              <app-recruitment-field
                labelKey="recruitment.fields.recruiter"
                inputId="req-recruiter"
              >
                <select
                  id="req-recruiter"
                  (change)="set('recruiter_user_id', $any($event.target).value)"
                >
                  <option value="" [selected]="!draft().recruiter_user_id">
                    {{ 'common.empty.notSet' | transloco }}
                  </option>
                  @for (u of people.users(); track u.id) {
                    <option [value]="u.id" [selected]="u.id === draft().recruiter_user_id">
                      {{ u.name }}
                    </option>
                  }
                </select>
              </app-recruitment-field>
            </div>
          </app-card>

          <app-card>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="flex flex-wrap items-center gap-1.5 text-section font-bold text-fg">
                {{ 'recruitment.requisitionForm.criteriaSection' | transloco }}
                <app-field-help
                  scope="recruitment"
                  page="requisitionForm"
                  field="screening_criteria"
                  [requirements]="criteriaRefs"
                />
                <app-ask-about
                  field="screening_criteria"
                  [prompt]="'recruitment.ask.criteria' | transloco"
                  [requirements]="criteriaRefs"
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
            @if (suggestions().length > 0) {
              <app-recruitment-ai-output
                class="my-3"
                useLabelKey="recruitment.ai.addAll"
                (used)="addSuggestions(suggestions())"
                (dismissed)="suggestions.set([])"
              >
                <ul class="flex flex-col gap-1.5">
                  @for (s of suggestions(); track $index) {
                    <li class="flex items-start justify-between gap-2 text-ui">
                      <span>
                        <span class="font-semibold text-fg">{{ s.label }}</span>
                        @if (s.description) {
                          <span class="block text-fg-muted">{{ s.description }}</span>
                        }
                      </span>
                      <button
                        type="button"
                        class="flex-none rounded-tile px-2 py-0.5 text-ui font-semibold text-accent hover:bg-accent-soft"
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
              [criteria]="draft().screening_criteria"
              (criteriaChange)="set('screening_criteria', $event)"
              [disabled]="!canWrite()"
            />
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-section font-bold text-fg">
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
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-recruitment-field
                class="sm:col-span-2"
                labelKey="recruitment.fields.postingTitle"
                inputId="req-posting-title"
              >
                <input
                  id="req-posting-title"
                  maxlength="255"
                  [value]="draft().posting_title"
                  (input)="set('posting_title', $any($event.target).value)"
                />
              </app-recruitment-field>
              <app-recruitment-field
                class="sm:col-span-2"
                labelKey="recruitment.fields.postingText"
                inputId="req-posting-text"
                help="posting_text"
              >
                <textarea
                  id="req-posting-text"
                  rows="8"
                  maxlength="20000"
                  [value]="draft().posting_text"
                  (input)="set('posting_text', $any($event.target).value)"
                ></textarea>
              </app-recruitment-field>
              <app-recruitment-field
                labelKey="recruitment.fields.postingClosesAt"
                inputId="req-closes"
              >
                <input
                  id="req-closes"
                  type="datetime-local"
                  [value]="draft().posting_closes_at"
                  (input)="set('posting_closes_at', $any($event.target).value)"
                />
              </app-recruitment-field>
            </div>
          </app-card>

          @if (editId()) {
            <app-card>
              <app-recruitment-field
                labelKey="recruitment.fields.changeReason"
                inputId="req-reason"
                help="change_reason"
              >
                <input
                  id="req-reason"
                  maxlength="500"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
              </app-recruitment-field>
            </app-card>
          }

          @if (saveError(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div
            class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
          >
            <a [routerLink]="backLink()">
              <app-button variant="secondary">{{ 'common.cancel' | transloco }}</app-button>
            </a>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="!canWrite()"
              data-testid="req-save"
            >
              {{
                (editId() ? 'recruitment.common.save' : 'recruitment.requisitionForm.create')
                  | transloco
              }}
            </app-button>
          </div>
        </form>
        <app-why-it-matters class="mt-8 block" scope="recruitment" page="requisitionForm" />
      }
    </div>
  `,
})
export class RequisitionForm {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly people = inject(RecruitmentPeople);

  protected readonly employmentTypes = EMPLOYMENT_TYPES;
  protected readonly risks = ROLE_RISKS;
  protected readonly positionTypes = ['position'];
  protected readonly criteriaRefs = ['hs:7.2'];
  protected readonly riskRefs = ['iso27001:A.6.1'];
  protected readonly justificationRefs = ['hs:7.1'];

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
  protected readonly submitted = signal(false);
  protected readonly suggestions = signal<readonly SuggestedCriterion[]>([]);
  protected readonly jobAd = signal<string | null>(null);
  protected readonly policy = signal<CheckPolicy>(DEFAULT_CHECKS);
  protected readonly position = signal<EntityChipRef | null>(null);
  protected readonly prefilled = signal(false);

  protected readonly locked = computed(() => {
    const req = this.original();
    return req !== null && isRequisitionLocked(req.status);
  });
  protected readonly canWrite = computed(() => this.original()?.can_edit ?? true);
  protected readonly errors = computed(() => requisitionErrors(this.draft()));
  /** Errors are shown after the first save attempt (validate on click). */
  protected readonly shown = computed<Partial<Record<RequisitionFormError, string>>>(() =>
    this.submitted() ? this.errors() : {},
  );
  protected readonly checksText = computed(() => {
    const list = this.policy()[this.draft().role_risk] ?? [];
    return list.length === 0
      ? this.language.translate('common.empty.none')
      : list.map((c) => this.language.translate(`recruitment.checkType.${c}`)).join(', ');
  });
  protected readonly positionRef = computed(() => this.position());
  protected readonly backLink = computed(() => {
    const id = this.editId();
    return id ? ['/recruitment/requisitions', id] : ['/recruitment/requisitions'];
  });
  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => {
    const req = this.original();
    const crumbs: Breadcrumb[] = [
      RECRUITMENT_CRUMB,
      { labelKey: 'recruitment.nav.requisitions', link: '/recruitment/requisitions' },
    ];
    if (req) {
      crumbs.push({ label: req.title, link: ['/recruitment/requisitions', req.id] });
      crumbs.push({ labelKey: 'recruitment.requisitionForm.editTitle' });
    } else {
      crumbs.push({ labelKey: 'recruitment.requisitionForm.newTitle' });
    }
    return crumbs;
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
      if (!orgId) {
        return;
      }
      const sub = this.api.getSettings(orgId).subscribe({
        next: (s) => this.policy.set(s.check_policy),
        error: () => this.policy.set(DEFAULT_CHECKS),
      });
      onCleanup(() => sub.unsubscribe());
    });
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
          const p = req.position;
          this.position.set(
            p
              ? {
                  entity_type: 'position',
                  entity_id: p.id,
                  title: p.title,
                  code: p.code,
                  url: p.url,
                }
              : null,
          );
        },
        error: (err) => this.loadError.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected set<K extends keyof RequisitionDraft>(key: K, value: RequisitionDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  /** Link a People position and fill in what the role already says (empty fields only). */
  protected pickPosition(item: SearchItem): void {
    this.position.set({
      entity_type: 'position',
      entity_id: item.entity_id,
      title: item.title,
      code: item.code,
      url: item.url,
    });
    this.set('position_id', item.entity_id);
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.api.positionPrefill(orgId, item.entity_id).subscribe({
      next: (p) => {
        const d = this.draft();
        const locked = this.locked();
        const criteria: CriterionDraft[] =
          d.screening_criteria.length > 0
            ? [...d.screening_criteria]
            : p.screening_criteria.map((c) => ({
                id: null,
                label: c.label,
                description: c.description ?? '',
              }));
        this.draft.set({
          ...d,
          title: d.title.trim() ? d.title : p.title,
          description: d.description.trim() ? d.description : (p.description ?? ''),
          department_id: locked || d.department_id ? d.department_id : (p.department_id ?? ''),
          role_risk: locked ? d.role_risk : p.role_risk,
          screening_criteria: criteria,
        });
        this.prefilled.set(true);
      },
      error: (err) => this.toasts.error(recruitmentError(err).key),
    });
  }

  protected clearPosition(): void {
    this.position.set(null);
    this.prefilled.set(false);
    this.set('position_id', '');
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
    if (!orgId || this.saving()) {
      return;
    }
    this.submitted.set(true);
    const errors = this.errors();
    if (Object.keys(errors).length > 0) {
      this.saveError.set('recruitment.form.fixErrors');
      const first = errors.title ? 'req-title' : 'req-headcount';
      this.host.nativeElement.querySelector<HTMLElement>(`#${first}`)?.focus();
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
