import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { AttachmentsApi } from '../../../core/attachments/attachments-api';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { SignaturePad, SignatureValue } from '../components/signature-pad';
import {
  AnswerDraft,
  EMPTY_DRAFT,
  draftFromResponse,
  groupBySection,
  predictedResult,
  progressOf,
  toAnswerInput,
} from '../data/answer-model';
import { resultKey, resultTone } from '../data/inspection-display';
import { inspectionErrorKey, questionIdsOf } from '../data/inspection-errors';
import {
  INSPECTIONS_MODULE,
  INSPECTION_ENTITY_TYPE,
  InspectionDetail,
  Question,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';
import { AnswerInput, SaveState } from './answer-input';

/** Answers are saved shortly after the last change, batched into one request. */
const SAVE_DELAY_MS = 600;

/**
 * Perform an inspection (`/inspections/:id/run`), built for a phone on site: the
 * checklist by section with a progress bar, large answer buttons, photo evidence from
 * the camera, notes and N/A. Answers save automatically as you go (the first one
 * starts a planned inspection). "Complete" shows what is missing and the expected
 * result, then takes a summary and a signature; failed answers raise findings (and
 * deviations when the template says so).
 */
@Component({
  selector: 'app-inspection-run',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    LocalPercentPipe,
    Alert,
    Badge,
    Button,
    FormField,
    Icon,
    ProgressBar,
    SlideOver,
    SignaturePad,
    AnswerInput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (inspection(); as ins) {
      <div class="mx-auto max-w-[860px] px-3 pt-4 pb-6 sm:px-8 sm:pt-7">
        <a
          [routerLink]="['/inspections', ins.id]"
          class="mb-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'inspections.run.back' | transloco }}
        </a>
        <p class="font-mono text-[12px] text-fg-subtle">{{ ins.code }}</p>
        <h1 class="font-display text-[22px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
          {{ ins.title }}
        </h1>
        @if (ins.location) {
          <p class="mt-0.5 text-[13px] text-fg-muted">{{ ins.location }}</p>
        }

        <div
          class="sticky top-0 z-20 -mx-3 mt-3 border-b border-border bg-bg/95 px-3 py-2.5 backdrop-blur sm:-mx-8 sm:px-8"
          data-testid="run-progress"
        >
          <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span class="font-semibold text-fg">
              {{
                'inspections.run.progress'
                  | transloco: { answered: progress().answered, total: progress().total }
              }}
            </span>
            <span class="flex items-center gap-2 text-fg-muted">
              @if (progress().scorePct !== null) {
                <span
                  >{{ 'inspections.run.score' | transloco }}:
                  {{ progress().scorePct | localPercent }}</span
                >
              }
              @if (progress().failed > 0) {
                <app-badge tone="fail">{{
                  'inspections.run.failedCount' | transloco: { count: progress().failed }
                }}</app-badge>
              }
              <span aria-live="polite">
                @if (pendingCount() > 0 || inFlight()) {
                  {{ 'inspections.run.saving' | transloco }}
                } @else if (lastSaveFailed()) {
                  <span class="text-fail">{{ 'inspections.run.saveFailed' | transloco }}</span>
                } @else {
                  {{ 'inspections.run.allSaved' | transloco }}
                }
              </span>
            </span>
          </div>
          <app-progress-bar
            [value]="progress().total ? (100 * progress().answered) / progress().total : 0"
            [label]="'inspections.run.progressLabel' | transloco"
          />
          @if (sections().length > 1) {
            <nav
              class="mt-2 flex gap-1.5 overflow-x-auto pb-0.5"
              [attr.aria-label]="'inspections.run.sections' | transloco"
            >
              @for (s of sections(); track $index) {
                <button
                  type="button"
                  class="h-8 flex-none rounded-full border border-border bg-surface px-3 text-[12.5px] font-semibold whitespace-nowrap text-fg-muted hover:text-fg"
                  (click)="jumpTo(s.items[0].id)"
                >
                  {{ s.title ?? ('inspections.builder.noSection' | transloco) }}
                  <span class="text-fg-subtle"
                    >{{ sectionDone(s.items) }}/{{ s.items.length }}</span
                  >
                </button>
              }
            </nav>
          }
        </div>

        <div class="mt-4 flex flex-col gap-3">
          <app-guide-intro scope="inspections" page="run" />
          @if (!ins.permissions.can_perform) {
            <app-alert tone="info">{{ 'inspections.run.readOnly' | transloco }}</app-alert>
          } @else if (ins.status === 'planned') {
            <app-alert tone="info">{{ 'inspections.run.autoStart' | transloco }}</app-alert>
          }
          @if (closed()) {
            <app-alert tone="info">{{ 'inspections.run.closed' | transloco }}</app-alert>
          }
        </div>

        @for (s of sections(); track $index) {
          <section
            class="mt-5"
            [attr.aria-label]="s.title ?? ('inspections.builder.noSection' | transloco)"
          >
            @if (s.title) {
              <h2 class="mb-2 text-[13px] font-bold tracking-wide text-fg-subtle uppercase">
                {{ s.title }}
              </h2>
            }
            <div class="flex flex-col gap-3">
              @for (q of s.items; track q.id) {
                <app-answer-input
                  [question]="q"
                  [number]="numberOf(q.id)"
                  [draft]="drafts()[q.id] ?? empty"
                  [disabled]="readOnly()"
                  [saveState]="saveStates()[q.id] ?? 'idle'"
                  [missing]="missing().has(q.id)"
                  [uploading]="uploading().has(q.id)"
                  [fileNames]="fileNames()"
                  (draftChange)="setDraft(q.id, $event)"
                  (commit)="schedule(q.id)"
                  (upload)="uploadPhoto(q, $event)"
                />
              }
            </div>
          </section>
        }

        <app-why-it-matters class="mt-6 block" scope="inspections" page="run" />

        @if (!readOnly()) {
          <div
            class="sticky bottom-0 z-30 -mx-3 mt-6 border-t border-border bg-bg/95 px-3 py-3 backdrop-blur sm:-mx-8 sm:px-8"
          >
            <div class="mx-auto flex max-w-[860px] items-center justify-between gap-2">
              <span class="text-[12.5px] text-fg-muted">
                {{
                  'inspections.run.requiredLeft'
                    | transloco: { count: progress().missingRequired.length }
                }}
              </span>
              <app-button (click)="openComplete()" data-testid="open-complete">
                <app-icon name="checkcircle" [size]="15" />
                {{ 'inspections.run.complete' | transloco }}
              </app-button>
            </div>
          </div>
        }
      </div>

      <app-slide-over
        [open]="completeOpen()"
        [title]="'inspections.run.completeTitle' | transloco"
        [closeLabel]="'inspections.actions.close' | transloco"
        [width]="560"
        (closed)="completeOpen.set(false)"
      >
        <div class="flex flex-col gap-4">
          @if (progress().missingRequired.length > 0) {
            <app-alert tone="error">
              {{
                'inspections.run.missingIntro'
                  | transloco: { count: progress().missingRequired.length }
              }}
            </app-alert>
            <ul class="flex flex-col gap-1 text-[13px]" data-testid="missing-list">
              @for (qid of progress().missingRequired; track qid) {
                <li>
                  <button
                    type="button"
                    class="text-left font-semibold text-accent hover:underline"
                    (click)="completeOpen.set(false); jumpTo(qid)"
                  >
                    {{ numberOf(qid) }}. {{ questionText(qid) }}
                  </button>
                </li>
              }
            </ul>
          } @else {
            <div class="rounded-card border border-border bg-surface-2 p-3 text-[13.5px]">
              <p class="flex flex-wrap items-center gap-2">
                {{ 'inspections.run.expected' | transloco }}
                <app-badge [tone]="resultTone(expected())">{{
                  resultKey(expected()) | transloco
                }}</app-badge>
                @if (progress().scorePct !== null) {
                  <span class="text-fg-muted">{{ progress().scorePct | localPercent }}</span>
                }
                @if (ins.pass_threshold !== null) {
                  <span class="text-fg-muted">
                    ({{
                      'inspections.library.passMark' | transloco: { value: ins.pass_threshold }
                    }})
                  </span>
                }
              </p>
              @if (progress().failed > 0) {
                <p class="mt-1.5 text-fg-muted">
                  {{
                    (ins.auto_deviation
                      ? 'inspections.run.findingsWithDeviations'
                      : 'inspections.run.findingsOnly'
                    ) | transloco: { count: progress().failed }
                  }}
                </p>
              }
            </div>
            <app-form-field
              [label]="'inspections.fields.summary' | transloco"
              inputId="run-summary"
            >
              <textarea
                id="run-summary"
                rows="4"
                maxlength="20000"
                [value]="summary()"
                (input)="summary.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
            <div>
              <h3 class="mb-1 text-[14px] font-bold text-fg">
                {{ 'inspections.run.signOff' | transloco }}
              </h3>
              <app-field-help scope="inspections" page="run" field="signature" />
              <app-signature-pad [value]="signature()" (valueChange)="signature.set($event)" />
            </div>
            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="ghost" (click)="completeOpen.set(false)">
                {{ 'inspections.actions.cancel' | transloco }}
              </app-button>
              <app-button
                [loading]="completing()"
                [disabled]="!signature()?.name?.trim()"
                (click)="complete()"
                data-testid="confirm-complete"
              >
                {{ 'inspections.run.completeConfirm' | transloco }}
              </app-button>
            </div>
          }
        </div>
      </app-slide-over>
    } @else if (failed()) {
      <div class="mx-auto max-w-[720px] px-4 py-10 sm:px-8">
        <app-alert tone="error">{{ 'inspections.detail.notFound' | transloco }}</app-alert>
      </div>
    } @else {
      <p class="px-8 py-10 text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
    }
  `,
})
export class InspectionRun {
  private readonly api = inject(InspectionsApi);
  private readonly attachmentsApi = inject(AttachmentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  protected readonly empty = EMPTY_DRAFT;
  protected readonly resultKey = resultKey;
  protected readonly resultTone = resultTone;

  protected readonly inspection = signal<InspectionDetail | null>(null);
  protected readonly failed = signal(false);
  protected readonly drafts = signal<Readonly<Record<string, AnswerDraft>>>({});
  protected readonly saveStates = signal<Readonly<Record<string, SaveState>>>({});
  protected readonly missing = signal<ReadonlySet<string>>(new Set());
  protected readonly uploading = signal<ReadonlySet<string>>(new Set());
  protected readonly fileNames = signal<Readonly<Record<string, string>>>({});
  protected readonly pending = signal<ReadonlySet<string>>(new Set());
  protected readonly inFlight = signal(false);
  protected readonly lastSaveFailed = signal(false);
  protected readonly completeOpen = signal(false);
  protected readonly completing = signal(false);
  protected readonly summary = signal('');
  protected readonly signature = signal<SignatureValue | null>(null);

  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly questions = computed<readonly Question[]>(
    () => this.inspection()?.questions ?? [],
  );
  protected readonly sections = computed(() => groupBySection(this.questions()));
  private readonly numbers = computed(
    () => new Map(this.questions().map((q, i) => [q.id, i + 1] as const)),
  );
  protected readonly progress = computed(() => progressOf(this.questions(), this.drafts()));
  protected readonly pendingCount = computed(() => this.pending().size);
  protected readonly closed = computed(() => {
    const s = this.inspection()?.status;
    return s === 'completed' || s === 'cancelled';
  });
  protected readonly readOnly = computed(
    () => this.closed() || !this.inspection()?.permissions.can_perform,
  );
  protected readonly expected = computed(() =>
    predictedResult(
      this.progress().scorePct,
      this.inspection()?.pass_threshold ?? null,
      this.progress().failed,
    ),
  );

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: INSPECTION_ENTITY_TYPE,
      entityId: this.id(),
      view: 'edit',
      title: this.inspection()?.title ?? null,
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() => this.load(orgId, id));
      }
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.timer) {
        clearTimeout(this.timer);
        this.flush();
      }
    });
  }

  private load(orgId: string, id: string): void {
    this.api.get(orgId, id).subscribe({
      next: (ins) => {
        this.inspection.set(ins);
        const byId = new Map(ins.responses.map((r) => [r.question_id, r]));
        const drafts: Record<string, AnswerDraft> = {};
        for (const q of ins.questions) {
          drafts[q.id] = draftFromResponse(byId.get(q.id));
        }
        this.drafts.set(drafts);
        if (ins.responses.some((r) => r.attachment_ids.length > 0)) {
          this.loadFileNames(orgId, id);
        }
      },
      error: () => this.failed.set(true),
    });
  }

  private loadFileNames(orgId: string, id: string): void {
    this.attachmentsApi.list(orgId, INSPECTION_ENTITY_TYPE, id).subscribe({
      next: (items) =>
        this.fileNames.update((names) => ({
          ...names,
          ...Object.fromEntries(items.map((a) => [a.id, a.filename])),
        })),
      error: () => undefined,
    });
  }

  protected numberOf(id: string): number {
    return this.numbers().get(id) ?? 0;
  }

  protected questionText(id: string): string {
    return this.questions().find((q) => q.id === id)?.text ?? id;
  }

  protected sectionDone(items: readonly Question[]): number {
    return progressOf(items, this.drafts()).answered;
  }

  protected jumpTo(questionId: string): void {
    const el = document.getElementById(`q-${questionId}`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    el?.querySelector<HTMLElement>('button, input, textarea, select')?.focus({
      preventScroll: true,
    });
  }

  protected setDraft(questionId: string, draft: AnswerDraft): void {
    this.drafts.update((d) => ({ ...d, [questionId]: draft }));
    if (this.missing().has(questionId)) {
      const next = new Set(this.missing());
      next.delete(questionId);
      this.missing.set(next);
    }
  }

  protected schedule(questionId: string): void {
    if (this.readOnly()) {
      return;
    }
    this.pending.update((p) => new Set([...p, questionId]));
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, SAVE_DELAY_MS);
  }

  /** Save every pending answer in one request. */
  private flush(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    const ids = [...this.pending()];
    if (!orgId || !ins || ids.length === 0 || this.inFlight()) {
      return;
    }
    const byId = new Map(ins.questions.map((q) => [q.id, q]));
    const responses = ids
      .map((id) => byId.get(id))
      .filter((q): q is Question => !!q)
      .map((q) => toAnswerInput(q, this.drafts()[q.id] ?? EMPTY_DRAFT));
    this.pending.set(new Set());
    this.inFlight.set(true);
    this.markStates(ids, 'saving');
    this.api.saveResponses(orgId, ins.id, responses).subscribe({
      next: (updated) => {
        this.inFlight.set(false);
        this.lastSaveFailed.set(false);
        this.inspection.set(updated);
        this.markStates(ids, 'saved');
        if (this.pending().size > 0) {
          this.flush();
        }
      },
      error: (e: unknown) => {
        this.inFlight.set(false);
        this.lastSaveFailed.set(true);
        const bad = questionIdsOf(e);
        this.markStates(bad.length ? bad : ids, 'error');
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }

  private markStates(ids: readonly string[], state: SaveState): void {
    this.saveStates.update((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, state])) }));
  }

  protected uploadPhoto(question: Question, file: File): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    if (!orgId || !ins || this.readOnly()) {
      return;
    }
    this.uploading.update((u) => new Set([...u, question.id]));
    const done = () =>
      this.uploading.update((u) => new Set([...u].filter((id) => id !== question.id)));
    this.attachmentsApi.upload(orgId, INSPECTION_ENTITY_TYPE, ins.id, file).subscribe({
      next: (event) => {
        if (event.kind !== 'done') {
          return;
        }
        done();
        const attachment = event.attachment;
        this.fileNames.update((n) => ({ ...n, [attachment.id]: attachment.filename }));
        const draft = this.drafts()[question.id] ?? EMPTY_DRAFT;
        this.setDraft(question.id, {
          ...draft,
          is_na: false,
          attachment_ids: [...draft.attachment_ids, attachment.id].slice(0, 20),
        });
        this.schedule(question.id);
      },
      error: () => {
        done();
        this.notifications.error('inspections.run.uploadFailed');
      },
    });
  }

  protected openComplete(): void {
    if (!this.signature()) {
      const me = this.auth.user();
      this.signature.set({ name: me?.full_name || '', image: null });
    }
    this.completeOpen.set(true);
  }

  protected complete(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ins = this.inspection();
    const sig = this.signature();
    if (!orgId || !ins || !sig?.name.trim() || this.completing()) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const byId = new Map(ins.questions.map((q) => [q.id, q]));
    const responses = [...this.pending()]
      .map((id) => byId.get(id))
      .filter((q): q is Question => !!q)
      .map((q) => toAnswerInput(q, this.drafts()[q.id] ?? EMPTY_DRAFT));
    this.pending.set(new Set());
    this.completing.set(true);
    this.api
      .complete(orgId, ins.id, {
        responses,
        summary: this.summary().trim() || null,
        signature: { name: sig.name.trim(), image: sig.image },
      })
      .subscribe({
        next: (done) => {
          this.completing.set(false);
          this.completeOpen.set(false);
          this.notifications.success('inspections.notices.completed', {
            code: done.code,
            count: done.finding_count,
          });
          void this.router.navigate(['/inspections', done.id]);
        },
        error: (e: unknown) => {
          this.completing.set(false);
          const ids = questionIdsOf(e);
          if (ids.length) {
            this.missing.set(new Set(ids));
            this.completeOpen.set(false);
          }
          this.notifications.error(inspectionErrorKey(e));
        },
      });
  }
}
