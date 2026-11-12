import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';

export interface SignatureValue {
  readonly name: string;
  readonly image: string | null;
}

/** The server accepts signature images up to 200 000 characters. */
const MAX_IMAGE_CHARS = 200_000;
const WIDTH = 480;
const HEIGHT = 160;

let nextId = 0;

/**
 * A signature: the signer's typed name (required, so the signature works with a
 * keyboard or screen reader) plus an optional drawn signature on a canvas (mouse,
 * pen or finger). Emits `{name, image}` where `image` is a PNG data URL or null.
 */
@Component({
  selector: 'app-signature-pad',
  imports: [TranslocoPipe, Button, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <app-form-field [label]="'inspections.signature.name' | transloco" [inputId]="uid + '-name'">
        <input
          [id]="uid + '-name'"
          maxlength="120"
          autocomplete="name"
          [disabled]="disabled()"
          [value]="name()"
          (input)="setName($any($event.target).value)"
          data-testid="signature-name"
        />
      </app-form-field>
      <div>
        <p class="mb-1 text-[13px] font-semibold text-fg-muted" [id]="uid + '-draw'">
          {{ 'inspections.signature.draw' | transloco }}
        </p>
        <canvas
          #canvas
          [attr.width]="width"
          [attr.height]="height"
          role="img"
          [attr.aria-labelledby]="uid + '-draw'"
          class="block h-[120px] w-full max-w-[480px] touch-none rounded-[10px] border border-border bg-white sm:h-[160px]"
          [class.opacity-60]="disabled()"
          (pointerdown)="start($event)"
          (pointermove)="draw($event)"
          (pointerup)="end()"
          (pointerleave)="end()"
          (pointercancel)="end()"
        ></canvas>
        <div class="mt-1.5 flex items-center gap-2">
          <app-button
            variant="ghost"
            size="sm"
            [disabled]="disabled() || !hasDrawing()"
            (click)="clear()"
          >
            {{ 'inspections.signature.clear' | transloco }}
          </app-button>
          <span class="text-[12px] text-fg-subtle">{{
            'inspections.signature.optional' | transloco
          }}</span>
        </div>
      </div>
    </div>
  `,
})
export class SignaturePad {
  /** Initial value (e.g. a saved answer). */
  readonly value = input<SignatureValue | null>(null);
  readonly disabled = input(false);
  readonly valueChange = output<SignatureValue>();

  protected readonly uid = `sig-${++nextId}`;
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly name = signal('');
  protected readonly hasDrawing = signal(false);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private drawing = false;
  private image: string | null = null;

  constructor() {
    // After render, so the canvas exists.
    afterRenderEffect(() => {
      const value = this.value();
      untracked(() => {
        this.name.set(value?.name ?? '');
        this.image = value?.image ?? null;
        this.hasDrawing.set(!!this.image);
        this.paint(this.image);
      });
    });
  }

  protected setName(name: string): void {
    this.name.set(name);
    this.emit();
  }

  protected start(event: PointerEvent): void {
    if (this.disabled()) {
      return;
    }
    const ctx = this.context();
    if (!ctx) {
      return;
    }
    this.drawing = true;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const { x, y } = this.point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  protected draw(event: PointerEvent): void {
    if (!this.drawing) {
      return;
    }
    const ctx = this.context();
    if (!ctx) {
      return;
    }
    const { x, y } = this.point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  protected end(): void {
    if (!this.drawing) {
      return;
    }
    this.drawing = false;
    const data = this.canvas()?.nativeElement.toDataURL?.('image/png') ?? '';
    this.image = data && data.length <= MAX_IMAGE_CHARS ? data : null;
    this.hasDrawing.set(true);
    this.emit();
  }

  protected clear(): void {
    this.image = null;
    this.hasDrawing.set(false);
    this.paint(null);
    this.emit();
  }

  private emit(): void {
    this.valueChange.emit({ name: this.name(), image: this.image });
  }

  private context(): CanvasRenderingContext2D | null {
    const ctx = this.canvas()?.nativeElement.getContext?.('2d') ?? null;
    if (ctx) {
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    }
    return ctx;
  }

  private point(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas()?.nativeElement.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    };
    const sx = rect.width ? WIDTH / rect.width : 1;
    const sy = rect.height ? HEIGHT / rect.height : 1;
    return { x: (event.clientX - rect.left) * sx, y: (event.clientY - rect.top) * sy };
  }

  private paint(image: string | null): void {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.context();
    } catch {
      return;
    }
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    if (image && typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => ctx?.drawImage(img, 0, 0, WIDTH, HEIGHT);
      img.src = image;
    }
  }
}
