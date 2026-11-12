import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Turtle } from '../data/process.models';

/**
 * The turtle diagram of a process: the process in the middle with its owner and
 * purpose, inputs on the left and outputs on the right, and the four "legs" —
 * with what (resources), with whom (competence), how (methods and procedures) and
 * how measured (KPIs) — plus risks and opportunities, and the upstream suppliers
 * and downstream customers from the interaction map. A 3 x 3 grid on wide
 * screens, stacked on small ones.
 */
@Component({
  selector: 'app-turtle-diagram',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let t = turtle();
    <div
      class="grid grid-cols-1 gap-3 md:grid-cols-3"
      role="group"
      [attr.aria-label]="'processes.turtle.label' | transloco"
      data-testid="turtle"
    >
      <ng-container *ngTemplateOutlet="leg; context: { key: 'resources', items: t.resources }" />
      <section class="rounded-[12px] border border-border bg-surface p-3">
        <h3 class="cf-leg-title">{{ 'processes.turtle.upstream' | transloco }}</h3>
        <ul class="mt-1.5 flex flex-col gap-1 text-[13px]">
          @for (i of t.upstream; track i.id) {
            <li>
              <a [routerLink]="['/processes', i.process.id]" class="text-accent hover:underline">
                {{ i.process.code }} · {{ i.process.title }}
              </a>
              @if (i.label) {
                <span class="text-fg-subtle"> — {{ i.label }}</span>
              }
            </li>
          } @empty {
            <li class="text-fg-subtle">{{ 'processes.turtle.none' | transloco }}</li>
          }
        </ul>
      </section>
      <ng-container *ngTemplateOutlet="leg; context: { key: 'competence', items: t.competence }" />

      <ng-container *ngTemplateOutlet="leg; context: { key: 'inputs', items: t.inputs }" />
      <section
        class="flex flex-col justify-center rounded-[14px] border-2 border-accent bg-accent-soft p-4 text-center"
      >
        <p class="font-mono text-[12px] text-fg-subtle">{{ t.process.code }}</p>
        <h3 class="font-display text-[17px] font-bold text-fg">{{ t.process.title }}</h3>
        @if (t.owner) {
          <p class="mt-1 text-[12.5px] text-fg-muted">
            {{ 'processes.turtle.owner' | transloco: { name: t.owner.name ?? '' } }}
          </p>
        }
        @if (t.purpose) {
          <p class="mt-2 line-clamp-4 text-[12.5px] text-fg">{{ t.purpose }}</p>
        }
      </section>
      <ng-container *ngTemplateOutlet="leg; context: { key: 'outputs', items: t.outputs }" />

      <section class="rounded-[12px] border border-border bg-surface p-3">
        <h3 class="cf-leg-title">{{ 'processes.turtle.methods' | transloco }}</h3>
        <ul class="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[13px] text-fg">
          @for (item of t.methods; track $index) {
            <li>{{ item }}</li>
          }
          @for (doc of t.procedures; track doc.id) {
            <li>
              @if (doc.accessible && doc.url) {
                <a [routerLink]="doc.url" class="text-accent hover:underline">
                  {{ doc.doc_code }} · {{ doc.title }}
                </a>
              } @else {
                <span class="text-fg-subtle">{{
                  'processes.document.restricted' | transloco
                }}</span>
              }
            </li>
          }
          @if (t.methods.length === 0 && t.procedures.length === 0) {
            <li class="list-none text-fg-subtle">{{ 'processes.turtle.none' | transloco }}</li>
          }
        </ul>
      </section>
      <section class="rounded-[12px] border border-border bg-surface p-3">
        <h3 class="cf-leg-title">{{ 'processes.turtle.downstream' | transloco }}</h3>
        <ul class="mt-1.5 flex flex-col gap-1 text-[13px]">
          @for (i of t.downstream; track i.id) {
            <li>
              <a [routerLink]="['/processes', i.process.id]" class="text-accent hover:underline">
                {{ i.process.code }} · {{ i.process.title }}
              </a>
              @if (i.label) {
                <span class="text-fg-subtle"> — {{ i.label }}</span>
              }
            </li>
          } @empty {
            <li class="text-fg-subtle">{{ 'processes.turtle.none' | transloco }}</li>
          }
        </ul>
      </section>
      <section class="rounded-[12px] border border-border bg-surface p-3">
        <h3 class="cf-leg-title">{{ 'processes.turtle.kpis' | transloco }}</h3>
        <ul class="mt-1.5 flex flex-col gap-1 text-[13px] text-fg">
          @for (kpi of t.kpis; track $index) {
            <li>
              <span class="font-semibold">{{ kpi.name }}</span>
              @if (kpi.target) {
                <span class="text-fg-muted">
                  —
                  {{
                    'processes.kpi.targetShort'
                      | transloco: { target: kpi.target, unit: kpi.unit ?? '' }
                  }}
                </span>
              }
              @if (kpi.frequency) {
                <span class="text-fg-subtle"> ({{ kpi.frequency }})</span>
              }
            </li>
          } @empty {
            <li class="text-fg-subtle">{{ 'processes.turtle.none' | transloco }}</li>
          }
        </ul>
      </section>

      <div class="md:col-span-3">
        <ng-container *ngTemplateOutlet="leg; context: { key: 'risks', items: t.risks }" />
      </div>
    </div>

    <ng-template #leg let-key="key" let-items="items">
      <section class="h-full rounded-[12px] border border-border bg-surface p-3">
        <h3 class="cf-leg-title">{{ 'processes.turtle.' + key | transloco }}</h3>
        <ul class="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[13px] text-fg">
          @for (item of items; track $index) {
            <li>{{ item }}</li>
          } @empty {
            <li class="list-none text-fg-subtle">{{ 'processes.turtle.none' | transloco }}</li>
          }
        </ul>
      </section>
    </ng-template>
  `,
  styles: [
    `
      .cf-leg-title {
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--fg-muted);
      }
    `,
  ],
})
export class TurtleDiagram {
  readonly turtle = input.required<Turtle>();
}
