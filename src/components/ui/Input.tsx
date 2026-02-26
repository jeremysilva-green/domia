import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  containerStyle,
  secureTextEntry,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry);

  const hasError = !!error;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          hasError && styles.inputError,
        ]}
      >
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}

        <TextInput
          style={[styles.input, leftIcon && styles.inputWithLeftIcon]}
          placeholderTextColor={colors.gray[500]}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isSecure}
          {...props}
        />

        {secureTextEntry && (
          <TouchableOpacity
            style={styles.rightIcon}
            onPress={() => setIsSecure(!isSecure)}
          >
            <Text style={styles.toggleText}>{isSecure ? 'Show' : 'Hide'}</Text>
          </TouchableOpacity>
        )}

        {rightIcon && !secureTextEntry && (
          <View style={styles.rightIcon}>{rightIcon}</View>
        )}
      </View>

      {(error || hint) && (
        <Text style={[styles.hint, hasError && styles.errorText]}>
          {error || hint}
        </Text>
      )}
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
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    minHeight: 52,
  },
  inputFocused: {
    borderColor: '#facc15',
  },
  inputError: {
    borderColor: colors.error.main,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
  },
  inputWithLeftIcon: {
    paddingLeft: 0,
  },
  leftIcon: {
    paddingLeft: spacing.md,
  },
  rightIcon: {
    paddingRight: spacing.md,
  },
  toggleText: {
    ...typography.bodySmall,
    color: '#facc15',
    fontWeight: '500',
  },
  hint: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  errorText: {
    color: colors.error.main,
  },
});
