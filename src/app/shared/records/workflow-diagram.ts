import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { localize } from '../../core/records/localized';
import { StateCategory, WorkflowDefinition } from '../../core/records/record.models';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { NODE_HEIGHT, NODE_WIDTH, layoutWorkflow } from './workflow-layout';

/** Fill / stroke per state category (design tokens). */
const CATEGORY_STYLE: Record<StateCategory, { fill: string; stroke: string }> = {
  open: { fill: 'var(--info-soft)', stroke: 'var(--info)' },
  in_progress: { fill: 'var(--warn-soft)', stroke: 'var(--warn)' },
  done: { fill: 'var(--pass-soft)', stroke: 'var(--pass)' },
  cancelled: { fill: 'var(--surface-2)', stroke: 'var(--border-strong)' },
};

/**
 * SVG state diagram of a workflow definition (`<app-workflow-diagram [definition] [current]>`).
 * States are boxes coloured by category (the initial state has a double
 * border, the current one an accent ring); transitions are labelled arrows.
 * Scrolls horizontally on narrow screens. With `interactive`, states are
 * focusable buttons that emit `stateSelected` (Enter / Space / click). A text
 * list of the transitions is rendered for screen readers.
 */
@Component({
  selector: 'app-workflow-diagram',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('records')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = layout();
    <figure class="m-0">
      <div class="overflow-x-auto rounded-tile border border-border bg-bg">
        @if (l.nodes.length === 0) {
          <p class="px-4 py-8 text-center text-[13px] text-fg-muted">
            {{ 'records.diagram.empty' | transloco }}
          </p>
        } @else {
          <svg
            [attr.viewBox]="'0 0 ' + l.width + ' ' + l.height"
            [attr.width]="l.width"
            [attr.height]="l.height"
            class="block"
            role="img"
            [attr.aria-label]="
              'records.diagram.summary'
                | transloco
                  : { states: l.nodes.length, transitions: definition().transitions.length }
            "
          >
            <defs>
              <marker
                [attr.id]="markerId"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fg-subtle)" />
              </marker>
            </defs>
            @for (edge of l.edges; track edge.id) {
              <path
                [attr.d]="edge.path"
                fill="none"
                [attr.stroke]="
                  edge.transition === highlight() ? 'var(--accent)' : 'var(--border-strong)'
                "
                [attr.stroke-width]="edge.transition === highlight() ? 2.2 : 1.4"
                [attr.stroke-dasharray]="edge.back ? '4 3' : null"
                [attr.marker-end]="'url(#' + markerId + ')'"
              />
              <text
                [attr.x]="edge.labelX"
                [attr.y]="edge.labelY"
                text-anchor="middle"
                class="fill-fg-muted text-[10.5px]"
              >
                {{ truncate(transitionLabel(edge.transition), 22) }}
              </text>
            }
            @for (node of l.nodes; track node.key) {
              <g
                [attr.transform]="'translate(' + node.x + ',' + node.y + ')'"
                [attr.tabindex]="interactive() ? 0 : null"
                [attr.role]="interactive() ? 'button' : null"
                [attr.aria-label]="interactive() ? stateLabel(node.key) : null"
                [class.cursor-pointer]="interactive()"
                class="focus-visible:outline-2 focus-visible:outline-accent"
                (click)="select(node.key)"
                (keydown.enter)="select(node.key)"
                (keydown.space)="$event.preventDefault(); select(node.key)"
              >
                @if (node.key === current()) {
                  <rect
                    x="-4"
                    y="-4"
                    [attr.width]="nodeWidth + 8"
                    [attr.height]="nodeHeight + 8"
                    rx="14"
                    fill="none"
                    stroke="var(--accent)"
                    stroke-width="2.5"
                  />
                }
                <rect
                  [attr.width]="nodeWidth"
                  [attr.height]="nodeHeight"
                  rx="10"
                  [attr.fill]="style(node.category).fill"
                  [attr.stroke]="
                    node.key === selected() ? 'var(--accent)' : style(node.category).stroke
                  "
                  [attr.stroke-width]="node.key === selected() ? 2.4 : 1.4"
                />
                @if (node.initial) {
                  <rect
                    x="3"
                    y="3"
                    [attr.width]="nodeWidth - 6"
                    [attr.height]="nodeHeight - 6"
                    rx="8"
                    fill="none"
                    [attr.stroke]="style(node.category).stroke"
                    stroke-width="0.8"
                  />
                }
                <text
                  [attr.x]="nodeWidth / 2"
                  [attr.y]="nodeHeight / 2 + 4"
                  text-anchor="middle"
                  class="fill-fg text-[12.5px] font-semibold"
                >
                  {{ truncate(stateLabel(node.key), 20) }}
                </text>
              </g>
            }
          </svg>
        }
      </div>
      <figcaption class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-fg-subtle">
        @for (category of categories; track category) {
          <span class="inline-flex items-center gap-1.5">
            <span
              class="inline-block h-2.5 w-2.5 rounded-[3px] border"
              [style.background]="style(category).fill"
              [style.border-color]="style(category).stroke"
              aria-hidden="true"
            ></span>
            {{ 'records.categories.' + category | transloco }}
          </span>
        }
      </figcaption>
      <ul class="sr-only">
        @for (t of definition().transitions; track t.key) {
          <li>
            {{
              'records.diagram.transitionText'
                | transloco
                  : {
                      label: transitionLabel(t.key),
                      from: fromLabels(t.from),
                      to: stateLabel(t.to),
                    }
            }}
          </li>
        }
      </ul>
    </figure>
  `,
})
export class WorkflowDiagram {
  private readonly language = inject(LanguageService);

  readonly definition = input.required<WorkflowDefinition>();
  /** The state a record is in (accent ring). */
  readonly current = input<string | null>(null);
  /** The state being edited in a designer (accent border). */
  readonly selected = input<string | null>(null);
  /** A transition key to emphasise. */
  readonly highlight = input<string | null>(null);
  readonly interactive = input(false);
  readonly lang = input<string | null>(null);

  readonly stateSelected = output<string>();

  protected readonly nodeWidth = NODE_WIDTH;
  protected readonly nodeHeight = NODE_HEIGHT;
  protected readonly categories: readonly StateCategory[] = [
    'open',
    'in_progress',
    'done',
    'cancelled',
  ];
  protected readonly markerId = `wf-arrow-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly layout = computed(() => layoutWorkflow(this.definition()));
  private readonly activeLang = computed(() => this.lang() ?? this.language.active());

  protected style(category: StateCategory) {
    return CATEGORY_STYLE[category] ?? CATEGORY_STYLE.open;
  }

  protected stateLabel(key: string): string {
    const state = this.definition().states.find((s) => s.key === key);
    return localize(state?.label, this.activeLang()) || key;
  }

  protected transitionLabel(key: string): string {
    const t = this.definition().transitions.find((tr) => tr.key === key);
    return localize(t?.label, this.activeLang()) || key;
  }

  protected fromLabels(keys: readonly string[]): string {
    return keys.map((key) => this.stateLabel(key)).join(', ');
  }

  protected truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  protected select(key: string): void {
    if (this.interactive()) {
      this.stateSelected.emit(key);
    }
  }
}
