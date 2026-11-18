import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { blankToNull } from '../data/supplier-display';
import { supplierErrorKey } from '../data/supplier-errors';
import {
  APPROVAL_KINDS,
  EVALUATION_KINDS,
  EvaluationDetail,
  EvaluationKind,
  Questionnaire,
  RequiredAssessment,
  SupplierDetail,
} from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { SupplierUserSelect } from '../shared/people-select';

/** The questionnaire language for the active UI language (the backend has en and nb). */
export function questionnaireLang(active: string): 'en' | 'nb' {
  return active === 'nb' ? 'nb' : 'en';
}

/** The default kind of a new evaluation: initial until approved once, then periodic. */
export function defaultKind(s: Pick<SupplierDetail, 'approved_at' | 'status'>): EvaluationKind {
  return s.approved_at || s.status === 'approved' || s.status === 'conditional'
    ? 'periodic'
    : 'initial';
}

/**
 * The kind to suggest: the first assessment the risk profile calls for that is not done
 * and not started yet (e.g. the privacy assessment of a supplier that processes personal
 * data), else the approval kind (initial / periodic).
 */
export function recommendedKind(
  s: Pick<SupplierDetail, 'approved_at' | 'status' | 'required_assessments'>,
): EvaluationKind {
  const missing = (s.required_assessments ?? []).find((r) => !r.done && !r.open_evaluation_id);
  return missing?.kind ?? defaultKind(s);
}

/**
 * The kinds offered for a supplier: the approval kinds, plus the assessments its risk
 * profile calls for (a supplier without AI gets no AI assessment). `all` lists every kind.
 */
export function offeredKinds(
  required: readonly RequiredAssessment[] | undefined,
  all: boolean,
): readonly EvaluationKind[] {
  if (all || !required) {
    return EVALUATION_KINDS;
  }
  const needed = new Set(required.map((r) => r.kind));
  return EVALUATION_KINDS.filter((k) => APPROVAL_KINDS.includes(k) || needed.has(k));
}

/**
 * "Start vurdering" for a supplier: the kind (recommended from the risk profile, with the
 * reason), the questionnaire for that kind, an optional title (default: the kind's name),
 * evaluator and due date. Owned by the supplier page so the header action works on every
 * tab. Emits the created evaluation (the page opens it).
 */
