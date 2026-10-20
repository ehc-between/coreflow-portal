import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { JOB_POLL_INTERVAL_MS } from '../../core/standards/standards-api';
import { StandardJob } from '../../core/standards/standards.models';
import { QUEUED_STALL_MS, StandardJobProgress } from './job-progress';

const BASE = 'http://test/api';
const ORG = 'org-1';
const JOB_URL = `${BASE}/v1/orgs/${ORG}/standard-jobs/j-1`;

function job(over: Partial<StandardJob> = {}): StandardJob {
  return {
    id: 'j-1',
    kind: 'ai_map',
    status: 'running',
    progress: 0,
    suggestions_created: 0,
    ...over,
  };
}

describe('StandardJobProgress', () => {
  let fixture: ComponentFixture<StandardJobProgress>;
  let http: HttpTestingController;
  let finished: (StandardJob | null)[];

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [StandardJobProgress, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        { provide: SelectedOrgService, useValue: { currentOrgId: signal(ORG).asReadonly() } },
      ],
    });
    fixture = TestBed.createComponent(StandardJobProgress);
    fixture.componentRef.setInput('jobId', 'j-1');
    fixture.componentRef.setInput('labelKey', 'standards.job.mapping');
    finished = [];
    fixture.componentInstance.finished.subscribe((j) => finished.push(j));
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('emits the final snapshot once the job is done', () => {
    vi.advanceTimersByTime(0);
    http.expectOne(JOB_URL).flush(job({ progress: 40 }));
    vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS);
    http.expectOne(JOB_URL).flush(job({ status: 'done', progress: 100, suggestions_created: 3 }));
    expect(finished).toEqual([job({ status: 'done', progress: 100, suggestions_created: 3 })]);
  });

  it('shows the server error and emits when the job fails', () => {
    vi.advanceTimersByTime(0);
    http.expectOne(JOB_URL).flush(job({ status: 'failed', error: 'Model timed out' }));
    fixture.detectChanges();
    expect(finished).toHaveLength(1);
    expect(finished[0]?.status).toBe('failed');
    expect(text()).toContain('Model timed out');
  });

  it('emits null and shows an error when polling fails', () => {
    vi.advanceTimersByTime(0);
    http.expectOne(JOB_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(finished).toEqual([null]);
    expect(text()).toContain('standards.job.pollFailed');
  });

  it('stops after a long wait in the queue and says it is waiting for a worker', () => {
    vi.advanceTimersByTime(0);
    http.expectOne(JOB_URL).flush(job({ status: 'queued' }));
    const polls = Math.ceil(QUEUED_STALL_MS / JOB_POLL_INTERVAL_MS);
    for (let i = 0; i < polls; i++) {
      vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS);
      http.expectOne(JOB_URL).flush(job({ status: 'queued' }));
    }
    fixture.detectChanges();
    expect(finished).toEqual([null]);
    expect(text()).toContain('standards.job.stalled');
    vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS * 5);
    http.expectNone(JOB_URL);
  });
});
