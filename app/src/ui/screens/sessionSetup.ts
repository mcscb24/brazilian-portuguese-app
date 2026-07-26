import type { ContentBundle, QuestionType } from '../../content/types';
import { distinctSupportedTypes, distinctTopics } from '../../session/selection';
import type { SessionConfig } from '../../session/types';
import { el } from '../dom';
import type { Shell } from '../shell';

const FIXED_COUNT_OPTIONS = [10, 20, 30, 50] as const;
type CountChoice = (typeof FIXED_COUNT_OPTIONS)[number] | 'custom' | 'unlimited';

const TYPE_LABELS: Partial<Record<QuestionType, string>> = {
  en_to_pt: 'Translate to Portuguese',
  open_completion: 'Open sentence completion',
  explain_difference: 'Explain the difference',
  speak_aloud: 'Speak aloud',
  verb_conjugation: 'Verb conjugation',
  conjugation_pattern: 'Conjugation pattern',
};

export function renderSessionSetup(bundle: ContentBundle, shell: Shell): HTMLElement {
  const topics = distinctTopics(bundle);
  const types = distinctSupportedTypes(bundle);

  const selectedTopics = new Set(topics);
  const selectedTypes = new Set(types);
  let selectedCount: CountChoice = 10;
  let customCount = 10;
  let includeIgnored = false;

  const countChoices: CountChoice[] = [...FIXED_COUNT_OPTIONS, 'custom', 'unlimited'];
  const countButtons = new Map<CountChoice, HTMLButtonElement>();

  const customInput = el('input', {
    type: 'number',
    min: '1',
    value: String(customCount),
    'aria-label': 'Custom question count',
    oninput: (e: Event) => {
      customCount = Math.max(1, parseInt((e.target as HTMLInputElement).value, 10) || 1);
    },
  }) as HTMLInputElement;
  customInput.hidden = true;

  const countGroup = el(
    'div',
    { class: 'field-group', role: 'radiogroup', 'aria-label': 'Session length' },
    countChoices.map((choice) => {
      const label = choice === 'unlimited' ? 'Unlimited' : choice === 'custom' ? 'Custom' : String(choice);
      const button = el(
        'button',
        {
          type: 'button',
          class: choice === selectedCount ? 'chip chip-selected' : 'chip',
          onclick: () => {
            selectedCount = choice;
            for (const [c, btn] of countButtons) btn.classList.toggle('chip-selected', c === choice);
            customInput.hidden = choice !== 'custom';
          },
        },
        [label]
      ) as HTMLButtonElement;
      countButtons.set(choice, button);
      return button;
    })
  );

  const topicGroup = el('div', { class: 'field-group' }, [
    el('h2', {}, ['Topics']),
    ...topics.map((topic) => {
      const id = `topic-${topic.replace(/\s+/g, '-')}`;
      const checkbox = el('input', {
        type: 'checkbox',
        id,
        checked: true,
        onchange: (e: Event) => {
          if ((e.target as HTMLInputElement).checked) selectedTopics.add(topic);
          else selectedTopics.delete(topic);
        },
      });
      return el('label', { for: id, class: 'checkbox-row' }, [checkbox, topic]);
    }),
  ]);

  const typeGroup = el('div', { class: 'field-group' }, [
    el('h2', {}, ['Question types']),
    ...(types.length > 0
      ? types.map((type) => {
          const id = `type-${type.replace(/\s+/g, '-')}`;
          const checkbox = el('input', {
            type: 'checkbox',
            id,
            checked: true,
            onchange: (e: Event) => {
              if ((e.target as HTMLInputElement).checked) selectedTypes.add(type);
              else selectedTypes.delete(type);
            },
          });
          return el('label', { for: id, class: 'checkbox-row' }, [checkbox, TYPE_LABELS[type] ?? type]);
        })
      : [el('p', { class: 'muted' }, ['No supported question types in this bundle yet.'])]),
  ]);

  const includeIgnoredCheckbox = el('input', {
    type: 'checkbox',
    id: 'include-ignored',
    onchange: (e: Event) => {
      includeIgnored = (e.target as HTMLInputElement).checked;
    },
  });

  const startButton = el(
    'button',
    {
      class: 'primary',
      onclick: () => {
        if (selectedTopics.size === 0) {
          window.alert('Select at least one topic.');
          return;
        }
        if (types.length === 0) {
          window.alert('No supported question types are available in this content bundle.');
          return;
        }
        if (selectedTypes.size === 0) {
          window.alert('Select at least one question type.');
          return;
        }
        const config: SessionConfig = {
          count: selectedCount === 'custom' ? customCount : selectedCount,
          topics: [...selectedTopics],
          types: [...selectedTypes],
          source_filter: 'random',
          include_ignored: includeIgnored,
        };
        void shell.goPractice(config);
      },
    },
    ['Start']
  );

  return el('div', { class: 'screen screen-session-setup' }, [
    el('h1', {}, ['Session setup']),
    el('h2', {}, ['Length']),
    countGroup,
    customInput,
    topicGroup,
    typeGroup,
    el('label', { class: 'checkbox-row' }, [includeIgnoredCheckbox, 'Include ignored/flagged questions']),
    el('p', { class: 'muted' }, ['Source: random selection from matching active questions.']),
    startButton,
    el('button', { onclick: () => shell.goHome() }, ['Cancel']),
  ]);
}
