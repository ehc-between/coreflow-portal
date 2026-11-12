import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { AiActionsApi, actionErrorState } from './ai-actions-api';

describe('AiActionsApi', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api/api/' } },
      ],
    });
    return { api: TestBed.inject(AiActionsApi), http: TestBed.inject(HttpTestingController) };
  }

  it('confirms, rejects and reads a proposal on the org-scoped paths, without toasts', () => {
    const { api, http } = setup();

    api.confirm('o1', 'a1').subscribe();
    const confirm = http.expectOne('http://api/api/v1/orgs/o1/ai/actions/a1/confirm');
    expect(confirm.request.method).toBe('POST');
    expect(confirm.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    confirm.flush({ status: 'confirmed', result: { message: 'ok' } });

    api.reject('o1', 'a1').subscribe();
    const reject = http.expectOne('http://api/api/v1/orgs/o1/ai/actions/a1/reject');
    expect(reject.request.method).toBe('POST');
    reject.flush(null, { status: 204, statusText: 'No Content' });

    api.get('o1', 'a1').subscribe();
    const get = http.expectOne('http://api/api/v1/orgs/o1/ai/actions/a1');
    expect(get.request.method).toBe('GET');
    get.flush({});
    http.verify();
  });
});

describe('actionErrorState', () => {
  it('maps the documented status codes', () => {
    expect(actionErrorState({ status: 409 })).toEqual({ kind: 'not-pending' });
    expect(actionErrorState({ status: 410 })).toEqual({ kind: 'expired' });
    expect(actionErrorState({ status: 403 })).toEqual({ kind: 'forbidden' });
    expect(
      actionErrorState({ status: 404, error: { detail: { code: 'module_disabled' } } }),
    ).toEqual({ kind: 'gone' });
    expect(actionErrorState({ status: 500 })).toEqual({ kind: 'error' });
    expect(actionErrorState(null)).toEqual({ kind: 'error' });
  });

  it('keeps the user-safe message of an action_failed 422 only', () => {
    expect(
      actionErrorState({
        status: 422,
        error: { detail: { code: 'action_failed', message: 'Nope' } },
      }),
    ).toEqual({ kind: 'failed', message: 'Nope' });
    expect(actionErrorState({ status: 422, error: { detail: [{ msg: 'validation' }] } })).toEqual({
      kind: 'failed',
      message: null,
    });
  });
});
