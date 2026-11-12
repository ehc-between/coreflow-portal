import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { RecruitmentApi } from '../data/recruitment-api';
import { blankToNull } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  ApplicationDetail,
  ENTITY_APPLICATION,
  SCREENING_RESULTS,
  ScreeningEntry,
  ScreeningResult,
} from '../data/recruitment.models';
import { RecruitmentAiOutput } from '../shared/ai-output';

interface Row {
  readonly criterion_id: string;
  readonly label: string;
  readonly description: string | null;
  readonly result: ScreeningResult;
  readonly note: string;
}

/** Build the screening rows from the criteria and the saved results. */
export function screeningRows(app: Pick<ApplicationDetail, 'criteria' | 'screening'>): Row[] {
  const saved = new Map(app.screening.map((s) => [s.criterion_id, s]));
  return app.criteria.map((c) => ({
    criterion_id: c.id,
    label: c.label,
    description: c.description,
    result: saved.get(c.id)?.result ?? 'unknown',
    note: saved.get(c.id)?.note ?? '',
  }));
}

let nextId = 0;

/**
 * Structured screening: a human records, per criterion, whether the application
 * meets it. The optional AI summary only collects what the material says about
 * each criterion when someone asks; it never scores, ranks or recommends.
 */
@Component({
  selector: 'app-application-screening',
  imports: [TranslocoPipe, AiAssistButton, FieldHelp, Button, Card, RecruitmentAiOutput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'recruitment.screening.title' | transloco }}
        </h2>
        @if (canEdit() && app().criteria.length > 0) {
          <app-ai-assist-button
            assist="recruitment.summarise_application"
            labelKey="recruitment.ai.summarise"
            [entityType]="entityType"
            [entityId]="app().id"
            (text)="summary.set($event)"
          />
        }
      </div>
      <app-field-help scope="recruitment" page="application" field="screening" />
      @if (summary()) {
        <app-recruitment-ai-output
          class="my-3"
          [text]="summary()"
          (dismissed)="summary.set(null)"
        />
      }

      @if (rows().length === 0) {
        <p class="mt-2 text-[13px] text-fg-muted">
          {{ 'recruitment.screening.noCriteria' | transloco }}
        </p>
      } @else {
        <ol class="mt-3 flex flex-col gap-3">
          @for (row of rows(); track row.criterion_id; let i = $index) {
            <li class="rounded-tile border border-border p-3">
              <p class="text-[13.5px] font-semibold text-fg">{{ row.label }}</p>
              @if (row.description) {
                <p class="text-[12.5px] text-fg-muted">{{ row.description }}</p>
              }
              <div class="mt-2 flex flex-col gap-2 sm:flex-row">
                <label class="sr-only" [attr.for]="uid + '-r-' + i">{{
                  'recruitment.screening.result' | transloco: { label: row.label }
                }}</label>
                <select
                  [id]="uid + '-r-' + i"
                  class="h-9 rounded-[8px] border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent sm:w-[180px]"
                  [disabled]="!canEdit()"
                  (change)="update(i, { result: $any($event.target).value })"
                >
                  @for (r of results; track r) {
                    <option [value]="r" [selected]="r === row.result">
                      {{ 'recruitment.screeningResult.' + r | transloco }}
                    </option>
                  }
                </select>
                <label class="sr-only" [attr.for]="uid + '-n-' + i">{{
                  'recruitment.screening.note' | transloco: { label: row.label }
                }}</label>
                <input
                  [id]="uid + '-n-' + i"
                  class="h-9 flex-1 rounded-[8px] border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent"
                  maxlength="2000"
                  [disabled]="!canEdit()"
                  [placeholder]="'recruitment.screening.notePlaceholder' | transloco"
                  [value]="row.note"
                  (input)="update(i, { note: $any($event.target).value })"
                />
              </div>
            </li>
          }
        </ol>
      }

      <div class="mt-4">
        <label class="text-[13px] font-semibold text-fg-muted" [attr.for]="uid + '-cover'">
          {{ 'recruitment.fields.coverNote' | transloco }}
        </label>
        @if (canEdit()) {
          <textarea
            [id]="uid + '-cover'"
            rows="4"
            maxlength="20000"
            class="mt-1.5 w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent"
            [value]="cover()"
            (input)="cover.set($any($event.target).value)"
          ></textarea>
        } @else {
          <p [id]="uid + '-cover'" class="mt-1 text-[13.5px] whitespace-pre-wrap text-fg">
            {{ app().cover_note || '—' }}
          </p>
        }
      </div>

      @if (canEdit()) {
        <div class="mt-3 flex justify-end">
          <app-button size="sm" [loading]="saving()" [disabled]="!dirty()" (click)="save()">
            {{ 'recruitment.screening.save' | transloco }}
          </app-button>
        </div>
      }
    </app-card>
  `,
})
export class ApplicationScreening {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly toasts = inject(NotificationService);

  readonly app = input.required<ApplicationDetail>();
  readonly canEdit = input(false);
  readonly changed = output<ApplicationDetail>();

  protected readonly entityType = ENTITY_APPLICATION;
  protected readonly results = SCREENING_RESULTS;
  protected readonly uid = `cf-screen-${++nextId}`;
  protected readonly rows = linkedSignal(() => screeningRows(this.app()));
  protected readonly cover = linkedSignal(() => this.app().cover_note ?? '');
  protected readonly saving = signal(false);
  protected readonly summary = signal<string | null>(null);
  private readonly edited = linkedSignal({ source: this.app, computation: () => false });
  protected readonly dirty = computed(
    () => this.edited() || this.cover() !== (this.app().cover_note ?? ''),
  );

  protected update(index: number, patch: Partial<Row>): void {
    this.rows.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    this.edited.set(true);
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId || this.saving()) {
      return;
    }
    const screening: ScreeningEntry[] = this.rows().map((r) => ({
      criterion_id: r.criterion_id,
      result: r.result,
      note: blankToNull(r.note),
    }));
    this.saving.set(true);
    this.api
      .updateApplication(orgId, this.app().id, {
        screening,
        cover_note: blankToNull(this.cover()),
      })
      .subscribe({
        next: (app) => {
          this.saving.set(false);
          this.toasts.success('recruitment.screening.saved');
          this.changed.emit(app);
        },
        error: (err) => {
          this.saving.set(false);
          this.toasts.error(recruitmentError(err).key);
        },
      });
  }
}
