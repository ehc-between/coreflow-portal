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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../shared/guidance/field-help';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { PeopleApi } from './data/people-api';
import { textOrNull } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { PeopleLookups } from './data/people-lookups';
import {
  CompetenceSuggestions,
  PositionDetail,
  REQUIRED_LEVELS,
  RequirementIn,
  SuggestedCompetence,
} from './data/people.models';

export interface RequirementDraft {
  readonly competence_id: string;
  readonly competence_name: string;
  readonly required_level: number;
  readonly mandatory: boolean;
  readonly note: string;
}

export function draftsFromPosition(p: PositionDetail): RequirementDraft[] {
  return p.requirements.map((r) => ({
    competence_id: r.competence_id,
    competence_name: r.competence_name,
    required_level: r.required_level,
    mandatory: r.mandatory,
    note: r.note ?? '',
  }));
}

export function toRequirementsBody(drafts: readonly RequirementDraft[]): RequirementIn[] {
  return drafts
    .filter((d) => d.competence_id)
    .map((d) => ({
      competence_id: d.competence_id,
      required_level: d.required_level,
      mandatory: d.mandatory,
      note: textOrNull(d.note),
    }));
}

/**
 * The competence requirements of a position: view, or (with `people:manage`) edit as
 * a list and save it as a whole. "Suggest competences" asks the assistant for
 * requirements from the position's title and responsibilities; chosen suggestions
 * are added to the list (new competences are created in the catalogue first).
 */
