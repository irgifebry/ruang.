'use client';

import { useId } from 'react';

/**
 * Form primitives.
 *
 * Every field wires its own `id`, `<label htmlFor>`, and `aria-invalid` /
 * `aria-describedby`, so screen readers announce the label and the error
 * together. The previous pages used bare `<label>` with no `htmlFor` and inline
 * `<p>` errors, which left the error invisible to assistive tech.
 */

const INPUT_BASE =
  'w-full bg-ruang-shell border rounded-[3px] text-ruang-ink px-[11px] outline-none transition-colors placeholder:text-ruang-ghost disabled:opacity-60';

/** Shared focus ring. `focus-visible` keeps it off mouse clicks. */
function borderFor(error, size = 'md') {
  const height = size === 'lg' ? 'h-[54px]' : 'h-[40px]';
  const color = error
    ? 'border-ruang-danger-ink focus:border-ruang-danger-ink'
    : 'border-ruang-line-2 focus:border-ruang-accent-text';
  return `${height} ${color}`;
}

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className="flex flex-col gap-[8px]">
      <label htmlFor={htmlFor} className="text-ruang-body text-[13px] font-medium tracking-[0.01em]">
        {label}
      </label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-ruang-danger-ink text-[12px] leading-[1.5]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-ruang-subtle text-[12px] leading-[1.6]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Shared props for a control so error/hint wiring stays consistent. */
function controlProps(id, error, describedBy) {
  return {
    id,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
  };
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  type = 'text',
  maxLength,
  autoComplete,
  inputMode,
  size,
  ...rest
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      <input
        {...controlProps(id, error, describedBy)}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={`${INPUT_BASE} ${borderFor(error, size)} ${size === 'lg' ? 'text-[24px] font-mono' : 'text-[13px]'}`}
        {...rest}
      />
    </Field>
  );
}

/**
 * Numeric input.
 *
 * Rendered as `type="text"` with `inputMode="numeric"` rather than
 * `type="number"`: number inputs silently discard invalid keystrokes, so a
 * pasted "12.500" or a stray "-" never reaches validation and the user gets no
 * feedback at all. As text, the raw value is visible and `validateExpense` can
 * explain what is wrong.
 */
export function NumberField({ label, value, onChange, error, hint, size, align = 'left', ...rest }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      <div className="relative">
        {align === 'right' && (
          <span className="absolute left-[10px] top-1/2 -translate-y-1/2 font-mono text-[12px] text-ruang-subtle pointer-events-none">
            Rp
          </span>
        )}
        <input
          {...controlProps(id, error, describedBy)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={onChange}
          placeholder="0"
          className={`${INPUT_BASE} font-mono ${borderFor(error, size)} ${
            size === 'lg' ? 'text-[24px]' : 'text-[13px]'
          } ${align === 'right' ? 'pl-[32px] text-right' : 'text-[13px]'}`}
          {...rest}
        />
      </div>
    </Field>
  );
}

export function SelectField({ label, value, onChange, error, hint, options, placeholder, ...rest }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      <select
        {...controlProps(id, error, describedBy)}
        value={value}
        onChange={onChange}
        className={`${INPUT_BASE} ${borderFor(error)} text-[13px] text-ruang-ink cursor-pointer`}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-ruang-shell">
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Primary action button. `busy` swaps the label for a spinner and disables the
 * control, so a double submit cannot create two expenses.
 *
 * `tone="danger"` is the destructive variant, used by the confirmation dialog so
 * a delete does not look like a save. Everything else stays lime.
 *
 * `whitespace-nowrap` on the label is deliberate. Beside a cancel button on a
 * narrow dialog, a label like "Simpan transaksi" would otherwise break across
 * two lines at an arbitrary point — "Simpan" / "gaji" — and the button grew
 * past its fixed 42px height. A nowrap label makes the pair overflow instead,
 * which is why the rows that hold a primary and a ghost button wrap their
 * children rather than forcing them to share one line.
 */
export function Button({ children, busy, busyLabel, tone = 'lime', type = 'button', className = '', ...rest }) {
  const toneClass =
    tone === 'danger'
      ? 'bg-ruang-danger-ink text-ruang-danger-fill-ink hover:bg-ruang-danger-hover'
      : 'bg-ruang-accent text-ruang-accent-ink hover:bg-ruang-accent-hover';

  return (
    <button
      type={type}
      disabled={busy || rest.disabled}
      className={`h-[42px] px-[18px] flex items-center justify-center gap-[10px] whitespace-nowrap text-[13px] font-bold tracking-[0.02em] rounded-[4px] ${toneClass} transition-colors active:scale-95 disabled:opacity-60 disabled:active:scale-100 ${
        busy ? 'cursor-wait' : ''
      } ${className}`}
      {...rest}
    >
      {busy ? busyLabel : children}
    </button>
  );
}

/** Secondary / ghost button used for cancel and low-emphasis actions. */
export function GhostButton({ children, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`h-[42px] px-[18px] flex items-center justify-center gap-[10px] whitespace-nowrap text-[13px] font-bold tracking-[0.02em] rounded-[4px] border border-ruang-line-3 text-ruang-ink hover:border-ruang-accent-text hover:text-ruang-accent-text transition-colors active:scale-95 disabled:opacity-60 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Inline status line for form-level feedback.
 *
 * `role="status"` + `aria-live="polite"` means the message is announced when it
 * appears. Colour alone never carries the meaning: success also carries
 * "Tersimpan", errors state what went wrong.
 */
export function FormMessage({ error, success }) {
  if (!error && !success) return null;
  return (
    <p
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      className={`text-[12px] leading-[1.6] ${error ? 'text-ruang-danger-ink' : 'text-ruang-accent-text'}`}
    >
      {error || success}
    </p>
  );
}
