import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../src/services/supabase';
import { Button, Input } from '../../../../../src/components/ui';
import { colors, spacing, typography } from '../../../../../src/constants/theme';
import { useI18n } from '../../../../../src/i18n';
import { CURRENCIES, Currency, getCurrencyLabel } from '../../../../../src/utils/currency';

export default function NewUnitScreen() {
  const { t } = useI18n();
  const { id: propertyId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [unitNumber, setUnitNumber] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [bedrooms, setBedrooms] = useState('1');
  const [bathrooms, setBathrooms] = useState('1');
  const [errors, setErrors] = useState<{ unitNumber?: string; rentAmount?: string }>({});
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);

  const createUnit = useMutation({
    mutationFn: async () => {
      if (!propertyId) throw new Error('No property ID');

      const { data, error } = await (supabase
        .from('units') as any)
        .insert({
          property_id: propertyId,
          unit_number: unitNumber.trim(),
          rent_amount: parseFloat(rentAmount),
          currency: currency,
          bedrooms: parseInt(bedrooms) || 1,
          bathrooms: parseFloat(bathrooms) || 1,
          status: 'vacant',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
      router.back();
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message || t.properties.createUnitFailed);
    },
  });

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!unitNumber.trim()) {
      newErrors.unitNumber = t.units.unitNumberRequired;
    }

    if (!rentAmount.trim() || isNaN(parseFloat(rentAmount))) {
      newErrors.rentAmount = t.units.rentAmountRequired;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createUnit.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelButton}>{t.common.cancel}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t.units.newUnit}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Input
            label={t.units.unitNumber}
            placeholder={t.units.unitNumberPlaceholder}
            value={unitNumber}
            onChangeText={setUnitNumber}
            error={errors.unitNumber}
          />

          <View style={styles.currencyRow}>
            <Text style={styles.currencyLabel}>{t.tenants.currency}</Text>
            <TouchableOpacity
              style={styles.currencySelector}
              onPress={() => setShowCurrencyModal(true)}
            >
              <Text style={styles.currencySelectorText}>{getCurrencyLabel(currency)}</Text>
              <Text style={styles.currencyChevron}>▼</Text>
            </TouchableOpacity>
          </View>

          <Input
            label={t.units.monthlyRent}
            placeholder="0"
            value={rentAmount}
            onChangeText={setRentAmount}
            keyboardType="decimal-pad"
            error={errors.rentAmount}
          />

          <Input
            label={t.units.bedrooms}
            placeholder="1"
            value={bedrooms}
            onChangeText={setBedrooms}
            keyboardType="number-pad"
          />

          <Input
            label={t.units.bathrooms}
            placeholder="1"
            value={bathrooms}
            onChangeText={setBathrooms}
            keyboardType="decimal-pad"
          />

          <Button
            title={t.units.createUnit}
            onPress={handleSubmit}
            loading={createUnit.isPending}
            fullWidth
            style={styles.submitButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showCurrencyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCurrencyModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCurrencyModal(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.tenants.currency}</Text>
              <TouchableOpacity onPress={() => setShowCurrencyModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[
                    styles.currencyItem,
                    currency === c.code && styles.currencyItemActive,
                  ]}
                  onPress={() => {
                    setCurrency(c.code as Currency);
                    setShowCurrencyModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.currencyItemText,
                      currency === c.code && styles.currencyItemTextActive,
                    ]}
                  >
                    {c.symbol}  {c.code} — {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cancelButton: {
    ...typography.body,
    color: '#facc15',
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 60,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  currencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  currencyLabel: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: '500',
  },
  currencySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[800],
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  currencySelectorText: {
    ...typography.bodySmall,
    color: colors.text.primary,
    fontWeight: '600',
  },
  currencyChevron: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  submitButton: {
    marginTop: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.gray[800],
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  modalClose: {
    ...typography.body,
    color: colors.text.secondary,
  },
  currencyItem: {
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  currencyItemActive: {
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
  },
  currencyItemText: {
    ...typography.body,
    color: colors.text.primary,
  },
  currencyItemTextActive: {
    color: '#facc15',
    fontWeight: '600',
  },
});