@Component({
  selector: 'app-people-position-requirements',
  imports: [RouterLink, TranslocoPipe, AiAssistButton, FieldHelp, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-pos-req-h">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-pos-req-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'people.requirements.title' | transloco }}
        </h2>
        @if (canManage()) {
          <div class="flex flex-wrap gap-2">
            <app-ai-assist-button
              assist="people.suggest_competences"
              labelKey="people.ai.suggestCompetences"
              [input]="{ position_id: position().id }"
              entityType="position"
              [entityId]="position().id"
              (result)="onSuggestions($any($event))"
            />
            @if (!editing()) {
              <app-button
                size="sm"
                variant="secondary"
                (click)="editing.set(true)"
                data-testid="requirements-edit"
              >
                {{ 'people.common.edit' | transloco }}
              </app-button>
            }
          </div>
        }
      </div>
      <app-field-help scope="people" page="positionDetail" field="requirements" />

      @if (suggestions().length) {
        <div
          class="my-3 rounded-tile border border-border bg-surface-2 p-3"
          data-testid="suggestions"
        >
          <p class="mb-2 text-[12.5px] font-semibold text-fg">
            {{ 'people.ai.suggestionsTitle' | transloco }}
          </p>
          <ul class="flex flex-col gap-2">
            @for (s of suggestions(); track s.name; let i = $index) {
              <li class="flex items-start gap-2">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                  [id]="'cf-sugg-' + i"
                  [checked]="chosen().has(i)"
                  (change)="toggle(i)"
                />
                <label [for]="'cf-sugg-' + i" class="min-w-0 flex-1 text-[13px] text-fg">
                  <span class="font-semibold">{{ s.name }}</span>
                  · {{ 'people.levels.' + s.required_level | transloco }}
                  @if (s.mandatory) {
                    · {{ 'people.competences.mandatory' | transloco }}
                  }
                  @if (!s.existing_competence_id) {
                    <span class="text-fg-subtle">
                      · {{ 'people.ai.newCompetence' | transloco }}</span
                    >
                  }
                  @if (s.rationale) {
                    <span class="block text-[12px] text-fg-muted">{{ s.rationale }}</span>
                  }
                </label>
              </li>
            }
          </ul>
          <div class="mt-3 flex flex-wrap gap-2">
            <app-button
              size="sm"
              [disabled]="chosen().size === 0 || busy()"
              [loading]="busy()"
              (click)="applySuggestions()"
              data-testid="apply-suggestions"
            >
              {{ 'people.ai.addChosen' | transloco: { count: chosen().size } }}
            </app-button>
            <app-button size="sm" variant="ghost" (click)="clearSuggestions()">
              {{ 'people.ai.discard' | transloco }}
            </app-button>
          </div>
        </div>
      }

      @if (editing()) {
        <ul class="mt-3 flex flex-col gap-3" data-testid="requirement-editor">
          @for (d of drafts(); track $index; let i = $index) {
            <li class="rounded-tile border border-border p-3">
              <fieldset
                class="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto_auto] sm:items-end"
              >
                <legend class="sr-only">
                  {{ 'people.requirements.row' | transloco: { n: i + 1 } }}
                </legend>
                <div class="flex flex-col gap-1">
                  <label [for]="'cf-req-comp-' + i" class="text-[12px] font-semibold text-fg-muted">
                    {{ 'people.fields.competence' | transloco }}
                  </label>
                  <select
                    [id]="'cf-req-comp-' + i"
                    class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
                    (change)="setCompetence(i, $any($event.target).value)"
                  >
                    <option value="" [selected]="!d.competence_id">
                      {{ 'people.competences.pick' | transloco }}
                    </option>
                    @if (d.competence_id && !known(d.competence_id)) {
                      <option [value]="d.competence_id" selected>{{ d.competence_name }}</option>
                    }
                    @for (c of activeCompetences(); track c.id) {
                      <option [value]="c.id" [selected]="d.competence_id === c.id">
                        {{ c.name }}
                      </option>
                    }
                  </select>
                </div>
                <div class="flex flex-col gap-1">
                  <label
                    [for]="'cf-req-level-' + i"
                    class="text-[12px] font-semibold text-fg-muted"
                  >
                    {{ 'people.fields.requiredLevel' | transloco }}
                  </label>
                  <select
                    [id]="'cf-req-level-' + i"
                    class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
                    (change)="patch(i, { required_level: +$any($event.target).value })"
                  >
                    @for (l of levels; track l) {
                      <option [value]="l" [selected]="d.required_level === l">
                        {{ 'people.levels.' + l | transloco }}
                      </option>
                    }
                  </select>
                </div>
                <label class="flex h-9 items-center gap-2 text-[13px] text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="d.mandatory"
                    (change)="patch(i, { mandatory: $any($event.target).checked })"
                  />
                  {{ 'people.competences.mandatory' | transloco }}
                </label>
                <app-button size="sm" variant="ghost" (click)="removeRow(i)">
                  <app-icon name="trash" [size]="14" />
                  <span class="sr-only">{{ 'people.requirements.remove' | transloco }}</span>
                </app-button>
              </fieldset>
            </li>
          }
        </ul>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <app-button size="sm" variant="ghost" (click)="addRow()" data-testid="requirement-add">
            <app-icon name="plus" [size]="14" />
            {{ 'people.requirements.add' | transloco }}
          </app-button>
          <div class="flex gap-2">
            <app-button size="sm" variant="ghost" (click)="cancel()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              size="sm"
              [loading]="busy()"
              [disabled]="busy()"
              (click)="save()"
              data-testid="requirements-save"
            >
              {{ 'common.save' | transloco }}
            </app-button>
          </div>
        </div>
      } @else if (position().requirements.length === 0) {
        <p class="py-3 text-[13px] text-fg-muted" data-testid="requirements-empty">
          {{ 'people.requirements.empty' | transloco }}
        </p>
      } @else {
        <ul class="mt-2 divide-y divide-border" data-testid="requirement-rows">
          @for (r of position().requirements; track r.competence_id) {
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
              <a
                [routerLink]="['/people/competences', r.competence_id]"
                class="min-w-0 flex-1 font-semibold text-fg hover:underline"
                >{{ r.competence_name }}</a
              >
              <span class="text-fg-muted">{{
                'people.levels.' + r.required_level | transloco
              }}</span>
              <span class="text-[12px] text-fg-subtle">{{
                (r.mandatory ? 'people.competences.mandatory' : 'people.competences.desirable')
                  | transloco
              }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class PositionRequirements {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly lookups = inject(PeopleLookups);

  readonly position = input.required<PositionDetail>();
  readonly canManage = input(false);
  readonly saved = output<PositionDetail>();

  protected readonly levels = REQUIRED_LEVELS;
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly drafts = linkedSignal<RequirementDraft[]>(() =>
    draftsFromPosition(this.position()),
  );
  protected readonly suggestions = signal<readonly SuggestedCompetence[]>([]);
  protected readonly chosen = signal<ReadonlySet<number>>(new Set());

  protected readonly activeCompetences = computed(() =>
    this.lookups.competences().filter((c) => c.status === 'active'),
  );

  constructor() {
    this.lookups.ensureLoaded();
  }

  protected known(id: string): boolean {
    return this.activeCompetences().some((c) => c.id === id);
  }

  protected setCompetence(index: number, id: string): void {
    const name = this.activeCompetences().find((c) => c.id === id)?.name ?? '';
    this.patch(index, { competence_id: id, competence_name: name });
  }

  protected patch(index: number, patch: Partial<RequirementDraft>): void {
    this.drafts.update((list) => list.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  protected addRow(): void {
    this.drafts.update((list) => [
      ...list,
      { competence_id: '', competence_name: '', required_level: 2, mandatory: true, note: '' },
    ]);
  }

  protected removeRow(index: number): void {
    this.drafts.update((list) => list.filter((_, i) => i !== index));
  }

  protected cancel(): void {
    this.drafts.set(draftsFromPosition(this.position()));
    this.editing.set(false);
  }

  protected onSuggestions(result: CompetenceSuggestions | null): void {
    const list = Array.isArray(result?.competences) ? result.competences : [];
    const existing = new Set(this.position().requirements.map((r) => r.competence_id));
    const fresh = list.filter(
      (s) => s?.name && !(s.existing_competence_id && existing.has(s.existing_competence_id)),
    );
    this.suggestions.set(fresh);
    this.chosen.set(new Set(fresh.map((_, i) => i)));
  }

  protected toggle(index: number): void {
    const next = new Set(this.chosen());
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    this.chosen.set(next);
  }

  protected clearSuggestions(): void {
    this.suggestions.set([]);
    this.chosen.set(new Set());
  }

  /** Create missing competences, then save the requirements with the chosen ones added. */
  protected applySuggestions(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const picked = this.suggestions().filter((_, i) => this.chosen().has(i));
    const byName = new Map(this.lookups.competences().map((c) => [c.name.toLowerCase(), c.id]));
    this.busy.set(true);
    forkJoin(
      picked.map((s) => {
        const id = s.existing_competence_id ?? byName.get(s.name.toLowerCase()) ?? null;
        if (id) {
          return of({ s, id });
        }
        return this.api
          .createCompetence(orgId, {
            name: s.name,
            category: s.category,
            description: textOrNull(s.rationale),
            validity_months: null,
          })
          .pipe(
            map((c) => ({ s, id: c.id as string | null })),
            catchError(() => of({ s, id: null as string | null })),
          );
      }),
    )
      .pipe(
        switchMap((resolved) => {
          const current = toRequirementsBody(draftsFromPosition(this.position()));
          const have = new Set(current.map((r) => r.competence_id));
          const added = resolved
            .filter((r): r is { s: SuggestedCompetence; id: string } => !!r.id && !have.has(r.id))
            .map((r) => ({
              competence_id: r.id,
              required_level: r.s.required_level,
              mandatory: r.s.mandatory,
              note: null,
            }));
          return this.api.replaceRequirements(orgId, this.position().id, [...current, ...added]);
        }),
      )
      .subscribe({
        next: (position) => {
          this.busy.set(false);
          this.clearSuggestions();
          this.lookups.invalidate();
          this.lookups.ensureLoaded();
          this.notifications.success('people.notices.requirementsSaved');
          this.saved.emit(position);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(peopleErrorKey(error));
        },
      });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const body = toRequirementsBody(this.drafts());
    const ids = body.map((r) => r.competence_id);
    if (new Set(ids).size !== ids.length) {
      this.notifications.error('people.errors.duplicate_competence');
      return;
    }
    this.busy.set(true);
    this.api.replaceRequirements(orgId, this.position().id, body).subscribe({
      next: (position) => {
        this.busy.set(false);
        this.editing.set(false);
        this.notifications.success('people.notices.requirementsSaved');
        this.saved.emit(position);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }
}
