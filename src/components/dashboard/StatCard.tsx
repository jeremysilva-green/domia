import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Card } from '../ui';
import { colors, spacing, typography } from '../../constants/theme';

type StatVariant = 'default' | 'success' | 'warning' | 'error';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  variant?: StatVariant;
  style?: ViewStyle;
}

const variantColors = {
  default: '#facc15',
  success: colors.success.main,
  warning: '#facc15',
  error: colors.error.main,
};

export function StatCard({
  title,
  value,
  subtitle,
  variant = 'default',
  style,
}: StatCardProps) {
  return (
    <Card style={[styles.card, style]}>
      <Text style={styles.title}>{title}</Text>
      <Text
        style={[styles.value, { color: variantColors[variant] }]}
        adjustsFontSizeToFit={true}
        numberOfLines={1}
        minimumFontScale={0.4}
      >
        {value}
      </Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 100,
  },
  title: {
    ...typography.caption,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    color: colors.text.secondary,
  },
});
