// Hand-rolled view switcher (Phase 2 plan's architecture decision 4): a fixed hub-and-spoke
// flow across five screens, no hash router. history.pushState/popstate is used only so an
// Android back-button press during an active session invokes the same leave-session flow as the
// practice screen's own "Exit session" control, instead of unexpectedly exiting.

import type { ContentBundle, Note } from '../content/types';
import { SessionRunner } from '../session/sessionRunner';
import type { SessionConfig } from '../session/types';
import { getActiveSession } from '../storage/activeSessionStore';
import { mount } from './dom';
import { renderHome } from './screens/home';
import { renderNoteDetail, renderNotesList } from './screens/notes';
import { renderPractice } from './screens/practice';
import { renderSessionSetup } from './screens/sessionSetup';
import { renderSessionSummary } from './screens/sessionSummary';
import { renderSettings } from './screens/settings';

const SESSION_HISTORY_STATE = { bpPracticeSession: true };

// Registered by the practice screen right after mounting (its "show exit panel" closure), and
// invoked identically whether triggered by the in-page "Exit session" button or by the Android
// back button — both paths get the same Save and leave / End session / Continue practising
// choice. The boolean tells the handler whether a history re-push is its responsibility if the
// user picks "Continue" (only true for the back-button path — see popstate below).
type ExitHandler = (triggeredByBackButton: boolean) => Promise<void>;

export class Shell {
  private inSession = false;
  private exitHandler: ExitHandler | null = null;

  constructor(
    private root: HTMLElement,
    private bundle: ContentBundle
  ) {
    window.addEventListener('popstate', (event) => {
      if (!this.inSession) return;
      if (event.state && (event.state as { bpPracticeSession?: boolean }).bpPracticeSession) return;

      if (this.exitHandler) {
        void this.exitHandler(true);
      } else {
        this.inSession = false;
        this.goHome();
      }
    });
  }

  setExitHandler(handler: ExitHandler | null): void {
    this.exitHandler = handler;
  }

  // Re-pushes the session history marker — used by the practice screen's exit dialog when the
  // user picks "Continue practising" in response to a back-button press, to undo the browser's
  // already-completed pop and stay on the practice screen.
  pushSessionHistoryMarker(): void {
    history.pushState(SESSION_HISTORY_STATE, '');
  }

  goHome(): void {
    this.inSession = false;
    this.setExitHandler(null);
    mount(this.root, renderHome(this.bundle, this));
  }

  goSessionSetup(): void {
    this.inSession = false;
    this.setExitHandler(null);
    mount(this.root, renderSessionSetup(this.bundle, this));
  }

  async goPractice(config: SessionConfig): Promise<void> {
    const runner = await SessionRunner.start(this.bundle, config);
    this.inSession = true;
    history.pushState(SESSION_HISTORY_STATE, '');
    mount(this.root, renderPractice(runner, this));
  }

  // Parallel to goPractice(), but reconstructs the runner from a saved checkpoint instead of
  // starting fresh (Phase 2.1 save/resume). No-op if there's nothing to resume — Home only shows
  // the Resume card when getActiveSession() returned a checkpoint, so this shouldn't normally be
  // reached with none, but it's a harmless no-op if it ever is (e.g. a stale card race).
  async resumeSession(): Promise<void> {
    const saved = await getActiveSession();
    if (!saved) return;
    const runner = SessionRunner.resume(this.bundle, saved);
    this.inSession = true;
    history.pushState(SESSION_HISTORY_STATE, '');
    mount(this.root, renderPractice(runner, this));
  }

  goSessionSummaryFrom(runner: SessionRunner): void {
    this.inSession = false;
    this.setExitHandler(null);
    mount(this.root, renderSessionSummary(runner, this));
  }

  goSettings(): void {
    this.inSession = false;
    this.setExitHandler(null);
    mount(this.root, renderSettings(this.bundle, this));
  }

  goNotesList(): void {
    this.inSession = false;
    this.setExitHandler(null);
    mount(this.root, renderNotesList(this.bundle, this));
  }

  goNoteDetail(note: Note): void {
    this.inSession = false;
    this.setExitHandler(null);
    mount(this.root, renderNoteDetail(note, this));
  }
}
