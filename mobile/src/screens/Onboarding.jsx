/**
 * The first-run carousel: three short slides, then Masuk / Daftar /
 * Lihat-lihat dulu.
 *
 * Everything is drawn from `tokens(resolved)` — no second palette for light
 * mode. Entrance motion uses React Native's `Animated` only: one set of values
 * per slide, staggered 0 / 70 / 140 ms (and 210 ms for the final CTAs), with
 * `useNativeDriver: true` for opacity and translation. The dot width is the
 * one JS-driven animation because native drivers cannot animate width.
 *
 * The screen is a plain component with injected collaborators: `storage` is
 * the SecureStore adapter from the route, and `onLookAround` is the route's
 * `DemoProvider.enterDemo()` callback. Both stay injected so the screen can be
 * used without the app providers around it.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Rect } from 'react-native-svg';

import BrandMark from '../components/BrandMark.jsx';
import { SolarIcon } from '../components/icons.jsx';
import { setSeenOnboarding } from '../state/onboarding.js';
import { tokens, withAlpha } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

const SLIDES = [
  {
    key: 'catat',
    eyebrow: '01 / CATAT',
    title: 'Semua uangmu,\nsatu ruang.',
    body: 'Catat pemasukan dan pengeluaran sehari-hari. Nggak perlu spreadsheet yang berantakan.',
    keyword: 'Catat uang masuk dan keluar',
    art: 'ledger',
  },
  {
    key: 'anggaran',
    eyebrow: '02 / ANGGARAN',
    title: 'Batas jelas per\nkategori.',
    body: 'Beri anggaran tiap kategori dan lihat sisanya sepanjang bulan. Kamu yang menentukan batasnya.',
    keyword: 'Atur anggaran kategori',
    art: 'budget',
  },
  {
    key: 'riwayat',
    eyebrow: '03 / RIWAYAT',
    title: 'Tiap bulan lebih\nmudah dibaca.',
    body: 'Lihat ringkasan per bulan dan temukan ke mana uangmu pergi tanpa menggali catatan lama.',
    keyword: 'Lihat riwayat per bulan',
    art: 'history',
  },
];

const LAST = SLIDES.length - 1;

/** A press-scale button with its own value, so pressing one CTA leaves the rest alone. */
function PressableScale({ children, onPressIn, onPressOut, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue) =>
    Animated.timing(scale, { toValue, duration: 120, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        {...rest}
        onPressIn={() => {
          animate(0.97);
          onPressIn?.();
        }}
        onPressOut={() => {
          animate(1);
          onPressOut?.();
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** Small, token-only illustrations — no image assets, no new colours. */
function Illustration({ kind, t, s }) {
  if (kind === 'ledger') {
    return (
      <View style={s.artCard}>
        <Text style={s.artLabel}>Saldo bulan ini</Text>
        <Text style={s.artAmount}>Rp 2.450.000</Text>
        <View style={s.artRow}>
          <View style={[s.artDot, { backgroundColor: t.accent }]} />
          <Text style={s.artRowLabel}>Masuk</Text>
          <Text style={[s.artRowValue, { color: t.accentText }]}>+ Rp 3.200.000</Text>
        </View>
        <View style={s.artRow}>
          <View style={[s.artDot, { backgroundColor: t.warn }]} />
          <Text style={s.artRowLabel}>Keluar</Text>
          <Text style={s.artRowValue}>- Rp 750.000</Text>
        </View>
      </View>
    );
  }
  if (kind === 'budget') {
    return (
      <View style={s.artCard}>
        <Text style={s.artLabel}>Anggaran kategori</Text>
        {[
          { name: 'Makan', fill: t.accent, width: '82%' },
          { name: 'Transport', fill: t.warn, width: '58%' },
          { name: 'Belanja', fill: t.body, width: '34%' },
        ].map((row) => (
          <View key={row.name} style={s.budgetRow}>
            <Text style={s.artRowLabel}>{row.name}</Text>
            <View style={s.budgetTrack}>
              <View style={[s.budgetFill, { backgroundColor: row.fill, width: row.width }]} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={s.artCard}>
      <Text style={s.artLabel}>Pengeluaran 6 bulan</Text>
      <Svg width={228} height={104} viewBox="0 0 228 104">
        {[38, 62, 44, 78, 56, 90].map((height, index) => (
          <Rect
            key={index}
            x={index * 37 + 4}
            y={104 - height}
            width={26}
            height={height}
            rx={4}
            fill={index === 5 ? t.accent : t.line3}
          />
        ))}
      </Svg>
    </View>
  );
}

export default function Onboarding({ storage, onLookAround }) {
  const router = useRouter();
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const { width } = useWindowDimensions();

  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);
  const finishingRef = useRef(false);
  const motion = useRef(
    SLIDES.map(() => ({
      title: new Animated.Value(0),
      art: new Animated.Value(0),
      keyword: new Animated.Value(0),
      cta: new Animated.Value(0),
      lift: new Animated.Value(16),
      // The final CTAs get their own, shorter lift: they arrive last and must
      // rise as they fade rather than fading in place (12 -> 0).
      ctaLift: new Animated.Value(12),
      dot: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    const active = motion[index];
    // Replay the entrance when a visitor swipes back to a slide.
    active.title.setValue(0);
    active.art.setValue(0);
    active.keyword.setValue(0);
    active.cta.setValue(0);
    active.lift.setValue(16);
    active.ctaLift.setValue(12);

    const rise = (value, delay) =>
      Animated.timing(value, { toValue: 1, duration: 360, delay, useNativeDriver: true });
    Animated.parallel([
      rise(active.title, 0),
      rise(active.art, 70),
      rise(active.keyword, 140),
      rise(active.cta, 210),
      Animated.timing(active.lift, { toValue: 0, duration: 360, useNativeDriver: true }),
      Animated.timing(active.ctaLift, {
        toValue: 0,
        duration: 360,
        delay: 210,
        useNativeDriver: true,
      }),
    ]).start();

    // Width cannot use the native driver; the dots are a JS animation.
    motion.forEach((dot, position) => {
      Animated.timing(dot.dot, {
        toValue: position === index ? 1 : 0,
        duration: 220,
        useNativeDriver: false,
      }).start();
    });
  }, [index]);

  /** The flag is stamped exactly once, and only on a completed carousel. */
  const markSeen = async () => {
    try {
      await setSeenOnboarding(storage);
    } catch (error) {
      console.warn('[onboarding] penanda gagal disimpan:', error?.message ?? error);
    }
  };

  const goTo = async (path) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await markSeen();
    router.replace(path);
  };

  const handleLookAround = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await markSeen();
    // The route supplies DemoProvider.enterDemo(); optional so the screen also
    // renders in isolation.
    onLookAround?.();
    router.replace('/');
  };

  const goToSlide = (next) => {
    const target = Math.max(0, Math.min(LAST, next));
    setIndex(target);
    scrollRef.current?.scrollTo({ x: target * width, animated: true });
  };

  const onMomentumScrollEnd = ({ nativeEvent }) => {
    const next = Math.round(nativeEvent.contentOffset.x / width);
    if (next >= 0 && next <= LAST && next !== index) setIndex(next);
  };

  return (
    <View style={s.screen}>
      <View style={s.top}>
        <BrandMark size={28} />
        <Pressable onPress={() => goTo('/login')} hitSlop={10} accessibilityRole="link">
          <Text style={s.skip}>Lewati</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
      >
        {SLIDES.map((slide, position) => {
          const active = motion[position];
          return (
            <View key={slide.key} style={[s.slide, { width }]}>
              <Animated.View
                style={{ opacity: active.title, transform: [{ translateY: active.lift }] }}
              >
                <Text style={s.eyebrow}>{slide.eyebrow}</Text>
                <Text style={s.title}>{slide.title}</Text>
              </Animated.View>

              <Animated.View
                style={{ opacity: active.art, transform: [{ translateY: active.lift }] }}
              >
                <Illustration kind={slide.art} t={t} s={s} />
              </Animated.View>

              <Animated.View style={{ opacity: active.keyword }}>
                <Text style={s.keyword}>{slide.keyword}</Text>
                <Text style={s.body}>{slide.body}</Text>
              </Animated.View>

              {position === LAST ? (
                <Animated.View
                  style={{ opacity: active.cta, transform: [{ translateY: active.ctaLift }], gap: 10 }}
                >
                  <PressableScale
                    style={s.primary}
                    onPress={() => goTo('/login')}
                    accessibilityRole="button"
                  >
                    <Text style={s.primaryText}>Masuk</Text>
                    <SolarIcon name="arrow-right" size={17} color={t.accentInk} />
                  </PressableScale>
                  <PressableScale
                    style={s.secondary}
                    onPress={() => goTo('/register')}
                    accessibilityRole="button"
                  >
                    <Text style={s.secondaryText}>Daftar</Text>
                  </PressableScale>
                  <Pressable
                    style={s.link}
                    onPress={handleLookAround}
                    accessibilityRole="link"
                    hitSlop={8}
                  >
                    <Text style={s.linkText}>Lihat-lihat dulu →</Text>
                  </Pressable>
                </Animated.View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <View style={s.dots}>
          {motion.map((dot, position) => (
            <Animated.View
              key={position}
              style={{
                width: dot.dot.interpolate({ inputRange: [0, 1], outputRange: [6, 18] }),
                height: 6,
                borderRadius: t.radius.full,
                backgroundColor: position === index ? t.accent : t.track,
              }}
            />
          ))}
        </View>
        <View style={s.nav}>
          {index > 0 ? (
            <PressableScale
              style={s.back}
              onPress={() => goToSlide(index - 1)}
              accessibilityRole="button"
            >
              <SolarIcon name="arrow-left" size={16} color={t.body} />
              <Text style={s.backText}>Kembali</Text>
            </PressableScale>
          ) : null}
          {index < LAST ? (
            <PressableScale
              style={s.next}
              onPress={() => goToSlide(index + 1)}
              accessibilityRole="button"
            >
              <Text style={s.nextText}>Lanjut</Text>
              <SolarIcon name="arrow-right" size={16} color={t.accentInk} />
            </PressableScale>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export { Onboarding };

const stylesFor = (t) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg, paddingHorizontal: 20, paddingTop: 24 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    skip: { fontFamily: t.font.display, fontSize: 13, color: t.muted },
    pager: { flex: 1 },
    slide: { flex: 1, paddingTop: t.spacing.section, paddingBottom: 12 },
    eyebrow: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.55,
      color: t.accentText,
      marginBottom: 14,
    },
    title: {
      fontFamily: t.font.display,
      fontSize: 34,
      lineHeight: 40,
      letterSpacing: -0.06,
      color: t.ink,
      marginBottom: t.spacing.card,
    },
    artCard: {
      borderRadius: t.radius.xl,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.panel,
      padding: 18,
      gap: 12,
      marginBottom: t.spacing.card,
    },
    artLabel: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.4,
      color: t.subtle,
    },
    artAmount: {
      fontFamily: t.font.display,
      fontSize: 26,
      letterSpacing: -0.04,
      color: t.ink,
    },
    artRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    artDot: { width: 8, height: 8, borderRadius: t.radius.full },
    artRowLabel: { fontSize: 12, color: t.body, flex: 1 },
    artRowValue: { fontFamily: t.font.mono, fontSize: 12, color: t.ink },
    budgetRow: { gap: 7 },
    budgetTrack: {
      height: 8,
      borderRadius: t.radius.full,
      backgroundColor: t.track,
      overflow: 'hidden',
    },
    budgetFill: { height: 8, borderRadius: t.radius.full },
    keyword: {
      fontFamily: t.font.display,
      fontSize: 15,
      fontWeight: 'bold',
      color: t.ink,
      marginBottom: 8,
    },
    body: { fontSize: 13, lineHeight: 22, color: t.body },
    primary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
    },
    primaryText: { fontFamily: t.font.display, fontSize: 14, fontWeight: 'bold', color: t.accentInk },
    secondary: {
      alignItems: 'center',
      justifyContent: 'center',
      height: 46,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.line3,
      backgroundColor: withAlpha(t.accent, 0.08),
    },
    secondaryText: { fontFamily: t.font.display, fontSize: 14, fontWeight: 'bold', color: t.ink },
    link: { alignSelf: 'center', paddingVertical: 6 },
    linkText: { fontSize: 13, color: t.accentText, textDecorationLine: 'underline' },
    footer: { gap: t.spacing.card, paddingBottom: 12 },
    dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      height: 42,
    },
    backText: { fontSize: 13, color: t.body },
    next: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      height: 42,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
    },
    nextText: { fontFamily: t.font.display, fontSize: 13, fontWeight: 'bold', color: t.accentInk },
  });
