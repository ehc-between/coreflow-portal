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
import { AuthService } from '../../../core/auth/auth.service';
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
import { categoryKey } from '../data/process-display';
import { processErrorKey } from '../data/process-errors';
import { ProcessReferences } from '../data/process-references';
import {
  Kpi,
  PROCESS_CATEGORIES,
  PROCESS_ENTITY_TYPE,
  PROCESS_MODULE,
  ProcessCategory,
  ProcessDetail,
  TURTLE_LIST_FIELDS,
  TurtleDraft,
  TurtleListField,
} from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';
import {
  ProcessFormValue,
  emptyForm,
  formFromDetail,
  mergeTurtleDraft,
  toCreateRequest,
  toUpdateRequest,
  validateForm,
} from './process-form-model';
import { StringListEditor } from './string-list-editor';

type TextField =
  | 'title'
  | 'code'
  | 'purpose'
  | 'scope'
  | 'owner_user_id'
  | 'department_id'
  | 'parent_id'
  | 'review_interval_months'
  | 'next_review_at';

/**
 * Create (`/processes/new`) and edit (`/processes/:id/edit`) a process: the
 * register facts (title, code, category, owner, department, parent, purpose,
 * scope), the review cycle, and the turtle-diagram facts (inputs, outputs,
 * resources, competence, methods, KPIs, risks). An AI button drafts the turtle
 * facts from the title and purpose; suggestions are added, never overwritten.
 * Editing sends only the changed fields, with an optional change reason for the
 * revision history.
 */
