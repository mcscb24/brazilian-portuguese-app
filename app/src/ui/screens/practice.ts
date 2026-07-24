import type { Question } from '../../content/types';
import type { Rating } from '../../review/types';
import type { FeedbackState, SessionRunner } from '../../session/sessionRunner';
import { clear, el } from '../dom';
import { showActionDialog } from '../dialog';
import type { Shell } from '../shell';

const FLAG_REASONS = [
  'Incorrect answer',
  'Ambiguous prompt',
  'Unnatural Portuguese',
  'Duplicate',
  'Outside current scope',
  'Source note needs correction',
  'Other',
];

const RATING_LABELS: Record<Rating, string> = {
  again: 'Again',
  difficult: 'Difficult',
  good: 'Good',
  easy: 'Easy',
};

const RATING_ORDER: Rating[] = ['again', 'difficult', 'good', 'easy'];

export function renderPractice(runner: SessionRunner, shell: Shell): HTMLElement {
  const container = el('div', { class: 'screen screen-practice' }, []);
  let exitDialogOpen = false;

  // Registered with the Shell right after mounting, so an Android/browser back press during this
  // session invokes this exact same 3-way choice as the in-page "Exit session" button — see
  // ui/shell.ts's popstate listener. exitDialogOpen guards against both being triggered at once.
  async function showExitDialog(triggeredByBackButton: boolean): Promise<void> {
    if (exitDialogOpen) return;
    exitDialogOpen = true;
    const choice = await showActionDialog<'save' | 'end' | 'continue'>(
      'Exit session?',
      'Your progress so far is already saved. What would you like to do?',
      [
        { label: 'Save and leave', value: 'save', variant: 'primary' },
        { label: 'End session', value: 'end', variant: 'danger' },
        { label: 'Continue practising', value: 'continue' },
      ]
    );
    exitDialogOpen = false;

    if (choice === 'save') {
      await runner.saveAndExit();
      shell.goHome();
    } else if (choice === 'end') {
      await runner.finish();
      shell.goSessionSummaryFrom(runner);
    } else if (triggeredByBackButton) {
      // Undo the browser's already-completed back-navigation pop, matching the pre-Phase-2.1
      // "cancel" history semantics exactly.
      shell.pushSessionHistoryMarker();
    }
  }

  shell.setExitHandler(showExitDialog);

  function redraw(): void {
    clear(container);
    if (runner.isFinished()) {
      void finishAndShowSummary();
      return;
    }
    const question = runner.currentQuestion();
    if (!question) {
      void finishAndShowSummary();
      return;
    }
    container.append(renderQuestionPhase(question));
  }

  async function finishAndShowSummary(): Promise<void> {
    await runner.finish();
    shell.goSessionSummaryFrom(runner);
  }

  function exitButton(): HTMLElement {
    return el('button', { onclick: () => void showExitDialog(false) }, ['Exit session']);
  }

  function renderQuestionPhase(question: Question): HTMLElement {
    const input = el('input', {
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      id: 'answer-input',
      'aria-label': 'Your answer in Portuguese',
    }) as HTMLInputElement;

    const submit = () => {
      const feedback = runner.submitAnswer(input.value);
      clear(container);
      container.append(renderFeedbackPhase(feedback));
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });

    return el('div', {}, [
      el('div', { class: 'session-progress' }, [runner.progressLabel()]),
      el('p', { class: 'prompt' }, [question.prompt]),
      el('label', { for: 'answer-input' }, ['Type your answer:']),
      input,
      el('button', { class: 'primary', onclick: submit }, ['Submit']),
      exitButton(),
    ]);
  }

  function renderFeedbackPhase(feedback: FeedbackState): HTMLElement {
    const outcomeLabel =
      feedback.outcome === 'correct'
        ? 'Correct'
        : feedback.outcome === 'correct_accent_only'
          ? 'Correct — check your accents'
          : 'Not quite';

    const acceptedList = (feedback.question.accepted_answers ?? []).map((a) => a.text).join(' / ');

    let selectedRating: Rating = feedback.autoRating;

    const ratingButtons = new Map<Rating, HTMLButtonElement>();
    const ratingRow = el(
      'div',
      { class: 'rating-row', role: 'radiogroup', 'aria-label': 'Rate this question' },
      RATING_ORDER.map((rating) => {
        const button = el(
          'button',
          {
            type: 'button',
            class: rating === selectedRating ? 'chip chip-selected' : 'chip',
            onclick: () => {
              selectedRating = rating;
              for (const [r, btn] of ratingButtons) btn.classList.toggle('chip-selected', r === rating);
            },
          },
          [RATING_LABELS[rating]]
        ) as HTMLButtonElement;
        ratingButtons.set(rating, button);
        return button;
      })
    );

    const nextButton = el(
      'button',
      {
        class: 'primary',
        onclick: async () => {
          nextButton.setAttribute('disabled', '');
          await runner.confirmRating(selectedRating);
          runner.proceedToNext();
          redraw();
        },
      },
      ['Next question']
    ) as HTMLButtonElement;

    const nextRow = el('div', { class: 'next-row' }, [nextButton]);

    if (feedback.outcome === 'incorrect') {
      nextRow.prepend(
        el(
          'button',
          {
            onclick: () => {
              const updated = runner.overrideOutcomeAsCorrect();
              clear(container);
              container.append(renderFeedbackPhase(updated));
            },
          },
          ['Actually correct']
        )
      );
    }

    const ignoreFlagRow = el('div', { class: 'ignore-flag-row' }, []);
    const ignoreButton = el(
      'button',
      {
        onclick: async () => {
          await runner.ignoreCurrentQuestion();
          runner.proceedToNext();
          redraw();
        },
      },
      ['Ignore this question']
    );
    const flagButton = el('button', { onclick: () => showFlagReasons() }, ['Flag as bad']);
    ignoreFlagRow.append(ignoreButton, flagButton);

    function showFlagReasons(): void {
      if (ignoreFlagRow.querySelector('select')) return;
      const select = el(
        'select',
        { 'aria-label': 'Reason for flagging' },
        FLAG_REASONS.map((reason) => el('option', { value: reason }, [reason]))
      ) as HTMLSelectElement;
      const confirmFlag = el(
        'button',
        {
          onclick: async () => {
            await runner.flagCurrentQuestionAsBad(select.value);
            runner.proceedToNext();
            redraw();
          },
        },
        ['Confirm flag']
      );
      ignoreFlagRow.append(select, confirmFlag);
    }

    return el('div', {}, [
      el('div', { class: 'session-progress' }, [runner.progressLabel()]),
      el('p', { class: `outcome outcome-${feedback.outcome}` }, [outcomeLabel]),
      el('p', {}, [`Your answer: ${feedback.userAnswer}`]),
      el('p', {}, [`Accepted: ${acceptedList}`]),
      el('p', { class: 'explanation' }, [feedback.question.explanation]),
      el('h3', {}, ['Rate this question']),
      ratingRow,
      nextRow,
      ignoreFlagRow,
      exitButton(),
    ]);
  }

  redraw();
  return container;
}
