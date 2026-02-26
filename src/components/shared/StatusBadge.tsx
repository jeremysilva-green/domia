import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius } from '../../constants/theme';
import { RentStatus, MaintenanceStatus } from '../../types';

interface StatusBadgeProps {
  status: RentStatus | MaintenanceStatus;
  type: 'rent' | 'maintenance';
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

const rentStatusConfig: Record<
  RentStatus,
  { emoji: string; label: string; color: string; bgColor: string }
> = {
  paid: {
    emoji: '',
    label: 'Paid',
    color: colors.success.dark,
    bgColor: colors.success.light,
  },
  due: {
    emoji: '',
    label: 'Due',
    color: colors.warning.dark,
    bgColor: colors.warning.light,
  },
  late: {
    emoji: '',
    label: 'Late',
    color: colors.error.dark,
    bgColor: colors.error.light,
  },
  partial: {
    emoji: '',
    label: 'Partial',
    color: '#c2410c',
    bgColor: '#fed7aa',
  },
};

const maintenanceStatusConfig: Record<
  MaintenanceStatus,
  { emoji: string; label: string; color: string; bgColor: string }
> = {
  submitted: {
    emoji: '',
    label: 'New',
    color: '#854d0e',
    bgColor: colors.primary[100],
  },
  in_progress: {
    emoji: '',
    label: 'In Progress',
    color: colors.warning.dark,
    bgColor: colors.warning.light,
  },
  completed: {
    emoji: '',
    label: 'Completed',
    color: colors.success.dark,
    bgColor: colors.success.light,
  },
  cancelled: {
    emoji: '',
    label: 'Cancelled',
    color: colors.gray[400],
    bgColor: colors.surfaceLight,
  },
};

export function StatusBadge({ status, type, size = 'md', style }: StatusBadgeProps) {
  const config =
    type === 'rent'
      ? rentStatusConfig[status as RentStatus]
      : maintenanceStatusConfig[status as MaintenanceStatus];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bgColor },
        styles[`size_${size}`],
        style,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.label, { color: config.color }, styles[`textSize_${size}`]]}>
        {config.label}
      </Text>
    </View>
  );
}

// Simple emoji-based indicator for list views
interface RentIndicatorProps {
  status: RentStatus;
  style?: ViewStyle;
}

export function RentIndicator({ status, style }: RentIndicatorProps) {
  const emojiMap: Record<RentStatus, string> = {
    paid: '🟢',
    due: '🟡',
    late: '🔴',
    partial: '🟠',
  };

  return (
    <View style={[styles.indicator, style]}>
      <Text style={styles.emoji}>{emojiMap[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  size_sm: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  size_md: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  label: {
    fontWeight: '600',
  },
  textSize_sm: {
    fontSize: 10,
  },
  textSize_md: {
    fontSize: 12,
  },
  indicator: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 14,
  },
});
