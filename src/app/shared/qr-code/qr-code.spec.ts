import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QrCode, qrPath } from './qr-code';

const URI = 'otpauth://totp/CoreFlow:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=CoreFlow';

describe('QrCode', () => {
  it('encodes text into a square module grid with a quiet zone', () => {
    const { size, d } = qrPath(URI);
    // Version 4+ for this length (33+ modules) plus a 2-module border on each side.
    expect(size).toBeGreaterThanOrEqual(37);
    // The top-left corner is the quiet zone; the finder pattern starts at (2,2).
    expect(d.startsWith('M2 2h1v1h-1z')).toBe(true);
    expect(d).not.toContain('M0 0');
  });

  it('is deterministic', () => {
    expect(qrPath(URI)).toEqual(qrPath(URI));
    expect(qrPath(URI).d).not.toEqual(qrPath(`${URI}x`).d);
  });

  it('renders an accessible svg', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(QrCode);
    fixture.componentRef.setInput('value', URI);
    fixture.componentRef.setInput('label', 'Scan me');
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Scan me');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(qrPath(URI).d);
  });
});
