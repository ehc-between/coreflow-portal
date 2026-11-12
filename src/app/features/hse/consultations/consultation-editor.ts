import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import {
  CONSULTATION_KINDS,
  Consultation,
  ConsultationFields,
  ConsultationKind,
  ConsultationStatus,
  RelatedIn,
} from '../data/hse.models';
import {
  linesToList,
  listToLines,
  localInputToWire,
  textOrNull,
  wireToLocalInput,
} from '../hse-format';
import { HSE_MODULE, HseDirectorySelect } from '../shared/hse-shared';

/**
 * `/hse/consultations/new` and `/hse/consultations/:id/edit`: a worker
 * consultation or participation record — what kind it is, when and where, the
 * topics, participants and worker representatives. Once held, the summary and
 * decisions can be edited here too. `?entity_type=&entity_id=` on "new" links the
 * record to that one.
 */
@Component({
  selector: 'app-consultation-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    Card,
    FormField,
    Icon,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    HseDirectorySelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[860px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/hse/consultations', id()] : '/hse/consultations'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'hse.common.backToRecord' : 'hse.consultation.list.back') | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'hse.consultation.edit.title' : 'hse.consultation.edit.newTitle') | transloco }}
        @if (code()) {
          <span class="ml-2 font-mono text-[14px] font-semibold text-fg-subtle">{{ code() }}</span>
        }
      </h1>
      <div class="mb-5 grid gap-4 lg:grid-cols-[1fr_300px]">
        <app-guide-intro scope="hse" page="consultation-edit" />
        <app-why-it-matters scope="hse" page="consultation-edit" />
      </div>

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
          {{ 'hse.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <p class="py-10 text-center text-[14px] text-fail" role="alert">
          {{ 'hse.common.loadFailed' | transloco }}
        </p>
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          @if (related().length) {
            <p
              class="rounded-tile border border-accent-border bg-accent-soft/50 px-3 py-2 text-[13px] text-fg"
            >
              {{ 'hse.common.willLink' | transloco }}
            </p>
          }
          <app-card>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'hse.consultation.fields.title' | transloco"
                  inputId="wc-title"
                >
                  <input
                    id="wc-title"
                    type="text"
                    required
                    maxlength="255"
                    autocomplete="off"
                    [value]="title()"
                    (input)="title.set($any($event.target).value)"
                    [attr.aria-invalid]="submitted() && !title().trim()"
                  />
                </app-form-field>
                @if (submitted() && !title().trim()) {
                  <p class="mt-1 text-[12.5px] text-fail" role="alert">
                    {{ 'hse.errors.title_required' | transloco }}
                  </p>
                }
              </div>
              <div>
                <app-form-field
                  [label]="'hse.consultation.fields.kind' | transloco"
                  inputId="wc-kind"
                >
                  <select
                    id="wc-kind"
                    [value]="kind()"
                    (change)="kind.set($any($event.target).value)"
                  >
                    @for (k of kinds; track k) {
                      <option [value]="k" [selected]="k === kind()">
                        {{ 'hse.consultation.kind.' + k | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="hse" page="consultation-edit" field="kind" />
              </div>
              <app-form-field
                [label]="'hse.consultation.fields.scheduled_at' | transloco"
                inputId="wc-scheduled"
              >
                <input
                  id="wc-scheduled"
                  type="datetime-local"
                  [value]="scheduledAt()"
                  (input)="scheduledAt.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'hse.consultation.fields.location' | transloco"
                inputId="wc-location"
              >
                <input
                  id="wc-location"
                  type="text"
                  maxlength="200"
                  [value]="location()"
                  (input)="location.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'hse.consultation.fields.owner' | transloco"
                inputId="wc-owner"
              >
                <app-hse-directory-select
                  inputId="wc-owner"
                  kind="user"
                  noneKey="hse.common.me"
                  [value]="ownerId()"
                  [currentName]="ownerName()"
                  (valueChange)="ownerId.set($event)"
                />
              </app-form-field>
              <app-form-field [label]="'hse.common.department' | transloco" inputId="wc-department">
                <app-hse-directory-select
                  inputId="wc-department"
                  kind="department"
                  [value]="departmentId()"
                  (valueChange)="departmentId.set($event)"
                />
              </app-form-field>
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'hse.consultation.fields.topics' | transloco"
                  inputId="wc-topics"
                >
                  <textarea
                    id="wc-topics"
                    rows="4"
                    [value]="topics()"
                    (input)="topics.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help scope="hse" page="consultation-edit" field="topics" />
              </div>
              <div>
                <app-form-field
                  [label]="'hse.consultation.fields.participants' | transloco"
                  inputId="wc-participants"
                >
                  <textarea
                    id="wc-participants"
                    rows="4"
                    [value]="participants()"
                    (input)="participants.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help scope="hse" page="consultation-edit" field="participants" />
              </div>
              <div>
                <app-form-field
                  [label]="'hse.consultation.fields.worker_representatives' | transloco"
                  inputId="wc-reps"
                >
                  <textarea
                    id="wc-reps"
                    rows="4"
                    [value]="representatives()"
                    (input)="representatives.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help
                  scope="hse"
                  page="consultation-edit"
                  field="worker_representatives"
                />
              </div>
              <label class="flex items-center gap-2 text-[13.5px] text-fg sm:col-span-2">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="repPresent()"
                  (change)="repPresent.set($any($event.target).checked)"
                />
                {{ 'hse.consultation.fields.worker_representative_present' | transloco }}
              </label>
            </div>
          </app-card>

          @if (status() === 'held') {
            <app-card>
              <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                {{ 'hse.consultation.edit.outcomeSection' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4">
                <app-form-field
                  [label]="'hse.consultation.fields.held_at' | transloco"
                  inputId="wc-held"
                >
                  <input
                    id="wc-held"
                    type="datetime-local"
                    [value]="heldAt()"
                    (input)="heldAt.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'hse.consultation.fields.summary' | transloco"
                  inputId="wc-summary"
                >
                  <textarea
                    id="wc-summary"
                    rows="4"
                    [value]="summary()"
                    (input)="summary.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-form-field
                  [label]="'hse.consultation.fields.decisions' | transloco"
                  inputId="wc-decisions"
                >
                  <textarea
                    id="wc-decisions"
                    rows="4"
                    [value]="decisions()"
                    (input)="decisions.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>
            </app-card>
          }

          <div class="flex flex-wrap items-center justify-end gap-2">
            <a
              [routerLink]="id() ? ['/hse/consultations', id()] : '/hse/consultations'"
              tabindex="-1"
            >
              <app-button variant="secondary">{{ 'hse.common.cancel' | transloco }}</app-button>
            </a>
            <app-button type="submit" [loading]="saving()" [disabled]="saving()">
              {{ (id() ? 'hse.common.save' : 'hse.consultation.edit.create') | transloco }}
            </app-button>
          </div>
        </form>
      }
    </div>
  `,
})
export class ConsultationEditor {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  protected readonly kinds = CONSULTATION_KINDS;

  protected readonly id = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly state = signal<'loading' | 'ready' | 'error'>(this.id() ? 'loading' : 'ready');
  protected readonly code = signal('');
  protected readonly status = signal<ConsultationStatus | null>(null);

  protected readonly title = signal('');
  protected readonly kind = signal<ConsultationKind>('meeting');
  protected readonly scheduledAt = signal('');
  protected readonly location = signal('');
  protected readonly ownerId = signal('');
  protected readonly ownerName = signal<string | null>(null);
  protected readonly departmentId = signal('');
  protected readonly topics = signal('');
  protected readonly participants = signal('');
  protected readonly representatives = signal('');
  protected readonly repPresent = signal(false);
  protected readonly heldAt = signal('');
  protected readonly summary = signal('');
  protected readonly decisions = signal('');
  protected readonly related = signal<RelatedIn[]>([]);

  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'worker_consultation',
      entityId: this.id(),
      view: this.id() ? 'edit' : 'new',
      title: this.title() || null,
    }));
    const params = this.route.snapshot.queryParamMap;
    const linkType = params.get('entity_type');
    const linkId = params.get('entity_id');
    if (!this.id() && linkType && linkId) {
      this.related.set([{ entity_type: linkType, entity_id: linkId, link_type: 'relates_to' }]);
    }
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() =>
          this.api.getConsultation(orgId, id).subscribe({
            next: (c) => this.fill(c),
            error: () => this.state.set('error'),
          }),
        );
      }
    });
  }

  private fill(c: Consultation): void {
    this.code.set(c.code);
    this.status.set(c.status);
    this.title.set(c.title);
    this.kind.set(c.kind);
    this.scheduledAt.set(wireToLocalInput(c.scheduled_at));
    this.location.set(c.location ?? '');
    this.ownerId.set(c.owner?.id ?? '');
    this.ownerName.set(c.owner?.name ?? null);
    this.departmentId.set(c.department_id ?? '');
    this.topics.set(c.topics ?? '');
    this.participants.set(listToLines(c.participants));
    this.representatives.set(listToLines(c.worker_representatives));
    this.repPresent.set(c.worker_representative_present);
    this.heldAt.set(wireToLocalInput(c.held_at));
    this.summary.set(c.summary ?? '');
    this.decisions.set(c.decisions ?? '');
    this.state.set('ready');
    if (c.status === 'cancelled') {
      this.notifications.info('hse.errors.consultation_cancelled');
      void this.router.navigate(['/hse/consultations', c.id]);
    }
  }

  private fields(): ConsultationFields {
    return {
      title: this.title().trim(),
      kind: this.kind(),
      scheduled_at: localInputToWire(this.scheduledAt()),
      location: textOrNull(this.location()),
      topics: textOrNull(this.topics()),
      participants: linesToList(this.participants()),
      worker_representatives: linesToList(this.representatives()),
      worker_representative_present: this.repPresent(),
      owner_user_id: this.ownerId() || undefined,
      department_id: this.departmentId() || null,
    };
  }

  protected save(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.title().trim() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const id = this.id();
    const fields = this.fields();
    const outcome =
      this.status() === 'held'
        ? {
            held_at: localInputToWire(this.heldAt()),
            summary: textOrNull(this.summary()),
            decisions: textOrNull(this.decisions()),
          }
        : {};
    const request = id
      ? this.api.updateConsultation(orgId, id, { ...fields, ...outcome })
      : this.api.createConsultation(orgId, {
          ...fields,
          title: fields.title ?? '',
          related: this.related().length ? this.related() : undefined,
        });
    request.subscribe({
      next: (c) => {
        this.saving.set(false);
        this.notifications.success(id ? 'hse.common.saved' : 'hse.consultation.created', {
          code: c.code,
        });
        void this.router.navigate(['/hse/consultations', c.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}
