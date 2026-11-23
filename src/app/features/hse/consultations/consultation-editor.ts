import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService, FlowContext } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { Term } from '../../../shared/guidance/term';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { Button } from '../../../shared/ui/button/button';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import {
  CONSULTATION_KINDS,
  Consultation,
  ConsultationFields,
  ConsultationKind,
  ConsultationStatus,
  RelatedIn,
  UserRef,
} from '../data/hse.models';
import { localInputToWire, textOrNull, wireToLocalInput } from '../hse-format';
import { HsePeoplePicker, NO_PEOPLE, PeopleValue, peopleCount } from '../shared/people-picker';
import {
  HSE_CRUMBS,
  HSE_MODULE,
  HSE_ROOT_CRUMB,
  HseDirectorySelect,
  HseField,
} from '../shared/hse-shared';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';

/**
 * `/hse/consultations/new` and `/hse/consultations/:id/edit`: a worker
 * consultation ("medvirkningsmøte"). What kind, when and where, who organises
 * it; the topics; participants and worker representatives (members by name,
 * others as free text). "A worker representative took part" follows the
 * representatives list (it cannot say "no" while one is listed). Once held, the
 * summary and decisions can be corrected here; new decisions become follow-up
 * tasks from the record page.
 */
@Component({
  selector: 'app-consultation-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    Button,
    ErrorState,
    FlowBanner,
    HelpStrip,
    LoadingState,
    PageHeader,
    Term,
    HseDirectorySelect,
    HseField,
    HsePeoplePicker,
    FormSection,
    FormActions,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'hse.consultation.edit.title' : 'hse.consultation.edit.newTitle'"
        [breadcrumbs]="breadcrumbs()"
      >
        @if (code()) {
          <span meta class="font-mono">{{ code() }}</span>
        }
      </app-page-header>
      <app-help-strip scope="hse" page="consultation-edit" lesson="worker-participation" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="6" />
      } @else if (state() === 'error') {
        <app-error-state
          titleKey="hse.common.notFoundTitle"
          bodyKey="hse.common.notFound"
          (retry)="reload()"
        />
      } @else {
        <app-flow-banner [flow]="flow()" />
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          @if (related().length && !flow()) {
            <p
              class="rounded-tile border border-info/30 bg-info-soft px-3 py-2 text-ui text-info-ink"
            >
              {{ 'hse.common.willLink' | transloco }}
            </p>
          }
          <app-form-section
            [title]="'hse.consultation.edit.meetingSection' | transloco"
            [description]="'hse.consultation.edit.meetingSectionHint' | transloco"
          >
            <app-hse-field
              span="full"
              labelKey="hse.consultation.fields.title"
              inputId="wc-title"
              page="consultation-edit"
              [required]="true"
              [errorKey]="submitted() && !title().trim() ? 'hse.errors.title_required' : null"
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
            </app-hse-field>
            <app-hse-field
              labelKey="hse.consultation.fields.kind"
              inputId="wc-kind"
              page="consultation-edit"
              help="kind"
            >
              <select id="wc-kind" (change)="kind.set($any($event.target).value)">
                @for (k of kinds; track k) {
                  <option [value]="k" [selected]="k === kind()">
                    {{ 'hse.consultation.kind.' + k | transloco }}
                  </option>
                }
              </select>
            </app-hse-field>
            <app-hse-field labelKey="hse.consultation.fields.scheduled_at" inputId="wc-scheduled">
              <input
                id="wc-scheduled"
                type="datetime-local"
                [value]="scheduledAt()"
                (input)="scheduledAt.set($any($event.target).value)"
              />
            </app-hse-field>
            <app-hse-field labelKey="hse.consultation.fields.location" inputId="wc-location">
              <input
                id="wc-location"
                type="text"
                maxlength="200"
                [value]="location()"
                (input)="location.set($any($event.target).value)"
              />
            </app-hse-field>
            <app-hse-field labelKey="hse.consultation.fields.owner" inputId="wc-owner">
              <app-hse-directory-select
                inputId="wc-owner"
                kind="user"
                noneKey="hse.common.me"
                [value]="ownerId()"
                [currentName]="ownerName()"
                (valueChange)="ownerId.set($event)"
              />
            </app-hse-field>
            <app-hse-field labelKey="hse.common.department" inputId="wc-department">
              <app-hse-directory-select
                inputId="wc-department"
                kind="department"
                [value]="departmentId()"
                (valueChange)="departmentId.set($event)"
              />
            </app-hse-field>
            <app-hse-field
              span="full"
              labelKey="hse.consultation.fields.topics"
              inputId="wc-topics"
              page="consultation-edit"
              help="topics"
            >
              <app-ask-about
                label-extra
                [prompt]="'hse.consultation.ai.topicsPrompt' | transloco"
                [fieldLabel]="'hse.consultation.fields.topics' | transloco"
                labelKey="hse.consultation.ai.askTopics"
              />
              <textarea
                id="wc-topics"
                rows="4"
                [value]="topics()"
                (input)="topics.set($any($event.target).value)"
              ></textarea>
            </app-hse-field>
          </app-form-section>

          <app-form-section
            [columns]="1"
            [title]="'hse.consultation.edit.peopleSection' | transloco"
            [description]="'hse.consultation.edit.peopleSectionHint' | transloco"
          >
            <app-hse-field
              labelKey="hse.consultation.fields.participants"
              inputId="wc-participants"
              page="consultation-edit"
              help="participants"
              hintKey="hse.people.hint"
            >
              <app-hse-people-picker
                inputId="wc-participants"
                labelKey="hse.consultation.fields.participants"
                describedBy="wc-participants-hint"
                [value]="participants()"
                [known]="knownParticipants()"
                (valueChange)="participants.set($event)"
                testId="wc-participants-picker"
              />
            </app-hse-field>
            <app-hse-field
              labelKey="hse.consultation.fields.worker_representatives"
              inputId="wc-reps"
              page="consultation-edit"
              help="worker_representatives"
              hintKey="hse.consultation.edit.repsHint"
            >
              <app-hse-people-picker
                inputId="wc-reps"
                labelKey="hse.consultation.fields.worker_representatives"
                describedBy="wc-reps-hint"
                [value]="representatives()"
                [known]="knownReps()"
                (valueChange)="representatives.set($event)"
                testId="wc-reps-picker"
              />
            </app-hse-field>
            <label class="flex min-h-8 items-start gap-2 text-body text-fg">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                [checked]="repPresentShown()"
                [disabled]="hasReps()"
                (change)="repPresent.set($any($event.target).checked)"
                data-testid="wc-rep-present"
              />
              <span>
                <app-term key="worker-representative" scope="hse">{{
                  'hse.consultation.fields.worker_representative_present' | transloco
                }}</app-term>
                @if (hasReps()) {
                  <span class="block text-meta text-fg-muted">{{
                    'hse.consultation.edit.repAuto' | transloco
                  }}</span>
                }
              </span>
            </label>
          </app-form-section>

          @if (status() === 'held') {
            <app-form-section
              [columns]="1"
              [title]="'hse.consultation.edit.outcomeSection' | transloco"
              [description]="'hse.consultation.edit.outcomeSectionHint' | transloco"
            >
              <app-hse-field labelKey="hse.consultation.fields.held_at" inputId="wc-held">
                <input
                  id="wc-held"
                  type="datetime-local"
                  [value]="heldAt()"
                  (input)="heldAt.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field labelKey="hse.consultation.fields.summary" inputId="wc-summary">
                <textarea
                  id="wc-summary"
                  rows="4"
                  [value]="summary()"
                  (input)="summary.set($any($event.target).value)"
                ></textarea>
              </app-hse-field>
              <app-hse-field
                labelKey="hse.consultation.fields.decisions"
                inputId="wc-decisions"
                hintKey="hse.consultation.edit.decisionsHint"
              >
                <textarea
                  id="wc-decisions"
                  rows="4"
                  aria-describedby="wc-decisions-hint"
                  [value]="decisions()"
                  (input)="decisions.set($any($event.target).value)"
                ></textarea>
              </app-hse-field>
            </app-form-section>
          }

          <app-form-actions>
            <a [routerLink]="backLink()" tabindex="-1" (click)="cancelFlow()">
              <app-button variant="secondary">{{ 'hse.common.cancel' | transloco }}</app-button>
            </a>
            <app-button type="submit" [loading]="saving()" [disabled]="saving()">
              {{ (id() ? 'hse.common.save' : 'hse.consultation.edit.create') | transloco }}
            </app-button>
          </app-form-actions>
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
  private readonly language = inject(LanguageService);
  private readonly flows = inject(CreateFlowService);
  private readonly route = inject(ActivatedRoute);

  readonly id = input<string | undefined>(undefined);

  protected readonly kinds = CONSULTATION_KINDS;
  protected readonly state = signal<'loading' | 'ready' | 'error'>(
    inject(ActivatedRoute).snapshot.paramMap.has('id') ? 'loading' : 'ready',
  );
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
  protected readonly participants = signal<PeopleValue>(NO_PEOPLE);
  protected readonly knownParticipants = signal<readonly UserRef[]>([]);
  protected readonly representatives = signal<PeopleValue>(NO_PEOPLE);
  protected readonly knownReps = signal<readonly UserRef[]>([]);
  protected readonly repPresent = signal(false);
  protected readonly heldAt = signal('');
  protected readonly summary = signal('');
  protected readonly decisions = signal('');
  protected readonly related = signal<RelatedIn[]>([]);

  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);

  private readonly flowSource = signal<Signal<FlowContext | null> | null>(null);
  protected readonly flow = computed(() => this.flowSource()?.() ?? null);

  /** Listing a representative means one took part (the backend ticks it the same way). */
  protected readonly hasReps = computed(() => peopleCount(this.representatives()) > 0);
  protected readonly repPresentShown = computed(() => this.hasReps() || this.repPresent());

  protected readonly breadcrumbs = computed(() => {
    const id = this.id();
    return id
      ? [
          HSE_ROOT_CRUMB,
          HSE_CRUMBS.consultations,
          { label: this.code() || '…', link: ['/hse/consultations', id] },
          { labelKey: 'hse.common.edit' },
        ]
      : [HSE_ROOT_CRUMB, HSE_CRUMBS.consultations, { labelKey: 'hse.consultation.edit.newTitle' }];
  });
  protected readonly backLink = computed(() => {
    const id = this.id();
    return id ? ['/hse/consultations', id] : ['/hse/consultations'];
  });

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'worker_consultation',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.title() || this.language.translate('hse.consultation.edit.newTitle'),
    }));

    const params = this.route.snapshot.queryParamMap;
    const linkType = params.get('entity_type');
    const linkId = params.get('entity_id');
    if (linkType && linkId) {
      this.related.set([{ entity_type: linkType, entity_id: linkId, link_type: 'relates_to' }]);
    }

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        if (id) {
          this.load(orgId, id);
        } else if (!this.flowSource()) {
          this.flowSource.set(
            this.flows.consume(this.route, { targetType: 'worker_consultation' }),
          );
        }
      });
    });
    effect(() => {
      const flow = this.flow();
      if (flow && !this.id()) {
        untracked(() => {
          const title = flow.prefill.title;
          if (typeof title === 'string' && title && !this.title()) {
            this.title.set(title);
          }
          const description = flow.prefill.description;
          if (typeof description === 'string' && description && !this.topics()) {
            this.topics.set(description);
          }
        });
      }
    });
  }

  private load(orgId: string | null, id: string): void {
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.api.getConsultation(orgId, id).subscribe({
      next: (c) => this.fill(c),
      error: () => this.state.set('error'),
    });
  }

  protected reload(): void {
    const id = this.id();
    if (id) {
      this.load(this.selectedOrg.currentOrgId(), id);
    }
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
    this.participants.set({
      userIds: (c.participant_users ?? []).map((u) => u.id),
      names: [...(c.participants ?? [])],
    });
    this.knownParticipants.set(c.participant_users ?? []);
    this.representatives.set({
      userIds: (c.representative_users ?? []).map((u) => u.id),
      names: [...(c.worker_representatives ?? [])],
    });
    this.knownReps.set(c.representative_users ?? []);
    this.repPresent.set(c.worker_representative_present);
    this.heldAt.set(wireToLocalInput(c.held_at));
    this.summary.set(c.summary ?? '');
    this.decisions.set(c.decisions ?? '');
    this.state.set('ready');
    if (c.status === 'cancelled') {
      this.notifications.info('hse.errors.consultation_cancelled');
      void this.router.navigate(['/hse/consultations', c.id], { replaceUrl: true });
    }
  }

  private fields(): ConsultationFields {
    const people = this.participants();
    const reps = this.representatives();
    return {
      title: this.title().trim(),
      kind: this.kind(),
      scheduled_at: localInputToWire(this.scheduledAt()),
      location: textOrNull(this.location()),
      topics: textOrNull(this.topics()),
      participants: [...people.names],
      participant_user_ids: [...people.userIds],
      worker_representatives: [...reps.names],
      representative_user_ids: [...reps.userIds],
      worker_representative_present: this.repPresentShown(),
      owner_user_id: this.ownerId() || undefined,
      department_id: this.departmentId() || null,
    };
  }

  protected cancelFlow(): void {
    if (!this.id() && this.flow()) {
      this.flows.cancel();
    }
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
          related: this.related().length && !this.flow() ? this.related() : undefined,
        });
    request.subscribe({
      next: (c) => {
        this.saving.set(false);
        this.notifications.success(id ? 'hse.common.saved' : 'hse.consultation.created', {
          code: c.code,
        });
        if (!id && this.flow()) {
          this.flows.complete(c.id, 'worker_consultation').subscribe();
        }
        void this.router.navigate(['/hse/consultations', c.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}
