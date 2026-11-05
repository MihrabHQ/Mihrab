/**
 * Settings → About → Attributions.
 *
 * Religious content and bundled assets are attributed under their
 * licences — CC BY 3.0 for the Qur'an text, SIL OFL for the Arabic
 * fonts, and so on. This was eleven-point centred text crammed under the
 * version number at the foot of About, where it read as small print. It
 * is not small print: it names whose work this app is made of, and every
 * line links to the source so the claim can be checked.
 *
 * The riwayat are here too, though they are downloaded rather than
 * bundled — an attributions list that names only what ships answers the
 * wrong question. Someone reading Warsh in this app should be able to
 * find out here whose text it is.
 */
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { SettingsGroup } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';
import { SPACING } from '../../../theme/tokens';
import { TYPE } from '../../../theme/typography';
import { QURAN_TRANSLATIONS } from '../../../quran/translations';
import { TAFSIR_EDITIONS } from '../../../quran/tafsir';

/**
 * The counts and the QuranEnc versions come from the registries, so a
 * new edition is credited the day it is added. QuranEnc asks that the
 * version read be named: these are the versions the editions were checked
 * against when they were added (2026-11-05), the same text the app reads
 * live, since the API serves its current revision.
 */
const TANZIL_TRANSLATIONS = QURAN_TRANSLATIONS.filter(e => !e.source || e.source === 'tanzil');
const QURANENC_TRANSLATIONS = QURAN_TRANSLATIONS.filter(e => e.source === 'quranenc');
const QURANENC_VERSIONS: Record<string, string> = {
  english_rwwad: '1.0.20',
  swedish_rwwad: '1.0.2',
  hindi_omari: '1.1.5',
  french_rashid: '1.0.3',
  spanish_montada_eu: '1.0.1',
  german_rwwad: '1.0.16',
  indonesian_affairs: '1.0.1',
  indonesian_complex: '1.0.1',
  chinese_makin: '1.0.2',
};
const QURANCOM_TAFSIR = TAFSIR_EDITIONS.filter(e => !e.source || e.source === 'quran.com');
const TANZIL_TAFSIR = TAFSIR_EDITIONS.filter(e => e.source === 'tanzil');

type Credit = { label: string; sub: string; url: string };

