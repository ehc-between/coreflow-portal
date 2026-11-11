/**
 * Learning mode (F6) DTOs and guidance-content types. The wire types mirror
 * coreflow-core `app/platform/guidance/schemas.py` (contract: docs/platform-contracts.md, 9.1);
 * the content types mirror the guidance file format (9.2).
 */

export type GuidanceLevel = 'beginner' | 'standard' | 'expert';

export const GUIDANCE_LEVELS: readonly GuidanceLevel[] = ['beginner', 'standard', 'expert'];

export type ProgressEvent = 'seen' | 'completed' | 'quiz';

/** `GET/PUT /me/preferences`. */
export interface PreferencesDto {
  readonly guidance_level: GuidanceLevel | null;
  readonly org_default: GuidanceLevel;
  readonly effective: GuidanceLevel;
}

/** `GET/PUT /orgs/{org_id}/guidance`. */
export interface OrgGuidanceDto {
  readonly default_level: GuidanceLevel;
}

/** One learning-progress row (times are naive UTC ISO strings). */
export interface LearningProgressItem {
  readonly id: string;
  readonly module: string;
  readonly lesson_key: string;
  readonly seen_at: string | null;
  readonly completed_at: string | null;
  readonly quiz_score: number | null;
  readonly quiz_passed: boolean | null;
  readonly attempts: number;
}

export interface LearningProgressList {
  readonly items: readonly LearningProgressItem[];
}

/** `POST /orgs/{org_id}/learning/progress`. `score`/`passed` only (and both) for "quiz". */
export interface RecordProgressRequest {
  readonly module: string;
  readonly lesson_key: string;
  readonly event: ProgressEvent;
  readonly score?: number;
  readonly passed?: boolean;
}

/** `GET /orgs/{org_id}/learning/summary` row. */
export interface MemberLearningSummary {
  readonly user_id: string;
  readonly name: string | null;
  readonly lessons_seen: number;
  readonly lessons_completed: number;
  readonly quizzes_passed: number;
  readonly last_activity_at: string | null;
}

export interface LearningSummaryList {
  readonly items: readonly MemberLearningSummary[];
}

// --- guidance content (src/assets/guidance/<lang>/<scope>.json) ------------------

export interface GuidanceIntro {
  readonly title: string;
  readonly body: string;
  readonly steps?: readonly string[];
}

export interface GuidanceWhy {
  readonly body: string;
  /** Clause references, `"<framework>:<clause>"` (e.g. `hs:6.1`, `iso27001:A.5.24`). */
  readonly clauses?: readonly string[];
}

export interface GuidanceEmpty {
  readonly title: string;
  readonly body: string;
  readonly cta?: string;
}

export interface GuidanceFieldHelp {
  readonly help: string;
  readonly example?: string;
}

export interface GuidancePage {
  readonly intro?: GuidanceIntro;
  readonly why?: GuidanceWhy;
  readonly empty?: GuidanceEmpty;
  readonly fields?: Readonly<Record<string, GuidanceFieldHelp>>;
}

export interface LessonSection {
  readonly heading: string;
  readonly body: string;
}

export interface QuizQuestion {
  readonly question: string;
  readonly options: readonly string[];
  /** Index into `options`. */
  readonly answer: number;
  readonly explanation?: string;
}

/** A micro-lesson. M11 (training) feeds course content of the same shape to the player. */
export interface Lesson {
  readonly title: string;
  readonly minutes?: number;
  readonly sections: readonly LessonSection[];
  readonly quiz?: readonly QuizQuestion[];
  /** Fraction of correct answers needed to pass (0-1). Defaults to 0.8. */
  readonly pass_mark?: number;
}

export interface TourStep {
  /** The `[appTourStep]` key of the element to highlight; missing targets show centred. */
  readonly target: string;
  readonly title: string;
  readonly body: string;
}

export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
  readonly clauses?: readonly string[];
}

export interface GuidanceFile {
  readonly pages?: Readonly<Record<string, GuidancePage>>;
  readonly lessons?: Readonly<Record<string, Lesson>>;
  readonly tours?: Readonly<Record<string, readonly TourStep[]>>;
  readonly glossary?: Readonly<Record<string, GlossaryEntry>>;
}

/** Result the lesson player emits when the learner finishes a lesson. */
export interface LessonResult {
  /** Quiz score as a percentage (0-100), or null for a lesson without a quiz. */
  readonly score: number | null;
  readonly passed: boolean | null;
}

/** Default quiz pass mark when a lesson does not set one. */
export const DEFAULT_PASS_MARK = 0.8;

/** Progress lesson key: `"<scope>.<lesson key>"`. */
export function progressLessonKey(scope: string, lesson: string): string {
  return `${scope}.${lesson}`;
}
