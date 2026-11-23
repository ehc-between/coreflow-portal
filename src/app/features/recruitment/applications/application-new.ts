import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RecruitmentApi } from '../data/recruitment-api';
import { blankToNull } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  ApplicationCreate,
  Candidate,
  ENTITY_APPLICATION,
  MODULE_KEY,
  Requisition,
} from '../data/recruitment.models';
import {
  CandidateDraft,
  CandidateFields,
  candidatePayload,
  emptyCandidateDraft,
} from '../shared/candidate-fields';
import { RECRUITMENT_CRUMB } from '../shared/recruitment-nav';
import { RecruitmentField } from '../shared/recruitment-field';

type Mode = 'existing' | 'new';

/**
 * "Legg til kandidat": add a candidate to an open requisition (`?requisition_id=` /
 * `?candidate_id=` preselect), either an existing candidate or a new one registered
 * in the same step.
 */
@Component({
  selector: 'app-application-new',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    FormActions,
    FormSection,
    HelpStrip,
    Icon,
    PageHeader,
    CandidateFields,
    RecruitmentField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="recruitment.applicationNew.title"
        [breadcrumbs]="breadcrumbs"
        backLink="/recruitment/applications"
        backLabelKey="recruitment.common.back"
      />
      <app-help-strip
        class="mb-5 block"
        scope="recruitment"
        page="applicationNew"
        lesson="candidate-privacy"
      />
      <form class="flex flex-col gap-5" novalidate (submit)="$event.preventDefault(); save()">
        <app-form-section
          [title]="'recruitment.applicationNew.requisitionSection' | transloco"
          [description]="'recruitment.applicationNew.requisitionHint' | transloco"
          [columns]="1"
        >
          <app-recruitment-field
            labelKey="recruitment.fields.requisition"
            inputId="app-requisition"
            page="applicationNew"
            [required]="true"
            [error]="shown() && !requisitionId() ? 'recruitment.form.errors.requisition' : null"
          >
            <select
              id="app-requisition"
              required
              (change)="requisitionId.set($any($event.target).value)"
              data-testid="app-new-requisition"
            >
              <option value="" [selected]="!requisitionId()">
                {{ 'recruitment.applicationNew.chooseRequisition' | transloco }}
              </option>
              @for (r of requisitions(); track r.id) {
                <option [value]="r.id" [selected]="r.id === requisitionId()">
                  {{ r.code }} · {{ r.title }}
                </option>
              }
            </select>
            @if (requisitions().length === 0 && loaded()) {
              <p class="text-meta leading-snug text-warn-ink">
                {{ 'recruitment.applicationNew.noOpenRequisitions' | transloco }}
              </p>
            }
          </app-recruitment-field>
        </app-form-section>

        <app-form-section
          [title]="'recruitment.applicationNew.candidate' | transloco"
          [description]="'recruitment.applicationNew.candidateHint' | transloco"
        >
          <fieldset class="min-w-0 sm:col-span-2">
            <legend class="sr-only">
              {{ 'recruitment.applicationNew.candidate' | transloco }}
            </legend>
            <div class="grid grid-cols-2 gap-2">
              <label
                class="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-tile border px-3 text-ui"
                [class.border-accent]="mode() === 'existing'"
                [class.bg-accent-soft]="mode() === 'existing'"
                [class.border-border]="mode() !== 'existing'"
              >
                <input
                  type="radio"
                  name="mode"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="mode() === 'existing'"
                  (change)="mode.set('existing')"
                />
                {{ 'recruitment.applicationNew.existing' | transloco }}
              </label>
              <label
                class="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-tile border px-3 text-ui"
                [class.border-accent]="mode() === 'new'"
                [class.bg-accent-soft]="mode() === 'new'"
                [class.border-border]="mode() !== 'new'"
              >
                <input
                  type="radio"
                  name="mode"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="mode() === 'new'"
                  (change)="mode.set('new')"
                  data-testid="mode-new"
                />
                {{ 'recruitment.applicationNew.newCandidate' | transloco }}
              </label>
            </div>
          </fieldset>
          @if (mode() === 'existing') {
            <app-recruitment-field
              span="full"
              labelKey="recruitment.applicationNew.findCandidate"
              inputId="app-cand-search"
              [required]="true"
              [error]="shown() && !candidateId() ? 'recruitment.form.errors.candidate' : null"
            >
              <input
                id="app-cand-search"
                type="search"
                autocomplete="off"
                [value]="candidateQuery()"
                (input)="searchCandidates($any($event.target).value)"
              />
              <ul
                class="flex max-h-[260px] flex-col overflow-y-auto rounded-tile border border-border"
                role="listbox"
                [attr.aria-label]="'recruitment.applicationNew.findCandidate' | transloco"
              >
                @for (c of candidateOptions(); track c.id) {
                  <li role="option" [attr.aria-selected]="c.id === candidateId()">
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left text-ui hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      [class.bg-accent-soft]="c.id === candidateId()"
                      (click)="candidateId.set(c.id)"
                    >
                      <span class="font-mono text-meta text-fg-subtle">{{ c.code }}</span>
                      <span class="flex-1 truncate font-semibold text-fg">{{ c.full_name }}</span>
                      @if (c.id === candidateId()) {
                        <app-icon name="check" [size]="14" />
                      }
                    </button>
                  </li>
                } @empty {
                  <li class="px-3 py-2 text-ui text-fg-muted">
                    {{ 'recruitment.common.noMatches' | transloco }}
                  </li>
                }
              </ul>
            </app-recruitment-field>
          } @else {
            <app-candidate-fields
              [draft]="newCandidate()"
              (draftChange)="newCandidate.set($event)"
              [nameError]="
                shown() && !newCandidate().full_name.trim()
                  ? 'recruitment.form.errors.fullName'
                  : null
              "
            />
          }
        </app-form-section>

        <app-form-section
          [title]="'recruitment.applicationNew.applicationSection' | transloco"
          [description]="'recruitment.applicationNew.applicationHint' | transloco"
          [columns]="1"
        >
          <app-recruitment-field
            labelKey="recruitment.fields.coverNote"
            inputId="app-cover"
            page="applicationNew"
            help="cover_note"
          >
            <textarea
              id="app-cover"
              rows="5"
              maxlength="20000"
              [value]="coverNote()"
              (input)="coverNote.set($any($event.target).value)"
            ></textarea>
          </app-recruitment-field>
        </app-form-section>

        <app-form-actions [message]="saveError() ? (saveError()! | transloco) : ''">
          <a routerLink="/recruitment/applications">
            <app-button variant="secondary">{{ 'common.cancel' | transloco }}</app-button>
          </a>
          <app-button type="submit" [loading]="saving()" data-testid="app-new-save">
            {{ 'recruitment.applicationNew.submit' | transloco }}
          </app-button>
        </app-form-actions>
      </form>
    </div>
  `,
})
export class ApplicationNew {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly breadcrumbs = [
    RECRUITMENT_CRUMB,
    { labelKey: 'recruitment.nav.applications', link: '/recruitment/applications' },
    { labelKey: 'recruitment.applicationNew.title' },
  ];
  protected readonly requisitions = signal<readonly Requisition[]>([]);
  protected readonly loaded = signal(false);
  protected readonly requisitionId = signal(this.params.get('requisition_id') ?? '');
  protected readonly mode = signal<Mode>('existing');
  protected readonly candidateQuery = signal('');
  protected readonly candidates = signal<readonly Candidate[]>([]);
  protected readonly candidateId = signal(this.params.get('candidate_id') ?? '');
  protected readonly newCandidate = signal<CandidateDraft>(emptyCandidateDraft());
  protected readonly coverNote = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Errors are shown after the first save attempt. */
  protected readonly shown = signal(false);

  protected readonly valid = computed(
    () =>
      !!this.requisitionId() &&
      (this.mode() === 'existing'
        ? !!this.candidateId()
        : this.newCandidate().full_name.trim() !== ''),
  );

  private readonly preselected = signal<Candidate | null>(null);
  protected readonly candidateOptions = computed(() => {
    const pre = this.preselected();
    const rest = this.candidates();
    return pre && !rest.some((c) => c.id === pre.id) ? [pre, ...rest] : rest;
  });

  private readonly search$ = new Subject<string>();

  constructor() {
    providePageContext(() => ({ module: MODULE_KEY, entityType: ENTITY_APPLICATION, view: 'new' }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      if (!orgId) {
        return;
      }
      const subs = [
        this.api
          .listRequisitions(orgId, { status: ['open'], limit: 200, sort: 'title' })
          .subscribe({
            next: (res) => {
              this.requisitions.set(res.items);
              this.loaded.set(true);
            },
            error: () => this.loaded.set(true),
          }),
        this.search$
          .pipe(
            debounceTime(250),
            switchMap((q) => this.api.listCandidates(orgId, { q, limit: 20, sort: 'name' })),
          )
          .subscribe({ next: (res) => this.candidates.set(res.items) }),
      ];
      const preId = this.params.get('candidate_id');
      if (preId) {
        subs.push(
          this.api.getCandidate(orgId, preId).subscribe({
            next: (c) => this.preselected.set(c),
            error: () => this.candidateId.set(''),
          }),
        );
      }
      this.search$.next('');
      onCleanup(() => subs.forEach((s) => s.unsubscribe()));
    });
  }

  protected searchCandidates(q: string): void {
    this.candidateQuery.set(q);
    this.search$.next(q.trim());
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.shown.set(true);
    if (!this.valid()) {
      this.saveError.set('recruitment.form.fixErrors');
      return;
    }
    const body: ApplicationCreate =
      this.mode() === 'existing'
        ? {
            requisition_id: this.requisitionId(),
            candidate_id: this.candidateId(),
            cover_note: blankToNull(this.coverNote()),
          }
        : {
            requisition_id: this.requisitionId(),
            candidate: candidatePayload(this.newCandidate()),
            source: this.newCandidate().source,
            cover_note: blankToNull(this.coverNote()),
          };
    this.saving.set(true);
    this.saveError.set(null);
    this.api.createApplication(orgId, body).subscribe({
      next: (app) => {
        this.saving.set(false);
        this.toasts.success('recruitment.applicationNew.created', { code: app.code });
        void this.router.navigate(['/recruitment/applications', app.id]);
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(recruitmentError(err).key);
      },
    });
  }
}
