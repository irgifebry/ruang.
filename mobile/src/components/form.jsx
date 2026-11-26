import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SolarIcon } from './icons.jsx';
import { useTheme } from '../theme/useTheme.js';
import { tokens } from '../theme/tokens.js';

/**
 * Form primitives, the native mirror of `src/components/form.jsx` on the web
 * app. Every colour comes from `tokens(resolved)` — nothing is hardcoded.
 *
 * Notes, mirroring the web versions where it matters:
 * - Text fields are `type="text"` equivalents — `TextInput` with
 *   `keyboardType="numeric"` rather than a numeric-typed field, so pasted
 *   values stay visible to validation.
 * - Pickers are a read-only display plus a `Modal` sheet, because the core
 *   `Picker` is gone in React Native 0.88.
 */

const stylesFor = (t) =>
  StyleSheet.create({
    field: { flexDirection: 'column', gap: 8 },
    label: { fontFamily: t.font.display, fontSize: 13, fontWeight: '500', color: t.body },
    inputBase: {
      flex: 1,
      backgroundColor: t.shell,
      borderWidth: 1,
      borderRadius: t.radius.sm,
      color: t.ink,
      paddingHorizontal: 11,
      paddingVertical: 10,
      fontSize: 13,
    },
    inputError: { borderColor: t.dangerInk },
    inputOk: { borderColor: t.line2 },
    hint: { fontSize: 12, color: t.subtle },
    error: { fontSize: 12, color: t.dangerInk },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 44,
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
    },
    buttonDanger: { backgroundColor: t.dangerInk },
    buttonText: { color: t.accentInk, fontWeight: 'bold', fontSize: 13 },
    buttonTextDanger: { color: t.dangerFillInk, fontWeight: 'bold', fontSize: 13 },
    // A disabled control must read as disabled, not just ignore taps: the demo
    // uses these buttons for every write it locks.
    buttonDisabled: { opacity: 0.4 },
    ghost: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 44,
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.line3,
    },
    ghostText: { color: t.ink, fontWeight: 'bold', fontSize: 13 },
    ghostDisabled: { opacity: 0.4 },
    message: { fontSize: 12, color: t.dangerInk },
    messageSuccess: { fontSize: 12, color: t.accentText },
    selectBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.shell,
      borderWidth: 1,
      borderRadius: t.radius.sm,
      paddingHorizontal: 11,
      paddingVertical: 10,
    },
    selectText: { color: t.ink, fontSize: 13 },
    selectPlaceholder: { color: t.ghost, fontSize: 13 },
    sheet: {
      flex: 1,
      backgroundColor: t.panel2,
      paddingTop: 12,
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    sheetTitle: {
      fontFamily: t.font.display,
      fontSize: 13,
      fontWeight: 'bold',
      color: t.ink,
      marginBottom: 12,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      borderTopWidth: 1,
      borderColor: t.lineSoft,
    },
    sheetRowText: { color: t.ink, fontSize: 15 },
    closeButton: { paddingVertical: 12 },
    closeText: { color: t.muted, fontSize: 13 },
  });

const inputStyles = (t, s, error) => ({ ...s.inputBase, ...(error ? s.inputError : s.inputOk) });

