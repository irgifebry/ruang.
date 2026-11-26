/**
 * The native-app mirror of the web app's `TurnstileCaptcha`
 * (`src/components/AuthForm.jsx`): Cloudflare Turnstile rendered inside a
 * `react-native-webview` pointed at the ruang API origin. Tokens come back
 * through `window.ReactNativeWebView.postMessage` and are reported to the
 * caller as `onToken(token)`; an expired or errored widget reports `''`.
 *
 * The site key comes from `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (`process.env` —
 * Expo replaces `EXPO_PUBLIC_*` at build time). With no site key configured
 * the widget renders nothing: Turnstile cannot render, and no token will
 * ever arrive.
 *
 * The web view starts on a blank HTML document whose `source.baseUrl` is the
 * ruang API origin — Turnstile is bound to `ruang-cashflow.vercel.app`, so an
 * opaque origin could never be validated by Cloudflare. The injected script
 * loads the Turnstile bootstrap and renders into a host element of its own.
 * A `ref` is exposed with `reset()`: a Turnstile token is
 * single-use, so after every auth submit the screen clears the token and asks
 * the widget for a fresh one — the same `turnstile.reset()` the web form calls
 * in its `finally`.
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { apiBaseURL } from '../config.js';
import { TURNSTILE_SITE_KEY } from '../shared/captcha.js';

/** Cloudflare's Turnstile bootstrap — the same script the web app loads. */
export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js';

/** Turnstile's default widget footprint. */
const TURNSTILE_SIZE = { width: 300, height: 66 };

/** JS injected by `reset()` — the native equivalent of `window.turnstileReset()`. */
export const TURNSTILE_RESET_JS =
  'if (window.ruangTurnstileReset) { window.ruangTurnstileReset(); } true;';

/**
 * Builds the script the WebView injects on load. It loads the Turnstile
 * script, renders the widget into a host element, posts every token via
 * `window.ReactNativeWebView.postMessage`, and installs a reset hook that
 * reports `''` before asking Turnstile for a new challenge.
 *
 * The `window.ruangTurnstileStarted` flag is set before the script loads, so
 * a WebView re-run cannot stack a second widget. The widget id is kept on
 * `window.ruangTurnstileWidgetId` so `reset()` can reach the live widget.
 */
export function buildTurnstileScript({ siteKey }) {
  return `
    (function () {
      if (window.ruangTurnstileStarted) return;
      window.ruangTurnstileStarted = true;
      window.ruangTurnstileWidgetId = null;

      function post(token) {
        window.ReactNativeWebView.postMessage(token);
      }

      window.ruangTurnstileReset = function () {
        post('');
        if (window.turnstile && window.ruangTurnstileWidgetId !== null) {
          window.turnstile.reset(window.ruangTurnstileWidgetId);
        }
      };

      var script = document.createElement('script');
      script.src = ${JSON.stringify(TURNSTILE_SCRIPT_SRC)};
      script.onerror = function () { post(''); };
      script.onload = function () {
        var root = document.body || document.documentElement;
        var host = document.createElement('div');
        host.id = 'ruang-turnstile';
        root.appendChild(host);
        window.ruangTurnstileWidgetId = window.turnstile.render(host, {
          sitekey: ${JSON.stringify(siteKey)},
          callback: post,
          'expired-callback': function () { post(''); },
          'error-callback': function () { post(''); },
        });
      };
      (document.head || document.documentElement).appendChild(script);
    })();
    true;
  `;
}

export const TurnstileWidget = forwardRef(function TurnstileWidget(
  { onToken, baseURL, style },
  ref,
) {
  const siteKey = TURNSTILE_SITE_KEY || null;
  const webViewRef = useRef(null);

  // Hooks run before the early return: a screen without a site key still has
  // a stable ref object, and `reset()` there is simply a no-op.
  useImperativeHandle(
    ref,
    () => ({
      reset() {
        webViewRef.current?.injectJavaScript?.(TURNSTILE_RESET_JS);
      },
    }),
    [],
  );

  if (!siteKey) return null;

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: '<html><body></body></html>', baseUrl: baseURL ?? apiBaseURL() }}
        injectedJavaScript={buildTurnstileScript({ siteKey })}
        onMessage={(event) => onToken?.(event?.nativeEvent?.data ?? '')}
        scrollEnabled={false}
        webviewBounce={false}
        style={styles.webView}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: TURNSTILE_SIZE,
  webView: { flex: 1 },
});
