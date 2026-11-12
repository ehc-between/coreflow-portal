import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { RecruitmentApi } from '../data/recruitment-api';
import { blankToNull } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  Criterion,
  Interview,
  RECOMMENDATIONS,
  Rating,
  Recommendation,
  Scorecard,
} from '../data/recruitment.models';

interface RatingDraft {
  readonly criterion_id: string;
  readonly rating: number | null;
  readonly note: string;
}

const RATING_VALUES = [1, 2, 3, 4, 5] as const;
let nextId = 0;

/**
 * Interview scorecards. Each team member files their own against the same
 * criteria; colleagues' scorecards become visible once you have submitted yours
 * (independent judgement first), and submitted scorecards cannot be changed.
 */
@Component({
  selector: 'app-application-scorecards',
  imports: [TranslocoPipe, FieldHelp, LocalDatePipe, Badge, Button, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'recruitment.scorecards.title' | transloco }}
        </h2>
        @if (canFile() && !mine() && !editing()) {
          <app-button
            size="sm"
            variant="secondary"
            (click)="start(null)"
            data-testid="scorecard-new"
          >
            {{ 'recruitment.scorecards.write' | transloco }}
          </app-button>
        }
      </div>
      <app-field-help scope="recruitment" page="application" field="scorecards" />

      @if (editing()) {
        <form class="mt-3 flex flex-col gap-3" (submit)="$event.preventDefault(); save(true)">
          @if (interviews().length > 0 && !mine()) {
            <label class="text-[13px] font-semibold text-fg-muted" [attr.for]="uid + '-iv'">
              {{ 'recruitment.scorecards.interview' | transloco }}
            </label>
            <select
              [id]="uid + '-iv'"
              class="h-9 rounded-[8px] border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent"
              (change)="interviewId.set($any($event.target).value || null)"
            >
              <option value="">{{ 'recruitment.scorecards.noInterview' | transloco }}</option>
              @for (iv of interviews(); track iv.id) {
                <option [value]="iv.id" [selected]="iv.id === interviewId()">
                  {{ 'recruitment.interviewKind.' + iv.kind | transloco }} ·
                  {{ iv.scheduled_at | localDate: 'medium' }}
                </option>
              }
            </select>
          }
          @for (r of ratings(); track r.criterion_id; let i = $index) {
            <fieldset class="rounded-tile border border-border p-3">
              <legend class="px-1 text-[13px] font-semibold text-fg">
                {{ label(r.criterion_id) }}
              </legend>
              <div class="flex flex-wrap gap-3" role="radiogroup">
                @for (v of ratingValues; track v) {
                  <label class="inline-flex items-center gap-1.5 text-[13px] text-fg">
                    <input
                      type="radio"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [name]="uid + '-rate-' + i"
                      [checked]="r.rating === v"
                      (change)="rate(i, { rating: v })"
                    />
                    {{ 'recruitment.rating.' + v | transloco }}
                  </label>
                }
              </div>
              <label class="sr-only" [attr.for]="uid + '-note-' + i">{{
                'recruitment.scorecards.evidence' | transloco
              }}</label>
              <input
                [id]="uid + '-note-' + i"
                class="mt-2 h-9 w-full rounded-[8px] border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent"
                maxlength="2000"
                [placeholder]="'recruitment.scorecards.evidence' | transloco"
                [value]="r.note"
                (input)="rate(i, { note: $any($event.target).value })"
              />
            </fieldset>
          }
          <label class="text-[13px] font-semibold text-fg-muted" [attr.for]="uid + '-rec'">
            {{ 'recruitment.fields.recommendation' | transloco }}
          </label>
          <select
            [id]="uid + '-rec'"
            class="h-9 rounded-[8px] border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent"
            (change)="recommendation.set($any($event.target).value || null)"
          >
            <option value="" [selected]="!recommendation()">
              {{ 'recruitment.scorecards.chooseRecommendation' | transloco }}
            </option>
            @for (rec of recommendations; track rec) {
              <option [value]="rec" [selected]="rec === recommendation()">
                {{ 'recruitment.recommendation.' + rec | transloco }}
              </option>
            }
          </select>
          <label class="text-[13px] font-semibold text-fg-muted" [attr.for]="uid + '-summary'">
            {{ 'recruitment.fields.summary' | transloco }}
          </label>
          <textarea
            [id]="uid + '-summary'"
            rows="3"
            maxlength="5000"
            class="rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent"
            [value]="summary()"
            (input)="summary.set($any($event.target).value)"
          ></textarea>
          <div class="flex flex-wrap justify-end gap-2">
            <app-button size="sm" variant="ghost" (click)="editing.set(false)">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button size="sm" variant="secondary" [loading]="saving()" (click)="save(false)">
              {{ 'recruitment.scorecards.saveDraft' | transloco }}
            </app-button>
            <app-button size="sm" type="submit" [loading]="saving()" [disabled]="!recommendation()">
              {{ 'recruitment.scorecards.submit' | transloco }}
            </app-button>
          </div>
          <p class="text-right text-[12px] text-fg-subtle">
            {{ 'recruitment.scorecards.submitHint' | transloco }}
          </p>
        </form>
      }

      <ul class="mt-3 flex flex-col gap-2">
        @for (card of scorecards(); track card.id) {
          <li class="rounded-tile border border-border p-3 text-[13px]">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-fg">{{ card.author?.name ?? '—' }}</span>
              <app-badge [tone]="card.status === 'submitted' ? 'pass' : 'neutral'">
                {{ 'recruitment.scorecardStatus.' + card.status | transloco }}
              </app-badge>
              @if (card.recommendation) {
                <app-badge tone="info">{{
                  'recruitment.recommendation.' + card.recommendation | transloco
                }}</app-badge>
              }
              @if (card.submitted_at) {
                <span class="text-fg-subtle">{{ card.submitted_at | localDate: 'medium' }}</span>
              }
              @if (card.can_edit && card.status === 'draft' && !editing()) {
                <button
                  type="button"
                  class="ml-auto rounded-[6px] px-2 py-0.5 text-[12.5px] font-semibold text-accent hover:bg-accent-soft"
                  (click)="start(card)"
                >
                  {{ 'recruitment.common.edit' | transloco }}
                </button>
              }
            </div>
            @if (card.ratings.length > 0) {
              <ul class="mt-2 flex flex-col gap-1">
                @for (r of card.ratings; track r.criterion_id) {
                  <li>
                    <span class="text-fg-muted">{{ label(r.criterion_id) }}:</span>
                    <span class="font-semibold text-fg">
                      {{ 'recruitment.rating.' + r.rating | transloco }}</span
                    >
                    @if (r.note) {
                      <span class="block text-fg-muted">{{ r.note }}</span>
                    }
                  </li>
                }
              </ul>
            }
            @if (card.summary) {
              <p class="mt-2 whitespace-pre-wrap text-fg">{{ card.summary }}</p>
            }
          </li>
        } @empty {
          <li class="text-[13px] text-fg-muted">{{ 'recruitment.scorecards.none' | transloco }}</li>
        }
      </ul>
      @if (canFile() && mine()?.status !== 'submitted') {
        <p class="mt-3 text-[12px] text-fg-subtle">
          {{ 'recruitment.scorecards.blindNote' | transloco }}
        </p>
      }
    </app-card>
  `,
})
export class ApplicationScorecards {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly toasts = inject(NotificationService);

  readonly applicationId = input.required<string>();
  readonly criteria = input<readonly Criterion[]>([]);
  readonly scorecards = input<readonly Scorecard[]>([]);
  readonly interviews = input<readonly Interview[]>([]);
  readonly userId = input<string | null>(null);
  /** The caller is on the hiring team (any team member files their own scorecard). */
  readonly canFile = input(false);
  readonly changed = output<void>();

  protected readonly uid = `cf-score-${++nextId}`;
  protected readonly ratingValues = RATING_VALUES;
  protected readonly recommendations = RECOMMENDATIONS;
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  private readonly editingId = signal<string | null>(null);
  protected readonly interviewId = signal<string | null>(null);
  protected readonly ratings = signal<readonly RatingDraft[]>([]);
  protected readonly recommendation = signal<Recommendation | null>(null);
  protected readonly summary = signal('');

  protected readonly mine = computed(
    () => this.scorecards().find((s) => s.author?.id === this.userId()) ?? null,
  );

  protected label(criterionId: string): string {
    return this.criteria().find((c) => c.id === criterionId)?.label ?? criterionId;
  }

  protected start(card: Scorecard | null): void {
    const saved = new Map((card?.ratings ?? []).map((r) => [r.criterion_id, r]));
    this.editingId.set(card?.id ?? null);
    this.interviewId.set(card?.interview_id ?? null);
    this.ratings.set(
      this.criteria().map((c) => ({
        criterion_id: c.id,
        rating: saved.get(c.id)?.rating ?? null,
        note: saved.get(c.id)?.note ?? '',
      })),
    );
    this.recommendation.set(card?.recommendation ?? null);
    this.summary.set(card?.summary ?? '');
    this.editing.set(true);
  }

  protected rate(index: number, patch: Partial<RatingDraft>): void {
    this.ratings.update((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  protected save(submit: boolean): void {
    const orgId = this.orgId();
    if (!orgId || this.saving() || (submit && !this.recommendation())) {
      return;
    }
    const ratings: Rating[] = this.ratings().flatMap((r) =>
      r.rating === null
        ? []
        : [{ criterion_id: r.criterion_id, rating: r.rating, note: blankToNull(r.note) }],
    );
    const body = {
      ratings,
      recommendation: this.recommendation(),
      summary: blankToNull(this.summary()),
      submit,
    };
    const id = this.editingId();
    const call = id
      ? this.api.updateScorecard(orgId, id, body)
      : this.api.createScorecard(orgId, this.applicationId(), {
          ...body,
          interview_id: this.interviewId(),
        });
    this.saving.set(true);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.toasts.success(
          submit ? 'recruitment.scorecards.submitted' : 'recruitment.scorecards.draftSaved',
        );
        this.changed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.toasts.error(recruitmentError(err).key);
      },
    });
  }
}
