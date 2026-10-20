import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import {
  checklistItems,
  effectiveStatus,
  localized,
  standardsErrorKey,
  statusLabelKey,
  statusTone,
} from '../../core/standards/standards-data';
import {
  LinkEntityType,
  RequirementDetail,
  RequirementLink,
  CoverageOverride,
} from '../../core/standards/standards.models';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { EvidencePick, EvidencePicker } from './evidence-picker';

/** Status choices for the manual override ('' = automatic, from the evidence). */
const OVERRIDE_OPTIONS: readonly ('' | CoverageOverride)[] = [
  '',
  'covered',
  'partial',
  'not_started',
];

/** Router link for a linked record, or null when it has no page of its own. */
export function entityRoute(type: LinkEntityType, id: string): readonly string[] | null {
  switch (type) {
    case 'document':
      return ['/documents', id];
    case 'deviation':
      return ['/deviations', id];
    default:
      return null;
  }
}

/**
 * One requirement on the clause detail page: our requirement text and evidence
 * checklist, the confirmed evidence links, AI suggestions to confirm / reject,
 * and — with `standards:manage` — adding / removing evidence plus the
 * assessment (applicability + justification, manual status + note).
 * Emits `updated` with the patched requirement and `linksChanged` after any
 * evidence change (the server recomputes the coverage status).
 */
