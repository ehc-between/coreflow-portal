import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { encode } from 'uqr';

/** SVG path data drawing every dark module of a QR code as a 1×1 square. */
export function qrPath(text: string): { readonly size: number; readonly d: string } {
  const qr = encode(text, { ecc: 'M', border: 2 });
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.data[y][x]) {
        d += `M${x} ${y}h1v1h-1z`;
      }
    }
  }
  return { size: qr.size, d };
}

/**
 * Renders text (e.g. an `otpauth://` URI) as a scannable QR code, entirely in
 * the browser: the value never leaves the page. Always dark-on-white with a
 * quiet zone, whatever the theme, so phone cameras read it. `label` is the
 * accessible name (already translated).
 */
@Component({
  selector: 'app-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `
    @let qr = code();
    <svg
      role="img"
      [attr.aria-label]="label()"
      [attr.viewBox]="'0 0 ' + qr.size + ' ' + qr.size"
      [attr.width]="pixels()"
      [attr.height]="pixels()"
      shape-rendering="crispEdges"
      class="block rounded-tile bg-white"
    >
      <rect [attr.width]="qr.size" [attr.height]="qr.size" fill="#ffffff" />
      <path [attr.d]="qr.d" fill="#000000" />
    </svg>
  `,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly label = input('');
  /** Rendered width/height in CSS pixels. */
  readonly pixels = input(192);

  protected readonly code = computed(() => qrPath(this.value()));
}
