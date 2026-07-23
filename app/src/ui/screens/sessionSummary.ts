import type { SessionRunner } from '../../session/sessionRunner';
import { el } from '../dom';
import { formatPercent } from '../format';
import type { Shell } from '../shell';

export function renderSessionSummary(runner: SessionRunner, shell: Shell): HTMLElement {
  const summary = runner.buildDisplaySummary();

  const topicRows = summary.topic_breakdown.map((topic) =>
    el('li', {}, [`${topic.topic}: ${topic.correct}/${topic.correct + topic.incorrect} (${formatPercent(topic.accuracy)})`])
  );

  const incorrectRows = summary.incorrect_items.map((item) => el('li', {}, [`${item.prompt} (${item.topic})`]));

  return el('div', { class: 'screen screen-session-summary' }, [
    el('h1', {}, ['Session summary']),
    el('ul', { class: 'summary-stats' }, [
      el('li', {}, [`Answered: ${summary.answered}`]),
      el('li', {}, [`Correct: ${summary.correct}`]),
      el('li', {}, [`Correct (accent only): ${summary.correct_accent_only}`]),
      el('li', {}, [`Incorrect: ${summary.incorrect}`]),
      el('li', {}, [`Ignored/flagged: ${summary.ignored_or_flagged}`]),
      el('li', {}, [`Accuracy: ${formatPercent(summary.accuracy)}`]),
    ]),
    el('h2', {}, ['By topic']),
    topicRows.length > 0 ? el('ul', {}, topicRows) : el('p', { class: 'muted' }, ['No topic data for this session.']),
    el('h2', {}, ['Answered incorrectly']),
    incorrectRows.length > 0
      ? el('ul', {}, incorrectRows)
      : el('p', { class: 'muted' }, ['None — nice work.']),
    el('button', { class: 'primary', onclick: () => shell.goSessionSetup() }, ['Start another session']),
    el('button', { onclick: () => shell.goHome() }, ['Back to home']),
  ]);
}
