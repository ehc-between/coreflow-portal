import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { AiFeedbackApi } from './ai-feedback-api';

describe('AiFeedbackApi', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api/api/' } },
      ],
    });
    return { api: TestBed.inject(AiFeedbackApi), http: TestBed.inject(HttpTestingController) };
  }

  it('posts the rating to the org-scoped run path, quietly', () => {
    const { api, http } = setup();
    api.rate('o1', 'r1', { rating: 'up' }).subscribe();
    const req = http.expectOne('http://api/api/v1/orgs/o1/ai/runs/r1/feedback');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ rating: 'up' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.verify();
  });

  it('sends a valid reason slug and a trimmed, clipped comment', () => {
    const { api, http } = setup();
    api
      .rate('o1', 'r1', {
        rating: 'down',
        reason: 'missing_links',
        comment: `  ${'x'.repeat(2100)} `,
      })
      .subscribe();
    const req = http.expectOne('http://api/api/v1/orgs/o1/ai/runs/r1/feedback');
    expect(req.request.body.rating).toBe('down');
    expect(req.request.body.reason).toBe('missing_links');
    expect(req.request.body.comment.length).toBe(2000);
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.verify();
  });

  it('drops an invalid reason and a blank comment instead of risking a 422', () => {
    const { api, http } = setup();
    api.rate('o1', 'r1', { rating: 'down', reason: 'Not Good!', comment: '   ' }).subscribe();
    const req = http.expectOne('http://api/api/v1/orgs/o1/ai/runs/r1/feedback');
    expect(req.request.body).toEqual({ rating: 'down' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.verify();
  });
});
