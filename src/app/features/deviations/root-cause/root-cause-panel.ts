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
import { FormsModule } from '@angular/forms';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  FISHBONE_CATEGORIES,
  FishboneCategory,
  RootCauseAnalysis,
  RootCauseAnalysisMethod,
  SuggestedRootCause,
} from '../../../core/deviations/deviation.models';
import { notifyDeviationError } from '../../../core/deviations/deviation-errors';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  MAX_WHYS,
  WorksheetForm,
  createRequest,
  emptyWorksheet,
  lastAnswer,
  updateRequest,
  worksheetFromAnalysis,
  worksheetFromSuggestion,
} from './root-cause-form';

/**
 * Root-cause tools on a deviation (M03): 5 Whys and fishbone (Ishikawa)
 * worksheets. Lists the saved worksheets; with `canEdit` a user starts a new one
 * (or lets AI draft one to review), edits, applies the conclusion to the
 * deviation's root cause, or removes it. `applied` fires after the root cause
 * changed so the host refreshes the deviation.
 */
@Component({
  selector: 'app-root-cause-panel',
  imports: [
    TourStepDirective,
    FormsModule,
    TranslocoPipe,
    Badge,
    Button,
    Icon,
    ConfirmDialog,
    AiAssistButton,
    FieldHelp,
    LocalDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId" appTourStep="deviations-root-cause">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <h2
            [id]="headingId"
            class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg"
          >
            {{ 'deviations.rootCauses.title' | transloco }}
          </h2>
          <app-field-help scope="deviations" page="detail" field="root_cause_tools" />
        </div>
        @if (canEdit() && !form()) {
          <div class="flex flex-wrap items-center gap-2">
            <app-button variant="secondary" size="sm" (click)="start('five_whys')">
              <app-icon name="plus" [size]="15" />
              {{ 'deviations.rootCauses.newFiveWhys' | transloco }}
            </app-button>
            <app-button variant="secondary" size="sm" (click)="start('fishbone')">
              <app-icon name="plus" [size]="15" />
              {{ 'deviations.rootCauses.newFishbone' | transloco }}
            </app-button>
            <app-ai-assist-button
              assist="deviations.suggest_root_cause"
              labelKey="deviations.assist.suggestRootCause"
              entityType="deviation"
              [entityId]="deviationId()"
              (result)="onSuggestion($event)"
            />
          </div>
        }
      </div>

      @if (form(); as f) {
        <form
          class="mb-4 flex flex-col gap-3 rounded-tile border border-border bg-surface-2 p-3.5"
          (ngSubmit)="save()"
          data-testid="root-cause-editor"
        >
          <p class="text-[13px] font-semibold text-fg">
            {{ 'deviations.rootCauses.methods.' + f.method | transloco }}
            @if (fromAi()) {
              <span class="ml-1 text-[12px] font-normal text-fg-muted">{{
                'deviations.rootCauses.aiDraftNote' | transloco
              }}</span>
            }
          </p>
          <div class="flex flex-col gap-1.5">
            <label [for]="ids.problem" class="text-[13px] font-semibold text-fg-muted">
              {{ 'deviations.rootCauses.problem' | transloco }}
            </label>
            <textarea
              [id]="ids.problem"
              name="problem"
              rows="2"
              maxlength="4000"
              [ngModel]="f.problem"
              (ngModelChange)="patch({ problem: $event })"
              class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent"
            ></textarea>
          </div>

          @if (f.method === 'five_whys') {
            <ol
              class="flex flex-col gap-2.5"
              [attr.aria-label]="'deviations.rootCauses.whys' | transloco"
            >
              @for (step of f.whys; track $index; let i = $index) {
                <li
                  class="grid gap-2 rounded-[10px] border border-border bg-surface p-2.5 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-start"
                >
                  <span class="pt-2 text-[12px] font-bold text-fg-subtle">{{ i + 1 }}.</span>
                  <input
                    type="text"
                    [name]="'q' + i"
                    maxlength="1000"
                    [ngModel]="step.question"
                    (ngModelChange)="setWhy(i, 'question', $event)"
                    [attr.aria-label]="'deviations.rootCauses.question' | transloco: { n: i + 1 }"
                    class="h-9 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    [name]="'a' + i"
                    maxlength="2000"
                    [ngModel]="step.answer"
                    (ngModelChange)="setWhy(i, 'answer', $event)"
                    [placeholder]="'deviations.rootCauses.answerPlaceholder' | transloco"
                    [attr.aria-label]="'deviations.rootCauses.answer' | transloco: { n: i + 1 }"
                    class="h-9 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    (click)="removeWhy(i)"
                    [attr.aria-label]="'deviations.rootCauses.removeWhy' | transloco: { n: i + 1 }"
                    class="flex h-9 w-9 items-center justify-center rounded-[8px] text-fg-subtle hover:bg-surface-2 hover:text-fail"
                  >
                    <app-icon name="x" [size]="15" />
                  </button>
                </li>
              }
            </ol>
            <div class="flex flex-wrap gap-2">
              @if (f.whys.length < maxWhys) {
                <app-button variant="ghost" size="sm" (click)="addWhy()">
                  <app-icon name="plus" [size]="14" />
                  {{ 'deviations.rootCauses.addWhy' | transloco }}
                </app-button>
              }
              @if (suggestedConclusion()) {
                <app-button variant="ghost" size="sm" (click)="useLastAnswer()">
                  {{ 'deviations.rootCauses.useLastAnswer' | transloco }}
                </app-button>
              }
            </div>
          }

          @if (f.method === 'fishbone') {
            <p class="text-[12.5px] text-fg-muted">
              {{ 'deviations.rootCauses.fishboneHint' | transloco }}
            </p>
            <div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              @for (category of categories; track category) {
                <div class="flex flex-col gap-1">
                  <label
                    [for]="ids.category + category"
                    class="text-[12px] font-semibold text-fg-muted"
                  >
                    {{ 'deviations.rootCauses.categories.' + category | transloco }}
                  </label>
                  <textarea
                    [id]="ids.category + category"
                    [name]="'cat-' + category"
                    rows="3"
                    [ngModel]="f.categories[category]"
                    (ngModelChange)="setCategory(category, $event)"
                    class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-accent"
                  ></textarea>
                </div>
              }
            </div>
          }

          <div class="flex flex-col gap-1.5">
            <label [for]="ids.conclusion" class="text-[13px] font-semibold text-fg-muted">
              {{ 'deviations.rootCauses.conclusion' | transloco }}
            </label>
            <textarea
              [id]="ids.conclusion"
              name="conclusion"
              rows="2"
              maxlength="4000"
              [ngModel]="f.conclusion"
              (ngModelChange)="patch({ conclusion: $event })"
              class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent"
            ></textarea>
          </div>
          @if (!editingId()) {
            <label class="inline-flex items-center gap-2 text-[13px] text-fg">
              <input
                type="checkbox"
                name="apply"
                [ngModel]="f.apply"
                (ngModelChange)="patch({ apply: $event })"
                [disabled]="!f.conclusion.trim()"
              />
              {{ 'deviations.rootCauses.applyOnSave' | transloco }}
            </label>
          }
          <div class="flex items-center gap-2">
            <app-button type="submit" size="sm" [loading]="saving()">
              {{ 'deviations.rootCauses.save' | transloco }}
            </app-button>
            <app-button variant="ghost" size="sm" (click)="cancel()">
              {{ 'common.cancel' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @if (loading()) {
        <p class="py-3 text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (items().length === 0 && !form()) {
        <p class="py-3 text-[13.5px] text-fg-muted">
          {{ 'deviations.rootCauses.empty' | transloco }}
        </p>
      } @else {
        <ul class="flex flex-col gap-2.5">
          @for (item of items(); track item.id) {
            <li
              class="rounded-tile border border-border bg-surface p-3.5"
              [attr.data-analysis]="item.id"
            >
              <div class="flex flex-wrap items-center gap-1.5">
                <app-badge tone="neutral">{{ methodKey(item.method) | transloco }}</app-badge>
                @if (item.applied_at) {
                  <app-badge tone="pass">{{
                    'deviations.rootCauses.applied' | transloco
                  }}</app-badge>
                }
                <span class="text-[12px] text-fg-subtle">
                  {{
                    'deviations.rootCauses.byline'
                      | transloco
                        : {
                            name: item.created_by_name ?? '',
                            date: (item.updated_at | localDate: 'mediumDate'),
                          }
                  }}
                </span>
              </div>
              @if (item.problem) {
                <p class="mt-2 text-[13px] text-fg">
                  <span class="font-semibold"
                    >{{ 'deviations.rootCauses.problem' | transloco }}:</span
                  >
                  {{ item.problem }}
                </p>
              }
              @if (item.whys.length) {
                <ol class="mt-2 flex flex-col gap-1 border-l-2 border-accent-border pl-3">
                  @for (step of item.whys; track $index) {
                    <li class="text-[12.5px]">
                      <span class="text-fg-muted">{{ step.question }}</span>
                      <span class="block text-fg">{{ step.answer || '—' }}</span>
                    </li>
                  }
                </ol>
              }
              @if (hasCauses(item)) {
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="fishbone">
                  @for (category of categories; track category) {
                    @if (item.categories[category]?.length) {
                      <div class="rounded-[10px] bg-surface-2 px-2.5 py-2">
                        <p class="text-[11px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
                          {{ 'deviations.rootCauses.categories.' + category | transloco }}
                        </p>
                        <ul class="mt-1 list-disc pl-4 text-[12.5px] text-fg">
                          @for (cause of item.categories[category]; track $index) {
                            <li>{{ cause }}</li>
                          }
                        </ul>
                      </div>
                    }
                  }
                </div>
              }
              @if (item.conclusion) {
                <p class="mt-2 rounded-[8px] bg-accent-soft/40 px-3 py-2 text-[13px] text-fg">
                  <span class="font-semibold"
                    >{{ 'deviations.rootCauses.conclusion' | transloco }}:</span
                  >
                  {{ item.conclusion }}
                </p>
              }
              @if (canEdit()) {
                <div class="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  <app-button
                    variant="secondary"
                    size="sm"
                    [disabled]="busyId() === item.id"
                    (click)="edit(item)"
                  >
                    {{ 'deviations.rootCauses.edit' | transloco }}
                  </app-button>
                  <app-button
                    variant="secondary"
                    size="sm"
                    [disabled]="!item.conclusion || busyId() === item.id"
                    [loading]="busyId() === item.id && applying()"
                    (click)="apply(item)"
                  >
                    {{ 'deviations.rootCauses.apply' | transloco }}
                  </app-button>
                  <app-button
                    variant="ghost"
                    size="sm"
                    [disabled]="busyId() === item.id"
                    (click)="confirmRemove.set(item)"
                  >
                    {{ 'deviations.rootCauses.remove' | transloco }}
                  </app-button>
                </div>
              }
            </li>
          }
        </ul>
      }

      <app-confirm-dialog
        [open]="confirmRemove() !== null"
        [busy]="busyId() !== null"
        [title]="'deviations.rootCauses.removeTitle' | transloco"
        [message]="'deviations.rootCauses.removeConfirm' | transloco"
        [confirmLabel]="'deviations.rootCauses.remove' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        (confirmed)="remove()"
        (cancelled)="confirmRemove.set(null)"
      />
    </section>
  `,
})
export class RootCausePanel {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly deviationId = input.required<string>();
  readonly canEdit = input(false);
  /** The deviation's description, used as the default problem statement. */
  readonly problem = input('');

  /** The deviation's root cause was changed (applied); the host refreshes it. */
  readonly applied = output<void>();

  private static nextId = 0;
  private readonly uid = ++RootCausePanel.nextId;
  protected readonly headingId = `rca-heading-${this.uid}`;
  protected readonly ids = {
    problem: `rca-problem-${this.uid}`,
    conclusion: `rca-conclusion-${this.uid}`,
    category: `rca-cat-${this.uid}-`,
  };
  protected readonly categories = FISHBONE_CATEGORIES;
  protected readonly maxWhys = MAX_WHYS;

  protected readonly items = signal<readonly RootCauseAnalysis[]>([]);
  protected readonly loading = signal(false);
  protected readonly form = signal<WorksheetForm | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly fromAi = signal(false);
  protected readonly saving = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly applying = signal(false);
  protected readonly confirmRemove = signal<RootCauseAnalysis | null>(null);

  protected readonly suggestedConclusion = computed(() => {
    const f = this.form();
    return f && !f.conclusion.trim() ? lastAnswer(f) : '';
  });

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.deviationId();
      untracked(() => this.load(orgId, id));
    });
  }

  protected methodKey(method: string): string {
    return `deviations.rootCauses.methods.${['five_whys', 'fishbone'].includes(method) ? method : 'other'}`;
  }

  protected hasCauses(item: RootCauseAnalysis): boolean {
    return FISHBONE_CATEGORIES.some((c) => (item.categories[c]?.length ?? 0) > 0);
  }

  protected start(method: RootCauseAnalysisMethod): void {
    this.editingId.set(null);
    this.fromAi.set(false);
    this.form.set(
      emptyWorksheet(
        method,
        this.language.translate('deviations.rootCauses.whyPrompt'),
        this.problem().slice(0, 4000),
      ),
    );
  }

  protected onSuggestion(result: unknown): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    this.editingId.set(null);
    this.fromAi.set(true);
    this.form.set(worksheetFromSuggestion(result as SuggestedRootCause));
  }

  protected edit(item: RootCauseAnalysis): void {
    this.editingId.set(item.id);
    this.fromAi.set(false);
    this.form.set(worksheetFromAnalysis(item));
  }

  protected cancel(): void {
    this.form.set(null);
    this.editingId.set(null);
    this.fromAi.set(false);
  }

  protected patch(change: Partial<WorksheetForm>): void {
    const f = this.form();
    if (f) {
      const next = { ...f, ...change };
      this.form.set(next.conclusion.trim() ? next : { ...next, apply: false });
    }
  }

  protected setWhy(index: number, key: 'question' | 'answer', value: string): void {
    const f = this.form();
    if (f) {
      this.patch({ whys: f.whys.map((w, i) => (i === index ? { ...w, [key]: value } : w)) });
    }
  }

  protected addWhy(): void {
    const f = this.form();
    if (f && f.whys.length < MAX_WHYS) {
      this.patch({
        whys: [
          ...f.whys,
          { question: this.language.translate('deviations.rootCauses.whyPrompt'), answer: '' },
        ],
      });
    }
  }

  protected removeWhy(index: number): void {
    const f = this.form();
    if (f) {
      this.patch({ whys: f.whys.filter((_, i) => i !== index) });
    }
  }

  protected useLastAnswer(): void {
    this.patch({ conclusion: this.suggestedConclusion() });
  }

  protected setCategory(category: FishboneCategory, value: string): void {
    const f = this.form();
    if (f) {
      this.patch({ categories: { ...f.categories, [category]: value } });
    }
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const f = this.form();
    if (!orgId || !f || this.saving()) {
      return;
    }
    const editing = this.editingId();
    const request$ = editing
      ? this.api.updateRootCause(orgId, this.deviationId(), editing, updateRequest(f))
      : this.api.createRootCause(orgId, this.deviationId(), createRequest(f));
    const applies = !editing && createRequest(f).apply === true;
    this.saving.set(true);
    request$.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.items.set(
          editing
            ? this.items().map((i) => (i.id === saved.id ? saved : i))
            : [saved, ...this.items()],
        );
        this.cancel();
        this.notifications.success('deviations.rootCauses.savedToast');
        if (applies) {
          this.applied.emit();
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast(error);
      },
    });
  }

  protected apply(item: RootCauseAnalysis): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busyId()) {
      return;
    }
    this.busyId.set(item.id);
    this.applying.set(true);
    this.api.applyRootCause(orgId, this.deviationId(), item.id).subscribe({
      next: (saved) => {
        this.busyId.set(null);
        this.applying.set(false);
        this.items.set(this.items().map((i) => (i.id === saved.id ? saved : i)));
        this.notifications.success('deviations.rootCauses.appliedToast');
        this.applied.emit();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.applying.set(false);
        this.toast(error);
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const item = this.confirmRemove();
    if (!orgId || !item || this.busyId()) {
      return;
    }
    this.busyId.set(item.id);
    this.api.deleteRootCause(orgId, this.deviationId(), item.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.confirmRemove.set(null);
        this.items.set(this.items().filter((i) => i.id !== item.id));
        this.notifications.info('deviations.rootCauses.removedToast');
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.confirmRemove.set(null);
        this.toast(error);
      },
    });
  }

  private toast(error: unknown): void {
    notifyDeviationError(this.notifications, error);
  }

  private load(orgId: string | null, id: string): void {
    this.items.set([]);
    this.cancel();
    if (!orgId || !id) {
      return;
    }
    this.loading.set(true);
    this.api.listRootCauses(orgId, id).subscribe({
      next: (list) => {
        this.items.set(list.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
