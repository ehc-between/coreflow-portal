import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { AuditAccess } from '../data/audit-access';
import { fromDateInput, textOrNull, toDateInput } from '../data/audit-display';
import {
  AuditorProfile,
  AuditorProfileInput,
  FRAMEWORKS,
  ListResponse,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditChoiceCheckboxes, Choice } from '../shared/choice-checkboxes';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditUserSelect } from '../shared/user-select';

export interface ProfileFormValue {
  userId: string;
  frameworks: string[];
  lead: boolean;
  qualifications: string;
  trained: string;
  validUntil: string;
  active: boolean;
}

export function emptyProfileForm(): ProfileFormValue {
  return {
    userId: '',
    frameworks: [],
    lead: false,
    qualifications: '',
    trained: '',
    validUntil: '',
    active: true,
  };
}

export function profileFormToInput(v: ProfileFormValue, editing: boolean): AuditorProfileInput {
  return {
    ...(editing ? {} : { user_id: v.userId }),
    frameworks: v.frameworks,
    lead_auditor: v.lead,
    qualifications: textOrNull(v.qualifications),
    trained_at: fromDateInput(v.trained),
    valid_until: fromDateInput(v.validUntil),
    active: v.active,
  };
}

/**
 * `/audits/auditors`: the auditor competence register — who may audit which
 * frameworks, who may lead, their training and how long the qualification is valid.
 * Assigning an internal auditor checks this register. Changing it needs `audits:manage`.
 */
