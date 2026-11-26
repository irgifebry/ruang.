import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, GhostButton } from './form.jsx';
import { SolarIcon } from './icons.jsx';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

/**
 * The native mirror of `src/components/confirm-dialog.jsx` on the web app.
 *
 * A destructive action is never taken on a bare tap: the dialog names the row,
 * the amount (or the number of transactions holding a category) and the fact
 * that the action cannot be undone. It is rendered in the app's own surface so
 * it picks up the active theme instead of borrowing a platform popup.
 *
 * `onRequestClose` and the backdrop both cancel, but never while the caller's
 * `onConfirm` is in flight — a delete already sent cannot be waved away.
 */
export function ConfirmDialog({
  visible = false,
  title = 'Lanjutkan?',
  eyebrow = 'KONFIRMASI',
  description,
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  tone = 'danger',
  busy = false,
  busyLabel = 'Memproses...',
  onConfirm,
  onCancel,
}) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const cancel = useCallback(() => {
    if (!busy) onCancel?.();
  }, [busy, onCancel]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={cancel}
      accessibilityViewIsModal
    >
      {/* Two siblings, not nested: a press on the panel must not also hit the
          backdrop and dismiss the question before it can be answered. */}
      <View style={[StyleSheet.absoluteFill, s.backdropTint]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="Tutup konfirmasi">
        <View />
      </Pressable>

      {/* `box-none` lets a tap on the empty space around the panel fall through
          to the backdrop Pressable behind it, while the panel and its buttons
          remain touchable children. Without it the full-screen centering View
          swallowed every outside tap and backdrop dismissal never fired. */}
      <View style={s.center} pointerEvents="box-none">
        <View style={s.panel} accessibilityRole="alertdialog" accessibilityLabel={title}>
          <View style={s.head}>
            <View style={s.iconBadge}>
              <SolarIcon name="danger-circle" size={16} color={t.dangerInk} />
            </View>
            <View style={s.headText}>
              <Text style={s.eyebrow}>{eyebrow}</Text>
              <Text style={s.title}>{title}</Text>
            </View>
          </View>

          {description ? <Text style={s.description}>{description}</Text> : null}

          <View style={s.actions}>
            <View style={s.action}>
              <GhostButton onPress={onCancel} disabled={busy}>
                {cancelLabel}
              </GhostButton>
            </View>
            <View style={s.action}>
              <Button onPress={onConfirm} busy={busy} busyLabel={busyLabel} tone={tone}>
                {confirmLabel}
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Promise-based wrapper so a handler reads top to bottom:
 *
 *   const ok = await confirm({ title, description, onConfirm: async () => ... });
 *
 * `onConfirm` returning `false` resolves the caller's promise with `false`
 * (the write failed) and the dialog still closes — same as the web hook. The
 * caller's mutation helper records the error for the page-level message. The
 * returned `dialog` element is rendered once by the caller.
 */
export function useConfirm() {
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(null);

  const settle = useCallback((result) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setBusy(false);
    setRequest(null);
    pending?.resolve(result);
  }, []);

  const confirm = useCallback((options) => {
    // One dialog only: a second request answers the first with `false` so no
    // caller is left waiting on a promise that will never settle.
    pendingRef.current?.resolve(false);
    return new Promise((resolve) => {
      pendingRef.current = { resolve };
      setBusy(false);
      setRequest(options);
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!request?.onConfirm) {
      settle(true);
      return;
    }
    setBusy(true);
    let result = true;
    try {
      result = await request.onConfirm();
    } catch {
      // The caller's mutation helper already recorded the message.
      result = false;
    }
    settle(result !== false);
  }, [request, settle]);

  const handleCancel = useCallback(() => {
    if (busy) return;
    settle(false);
  }, [busy, settle]);

  useEffect(() => () => pendingRef.current?.resolve(false), []);

  const dialog = (
    <ConfirmDialog
      {...(request ?? {})}
      visible={Boolean(request)}
      busy={busy}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}

const stylesFor = (t) =>
  StyleSheet.create({
    backdropTint: { backgroundColor: t.overlay, opacity: 0.85 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    },
    panel: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: t.panel2,
      borderWidth: 1,
      borderColor: t.line3,
      borderRadius: t.radius.md,
      paddingTop: 21,
      paddingBottom: 21,
      paddingHorizontal: 23,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    iconBadge: {
      width: 30,
      height: 30,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.full,
      backgroundColor: t.dangerSurface,
    },
    headText: { flex: 1, minWidth: 0, paddingTop: 2 },
    eyebrow: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.7,
      color: t.muted,
      textTransform: 'uppercase',
    },
    title: {
      fontFamily: t.font.display,
      fontSize: 18,
      letterSpacing: -0.03,
      fontWeight: '500',
      color: t.ink,
      marginTop: 6,
    },
    description: {
      fontSize: 13,
      lineHeight: 21,
      color: t.body,
      marginTop: 14,
    },
    actions: { flexDirection: 'row', gap: 9, marginTop: 20 },
    action: { flex: 1, minWidth: 112 },
  });

export default ConfirmDialog;