@Component({
  selector: 'app-requirement-card',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    FormField,
    Icon,
    EvidencePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let req = requirement();
    <div
      [id]="anchorId()"
      class="scroll-mt-6 rounded-card"
      [class.ring-2]="highlighted()"
      [class.ring-accent]="highlighted()"
    >
      <app-card>
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <span class="font-mono text-[12px] text-fg-subtle">{{ req.ref }}</span>
          <app-badge [tone]="tone()">{{ statusKey() | transloco }}</app-badge>
          @if (req.status_override) {
            <app-badge tone="neutral">{{ 'standards.requirement.manual' | transloco }}</app-badge>
          }
        </div>
        <p class="text-[14px] leading-relaxed text-fg">{{ text(req.text) }}</p>

        @if (checklist().length > 0) {
          <div class="mt-3">
            <div class="mb-1 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
              {{ 'standards.requirement.evidenceExamples' | transloco }}
            </div>
            <ul class="flex flex-col gap-1">
              @for (item of checklist(); track $index) {
                <li class="flex gap-2 text-[13px] text-fg-muted">
                  <span class="mt-0.5 flex flex-none text-fg-subtle"
                    ><app-icon name="checkcircle" [size]="14"
                  /></span>
                  {{ item }}
                </li>
              }
            </ul>
          </div>
        }

        @if (!req.applicable && req.justification) {
          <p class="mt-3 rounded-tile bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted">
            <span class="font-semibold text-fg">{{
              'standards.requirement.justification' | transloco
            }}</span>
            {{ req.justification }}
          </p>
        }
        @if (req.note) {
          <p class="mt-2 rounded-tile bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted">
            <span class="font-semibold text-fg">{{
              'standards.requirement.note' | transloco
            }}</span>
            {{ req.note }}
          </p>
        }

        <!-- Evidence -->
        <div class="mt-4">
          <div class="mb-1.5 flex items-center justify-between gap-2">
            <h3 class="text-[13px] font-bold text-fg">
              {{ 'standards.evidence.title' | transloco }}
            </h3>
            @if (canManage() && !picking()) {
              <button
                type="button"
                class="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"
                (click)="picking.set(true)"
              >
                <app-icon name="plus" [size]="13" />
                {{ 'standards.evidence.add' | transloco }}
              </button>
            }
          </div>
          @if (picking()) {
            <div class="mb-2">
              <app-evidence-picker (picked)="addLink($event)" (cancelled)="picking.set(false)" />
            </div>
          }
          @if (evidence().length === 0) {
            <p class="text-[12.5px] text-fg-muted">{{ 'standards.evidence.none' | transloco }}</p>
          } @else {
            <ul class="flex flex-col divide-y divide-border">
              @for (link of evidence(); track link.id) {
                <li class="flex items-center gap-2 py-1.5">
                  <span class="flex flex-none text-fg-subtle"
                    ><app-icon [name]="entityIcon(link.entity_type)" [size]="15"
                  /></span>
                  <span class="min-w-0 flex-1">
                    @if (route(link); as r) {
                      <a
                        [routerLink]="r"
                        class="block truncate text-[13px] font-medium text-fg hover:text-accent hover:underline"
                        >{{ labelOf(link) }}</a
                      >
                    } @else {
                      <span class="block truncate text-[13px] font-medium text-fg">{{
                        labelOf(link)
                      }}</span>
                    }
                    <span class="block text-[11.5px] text-fg-subtle">
                      {{ 'standards.entity.' + link.entity_type | transloco }}
                      @if (link.source === 'ai') {
                        · {{ 'standards.evidence.fromAi' | transloco }}
                      }
                      @if (link.confirmed_by_name) {
                        ·
                        {{
                          'standards.evidence.confirmedBy'
                            | transloco: { name: link.confirmed_by_name }
                        }}
                      }
                      · {{ link.created_at | date: 'mediumDate' }}
                    </span>
                  </span>
                  @if (canManage()) {
                    <button
                      type="button"
                      class="flex flex-none rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-60"
                      [attr.aria-label]="
                        'standards.evidence.remove' | transloco: { name: labelOf(link) }
                      "
                      [disabled]="busyLinkId() === link.id"
                      (click)="removeLink(link)"
                    >
                      <app-icon name="x" [size]="14" />
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </div>

        <!-- AI suggestions -->
        @if (suggestions().length > 0) {
          <div class="mt-4">
            <h3 class="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-fg">
              <span class="flex text-accent"><app-icon name="spark" [size]="14" /></span>
              {{ 'standards.suggestions.title' | transloco }}
            </h3>
            <ul class="flex flex-col gap-2">
              @for (link of suggestions(); track link.id) {
                <li class="rounded-tile border border-accent-border bg-accent-soft/40 px-3 py-2">
                  <div class="flex items-start gap-2">
                    <span class="min-w-0 flex-1">
                      @if (route(link); as r) {
                        <a
                          [routerLink]="r"
                          class="text-[13px] font-semibold text-fg hover:text-accent hover:underline"
                          >{{ labelOf(link) }}</a
                        >
                      } @else {
                        <span class="text-[13px] font-semibold text-fg">{{ labelOf(link) }}</span>
                      }
                      <span class="ml-1 text-[11.5px] text-fg-subtle">
                        {{ 'standards.entity.' + link.entity_type | transloco }}
                        @if (link.confidence !== null && link.confidence !== undefined) {
                          ·
                          {{
                            'standards.suggestions.confidence'
                              | transloco: { pct: confidencePct(link.confidence) }
                          }}
                        }
                      </span>
                      @if (link.rationale) {
                        <span class="mt-0.5 block text-[12.5px] text-fg-muted">{{
                          link.rationale
                        }}</span>
                      }
                    </span>
                    @if (canManage()) {
                      <span class="flex flex-none gap-1">
                        <app-button
                          size="sm"
                          variant="secondary"
                          [disabled]="busyLinkId() === link.id"
                          (click)="confirmLink(link)"
                        >
                          <app-icon name="check" [size]="13" />
                          {{ 'standards.suggestions.confirm' | transloco }}
                        </app-button>
                        <app-button
                          size="sm"
                          variant="ghost"
                          [disabled]="busyLinkId() === link.id"
                          (click)="rejectLink(link)"
                        >
                          {{ 'standards.suggestions.reject' | transloco }}
                        </app-button>
                      </span>
                    }
                  </div>
                </li>
              }
            </ul>
          </div>
        }

        @if (linkError()) {
          <p class="mt-2 text-[12.5px] text-fail" role="alert">
            {{ 'standards.evidence.error' | transloco }}
          </p>
        }

        <!-- Assessment -->
        @if (canManage()) {
          <div class="mt-4 border-t border-border pt-3">
            @if (!editing()) {
              <button
                type="button"
                class="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"
                (click)="startEdit()"
              >
                <app-icon name="sliders" [size]="13" />
                {{ 'standards.requirement.assess' | transloco }}
              </button>
            } @else {
              <div class="flex flex-col gap-3">
                <label class="flex items-center gap-2 text-[13px] text-fg">
                  <input
                    type="checkbox"
                    [ngModel]="formApplicable()"
                    (ngModelChange)="formApplicable.set($event)"
                  />
                  {{ 'standards.requirement.applicable' | transloco }}
                </label>
                @if (!formApplicable()) {
                  <app-form-field
                    [label]="'standards.requirement.justification' | transloco"
                    [inputId]="anchorId() + '-just'"
                  >
                    <textarea
                      [id]="anchorId() + '-just'"
                      rows="2"
                      [ngModel]="formJustification()"
                      (ngModelChange)="formJustification.set($event)"
                    ></textarea>
                  </app-form-field>
                  @if (justificationMissing()) {
                    <p class="-mt-2 text-[12px] text-fail" role="alert">
                      {{ 'standards.requirement.justificationRequired' | transloco }}
                    </p>
                  }
                } @else {
                  <app-form-field
                    [label]="'standards.requirement.manualStatus' | transloco"
                    [inputId]="anchorId() + '-status'"
                  >
                    <select
                      [id]="anchorId() + '-status'"
                      [ngModel]="formOverride()"
                      (ngModelChange)="formOverride.set($event)"
                    >
                      @for (option of overrideOptions; track option) {
                        <option [value]="option">
                          {{
                            (option ? statusLabelKey(option) : 'standards.requirement.automatic')
                              | transloco
                          }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                }
                <app-form-field
                  [label]="'standards.requirement.note' | transloco"
                  [inputId]="anchorId() + '-note'"
                >
                  <textarea
                    [id]="anchorId() + '-note'"
                    rows="2"
                    [ngModel]="formNote()"
                    (ngModelChange)="formNote.set($event)"
                  ></textarea>
                </app-form-field>
                @if (saveError(); as key) {
                  <p class="text-[12.5px] text-fail" role="alert">
                    {{ key | transloco }}
                  </p>
                }
                <div class="flex justify-end gap-2">
                  <app-button variant="ghost" size="sm" (click)="editing.set(false)">
                    {{ 'standards.requirement.cancel' | transloco }}
                  </app-button>
                  <app-button size="sm" [loading]="saving()" (click)="save()">
                    {{ 'standards.requirement.save' | transloco }}
                  </app-button>
                </div>
              </div>
            }
          </div>
        }
      </app-card>
    </div>
  `,
})
export class RequirementCard {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  readonly requirement = input.required<RequirementDetail>();
  readonly canManage = input(false);
  readonly highlighted = input(false);

  readonly updated = output<RequirementDetail>();
  readonly linksChanged = output<void>();

  protected readonly links = signal<readonly RequirementLink[]>([]);
  protected readonly busyLinkId = signal<string | null>(null);
  protected readonly linkError = signal(false);
  protected readonly picking = signal(false);

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  /** i18n key explaining a failed save, or null. */
  protected readonly saveError = signal<string | null>(null);
  protected readonly formApplicable = signal(true);
  protected readonly formJustification = signal('');
  protected readonly formOverride = signal<'' | CoverageOverride>('');
  protected readonly formNote = signal('');
  protected readonly justificationMissing = signal(false);

  protected readonly overrideOptions = OVERRIDE_OPTIONS;
  protected readonly statusLabelKey = statusLabelKey;

  protected readonly anchorId = computed(() => requirementAnchorId(this.requirement().ref));
  protected readonly status = computed(() => effectiveStatus(this.requirement()));
  protected readonly statusKey = computed(() => statusLabelKey(this.status()));
  protected readonly tone = computed(() => statusTone(this.status()));
  protected readonly checklist = computed(() =>
    checklistItems(this.requirement().evidence_examples, this.language.active()),
  );
  protected readonly evidence = computed(() =>
    this.links().filter((l) => l.status === 'confirmed'),
  );
  protected readonly suggestions = computed(() =>
    this.links().filter((l) => l.status === 'suggested'),
  );

  constructor() {
    effect(() => this.links.set(this.requirement().links));
  }

  protected text(value: RequirementDetail['text']): string {
    return localized(value, this.language.active());
  }

  /** The linked record's label, or a neutral fallback when it no longer resolves. */
  protected labelOf(link: RequirementLink): string {
    return link.entity_label || this.transloco.translate('standards.evidence.unavailable');
  }

  protected route(link: RequirementLink): readonly string[] | null {
    return entityRoute(link.entity_type, link.entity_id);
  }

  protected entityIcon(type: LinkEntityType): string {
    return type === 'deviation' ? 'alert' : type === 'attachment' ? 'link' : 'documents';
  }

  protected confidencePct(confidence: number): number {
    return Math.round(confidence * 100);
  }

  protected addLink(pick: EvidencePick): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.linkError.set(false);
    this.api
      .createLink(orgId, {
        requirement_ref: this.requirement().ref,
        entity_type: pick.entity_type,
        entity_id: pick.entity_id,
      })
      .subscribe({
        next: (link) => {
          this.links.update((list) => [...list.filter((l) => l.id !== link.id), link]);
          this.picking.set(false);
          this.linksChanged.emit();
        },
        error: () => this.linkError.set(true),
      });
  }

  protected confirmLink(link: RequirementLink): void {
    this.mutateLink(link, (orgId) => this.api.confirmLink(orgId, link.id));
  }

  protected rejectLink(link: RequirementLink): void {
    this.mutateLink(link, (orgId) => this.api.rejectLink(orgId, link.id));
  }

  protected removeLink(link: RequirementLink): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busyLinkId()) {
      return;
    }
    this.busyLinkId.set(link.id);
    this.linkError.set(false);
    this.api.deleteLink(orgId, link.id).subscribe({
      next: () => {
        this.busyLinkId.set(null);
        this.links.update((list) => list.filter((l) => l.id !== link.id));
        this.linksChanged.emit();
      },
      error: () => {
        this.busyLinkId.set(null);
        this.linkError.set(true);
      },
    });
  }

  protected startEdit(): void {
    const req = this.requirement();
    this.formApplicable.set(req.applicable);
    this.formJustification.set(req.justification ?? '');
    this.formOverride.set(req.status_override ?? '');
    this.formNote.set(req.note ?? '');
    this.justificationMissing.set(false);
    this.saveError.set(null);
    this.editing.set(true);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    const applicable = this.formApplicable();
    const justification = this.formJustification().trim();
    if (!applicable && !justification) {
      this.justificationMissing.set(true);
      return;
    }
    this.justificationMissing.set(false);
    this.saving.set(true);
    this.saveError.set(null);
    this.api
      .updateRequirement(orgId, this.requirement().ref, {
        applicable,
        justification: applicable ? null : justification,
        status_override: applicable ? this.formOverride() || null : null,
        note: this.formNote().trim() || null,
      })
      .subscribe({
        next: (req) => {
          this.saving.set(false);
          this.editing.set(false);
          this.updated.emit(req);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.saveError.set(standardsErrorKey(err, 'save'));
        },
      });
  }

  private mutateLink(
    link: RequirementLink,
    call: (orgId: string) => ReturnType<StandardsApi['confirmLink']>,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busyLinkId()) {
      return;
    }
    this.busyLinkId.set(link.id);
    this.linkError.set(false);
    call(orgId).subscribe({
      next: (updated) => {
        this.busyLinkId.set(null);
        this.links.update((list) => list.map((l) => (l.id === updated.id ? updated : l)));
        this.linksChanged.emit();
      },
      error: () => {
        this.busyLinkId.set(null);
        this.linkError.set(true);
      },
    });
  }
}

/** DOM id for a requirement's card (refs may contain characters invalid in ids). */
export function requirementAnchorId(ref: string): string {
  return `req-${ref.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}
