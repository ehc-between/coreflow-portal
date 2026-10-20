import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  effectiveStatus,
  localized,
  statusLabelKey,
  statusTone,
} from '../../../core/standards/standards-data';
import { Requirement, RequirementDetail } from '../../../core/standards/standards.models';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { RequirementCard, requirementAnchorId } from '../requirement-card';
import { RequirementAiHelp } from './requirement-ai-help';
import { shortRef, toRequirementDetail } from './workspace-data';
import { pluralKey } from '../../../shared/i18n/plural';

/**
 * One requirement inside a workspace section: a compact, clickable summary
 * row (status, ref, text, manual/applicability marker, evidence count and a
 * prominent "N AI suggestions" badge) that expands in place into the full
 * requirement card — AI suggestions to review, evidence add/remove, the AI
 * help section and the assessment — so the user never leaves the page.
 */
@Component({
  selector: 'app-requirement-row',
  imports: [TranslocoPipe, Badge, Icon, RequirementCard, RequirementAiHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let req = requirement();
    <div
      [id]="anchorId()"
      class="scroll-mt-24 rounded-tile border bg-surface transition-shadow"
      [class]="
        highlighted()
          ? 'border-accent ring-2 ring-accent/40'
          : expanded()
            ? 'border-border-strong shadow-card'
            : 'border-border hover:border-border-strong'
      "
    >
      <button
        type="button"
        class="flex w-full items-start gap-3 px-3.5 py-3 text-left"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="panelId()"
        (click)="toggled.emit()"
      >
        <span class="mt-0.5 flex-none">
          <app-badge [tone]="tone()">{{ statusKey() | transloco }}</app-badge>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-mono text-[11.5px] text-fg-subtle">{{ ref() }}</span>
          <span
            class="block text-[14px] leading-relaxed text-fg"
            [class.line-clamp-2]="!expanded()"
            >{{ text() }}</span
          >
        </span>
        <span class="mt-0.5 flex flex-none items-center gap-2.5 text-[12px] text-fg-subtle">
          @if (req.status_override) {
            <span
              class="hidden rounded-full border border-border px-2 py-px text-[11px] font-semibold sm:inline"
              >{{ 'standards.requirement.manual' | transloco }}</span
            >
          }
          <span
            class="inline-flex items-center gap-0.5"
            [class.text-fg-muted]="req.confirmed_links.length > 0"
            [title]="
              'standards.view.evidenceCount' | transloco: { count: req.confirmed_links.length }
            "
          >
            <app-icon name="link" [size]="13" />{{ req.confirmed_links.length }}
            <span class="sr-only">{{
              'standards.view.evidenceCount' | transloco: { count: req.confirmed_links.length }
            }}</span>
          </span>
          @if (req.suggested_links.length > 0) {
            <span
              class="inline-flex items-center gap-1 rounded-full border border-accent-border bg-accent-soft px-2 py-px text-[11.5px] font-semibold whitespace-nowrap text-accent"
              data-testid="ai-suggestion-badge"
              [title]="
                'standards.view.suggestionCount' | transloco: { count: req.suggested_links.length }
              "
            >
              <app-icon name="spark" [size]="12" />{{
                plural('standards.ai.suggestionBadge', req.suggested_links.length)
                  | transloco: { count: req.suggested_links.length }
              }}
            </span>
          }
          <app-icon
            name="chevron"
            [size]="14"
            class="transition-transform motion-reduce:transition-none"
            [class]="expanded() ? 'rotate-180' : ''"
          />
        </span>
      </button>
      @if (expanded()) {
        <div [id]="panelId()" class="border-t border-border px-3.5 pt-3 pb-3.5">
          <app-requirement-card
            [requirement]="detail()"
            [canManage]="canManage()"
            [embedded]="true"
            (updated)="updated.emit($event)"
            (linksChanged)="linksChanged.emit()"
          >
            @if (standardKey(); as key) {
              <div class="mt-4">
                <app-requirement-ai-help
                  [requirement]="req"
                  [standardKey]="key"
                  (suggestionsChanged)="linksChanged.emit()"
                />
              </div>
            }
          </app-requirement-card>
        </div>
      }
    </div>
  `,
})
export class RequirementRow {
  private readonly language = inject(LanguageService);

  readonly requirement = input.required<Requirement>();
  readonly expanded = input(false);
  readonly highlighted = input(false);
  readonly canManage = input(false);
  /** The standard the requirement belongs to (enables the AI help section). */
  readonly standardKey = input<string | null>(null);

  readonly toggled = output<void>();
  readonly updated = output<RequirementDetail>();
  readonly linksChanged = output<void>();

  protected readonly plural = pluralKey;
  protected readonly anchorId = computed(() => requirementAnchorId(this.requirement().ref));
  protected readonly panelId = computed(() => `${this.anchorId()}-panel`);
  protected readonly ref = computed(() => shortRef(this.requirement().ref));
  protected readonly text = computed(() =>
    localized(this.requirement().text, this.language.active()),
  );
  protected readonly status = computed(() => effectiveStatus(this.requirement()));
  protected readonly statusKey = computed(() => statusLabelKey(this.status()));
  protected readonly tone = computed(() => statusTone(this.status()));
  /** The card's input shape; recomputed whenever the tree patches this requirement. */
  protected readonly detail = computed(() => toRequirementDetail(this.requirement()));
}
