import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from './ui';
import { fonts, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ENTITY_NAME,
  LEGAL_VERSION,
  type LegalSection,
} from '../lib/legal';

/** Shared reader for the Terms of Use and Privacy Policy. */
export function LegalDoc({
  title,
  sections,
}: {
  title: string;
  sections: LegalSection[];
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Screen>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>
        {LEGAL_ENTITY_NAME} • Version {LEGAL_VERSION} • Effective{' '}
        {LEGAL_EFFECTIVE_DATE}
      </Text>
      {sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading}>{section.heading}</Text>
          {section.body.map((paragraph, index) => (
            <Text key={index} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </Screen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    title: {
      fontFamily: fonts.heading,
      fontSize: 28,
      color: c.text,
      marginTop: 8,
    },
    meta: { fontSize: 13, color: c.subtext, marginTop: 6 },
    section: { marginTop: 20 },
    heading: {
      fontSize: 15,
      fontWeight: '800',
      color: c.text,
      marginBottom: 8,
    },
    paragraph: { fontSize: 14, color: c.text, lineHeight: 22, marginTop: 8 },
  });
}