@Component({
  selector: 'app-start-evaluation-dialog',
  imports: [TranslocoPipe, Alert, Button, FieldHelp, FormField, SlideOver, SupplierUserSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'suppliers.evaluations.startTitle' | transloco"
      [subtitle]="supplier().code + ' ' + supplier().name"
      [closeLabel]="'common.cancel' | transloco"
      (closed)="closed.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); create()">
        <div>
          <app-form-field [label]="'suppliers.evaluations.kind' | transloco" inputId="ev-kind">
            <app-field-help label-suffix scope="suppliers" page="evaluation" field="kind" />
            <select id="ev-kind" (change)="setKind($any($event.target).value)">
              @for (k of kinds(); track k) {
                <option [value]="k" [selected]="kind() === k">
                  {{
                    (isRecommended(k)
                      ? 'suppliers.evaluations.kindRecommended'
                      : 'suppliers.evaluationKind.' + k
                    ) | transloco: { kind: ('suppliers.evaluationKind.' + k | transloco) }
                  }}
                </option>
              }
            </select>
          </app-form-field>
          @if (reasonOf(kind()); as reason) {
            <p class="mt-1 text-meta text-fg-muted" data-testid="kind-reason">
              {{ 'suppliers.required.why.' + reason | transloco }}
            </p>
          }
          <p class="mt-1 text-meta text-fg-subtle">
            {{
              (affectsStatus()
                ? 'suppliers.evaluations.kindSetsStatus'
                : 'suppliers.evaluations.kindRecordsOnly'
              ) | transloco
            }}
          </p>
          @if (!showAll() && hiddenKinds() > 0) {
            <button
              type="button"
              class="mt-1 text-meta font-semibold text-accent hover:underline"
              (click)="showAll.set(true)"
            >
              {{ 'suppliers.evaluations.showAllKinds' | transloco }}
            </button>
          }
        </div>
        <app-form-field
          [label]="'suppliers.evaluations.questionnaire' | transloco"
          inputId="ev-template"
        >
          <select id="ev-template" (change)="templateId.set($any($event.target).value)">
            @for (t of templates(); track t.id) {
              <option [value]="t.id" [selected]="templateId() === t.id">
                {{ t.name }}
                ({{
                  'suppliers.evaluations.questionCount' | transloco: { count: t.questions.length }
                }})
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'suppliers.evaluations.titleField' | transloco" inputId="ev-title">
          <input
            id="ev-title"
            type="text"
            maxlength="255"
            [placeholder]="
              'suppliers.evaluations.titlePlaceholder'
                | transloco: { kind: ('suppliers.evaluationKind.' + kind() | transloco) }
            "
            [value]="title()"
            (input)="title.set($any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'suppliers.evaluations.evaluator' | transloco" inputId="ev-user">
          <app-supplier-user-select
            inputId="ev-user"
            [value]="evaluator()"
            (valueChange)="evaluator.set($event)"
          />
        </app-form-field>
        <app-form-field [label]="'suppliers.evaluations.dueAt' | transloco" inputId="ev-due">
          <input
            id="ev-due"
            type="date"
            [attr.lang]="lang()"
            [value]="dueDay()"
            (input)="dueDay.set($any($event.target).value)"
          />
        </app-form-field>
        @if (formError(); as key) {
          <app-alert>{{ key | transloco }}</app-alert>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="ghost" (click)="closed.emit()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()" data-testid="start-evaluation-submit">
            {{ 'suppliers.evaluations.create' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class StartEvaluationDialog {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  readonly supplier = input.required<SupplierDetail>();
  readonly open = input(false);
  /** The kind to start with (e.g. the one a "Start" button next to it asked for). */
  readonly preferredKind = input<EvaluationKind | null>(null);
  readonly closed = output<void>();
  readonly created = output<EvaluationDetail>();

  protected readonly kind = signal<EvaluationKind>('initial');
  protected readonly showAll = signal(false);
  protected readonly allTemplates = signal<readonly Questionnaire[]>([]);
  protected readonly templateId = signal('');
  protected readonly title = signal('');
  protected readonly evaluator = signal('');
  protected readonly dueDay = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly lang = computed(() => questionnaireLang(this.language.active()));
  protected readonly kinds = computed(() => {
    const offered = offeredKinds(this.supplier().required_assessments, this.showAll());
    // The chosen kind always stays selectable (e.g. asked for by a button).
    return offered.includes(this.kind())
      ? offered
      : EVALUATION_KINDS.filter((k) => offered.includes(k) || k === this.kind());
  });
  protected readonly hiddenKinds = computed(
    () =>
      EVALUATION_KINDS.length - offeredKinds(this.supplier().required_assessments, false).length,
  );
  protected readonly templates = computed(() =>
    this.allTemplates().filter((t) => t.kind === this.kind()),
  );
  protected readonly affectsStatus = computed(() => APPROVAL_KINDS.includes(this.kind()));

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
  }

  protected isRecommended(kind: EvaluationKind): boolean {
    return recommendedKind(this.supplier()) === kind;
  }

  /** Why the risk profile calls for this kind (null for kinds it does not require). */
  protected reasonOf(kind: EvaluationKind): string | null {
    const r = (this.supplier().required_assessments ?? []).find((a) => a.kind === kind);
    return r && r.reason !== 'always' ? r.reason : null;
  }

  protected setKind(kind: EvaluationKind): void {
    this.kind.set(kind);
    this.pickDefaultTemplate();
  }

  private reset(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.formError.set(null);
    this.title.set('');
    this.evaluator.set('');
    this.dueDay.set('');
    this.showAll.set(false);
    this.setKind(this.preferredKind() ?? recommendedKind(this.supplier()));
    if (!orgId) {
      return;
    }
    this.api.listQuestionnaires(orgId, { lang: this.lang() }).subscribe({
      next: (res) => {
        this.allTemplates.set(res.items);
        this.pickDefaultTemplate();
      },
      error: () => this.allTemplates.set([]),
    });
  }

  private pickDefaultTemplate(): void {
    const list = this.templates();
    const builtin = list.find((t) => t.id === `builtin-${this.kind()}`);
    this.templateId.set(builtin?.id ?? list[0]?.id ?? '');
  }

  protected create(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const due = this.dueDay();
    this.busy.set(true);
    this.formError.set(null);
    this.api
      .createEvaluation(orgId, this.supplier().id, {
        kind: this.kind(),
        title: blankToNull(this.title()),
        template_id: this.templateId() || null,
        evaluator_user_id: this.evaluator() || null,
        due_at: due ? `${due}T23:59:59` : null,
        lang: this.lang(),
      })
      .subscribe({
        next: (evaluation) => {
          this.busy.set(false);
          this.created.emit(evaluation);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.formError.set(supplierErrorKey(err));
        },
      });
  }
}