@Component({
  selector: 'app-process-form-page',
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
    StringListEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/processes', id()] : ['/processes']"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'processes.form.backToProcess' : 'processes.form.backToList') | transloco }}
      </a>
      <h1 class="mb-3 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'processes.form.editTitle' : 'processes.form.newTitle') | transloco }}
      </h1>
      <app-guide-intro class="mb-4" scope="processes" page="form" />

      @if (loadError(); as err) {
        <app-alert tone="error">{{ err | transloco }}</app-alert>
      } @else if (id() && !original()) {
        <p class="text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()" novalidate>
          <app-card>
            <h2 class="mb-3 text-[15px] font-bold text-fg">
              {{ 'processes.form.sections.register' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px]">
              <div>
                <app-form-field [label]="'processes.fields.title' | transloco" inputId="pf-title">
                  <input
                    id="pf-title"
                    required
                    maxlength="255"
                    aria-describedby="pf-title-help"
                    [value]="form().title"
                    (input)="set('title', $any($event.target).value)"
                    data-testid="field-title"
                  />
                </app-form-field>
                <app-field-help id="pf-title-help" scope="processes" page="form" field="title" />
              </div>
              <div>
                <app-form-field [label]="'processes.fields.code' | transloco" inputId="pf-code">
                  <input
                    id="pf-code"
                    maxlength="32"
                    [placeholder]="'processes.form.codePlaceholder' | transloco"
                    [value]="form().code"
                    (input)="set('code', $any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="processes" page="form" field="code" />
              </div>
            </div>
            <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <app-form-field
                  [label]="'processes.fields.category' | transloco"
                  inputId="pf-category"
                >
                  <select
                    id="pf-category"
                    [value]="form().category"
                    (change)="setCategory($any($event.target).value)"
                  >
                    @for (c of categories; track c) {
                      <option [value]="c" [selected]="c === form().category">
                        {{ categoryKey(c) | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="processes" page="form" field="category" />
              </div>
              <div>
                <app-form-field [label]="'processes.fields.owner' | transloco" inputId="pf-owner">
                  <select id="pf-owner" (change)="set('owner_user_id', $any($event.target).value)">
                    <option value="" [selected]="!form().owner_user_id">
                      {{ 'processes.form.noOwner' | transloco }}
                    </option>
                    @if (orphanOwner(); as orphan) {
                      <option [value]="orphan.id" selected>{{ orphan.name }}</option>
                    }
                    @for (u of references.users(); track u.id) {
                      <option [value]="u.id" [selected]="u.id === form().owner_user_id">
                        {{ u.name }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="processes" page="form" field="owner" />
              </div>
              <div>
                <app-form-field
                  [label]="'processes.fields.department' | transloco"
                  inputId="pf-department"
                >
                  <select
                    id="pf-department"
                    (change)="set('department_id', $any($event.target).value)"
                  >
                    <option value="" [selected]="!form().department_id">
                      {{ 'processes.form.noDepartment' | transloco }}
                    </option>
                    @if (orphanDepartment(); as orphan) {
                      <option [value]="orphan.id" selected>{{ orphan.name }}</option>
                    }
                    @for (d of references.departments(); track d.id) {
                      <option [value]="d.id" [selected]="d.id === form().department_id">
                        {{ d.name }}
                      </option>
                    }
                  </select>
                </app-form-field>
              </div>
            </div>
            <div class="mt-4">
              <app-form-field [label]="'processes.fields.parent' | transloco" inputId="pf-parent">
                <select id="pf-parent" (change)="set('parent_id', $any($event.target).value)">
                  <option value="" [selected]="!form().parent_id">
                    {{ 'processes.form.noParent' | transloco }}
                  </option>
                  @for (p of parentOptions(); track p.id) {
                    <option [value]="p.id" [selected]="p.id === form().parent_id">
                      {{ p.code }} · {{ p.title }}
                    </option>
                  }
                </select>
              </app-form-field>
              <app-field-help scope="processes" page="form" field="parent" />
            </div>
            <div class="mt-4">
              <div class="flex items-center justify-between gap-2">
                <label for="pf-purpose" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'processes.fields.purpose' | transloco }}
                </label>
                <app-ask-about [prompt]="'processes.form.askPurpose' | transloco" field="purpose" />
              </div>
              <app-form-field>
                <textarea
                  id="pf-purpose"
                  rows="3"
                  maxlength="10000"
                  [value]="form().purpose"
                  (input)="set('purpose', $any($event.target).value)"
                ></textarea>
              </app-form-field>
              <app-field-help scope="processes" page="form" field="purpose" />
            </div>
            <div class="mt-4">
              <app-form-field [label]="'processes.fields.scope' | transloco" inputId="pf-scope">
                <textarea
                  id="pf-scope"
                  rows="2"
                  maxlength="10000"
                  [value]="form().scope"
                  (input)="set('scope', $any($event.target).value)"
                ></textarea>
              </app-form-field>
              <app-field-help scope="processes" page="form" field="scope" />
            </div>
          </app-card>

          <app-card>
            <div class="mb-1 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-[15px] font-bold text-fg">
                  {{ 'processes.form.sections.turtle' | transloco }}
                </h2>
                <p class="mt-0.5 text-[12.5px] text-fg-muted">
                  {{ 'processes.form.turtleHint' | transloco }}
                </p>
              </div>
              <app-ai-assist-button
                assist="processes.draft_turtle"
                labelKey="processes.ai.draftTurtle"
                [input]="turtleInput()"
                [entityType]="id() ? entityType : null"
                [entityId]="id() ?? null"
                [disabled]="!canDraft()"
                (result)="onTurtleDraft($event)"
              />
            </div>
            <div class="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              @for (field of listFields; track field) {
                <div>
                  <p class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                    {{ 'processes.fields.' + field | transloco }}
                  </p>
                  <app-string-list-editor
                    [name]="field"
                    [label]="'processes.fields.' + field | transloco"
                    [items]="form()[field]"
                    (itemsChange)="setList(field, $event)"
                  />
                  <app-field-help scope="processes" page="form" [field]="field" />
                </div>
              }
            </div>
            <div class="mt-5">
              <p class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                {{ 'processes.fields.kpis' | transloco }}
              </p>
              <app-field-help scope="processes" page="form" field="kpis" />
              <div class="mt-2 flex flex-col gap-2">
                @for (kpi of form().kpis; track $index; let i = $index) {
                  <div
                    class="grid grid-cols-2 gap-2 rounded-[10px] border border-border p-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                    data-testid="kpi-row"
                  >
                    <input
                      class="cf-kpi"
                      maxlength="200"
                      [attr.aria-label]="'processes.kpi.name' | transloco"
                      [placeholder]="'processes.kpi.name' | transloco"
                      [value]="kpi.name"
                      (input)="setKpi(i, { name: $any($event.target).value })"
                    />
                    <input
                      class="cf-kpi"
                      maxlength="200"
                      [attr.aria-label]="'processes.kpi.target' | transloco"
                      [placeholder]="'processes.kpi.target' | transloco"
                      [value]="kpi.target ?? ''"
                      (input)="setKpi(i, { target: $any($event.target).value })"
                    />
                    <input
                      class="cf-kpi"
                      maxlength="50"
                      [attr.aria-label]="'processes.kpi.unit' | transloco"
                      [placeholder]="'processes.kpi.unit' | transloco"
                      [value]="kpi.unit ?? ''"
                      (input)="setKpi(i, { unit: $any($event.target).value })"
                    />
                    <input
                      class="cf-kpi"
                      maxlength="50"
                      [attr.aria-label]="'processes.kpi.frequency' | transloco"
                      [placeholder]="'processes.kpi.frequency' | transloco"
                      [value]="kpi.frequency ?? ''"
                      (input)="setKpi(i, { frequency: $any($event.target).value })"
                    />
                    <button
                      type="button"
                      class="flex h-9 w-9 items-center justify-center rounded-[8px] text-fg-subtle hover:text-fail"
                      [attr.aria-label]="'processes.kpi.remove' | transloco: { name: kpi.name }"
                      (click)="removeKpi(i)"
                    >
                      <app-icon name="x" [size]="14" />
                    </button>
                  </div>
                }
              </div>
              @if (form().kpis.length < 50) {
                <app-button class="mt-2" variant="secondary" size="sm" (click)="addKpi()">
                  <app-icon name="plus" [size]="14" />
                  {{ 'processes.kpi.add' | transloco }}
                </app-button>
              }
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-3 text-[15px] font-bold text-fg">
              {{ 'processes.form.sections.review' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <app-form-field
                  [label]="'processes.fields.reviewInterval' | transloco"
                  inputId="pf-interval"
                >
                  <input
                    id="pf-interval"
                    type="number"
                    min="1"
                    max="60"
                    step="1"
                    [value]="form().review_interval_months"
                    (input)="set('review_interval_months', $any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="processes" page="form" field="reviewInterval" />
              </div>
              <div>
                <app-form-field
                  [label]="'processes.fields.nextReview' | transloco"
                  inputId="pf-next-review"
                >
                  <input
                    id="pf-next-review"
                    type="date"
                    [value]="form().next_review_at"
                    (input)="set('next_review_at', $any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="processes" page="form" field="nextReview" />
              </div>
            </div>
            @if (id()) {
              <div class="mt-4">
                <app-form-field
                  [label]="'processes.fields.changeReason' | transloco"
                  inputId="pf-reason"
                >
                  <input
                    id="pf-reason"
                    maxlength="1000"
                    [value]="changeReason()"
                    (input)="changeReason.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="processes" page="form" field="changeReason" />
              </div>
            }
          </app-card>

          @if (problems().length > 0 && attempted()) {
            <app-alert tone="error">
              <ul class="list-disc pl-4">
                @for (p of problems(); track p) {
                  <li>{{ p | transloco }}</li>
                }
              </ul>
            </app-alert>
          }

          <div class="flex flex-wrap items-center justify-end gap-2">
            <a [routerLink]="id() ? ['/processes', id()] : ['/processes']">
              <app-button variant="secondary">{{ 'common.cancel' | transloco }}</app-button>
            </a>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="saving()"
              data-testid="submit"
            >
              {{ (id() ? 'processes.form.save' : 'processes.form.create') | transloco }}
            </app-button>
          </div>
        </form>
        <app-why-it-matters class="mt-5" scope="processes" page="form" />
      }
    </div>
  `,
  styles: [
    `
      .cf-kpi {
        width: 100%;
        height: 36px;
        border-radius: 9px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        padding: 0 10px;
        outline: none;
      }
      .cf-kpi:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ProcessFormPage {
  private readonly api = inject(ProcessesApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly references = inject(ProcessReferences);

  /** Route param; set on `/processes/:id/edit`, absent on `/processes/new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly categories = PROCESS_CATEGORIES;
  protected readonly categoryKey = categoryKey;
  protected readonly listFields = TURTLE_LIST_FIELDS;
  protected readonly entityType = PROCESS_ENTITY_TYPE;

  protected readonly form = signal<ProcessFormValue>(emptyForm(this.auth.user()?.id ?? ''));
  protected readonly original = signal<ProcessDetail | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly changeReason = signal('');

  protected readonly problems = computed(() => validateForm(this.form()));
  protected readonly canDraft = computed(() => this.form().title.trim().length > 0);

  protected readonly parentOptions = computed(() => {
    const id = this.id();
    return this.references.processes().filter((p) => p.id !== id && p.status !== 'retired');
  });

  /** The current owner when the member list doesn't include them (e.g. no `documents:read`). */
  protected readonly orphanOwner = computed(() => {
    const original = this.original()?.owner;
    const value = this.form().owner_user_id;
    if (!original || original.id !== value || this.references.users().some((u) => u.id === value)) {
      return null;
    }
    return { id: original.id, name: original.name ?? original.id };
  });

  protected readonly orphanDepartment = computed(() => {
    const original = this.original()?.department;
    const value = this.form().department_id;
    if (
      !original ||
      original.id !== value ||
      this.references.departments().some((d) => d.id === value)
    ) {
      return null;
    }
    return { id: original.id, name: original.name ?? original.id };
  });

  protected readonly turtleInput = computed(() => {
    const f = this.form();
    const description = [f.title, f.purpose, f.scope].map((s) => s.trim()).filter(Boolean);
    return {
      description: description.join('\n\n') || undefined,
      process_id: this.id() || undefined,
    };
  });

  constructor() {
    providePageContext(() => {
      const id = this.id();
      return {
        module: PROCESS_MODULE,
        entityType: id ? PROCESS_ENTITY_TYPE : null,
        entityId: id ?? null,
        view: id ? 'edit' : 'new',
        title: this.form().title || null,
      };
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (!orgId) {
        return;
      }
      untracked(() => {
        this.references.ensurePeople();
        this.references.ensureProcesses();
        if (id) {
          this.load(orgId, id);
        }
      });
    });
  }

  private load(orgId: string, id: string): void {
    this.loadError.set(null);
    this.api.get(orgId, id).subscribe({
      next: (process) => {
        this.original.set(process);
        this.form.set(formFromDetail(process));
      },
      error: (error) => this.loadError.set(processErrorKey(error)),
    });
  }

  protected set(field: TextField, value: string): void {
    this.form.update((f) => ({ ...f, [field]: value }));
  }

  protected setCategory(value: string): void {
    this.form.update((f) => ({ ...f, category: value as ProcessCategory }));
  }

  protected setList(field: TurtleListField, items: readonly string[]): void {
    this.form.update((f) => ({ ...f, [field]: items }));
  }

  protected addKpi(): void {
    this.form.update((f) => ({ ...f, kpis: [...f.kpis, { name: '' }] }));
  }

  protected setKpi(index: number, patch: Partial<Kpi>): void {
    this.form.update((f) => ({
      ...f,
      kpis: f.kpis.map((k, i) => (i === index ? { ...k, ...patch } : k)),
    }));
  }

  protected removeKpi(index: number): void {
    this.form.update((f) => ({ ...f, kpis: f.kpis.filter((_, i) => i !== index) }));
  }

  protected onTurtleDraft(data: unknown): void {
    if (!data || typeof data !== 'object') {
      return;
    }
    this.form.update((f) => mergeTurtleDraft(f, data as TurtleDraft));
    this.notifications.info('processes.ai.draftApplied');
  }

  protected submit(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || this.problems().length > 0) {
      return;
    }
    const original = this.original();
    const id = this.id();
    if (id && original) {
      const patch = toUpdateRequest(this.form(), original, this.changeReason());
      if (Object.keys(patch).length === 0) {
        void this.router.navigate(['/processes', id]);
        return;
      }
      this.saving.set(true);
      this.api.update(orgId, id, patch).subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.notifications.success('processes.notices.saved');
          void this.router.navigate(['/processes', saved.id]);
        },
        error: (error) => this.fail(error),
      });
      return;
    }
    this.saving.set(true);
    this.api.create(orgId, toCreateRequest(this.form())).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.references.ensureProcesses(true);
        this.notifications.success('processes.notices.created', { code: created.code });
        void this.router.navigate(['/processes', created.id]);
      },
      error: (error) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.saving.set(false);
    this.notifications.error(processErrorKey(error));
  }
}
