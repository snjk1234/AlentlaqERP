"use client";

import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { groupMoneyInput, normalizeMoneyInput } from '../lib/money-format';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
};

export default function MoneyInput({ value, defaultValue, onValueChange, min, max, step,
  required, ...props }: Props) {
  const [edit, setEdit] = useState<{ raw: string; caret: number | null }>({
    raw: String(value ?? defaultValue ?? ''), caret: null
  });
  const draft = edit.raw;
  const [previousValue, setPreviousValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  if (value !== previousValue) {
    setPreviousValue(value);
    const next = String(value ?? '');
    if (next !== draft && !(next !== '' && draft !== '' && Number(next) === Number(draft))) {
      setEdit({ raw: next, caret: null });
    }
  }

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Reuse native number constraints although the visible field contains grouping commas.
    const validator = document.createElement('input');
    validator.type = 'number';
    validator.required = Boolean(required);
    if (min !== undefined) validator.min = String(min);
    if (max !== undefined) validator.max = String(max);
    if (step !== undefined) validator.step = String(step);
    validator.value = draft;
    input.setCustomValidity(draft !== '' && !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(draft)
      ? 'يرجى إدخال مبلغ صحيح'
      : validator.validationMessage);
    if (edit.caret !== null && document.activeElement === input) {
      input.setSelectionRange(edit.caret, edit.caret);
    }
  }, [edit, draft, min, max, step, required]);

  return <input {...props} ref={inputRef} type="text" inputMode="decimal" dir="ltr"
    required={required} value={groupMoneyInput(draft)}
    onKeyDown={event => {
      props.onKeyDown?.(event);
      if (event.defaultPrevented) return;
      const input = event.currentTarget;
      const start = input.selectionStart;
      if (start === null || start !== input.selectionEnd) return;
      if (event.key === 'Backspace' && input.value[start - 1] === ',') {
        input.setSelectionRange(start - 1, start - 1);
      } else if (event.key === 'Delete' && input.value[start] === ',') {
        input.setSelectionRange(start + 1, start + 1);
      }
    }}
    onChange={event => {
      const input = event.currentTarget;
      const raw = normalizeMoneyInput(input.value);
      if (!/^-?\d*(?:\.\d*)?$/.test(raw)) {
        const previousMessage = input.validationMessage;
        input.setCustomValidity('يرجى إدخال مبلغ صحيح');
        input.reportValidity();
        input.value = groupMoneyInput(draft);
        input.setCustomValidity(previousMessage);
        return;
      }
      const offset = normalizeMoneyInput(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
      const formatted = groupMoneyInput(raw);
      let caret = 0;
      let digits = 0;
      while (caret < formatted.length && digits < offset) {
        if (formatted[caret] !== ',') digits++;
        caret++;
      }
      setEdit({ raw, caret });
      onValueChange?.(raw);
    }} />;
}
