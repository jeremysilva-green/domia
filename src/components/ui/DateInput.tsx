import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../constants/theme';

interface DateInputProps {
  label: string;
  value: string; // Expected format: YYYY-MM-DD or empty
  onChangeText: (value: string) => void;
  error?: string;
  hint?: string;
}

export function DateInput({ label, value, onChangeText, error, hint }: DateInputProps) {
  const monthRef = useRef<TextInput>(null);
  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  // Parse the incoming YYYY-MM-DD value
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');

  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      setMonth(m);
      setDay(d);
      setYear(y);
    } else if (!value) {
      setMonth('');
      setDay('');
      setYear('');
    }
  }, [value]);

  const updateValue = (m: string, d: string, y: string) => {
    // Only update parent if we have complete date or all empty
    if (m.length === 2 && d.length === 2 && y.length === 4) {
      onChangeText(`${y}-${m}-${d}`);
    } else if (!m && !d && !y) {
      onChangeText('');
    }
  };

  const handleMonthChange = (text: string) => {
    // Only allow digits
    const cleaned = text.replace(/\D/g, '').slice(0, 2);
    setMonth(cleaned);

    // Auto-advance to day when 2 digits entered
    if (cleaned.length === 2) {
      dayRef.current?.focus();
    }

    updateValue(cleaned, day, year);
  };

  const handleDayChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 2);
    setDay(cleaned);

    // Auto-advance to year when 2 digits entered
    if (cleaned.length === 2) {
      yearRef.current?.focus();
    }

    updateValue(month, cleaned, year);
  };

  const handleYearChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 4);
    setYear(cleaned);

    updateValue(month, day, cleaned);
  };

  // Handle backspace to go back to previous field
  const handleMonthKeyPress = (e: any) => {
    // No previous field
  };

  const handleDayKeyPress = (e: any) => {
    if (e.nativeEvent.key === 'Backspace' && day === '') {
      monthRef.current?.focus();
    }
  };

  const handleYearKeyPress = (e: any) => {
    if (e.nativeEvent.key === 'Backspace' && year === '') {
      dayRef.current?.focus();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputContainer, error && styles.inputError]}>
        <TextInput
          ref={monthRef}
          style={styles.input}
          value={month}
          onChangeText={handleMonthChange}
          onKeyPress={handleMonthKeyPress}
          placeholder="MM"
          placeholderTextColor={colors.gray[600]}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
        />
        <Text style={styles.separator}>/</Text>
        <TextInput
          ref={dayRef}
          style={styles.input}
          value={day}
          onChangeText={handleDayChange}
          onKeyPress={handleDayKeyPress}
          placeholder="DD"
          placeholderTextColor={colors.gray[600]}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
        />
        <Text style={styles.separator}>/</Text>
        <TextInput
          ref={yearRef}
          style={[styles.input, styles.yearInput]}
          value={year}
          onChangeText={handleYearChange}
          onKeyPress={handleYearKeyPress}
          placeholder="YYYY"
          placeholderTextColor={colors.gray[600]}
          keyboardType="number-pad"
          maxLength={4}
          selectTextOnFocus
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {hint && !error && <Text style={styles.hintText}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  inputError: {
    borderColor: colors.error.main,
  },
  input: {
    ...typography.body,
    color: colors.text.primary,
    textAlign: 'center',
    width: 35,
    height: 48,
    padding: 0,
  },
  yearInput: {
    width: 50,
  },
  separator: {
    ...typography.body,
    color: colors.text.secondary,
    marginHorizontal: 2,
  },
  errorText: {
    ...typography.caption,
    color: colors.error.main,
    marginTop: spacing.xs,
  },
  hintText: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});
