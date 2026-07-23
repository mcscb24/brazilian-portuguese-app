// Hand-rolled view switcher (Phase 2 plan's architecture decision 4): a fixed hub-and-spoke
// flow across five screens, no hash router. history.pushState/popstate is used only so an
// Android back-button press during an active session asks for confirmation instead of exiting.

import type { ContentBundle } from '../content/types';
import type { SessionConfig } from '../session/types';
import { SessionRunner } from '../session/sessionRunner';
import { mount } from './dom';
import { renderHome } from './screens/home';
import { renderPractice } from './screens/practice';
import { renderSessionSetup } from './screens/sessionSetup';
import { renderSessionSummary } from './screens/sessionSummary';
import { renderSettings } from './screens/settings';

const SESSION_HISTORY_STATE = { bpPracticeSession: true };

export class Shell {
  private inSession = false;

  constructor(
    private root: HTMLElement,
    private bundle: ContentBundle
  ) {
    window.addEventListener('popstate', (event) => {
      if (!this.inSession) return;
      if (event.state && (event.state as { bpPracticeSession?: boolean }).bpPracticeSession) return;

      const confirmed = window.confirm('Leave this practice session? Your progress so far is already saved.');
      if (!confirmed) {
        history.pushState(SESSION_HISTORY_STATE, '');
        return;
      }
      this.inSession = false;
      this.goHome();
    });
  }

  goHome(): void {
    this.inSession = false;
    mount(this.root, renderHome(this.bundle, this));
  }

  goSessionSetup(): void {
    this.inSession = false;
    mount(this.root, renderSessionSetup(this.bundle, this));
  }

  async goPractice(config: SessionConfig): Promise<void> {
    const runner = await SessionRunner.start(this.bundle, config);
    this.inSession = true;
    history.pushState(SESSION_HISTORY_STATE, '');
    mount(this.root, renderPractice(runner, this));
  }

  goSessionSummaryFrom(runner: SessionRunner): void {
    this.inSession = false;
    mount(this.root, renderSessionSummary(runner, this));
  }

  goSettings(): void {
    this.inSession = false;
    mount(this.root, renderSettings(this.bundle, this));
  }
}
