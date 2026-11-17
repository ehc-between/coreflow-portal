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
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { localized, standardsErrorKey } from '../../../core/standards/standards-data';
import { Requirement } from '../../../core/standards/standards.models';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { EvidencePick, EvidencePicker } from '../evidence-picker';

/**
 * "Koble én post til hele punktet": pick any record once and link it as
 * confirmed evidence for every requirement of the clause, with a checkbox per
 * requirement to leave out the ones it does not prove. Saves a small company
 * from linking the same policy twelve times (ISO 9001 5.1.1 has twelve).
 */
@Component({
  selector: 'app-clause-link',
  imports: [TranslocoPipe, Button, Icon, EvidencePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (step()) {
      @case ('idle') {
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-meta font-semibold text-accent hover:underline"
          data-testid="clause-link-start"
          (click)="step.set('pick')"
        >
          <app-icon name="link" [size]="13" />
          {{ 'standards.clauseLink.start' | transloco: { count: requirements().length } }}
        </button>
        @if (doneCount() !== null) {
          <span class="ml-2 text-meta text-fg-muted" role="status">{{
            'standards.clauseLink.done' | transloco: { count: doneCount() }
          }}</span>
        }
      }
      @case ('pick') {
        <p class="mb-1.5 text-meta text-fg-muted">
          {{ 'standards.clauseLink.pickHint' | transloco }}
        </p>
        <app-evidence-picker (picked)="choose($event)" (cancelled)="reset()" />
      }
      @case ('confirm') {
        <div
          class="rounded-tile border border-border bg-surface-2 p-3"
          data-testid="clause-link-confirm"
        >
          <p class="text-ui text-fg">
            {{ 'standards.clauseLink.confirmTitle' | transloco: { record: picked()?.label } }}
          </p>
          <p class="mt-0.5 mb-2 text-meta text-fg-muted">
            {{ 'standards.clauseLink.confirmHint' | transloco }}
          </p>
          <ul class="flex flex-col gap-1">
            @for (req of requirements(); track req.ref; let i = $index) {
              <li>
                <label class="flex items-start gap-2 text-meta text-fg">
                  <input
                    type="checkbox"
                    class="mt-0.5"
                    [checked]="!excluded().has(req.ref)"
                    (change)="toggle(req.ref)"
                  />
                  <span class="min-w-0">
                    <span class="font-semibold">{{
                      'standards.reqs.positionLong'
                        | transloco: { index: i + 1, count: requirements().length }
                    }}</span>
                    · <span class="text-fg-muted">{{ short(req) }}</span>
                  </span>
                </label>
              </li>
            }
          </ul>
          @if (error(); as key) {
            <p class="mt-2 text-meta text-fail" role="alert">{{ key | transloco }}</p>
          }
          <div class="mt-3 flex flex-wrap justify-end gap-2">
            <app-button variant="ghost" size="sm" (click)="reset()">{{
              'standards.requirement.cancel' | transloco
            }}</app-button>
            <app-button
              size="sm"
              data-testid="clause-link-save"
              [loading]="saving()"
              [disabled]="selectedCount() === 0"
              (click)="save()"
            >
              {{ 'standards.clauseLink.save' | transloco: { count: selectedCount() } }}
            </app-button>
          </div>
        </div>
      }
    }
  `,
})
export class ClauseLink {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  readonly standardKey = input.required<string>();
  readonly number = input.required<string>();
  readonly requirements = input.required<readonly Requirement[]>();

  /** Evidence was linked: the workspace refetches the clause. */
  readonly linked = output<string>();

  protected readonly step = signal<'idle' | 'pick' | 'confirm'>('idle');
  protected readonly picked = signal<EvidencePick | null>(null);
  protected readonly excluded = signal<ReadonlySet<string>>(new Set());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly doneCount = signal<number | null>(null);
  protected readonly selectedCount = computed(
    () => this.requirements().filter((r) => !this.excluded().has(r.ref)).length,
  );

  protected short(req: Requirement): string {
    const text = localized(req.text, this.language.active());
    return text.length > 110 ? `${text.slice(0, 107).trimEnd()} …` : text;
  }

  protected choose(pick: EvidencePick): void {
    this.picked.set(pick);
    this.excluded.set(new Set());
    this.error.set(null);
    this.step.set('confirm');
  }

  protected toggle(ref: string): void {
    const next = new Set(this.excluded());
    if (next.has(ref)) {
      next.delete(ref);
    } else {
      next.add(ref);
    }
    this.excluded.set(next);
  }

  protected reset(): void {
    this.step.set('idle');
    this.picked.set(null);
    this.error.set(null);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const pick = this.picked();
    if (!orgId || !pick || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .linkClause(orgId, this.standardKey(), this.number(), {
        entity_type: pick.entity_type,
        entity_id: pick.entity_id,
        exclude_refs: [...this.excluded()],
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.doneCount.set(res.linked);
          this.reset();
          const first = res.refs[0] ?? this.requirements()[0]?.ref;
          if (first) {
            this.linked.emit(first);
          }
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(
            standardsErrorKey(err, 'save') === 'standards.requirement.saveError'
              ? 'standards.evidence.error'
              : standardsErrorKey(err, 'save'),
          );
        },
      });
  }
}
