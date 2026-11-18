import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { RecruitmentApi } from '../data/recruitment-api';
import { recruitmentError } from '../data/recruitment-errors';
import { CandidateDetail, ENTITY_CANDIDATE, MODULE_KEY } from '../data/recruitment.models';
import {
  CandidateDraft,
  CandidateFields,
  candidatePayload,
  draftFromCandidate,
  emptyCandidateDraft,
} from '../shared/candidate-fields';
import { RECRUITMENT_CRUMB } from '../shared/recruitment-nav';

/** Create (`/recruitment/candidates/new`) or edit (`/:id/edit`) a candidate record. */
@Component({
  selector: 'app-candidate-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    Alert,
    Button,
    Card,
    HelpStrip,
    LoadingState,
    PageHeader,
    CandidateFields,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="
          editId() ? 'recruitment.candidateForm.editTitle' : 'recruitment.candidateForm.newTitle'
        "
        [breadcrumbs]="breadcrumbs()"
        [backLink]="backLink()"
        backLabelKey="recruitment.common.back"
      />
      <app-help-strip scope="recruitment" page="candidateForm" lesson="candidate-privacy" />
      @if (loadError(); as key) {
        <app-alert class="mt-4 block">{{ key | transloco }}</app-alert>
      } @else if (editId() && !original()) {
        <app-loading-state [rows]="5" />
      } @else {
        @if (original() && !original()!.can_edit) {
          <app-alert class="mb-4 block" tone="info">{{
            'recruitment.candidateForm.noRights' | transloco
          }}</app-alert>
        }
        <form class="flex flex-col gap-5" novalidate (submit)="$event.preventDefault(); save()">
          <p class="text-meta text-fg-muted">{{ 'recruitment.form.requiredNote' | transloco }}</p>
          <app-card>
            <app-candidate-fields
              [draft]="draft()"
              (draftChange)="draft.set($event)"
              [withConsent]="!editId()"
              [nameError]="nameError()"
            />
          </app-card>
          @if (saveError(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div
            class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
          >
            <a [routerLink]="backLink()">
              <app-button variant="secondary">{{ 'common.cancel' | transloco }}</app-button>
            </a>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="original() !== null && !original()!.can_edit"
              data-testid="cand-save"
            >
              {{
                (editId() ? 'recruitment.common.save' : 'recruitment.candidateForm.create')
                  | transloco
              }}
            </app-button>
          </div>
        </form>
        <app-why-it-matters class="mt-8 block" scope="recruitment" page="candidateForm" />
      }
    </div>
  `,
})
export class CandidateForm {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;

  protected readonly editId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))),
    { initialValue: null },
  );
  protected readonly original = signal<CandidateDetail | null>(null);
  protected readonly draft = signal<CandidateDraft>(emptyCandidateDraft());
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly nameError = computed(() =>
    this.submitted() && !this.draft().full_name.trim() ? 'recruitment.form.errors.fullName' : null,
  );
  protected readonly backLink = computed(() => {
    const id = this.editId();
    return id ? ['/recruitment/candidates', id] : ['/recruitment/candidates'];
  });
  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => {
    const c = this.original();
    return [
      RECRUITMENT_CRUMB,
      { labelKey: 'recruitment.nav.candidates', link: '/recruitment/candidates' },
      ...(c ? [{ label: c.full_name, link: ['/recruitment/candidates', c.id] }] : []),
      {
        labelKey: c ? 'recruitment.candidateForm.editTitle' : 'recruitment.candidateForm.newTitle',
      },
    ];
  });

  constructor() {
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_CANDIDATE,
      entityId: this.editId(),
      view: this.editId() ? 'edit' : 'new',
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const id = this.editId();
      if (!orgId || !id) {
        return;
      }
      const sub = this.api.getCandidate(orgId, id).subscribe({
        next: (c) => {
          this.original.set(c);
          this.draft.set(draftFromCandidate(c));
        },
        error: (err) => this.loadError.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.submitted.set(true);
    if (this.nameError()) {
      this.saveError.set('recruitment.form.fixErrors');
      return;
    }
    this.saveError.set(null);
    this.saving.set(true);
    const payload = candidatePayload(this.draft());
    const original = this.original();
    const call = original
      ? this.api.updateCandidate(orgId, original.id, {
          full_name: payload.full_name,
          email: payload.email,
          phone: payload.phone,
          location: payload.location,
          profile_url: payload.profile_url,
          source: payload.source,
          notes: payload.notes,
        })
      : this.api.createCandidate(orgId, payload);
    call.subscribe({
      next: (c) => {
        this.saving.set(false);
        this.toasts.success(
          original ? 'recruitment.candidateForm.saved' : 'recruitment.candidateForm.created',
          { code: c.code },
        );
        void this.router.navigate(['/recruitment/candidates', c.id]);
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(recruitmentError(err).key);
      },
    });
  }
}