export function AttributionsSettingsScreen() {
  const { t } = useTranslation();

  const scripture: Credit[] = [
    {
      label: t('attributions.quranText', {
        defaultValue: 'Quran Uthmani text',
      }),
      sub: 'Tanzil.net · CC BY 3.0',
      url: 'https://tanzil.net/',
    },
    {
      label: t('attributions.mushafImages', {
        defaultValue: 'Mushaf page images (604)',
      }),
      sub: 'MihrabHQ/Mihrab · KFGQPC fonts · via quran/quran.com-images',
      url: 'https://github.com/MihrabHQ/Mihrab/releases/tag/mushaf-assets-v2',
    },
    {
      label: t('attributions.tajweedRules', {
        defaultValue: 'Tajweed rules of each word',
      }),
      sub: 'quran.com API · text_uthmani_tajweed',
      url: 'https://api-docs.quran.com/',
    },
    {
      label: t('attributions.quranGeometry', {
        defaultValue:
          'Ayah position data (quran.com / Quran for Android project)',
      }),
      sub: 'quran.com · files.quran.app ayahinfo',
      url: 'https://github.com/quran/quran_android',
    },
    {
      label: t('attributions.mushafMetadata', {
        defaultValue: 'Mushaf page metadata',
      }),
      sub: 'alquran.cloud /v1/meta · Tanzil-derived · CC BY 3.0',
      url: 'https://alquran.cloud/api',
    },
    {
      label: t('attributions.riwayat', {
        defaultValue:
          'Warsh, Qālūn and Shuʿbah texts (downloaded, not bundled)',
      }),
      sub: 'quranpedia.net · King Fahd Glorious Quran Printing Complex',
      url: 'https://quranpedia.net',
    },
    {
      label: t('attributions.riwayahLines', {
        defaultValue: 'Printed line geometry for those muṣḥafs',
      }),
      sub: 'quranpedia/quran-svg ayah polygons · CC0',
      url: 'https://github.com/quranpedia/quran-svg',
    },
    {
      label: t('attributions.indopakText', {
        defaultValue: 'IndoPak 15-line text (downloaded, not bundled)',
      }),
      sub: 'DigitalKhatt/digitalkhatt-js · MIT · © 2020–present DigitalKhatt contributors',
      url: 'https://github.com/DigitalKhatt/digitalkhatt-js',
    },
  ];

  const recitation: Credit[] = [
    {
      label: t('attributions.recitation', {
        defaultValue:
          'Recitation audio (44 reciters): EveryAyah.com · word timings: quran-align (CC BY 4.0)',
      }),
      sub: 'everyayah.com · cpfair/quran-align',
      url: 'https://everyayah.com/',
    },
    {
      label: t('attributions.recitationWholeSurah', {
        defaultValue:
          'Whole-surah recitations (15): mp3quran.net · ayah timings aligned to the audio by Mihrab',
      }),
      sub: 'mp3quran.net',
      url: 'https://mp3quran.net/',
    },
  ];

  const meaning: Credit[] = [
    {
      label: t('attributions.translationEditions', {
        defaultValue: 'Translation editions ({{n}})',
        n: TANZIL_TRANSLATIONS.length,
      }),
      sub: 'alquran.cloud · Tanzil-derived · CC BY 3.0',
      url: 'https://alquran.cloud/',
    },
    {
      label: t('attributions.quranencTranslations', {
        defaultValue: 'Translation editions from QuranEnc ({{n}}), shown as published',
        n: QURANENC_TRANSLATIONS.length,
      }),
      sub:
        'Encyclopedia of the Noble Quran · QuranEnc.com · ' +
        QURANENC_TRANSLATIONS.map(
          e => `${e.sourceId} ${QURANENC_VERSIONS[e.sourceId ?? e.id] ?? ''}`.trim(),
        ).join(' · '),
      url: 'https://quranenc.com/',
    },
    {
      label: t('attributions.tafsir', {
        defaultValue:
          'Tafsir editions ({{n}}): Ibn Kathir, Maarif-ul-Quran, al-Muyassar, al-Mukhtasar, as-Sa’di, Ahsanul Bayaan, Abu Bakr Zakaria, Bayan ul-Quran',
        n: QURANCOM_TAFSIR.length,
      }),
      sub: 'spa5k/tafsir_api · Quran.com tafsir corpus',
      url: 'https://github.com/spa5k/tafsir_api',
    },
    {
      label: t('attributions.tanzilTafsir', {
        defaultValue: 'Tafsir editions from Tanzil ({{n}}): Jalalayn, al-Muntakhab, Kuliev & as-Sa’di',
        n: TANZIL_TAFSIR.length,
      }),
      sub: 'alquran.cloud · Tanzil-derived · CC BY 3.0',
      url: 'https://alquran.cloud/',
    },
    {
      label: t('attributions.wordMeanings', {
        defaultValue: 'Arabic meanings of harder words',
      }),
      sub: 'Encyclopedia of the Noble Quran · QuranEnc.com',
      url: 'https://quranenc.com/ar/browse/arabic_seraj',
    },
    {
      label: t('attributions.sahihIntl', {
        defaultValue: 'Sahih International (English)',
      }),
      sub: 'public domain · via Tanzil',
      url: 'https://tanzil.net/trans/',
    },
    {
      label: t('attributions.pickthall', {
        defaultValue: 'Pickthall (English)',
      }),
      sub: 'public domain',
      url: 'https://tanzil.net/trans/',
    },
    {
      label: t('attributions.hisnulMuslim', {
        defaultValue: 'Hisnul Muslim duas',
      }),
      sub: 'rn0x/hisn_almuslim_json · MIT',
      url: 'https://github.com/rn0x/hisn_almuslim_json',
    },
  ];

  const typefaces: Credit[] = [
    {
      label: t('attributions.amiriFonts', {
        defaultValue: 'Amiri & Amiri Quran fonts',
      }),
      sub: 'aliftype/amiri · SIL OFL 1.1',
      url: 'https://github.com/aliftype/amiri',
    },
    {
      label: t('attributions.indopakFont', {
        defaultValue: 'DigitalKhatt IndoPak font (downloaded, not bundled)',
      }),
      sub: 'SIL OFL 1.1 · © 2024 Amine Anane, © 2024 Tarteel Inc.',
      url: 'https://github.com/DigitalKhatt/digitalkhatt-js',
    },
    {
      label: t('attributions.tajweedFonts', {
        defaultValue: 'Tajweed colour page fonts (downloaded, not bundled)',
      }),
      sub: 'King Fahd Glorious Quran Printing Complex · QPC V4 Tajweed · via Quranic Universal Library (QUL)',
      url: 'https://qul.tarteel.ai/resources/font',
    },
    {
      label: t('attributions.surahHeaderFont', {
        defaultValue: 'Surah-name calligraphy',
      }),
      sub: 'King Fahd Glorious Quran Printing Complex · via quran.com (MIT)',
      url: 'https://github.com/quran/quran.com-frontend-next',
    },
  ];

  return (
    <SettingsPage>
      <SettingsGroup title={t('attributions.groupScripture', 'The text')}>
        {scripture.map(c => (
          <CreditRow key={c.url + c.label} credit={c} />
        ))}
      </SettingsGroup>
      <SettingsGroup title={t('attributions.groupRecitation', 'Recitation')}>
        {recitation.map(c => (
          <CreditRow key={c.url + c.label} credit={c} />
        ))}
      </SettingsGroup>
      <SettingsGroup
        title={t('attributions.groupMeaning', 'Translation and tafsir')}>
        {meaning.map(c => (
          <CreditRow key={c.url + c.label} credit={c} />
        ))}
      </SettingsGroup>
      {/* The footer sits on the last group, where a reader who has gone
          through the list arrives at it. */}
      <SettingsGroup
        title={t('attributions.groupTypefaces', 'Typefaces')}
        footer={t(
          'attributions.footer',
          'Every line links to the source it came from.',
        )}>
        {typefaces.map(c => (
          <CreditRow key={c.url + c.label} credit={c} />
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}

function CreditRow({ credit }: { credit: Credit }) {
  const { palette } = useAppPalette();
  return (
    <View style={styles.row}>
      <Text
        accessibilityRole="link"
        accessibilityLabel={`${credit.label} — ${credit.sub}`}
        onPress={() => {
          void Linking.openURL(credit.url);
        }}>
        <Text style={[styles.label, { color: palette.text }]}>
          {credit.label}
        </Text>
        {'\n'}
        <Text style={[styles.sub, { color: palette.accent }]}>
          {credit.sub}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  label: { fontSize: TYPE.callout.fontSize, lineHeight: 21 },
  sub: { fontSize: TYPE.footnote.fontSize, lineHeight: 19 },
});
