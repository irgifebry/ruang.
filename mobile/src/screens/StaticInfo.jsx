/**
 * The two static pages — the native mirror of the web's `/help` and `/about`.
 * One screen, two variants, because the copy is fixed and only the shape
 * changes:
 *
 * - `help` — the four grouped FAQ topics from the in-app help page;
 * - `about` — the three principles.
 *
 * Every sentence is the web copy, and the card/section rhythm uses the same
 * tokens as every other screen. A question expands in place, mirroring the
 * web's disclosure button rather than hiding the answer behind a WebView.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button, GhostButton } from '../components/form.jsx';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

const FAQ_GROUPS = [
  {
    title: 'Mulai pakai ruang.',
    items: [
      {
        q: 'Apa yang perlu diatur dulu?',
        a: 'Buka Transaksi untuk mencatat pemasukan, lalu Pengaturan untuk membuat kategori beserta batas anggarannya. Setelah itu, catat pengeluaran di halaman yang sama.',
      },
      {
        q: 'Bagaimana cara mencatat pengeluaran?',
        a: 'Buka Pengeluaran, isi nama, jumlah, kategori, dan tanggal, lalu simpan. Jumlah harus berupa angka bulat tanpa pemisah desimal.',
      },
    ],
  },
  {
    title: 'Pemasukan dan riwayat',
    items: [
      {
        q: 'Kenapa riwayatku kosong?',
        a: 'Sebuah bulan muncul di riwayat setelah ada pemasukan atau pengeluaran yang tercatat di dalamnya. Akun baru belum punya catatan, jadi riwayatnya masih kosong.',
      },
      {
        q: 'Bagaimana cara mengubah pemasukan bulan lalu?',
        a: 'Buka Transaksi, pilih bulan yang ingin dilihat, lalu ubah atau hapus catatan pemasukannya. Perubahan hanya berlaku untuk catatan itu.',
      },
      {
        q: 'Apakah pemasukan bulan ini mengubah bulan sebelumnya?',
        a: 'Tidak. Setiap catatan pemasukan punya tanggal sendiri, jadi mengubah bulan ini tidak memengaruhi catatan bulan lain.',
      },
    ],
  },
  {
    title: 'Kategori dan transaksi',
    items: [
      {
        q: 'Apa yang terjadi kalau kategori dihapus?',
        a: 'Transaksinya tetap tersimpan dan tetap menampilkan nama kategori lama. Kategori itu hanya hilang dari daftar dan tidak bisa dipakai untuk catatan baru; nama yang sama boleh dipakai lagi untuk kategori baru.',
      },
      {
        q: 'Bisa menghubungkan rekening bank?',
        a: 'Belum. Semua angka dicatat manual; ruang. tidak mengambil data dari rekening bank.',
      },
    ],
  },
  {
    title: 'Akun dan privasi',
    items: [
      {
        q: 'Bagaimana kalau lupa kata sandi?',
        a: 'Di halaman Masuk, pilih “Lupa kata sandi?” untuk menerima tautan pengaturan ulang melalui email.',
      },
      {
        q: 'Siapa yang bisa melihat dataku?',
        a: 'Data akun bersifat pribadi. Setiap akun hanya dapat melihat dan mengubah catatannya sendiri.',
      },
    ],
  },
];

const PRINCIPLES = [
  {
    title: 'Input manual',
    body: 'Aplikasi tidak terhubung ke rekening bank.',
  },
  {
    title: 'Data per bulan',
    body: 'Setiap catatan bertanggal, jadi perubahan bulan ini tidak mengubah riwayat bulan sebelumnya.',
  },
  {
    title: 'Privat',
    body: 'Setiap akun hanya dapat mengakses catatannya sendiri.',
  },
];

function FaqRow({ question, answer, styles }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.faqRow}>
      <Pressable
        style={styles.faqButton}
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={8}
      >
        <Text style={styles.faqQuestion}>{question}</Text>
        <Text style={styles.faqToggle}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? <Text style={styles.faqAnswer}>{answer}</Text> : null}
    </View>
  );
}

export default function StaticInfo({ variant = 'help' }) {
  const router = useRouter();
  const { resolved } = useTheme();
  const t = tokens(resolved);
  const s = stylesFor(t);

  if (variant === 'about') {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.pageTitle}>
            ruang<Text style={s.accent}>.</Text>
          </Text>
        </View>
        <View style={s.rows}>
          {PRINCIPLES.map((item, index) => (
            <View style={s.principle} key={item.title}>
              <Text style={s.principleIndex}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={s.principleBody}>
                <Text style={s.principleTitle}>{item.title}</Text>
                <Text style={s.bodyCopy}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={s.actions}>
          <View style={s.actionGrow}>
            <Button onPress={() => router.replace('/')}>Ke ringkasan</Button>
          </View>
          <View style={s.actionGrow}>
            <GhostButton onPress={() => router.push('/help')}>Bantuan</GhostButton>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Text style={s.pageTitle}>Bantuan</Text>
        <Text style={s.lead}>
          Panduan singkat untuk mencatat pemasukan, mengatur anggaran, dan menjaga akunmu.
        </Text>
      </View>
      {FAQ_GROUPS.map((group, index) => (
        <View style={s.group} key={group.title}>
          <Text style={s.groupTitle}>{group.title}</Text>
          <View style={s.rows}>
            {group.items.map((item) => (
              <FaqRow key={`${index}-${item.q}`} question={item.q} answer={item.a} styles={s} />
            ))}
          </View>
        </View>
      ))}
      <View style={s.actions}>
        <View style={s.actionGrow}>
          <Button onPress={() => router.replace('/settings')}>Buka pengaturan</Button>
        </View>
        <View style={s.actionGrow}>
          <GhostButton onPress={() => router.push('/about')}>Tentang ruang.</GhostButton>
        </View>
      </View>
    </ScrollView>
  );
}

// One component, two route imports — all pinned by the source-level test.
export { StaticInfo, StaticInfo as HelpScreen, StaticInfo as AboutScreen };

const stylesFor = (t) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    content: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: t.spacing.section,
      paddingBottom: t.spacing.section,
    },
    header: { marginBottom: t.spacing.section },
    pageTitle: {
      fontFamily: t.font.display,
      fontSize: 36,
      lineHeight: 40,
      letterSpacing: -0.065,
      fontWeight: '500',
      color: t.ink,
      marginBottom: 12,
    },
    accent: { color: t.accentText },
    lead: { fontSize: 14, lineHeight: 24, color: t.muted },
    group: { marginBottom: t.spacing.section },
    groupTitle: {
      fontFamily: t.font.display,
      fontSize: 18,
      letterSpacing: -0.035,
      fontWeight: '500',
      color: t.ink,
      marginBottom: t.spacing.card,
    },
    rows: { borderTopWidth: 1, borderTopColor: t.line },
    faqRow: {
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
      gap: 0,
    },
    faqButton: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
    faqQuestion: { flexShrink: 1, fontSize: 14, fontWeight: '500', lineHeight: 22, color: t.ink },
    faqToggle: {
      fontFamily: t.font.mono,
      fontSize: 14,
      color: t.accentText,
      paddingTop: 1,
    },
    faqAnswer: { fontSize: 13, lineHeight: 24, color: t.muted, paddingTop: 10 },
    principle: {
      flexDirection: 'row',
      gap: t.spacing.card,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    principleIndex: {
      fontFamily: t.font.mono,
      fontSize: 12,
      fontWeight: '600',
      color: t.accentText,
      paddingTop: 2,
    },
    principleBody: { flex: 1, minWidth: 0 },
    principleTitle: {
      fontFamily: t.font.display,
      fontSize: 17,
      letterSpacing: -0.03,
      fontWeight: '500',
      color: t.ink,
    },
    bodyCopy: { fontSize: 13, lineHeight: 22, color: t.muted, marginTop: 6 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: t.spacing.section },
    actionGrow: { flexGrow: 1, flexBasis: 140 },
  });