@Component({
  selector: 'app-audit-auditor-register',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    LessonView,
    TeachingEmpty,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    SlideOver,
    AuditsNav,
    AuditChoiceCheckboxes,
    AuditLoadState,
    AuditUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
          {{ 'audits.auditors.title' | transloco }}
        </h1>
        @if (access.canManage()) {
          <app-button size="sm" (click)="openNew()">{{
            'audits.auditors.new' | transloco
          }}</app-button>
        }
      </header>
      <app-audits-nav />
      <div class="mt-4 flex flex-col gap-3">
        <app-guide-intro scope="audits" page="auditors" />
        <app-why-it-matters scope="audits" page="auditors" />
      </div>

      <div class="mt-4 mb-3 flex flex-wrap gap-2">
        <label class="sr-only" for="aud-framework">{{
          'audits.fields.framework' | transloco
        }}</label>
        <select
          id="aud-framework"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="framework.set($any($event.target).value)"
        >
          <option value="">{{ 'audits.filters.anyFramework' | transloco }}</option>
          @for (k of frameworks; track k) {
            <option [value]="k" [selected]="framework() === k">
              {{ 'audits.frameworks.' + k | transloco }}
            </option>
          }
        </select>
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg">
          <input
            type="checkbox"
            [checked]="activeOnly()"
            (change)="activeOnly.set($any($event.target).checked)"
          />
          {{ 'audits.auditors.activeOnly' | transloco }}
        </label>
      </div>

      @if (isEmpty()) {
        <app-teaching-empty
          scope="audits"
          page="auditors"
          [showAction]="access.canManage()"
          (action)="openNew()"
        />
      } @else {
        <app-card [padded]="false">
          <app-audit-load-state [state]="data.state()" (retry)="load()" />
          @if (data.state() === 'ready') {
            <ul class="divide-y divide-border">
              @for (p of rows(); track p.id) {
                <li class="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-[14px] font-semibold text-fg">{{ p.user.name || p.user.id }}</p>
                    <p class="text-[12.5px] text-fg-muted">
                      @for (f of p.frameworks; track f; let last = $last) {
                        {{ 'audits.frameworks.' + f | transloco }}{{ last ? '' : ', ' }}
                      } @empty {
                        {{ 'audits.auditors.noFrameworks' | transloco }}
                      }
                    </p>
                    @if (p.qualifications) {
                      <p class="mt-1 text-[12.5px] whitespace-pre-line text-fg-muted">
                        {{ p.qualifications }}
                      </p>
                    }
                    <p class="mt-1 text-[12px] text-fg-subtle">
                      {{
                        'audits.auditors.validity'
                          | transloco
                            : {
                                trained: (p.trained_at | localDay) || '–',
                                until: (p.valid_until | localDay) || '–',
                              }
                      }}
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5">
                    @if (p.lead_auditor) {
                      <app-badge tone="accent">{{ 'audits.auditors.lead' | transloco }}</app-badge>
                    }
                    @if (p.expired) {
                      <app-badge tone="fail">{{ 'audits.auditors.expired' | transloco }}</app-badge>
                    } @else if (!p.active) {
                      <app-badge tone="neutral">{{
                        'audits.auditors.inactive' | transloco
                      }}</app-badge>
                    } @else {
                      <app-badge tone="pass">{{ 'audits.auditors.active' | transloco }}</app-badge>
                    }
                    @if (access.canManage()) {
                      <app-button variant="ghost" size="sm" (click)="openEdit(p)">{{
                        'audits.common.edit' | transloco
                      }}</app-button>
                      <app-button variant="ghost" size="sm" (click)="deleting.set(p)">{{
                        'audits.common.remove' | transloco
                      }}</app-button>
                    }
                  </div>
                </li>
              } @empty {
                <li class="py-10 text-center text-[14px] text-fg-muted">
                  {{ 'audits.common.noMatches' | transloco }}
                </li>
              }
            </ul>
          }
        </app-card>
      }

      <div class="mt-6">
        <app-lesson scope="audits" lesson="audit-team" />
      </div>
    </div>

    <app-slide-over
      [open]="editorOpen()"
      [title]="(editing() ? 'audits.auditors.editTitle' : 'audits.auditors.newTitle') | transloco"
      [closeLabel]="'audits.common.close' | transloco"
      (closed)="editorOpen.set(false)"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
        @if (!editing()) {
          <app-form-field [label]="'audits.auditors.person' | transloco" inputId="ap-user">
            <app-audit-user-select
              inputId="ap-user"
              noneLabelKey="audits.common.choose"
              [required]="true"
              [value]="f().userId"
              (valueChange)="patch({ userId: $event })"
            />
          </app-form-field>
        } @else {
          <p class="text-[14px] font-semibold text-fg">{{ editing()!.user.name }}</p>
        }
        <app-audit-choice-checkboxes
          [legend]="'audits.fields.frameworks' | transloco"
          [choices]="frameworkChoices"
          [selected]="f().frameworks"
          (selectedChange)="patch({ frameworks: $event })"
        />
        <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
          <input
            type="checkbox"
            [checked]="f().lead"
            (change)="patch({ lead: $any($event.target).checked })"
          />
          {{ 'audits.auditors.leadQualified' | transloco }}
        </label>
        <app-field-help scope="audits" page="auditors" field="lead" />
        <app-form-field [label]="'audits.auditors.qualifications' | transloco" inputId="ap-qual">
          <textarea
            id="ap-qual"
            rows="3"
            [value]="f().qualifications"
            (input)="patch({ qualifications: $any($event.target).value })"
          ></textarea>
          <app-field-help scope="audits" page="auditors" field="qualifications" />
        </app-form-field>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <app-form-field [label]="'audits.auditors.trainedAt' | transloco" inputId="ap-trained">
            <input
              id="ap-trained"
              type="date"
              [value]="f().trained"
              (input)="patch({ trained: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field [label]="'audits.auditors.validUntil' | transloco" inputId="ap-valid">
            <input
              id="ap-valid"
              type="date"
              [value]="f().validUntil"
              (input)="patch({ validUntil: $any($event.target).value })"
            />
          </app-form-field>
        </div>
        <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
          <input
            type="checkbox"
            [checked]="f().active"
            (change)="patch({ active: $any($event.target).checked })"
          />
          {{ 'audits.auditors.active' | transloco }}
        </label>
        <div class="flex justify-end gap-2 border-t border-border pt-4">
          <app-button variant="secondary" (click)="editorOpen.set(false)">{{
            'audits.common.cancel' | transloco
          }}</app-button>
          <app-button
            type="submit"
            [loading]="saving.busy()"
            [disabled]="!valid() || saving.busy()"
          >
            {{ 'audits.common.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>

    <app-confirm-dialog
      [open]="!!deleting()"
      [title]="'audits.auditors.removeTitle' | transloco"
      [message]="
        'audits.auditors.removeMessage' | transloco: { name: deleting()?.user?.name ?? '' }
      "
      [confirmLabel]="'audits.common.remove' | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      [busy]="saving.busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class AuditorRegister {
  private readonly api = inject(AuditsApi);
  protected readonly access = inject(AuditAccess);

  protected readonly frameworks = FRAMEWORKS;
  protected readonly frameworkChoices: readonly Choice[] = FRAMEWORKS.map((k) => ({
    value: k,
    label: `audits.frameworks.${k}`,
  }));
  protected readonly data = loadable<ListResponse<AuditorProfile>>();
  protected readonly saving = mutator();
  protected readonly framework = signal('');
  protected readonly activeOnly = signal(false);
  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<AuditorProfile | null>(null);
  protected readonly deleting = signal<AuditorProfile | null>(null);
  protected readonly f = signal<ProfileFormValue>(emptyProfileForm());

  protected readonly rows = computed(() => this.data.value()?.items ?? []);
  protected readonly isEmpty = computed(
    () =>
      this.data.state() === 'ready' &&
      (this.data.value()?.total ?? 0) === 0 &&
      !this.framework() &&
      !this.activeOnly(),
  );
  protected readonly valid = computed(() => !!this.editing() || !!this.f().userId);

  constructor() {
    providePageContext(() => ({ module: 'audits', view: 'list', title: null }));
    effect(() => {
      this.access.orgId();
      this.framework();
      this.activeOnly();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      this.data.load(
        this.api.listProfiles(orgId, {
          framework: this.framework() || undefined,
          active: this.activeOnly() ? true : undefined,
          limit: 200,
        }),
        true,
      );
    }
  }

  protected patch(change: Partial<ProfileFormValue>): void {
    this.f.update((v) => ({ ...v, ...change }));
  }

  protected openNew(): void {
    this.editing.set(null);
    this.f.set(emptyProfileForm());
    this.editorOpen.set(true);
  }

  protected openEdit(p: AuditorProfile): void {
    this.editing.set(p);
    this.f.set({
      userId: p.user.id,
      frameworks: [...p.frameworks],
      lead: p.lead_auditor,
      qualifications: p.qualifications ?? '',
      trained: toDateInput(p.trained_at),
      validUntil: toDateInput(p.valid_until),
      active: p.active,
    });
    this.editorOpen.set(true);
  }

  protected save(): void {
    const orgId = this.access.orgId();
    if (!orgId || !this.valid()) {
      return;
    }
    const editing = this.editing();
    const body = profileFormToInput(this.f(), !!editing);
    this.saving.run(
      editing
        ? this.api.updateProfile(orgId, editing.id, body)
        : this.api.createProfile(orgId, body),
      {
        success: 'audits.notices.profileSaved',
        next: () => {
          this.editorOpen.set(false);
          this.load();
        },
      },
    );
  }

  protected remove(): void {
    const orgId = this.access.orgId();
    const target = this.deleting();
    if (!orgId || !target) {
      return;
    }
    this.saving.run(this.api.deleteProfile(orgId, target.id), {
      success: 'audits.notices.profileRemoved',
      next: () => {
        this.deleting.set(null);
        this.load();
      },
      error: () => {
        this.deleting.set(null);
      },
    });
  }
}
