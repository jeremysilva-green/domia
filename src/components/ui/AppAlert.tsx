/**
 * AppAlert — drop-in replacement for React Native's Alert.alert()
 * Renders a styled dark-theme modal matching the app design.
 *
 * Usage:
 *   AppAlert.alert('Title', 'Message', [{ text: 'OK' }]);
 *
 * Mount <AppAlertHost /> once in the root layout.
 */
import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertConfig {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type ShowFn = (config: AlertConfig) => void;

// Global ref set by <AppAlertHost /> on mount
let _show: ShowFn | null = null;

export const AppAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
  ) {
    if (!_show) {
      // Fallback if host not mounted yet
      console.warn('AppAlertHost not mounted');
      return;
    }
    _show({
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    });
  },
};

export function AppAlertHost() {
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const visible = config !== null;

  // Register the show function globally
  const showRef = useRef<ShowFn>((cfg) => setConfig(cfg));
  _show = showRef.current;

  const dismiss = () => setConfig(null);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={s.backdrop}>
        <View style={s.card}>
          {/* Title */}
          <Text style={s.title}>{config?.title}</Text>

          {/* Message */}
          {!!config?.message && (
            <Text style={s.message}>{config.message}</Text>
          )}

          {/* Divider */}
          <View style={s.divider} />

          {/* Buttons */}
          <View style={[s.btnRow, (config?.buttons?.length ?? 0) === 1 && s.btnRowSingle]}>
            {config?.buttons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.btn,
                    (config.buttons.length ?? 0) > 1 && i < config.buttons.length - 1 && s.btnBorderRight,
                  ]}
                  onPress={() => {
                    dismiss();
                    btn.onPress?.();
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      s.btnText,
                      isDestructive && s.btnTextDestructive,
                      isCancel && s.btnTextCancel,
                      !isDestructive && !isCancel && s.btnTextDefault,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.text.secondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  btnRow: {
    flexDirection: 'row',
  },
  btnRowSingle: {
    justifyContent: 'flex-end',
  },
  btn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBorderRight: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  btnText: {
    ...typography.button,
  },
  btnTextDefault: {
    color: colors.yellow,
  },
  btnTextCancel: {
    color: colors.text.secondary,
  },
  btnTextDestructive: {
    color: colors.error.main,
  },
});
