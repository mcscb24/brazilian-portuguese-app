// Reusable in-app confirmation/action overlay, replacing window.confirm() where practical (Phase
// 2.1). Renders to document.body rather than a screen's own container, so showing/dismissing one
// never requires the caller to redraw anything — any in-progress, unsubmitted UI state underneath
// (e.g. typed-but-not-submitted answer text) is left completely untouched.

import { el } from './dom';

export interface DialogAction<T> {
  label: string;
  value: T;
  variant?: 'primary' | 'danger' | 'default';
}

export function showActionDialog<T>(title: string, message: string, actions: DialogAction<T>[]): Promise<T> {
  return new Promise((resolve) => {
    const close = (value: T) => {
      overlay.remove();
      resolve(value);
    };

    const buttons = actions.map((action) =>
      el(
        'button',
        {
          class: action.variant === 'primary' ? 'primary' : action.variant === 'danger' ? 'danger' : '',
          onclick: () => close(action.value),
        },
        [action.label]
      )
    );

    const box = el('div', { class: 'dialog-box', role: 'alertdialog', 'aria-modal': 'true' }, [
      el('h2', {}, [title]),
      el('p', {}, [message]),
      el('div', { class: 'dialog-actions' }, buttons),
    ]);

    const overlay = el('div', { class: 'dialog-overlay' }, [box]);
    document.body.append(overlay);
  });
}

export function showConfirmDialog(
  title: string,
  message: string,
  confirmLabel = 'Confirm',
  danger = false
): Promise<boolean> {
  return showActionDialog<boolean>(title, message, [
    { label: confirmLabel, value: true, variant: danger ? 'danger' : 'primary' },
    { label: 'Cancel', value: false },
  ]);
}