/** Field label + its control + error/hint. */
export function Field({ label, error, hint, children }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <View style={s.field}>
      {/* Filters pass no label — they carry their own `accessibilityLabel` on
          the control — and an empty Text would still take a row in the gap. */}
      {label ? <Text style={s.label}>{label}</Text> : null}
      {children}
      {error ? (
        <Text style={s.error}>{error}</Text>
      ) : hint ? (
        <Text style={s.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Text input. Mirrors the web `TextField`. */
export function TextField({ label, value, onChange, error, hint, placeholder, maxLength, inputMode = 'default', inputStyle, ...rest }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <Field label={label} error={error} hint={hint}>
      {/* An error border is the stronger signal: a focus highlight must not
          overwrite it. `inputStyle` is only a neutral focus affordance. */}
      <TextInput
        style={[inputStyles(t, s, error), error ? null : inputStyle]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        keyboardType={inputMode === 'numeric' ? 'numeric' : 'default'}
        {...rest}
      />
    </Field>
  );
}

/**
 * Number input. Rendered as a text field with `keyboardType="numeric"` rather
 * than a numeric-typed field, so a pasted "12.500" reaches validation visible
 * instead of being silently discarded by the native number keyboard.
 */
export function NumberField({ label, value, onChange, error, hint, size, align, ...rest }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <Field label={label} error={error} hint={hint}>
      <TextInput
        style={inputStyles(t, s, error)}
        value={value}
        onChangeText={onChange}
        placeholder="0"
        keyboardType="numeric"
        {...(align === 'right' ? { textAlign: 'right', paddingLeft: 36 } : {})}
        {...(size ? { fontSize: size === 'lg' ? 24 : 13 } : {})}
        {...rest}
      />
    </Field>
  );
}

/** Select input — read-only display plus a modal sheet of the options. */
export function SelectField({ label, value, onChange, error, hint, options, placeholder, ...rest }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const [open, setOpen] = useState(false);
  const selected = options?.find((o) => o.value === value);
  return (
    <Field label={label} error={error} hint={hint}>
      <Pressable style={inputStyles(t, s, error)} onPress={() => setOpen(true)} {...rest}>
        <Text style={selected ? s.selectText : s.selectPlaceholder}>
          {selected ? selected.label : placeholder}
        </Text>
        <SolarIcon name="alt-arrow-down" size={12} color={t.subtle} />
      </Pressable>
      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
        animationType="slide"
      >
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{placeholder ?? label}</Text>
          {options?.map((option) => (
            <Pressable
              key={option.value}
              style={s.sheetRow}
              onPress={() => {
                onChange?.(option.value);
                setOpen(false);
              }}
            >
              <Text style={s.sheetRowText}>{option.label}</Text>
              {value === option.value ? <SolarIcon name="check" size={18} color={t.accent} /> : null}
            </Pressable>
          ))}
          <Pressable style={[s.sheetRow, s.closeButton]} onPress={() => setOpen(false)}>
            <Text style={s.closeText}>Tutup</Text>
          </Pressable>
        </View>
      </Modal>
    </Field>
  );
}

/** Primary action. `busy` swaps the label and disables the control. */
export function Button({ children, busy, busyLabel, tone = 'lime', ...rest }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <Pressable
      style={[
        s.button,
        tone === 'danger' ? s.buttonDanger : null,
        (busy || rest.disabled) && s.buttonDisabled,
      ]}
      onPress={rest.onPress}
      disabled={busy || rest.disabled}
      accessibilityState={{ busy: !!busy, disabled: !!(busy || rest.disabled) }}
    >
      <Text style={tone === 'danger' ? s.buttonTextDanger : s.buttonText}>
        {busy ? busyLabel : children}
      </Text>
    </Pressable>
  );
}

/** Secondary / ghost button for cancel and low-emphasis actions. */
export function GhostButton({ children, ...rest }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <Pressable
      style={[s.ghost, rest.disabled && s.ghostDisabled]}
      onPress={rest.onPress}
      disabled={rest.disabled}
      accessibilityState={{ disabled: !!rest.disabled }}
    >
      <Text style={s.ghostText}>{children}</Text>
    </Pressable>
  );
}

/** Inline status line for form-level feedback. */
export function FormMessage({ error, success }) {
  // The hook must run on every render: this component is mounted with empty
  // props and gains a message only after a write fails or succeeds.
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  if (!error && !success) return null;
  return (
    <Text
      style={error ? s.message : s.messageSuccess}
      accessibilityLiveRegion={error ? 'assertive' : 'polite'}
    >
      {error || success}
    </Text>
  );
}
