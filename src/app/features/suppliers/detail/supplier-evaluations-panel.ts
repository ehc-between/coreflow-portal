import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { blankToNull, decisionTone, evaluationStatusTone } from '../data/supplier-display';
import { supplierErrorKey } from '../data/supplier-errors';
import {
  APPROVAL_KINDS,
  EVALUATION_KINDS,
  EvaluationKind,
  EvaluationListItem,
  Questionnaire,
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
 * A supplier's evaluations (all kinds) and the "start evaluation" form: kind, the
 * questionnaire (built-in or an org template for that kind), title, evaluator and
 * due date. Creating one opens it, ready to answer.
 */
@Component({
  selector: 'app-supplier-evaluations-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Alert,
    Badge,
    Button,
    Card,
    FieldHelp,
    FormField,
    Icon,
    SlideOver,
    SupplierUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <div class="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'suppliers.evaluations.title' | transloco }}
        </h2>
        @if (canWrite()) {
          <app-button size="sm" (click)="openForm()" data-testid="start-evaluation">
            <app-icon name="plus" [size]="14" />
            {{ 'suppliers.evaluations.start' | transloco }}
          </app-button>
        }
      </div>
      @switch (state()) {
        @case ('loading') {
          <p class="px-4 pb-4 text-[13.5px] text-fg-muted">
            {{ 'suppliers.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="px-4 pb-4 text-[13.5px] text-fail">
            {{ 'suppliers.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (items().length === 0) {
            <p class="px-4 pb-4 text-[13.5px] text-fg-muted">
              {{ 'suppliers.evaluations.none' | transloco }}
            </p>
          } @else {
            <ul class="divide-y divide-border border-t border-border">
              @for (e of items(); track e.id) {
                <li class="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <div class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/suppliers', supplier().id, 'evaluations', e.id]"
                      class="block truncate text-[13.5px] font-semibold text-fg hover:underline"
                    >
                      {{ e.title }}
                    </a>
                    <span class="text-[12px] text-fg-subtle">
                      {{ 'suppliers.evaluationKind.' + e.kind | transloco }}
                      @if (e.evaluator?.name; as name) {
                        · {{ name }}
                      }
                    </span>
                  </div>
                  <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                    @if (e.score !== null) {
                      <span>{{
                        'suppliers.list.score'
                          | transloco: { score: (e.score | localNumber: '1.0-1') }
                      }}</span>
                    }
                    @if (e.decision) {
                      <app-badge [tone]="decisionTone(e.decision)">
                        {{ 'suppliers.decision.' + e.decision | transloco }}
                      </app-badge>
                    } @else {
                      <app-badge [tone]="statusTone(e.status)">
                        {{ 'suppliers.evaluationStatus.' + e.status | transloco }}
                      </app-badge>
                    }
                    @if (e.due_at && (e.status === 'draft' || e.status === 'submitted')) {
                      <span [class.text-fail]="e.overdue" [class.font-semibold]="e.overdue">
                        {{
                          'suppliers.evaluations.due' | transloco: { date: (e.due_at | localDay) }
                        }}
                      </span>
                    }
                  </span>
                </li>
              }
            </ul>
          }
        }
      }
    </app-card>

    <app-slide-over
      [open]="formOpen()"
      [title]="'suppliers.evaluations.startTitle' | transloco"
      [subtitle]="supplier().code + ' ' + supplier().name"
      [closeLabel]="'common.cancel' | transloco"
      (closed)="formOpen.set(false)"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); create()">
        <div>
          <div class="flex items-center gap-1">
            <app-field-help scope="suppliers" page="evaluation" field="kind" />
          </div>
          <app-form-field [label]="'suppliers.evaluations.kind' | transloco" inputId="ev-kind">
            <select id="ev-kind" (change)="setKind($any($event.target).value)">
              @for (k of kinds; track k) {
                <option [value]="k" [selected]="kind() === k">
                  {{ 'suppliers.evaluationKind.' + k | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <p class="mt-1 text-[12px] text-fg-subtle">
            {{
              (affectsStatus()
                ? 'suppliers.evaluations.kindSetsStatus'
                : 'suppliers.evaluations.kindRecordsOnly'
              ) | transloco
            }}
          </p>
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
            [placeholder]="'suppliers.evaluations.titlePlaceholder' | transloco"
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
            [value]="dueDay()"
            (input)="dueDay.set($any($event.target).value)"
          />
        </app-form-field>
        @if (formError(); as key) {
          <app-alert>{{ key | transloco }}</app-alert>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="ghost" (click)="formOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()">
            {{ 'suppliers.evaluations.create' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class SupplierEvaluationsPanel {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly supplier = input.required<SupplierDetail>();
  readonly canWrite = input(false);
  /** Ask the panel to open the start form (e.g. from the page header). */
  readonly startRequest = input(0);
  /** An evaluation was created (the page refreshes the supplier). */
  readonly created = output<EvaluationListItem>();

  protected readonly kinds = EVALUATION_KINDS;
  protected readonly statusTone = evaluationStatusTone;
  protected readonly decisionTone = decisionTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly EvaluationListItem[]>([]);

  protected readonly formOpen = signal(false);
  protected readonly kind = signal<EvaluationKind>('initial');
  protected readonly allTemplates = signal<readonly Questionnaire[]>([]);
  protected readonly templateId = signal('');
  protected readonly title = signal('');
  protected readonly evaluator = signal('');
  protected readonly dueDay = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly templates = computed(() =>
    this.allTemplates().filter((t) => t.kind === this.kind()),
  );
  protected readonly affectsStatus = computed(() => APPROVAL_KINDS.includes(this.kind()));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      // Tracks the whole record, so the list reloads when the supplier refreshes.
      const id = this.supplier().id;
      untracked(() => this.load(orgId, id));
    });
    effect(() => {
      if (this.startRequest() > 0) {
        untracked(() => this.openForm());
      }
    });
  }

  protected openForm(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.formError.set(null);
    this.title.set('');
    this.evaluator.set('');
    this.dueDay.set('');
    this.setKind(defaultKind(this.supplier()));
    this.formOpen.set(true);
    const lang = questionnaireLang(this.language.active());
    this.api.listQuestionnaires(orgId, { lang }).subscribe({
      next: (res) => {
        this.allTemplates.set(res.items);
        this.pickDefaultTemplate();
      },
      error: () => this.allTemplates.set([]),
    });
  }

  protected setKind(kind: EvaluationKind): void {
    this.kind.set(kind);
    this.pickDefaultTemplate();
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
        lang: questionnaireLang(this.language.active()),
      })
      .subscribe({
        next: (evaluation) => {
          this.busy.set(false);
          this.formOpen.set(false);
          this.created.emit(evaluation);
          void this.router.navigate([
            '/suppliers',
            this.supplier().id,
            'evaluations',
            evaluation.id,
          ]);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.formError.set(supplierErrorKey(err));
        },
      });
  }

  private load(orgId: string | null, supplierId: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listSupplierEvaluations(orgId, supplierId, { limit: 50 }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
