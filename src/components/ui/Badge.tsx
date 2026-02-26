import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

const variantStyles = {
  success: {
    backgroundColor: colors.success.light,
    textColor: colors.success.dark,
  },
  warning: {
    backgroundColor: colors.warning.light,
    textColor: colors.warning.dark,
  },
  error: {
    backgroundColor: colors.error.light,
    textColor: colors.error.dark,
  },
  info: {
    backgroundColor: colors.primary[100],
    textColor: '#854d0e',
  },
  neutral: {
    backgroundColor: colors.surfaceLight,
    textColor: colors.text.secondary,
  },
};

export function Badge({ label, variant = 'neutral', size = 'md', style }: BadgeProps) {
  const variantStyle = variantStyles[variant];

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: variantStyle.backgroundColor },
        styles[`size_${size}`],
        style,
      ]}
    >
      <Text style={[styles.text, { color: variantStyle.textColor }, styles[`textSize_${size}`]]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },

  size_sm: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  size_md: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 4,
  },

  text: {
    fontWeight: '600',
  },
  textSize_sm: {
    fontSize: 10,
  },
  textSize_md: {
    fontSize: 12,
  },
});
