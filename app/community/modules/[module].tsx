import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { type ThemeColors } from '../../../constants/theme';
import { useColors } from '../../../lib/theme';
import {
  MODULE_ROUTES,
  isModuleId,
} from '../../../lib/communityModules';

export default function LegacyModuleRedirect() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { module, id } = useLocalSearchParams<{
    module?: string;
    id?: string;
  }>();

  useEffect(() => {
    const key = Array.isArray(module) ? module[0] : module;
    const cid = Array.isArray(id) ? id[0] : id;
    if (!key || !isModuleId(key)) {
      router.replace('/teams');
      return;
    }
    const target = MODULE_ROUTES[key];
    if (target === '/forms' || target === '/wallet') {
      router.replace(target as '/forms');
    } else if (cid) {
      router.replace({ pathname: target as never, params: { id: cid } });
    } else {
      router.replace('/teams');
    }
  }, [module, id]);

  return (
    <View style={styles.page}>
      <ActivityIndicator color={c.ink} />
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: c.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
}
