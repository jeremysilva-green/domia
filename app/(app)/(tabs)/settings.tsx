// Force rebundle: 2026-02-25T12:00:00
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/stores/authStore';
import { useI18n, Language } from '../../../src/i18n';
import { Card, Button, Input } from '../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { supabase } from '../../../src/services/supabase';

function SettingsRow({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  return (
    <View style={styles.settingsRow}>
      <Text style={styles.settingsLabel}>{label}</Text>
      <Text style={styles.settingsValue}>{value || '-'}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { owner, signOut, isLoading, updateOwnerProfile, fetchOwnerProfile } = useAuthStore();
  const { t, language, setLanguage } = useI18n();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(owner?.full_name || '');
  const [phone, setPhone] = useState(owner?.phone || '');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bank info state
  const [isBankEditing, setIsBankEditing] = useState(false);
  const [bankFullName, setBankFullName] = useState(owner?.bank_full_name || '');
  const [bankName, setBankName] = useState(owner?.bank_name || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(owner?.bank_account_number || '');
  const [bankRuc, setBankRuc] = useState(owner?.bank_ruc || '');
  const [bankAlias, setBankAlias] = useState(owner?.bank_alias || '');
  const [savingBank, setSavingBank] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOwnerProfile();
    setRefreshing(false);
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      const filePath = `${owner!.id}.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${ext}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      await updateOwnerProfile({ profile_image_url: publicUrl });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateOwnerProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      });
      setIsEditing(false);
      Alert.alert(t.common.success, 'Profile updated successfully');
    } catch (error: any) {
      Alert.alert(t.common.error, error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBankInfo = async () => {
    setSavingBank(true);
    try {
      await updateOwnerProfile({
        bank_full_name: bankFullName.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
        bank_ruc: bankRuc.trim() || null,
        bank_alias: bankAlias.trim() || null,
      });
      setIsBankEditing(false);
      Alert.alert(t.common.success, 'Bank information saved successfully');
    } catch (error: any) {
      Alert.alert(t.common.error, error.message || 'Failed to save bank information');
    } finally {
      setSavingBank(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(t.auth.logout, t.auth.logoutConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.auth.logout,
        style: 'destructive',
        onPress: signOut,
      },
    ]);
  };

  const toggleLanguage = (lang: Language) => {
    setLanguage(lang);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.title}>{t.settings.title}</Text>

<View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.settings.account}</Text>
            {!isEditing && (
              <TouchableOpacity onPress={() => setIsEditing(true)}>
                <Feather name="edit-2" size={18} color={colors.yellow} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.avatarContainer} onPress={handlePickPhoto} disabled={uploadingPhoto}>
            {owner?.profile_image_url ? (
              <Image source={{ uri: owner.profile_image_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>
                  {(owner?.full_name || 'O')
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadingPhoto
                ? <ActivityIndicator size={12} color={colors.background} />
                : <Feather name="camera" size={12} color={colors.background} />}
            </View>
          </TouchableOpacity>

          <Card>
            {isEditing ? (
              <>
                <Input
                  label={t.auth.fullName}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
                <Input
                  label={t.settings.phone}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="+595 981 123 456"
                />
                <View style={styles.editButtons}>
                  <Button
                    title={t.common.cancel}
                    variant="outline"
                    onPress={() => {
                      setIsEditing(false);
                      setFullName(owner?.full_name || '');
                      setPhone(owner?.phone || '');
                    }}
                    style={styles.editButton}
                  />
                  <Button
                    title={t.common.save}
                    onPress={handleSaveProfile}
                    loading={saving}
                    style={styles.editButton}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.settings.name}</Text>
                  <Text style={styles.profileValue}>{owner?.full_name || '-'}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.settings.email}</Text>
                  <Text style={styles.profileValue}>{owner?.email || '-'}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.settings.phone}</Text>
                  <Text style={styles.profileValue}>{owner?.phone || t.common.notSet}</Text>
                </View>
              </>
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.settings.language}</Text>
          <Card>
            <View style={styles.languageSelector}>
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  language === 'en' && styles.languageOptionActive,
                ]}
                onPress={() => toggleLanguage('en')}
              >
                <Text
                  style={[
                    styles.languageText,
                    language === 'en' && styles.languageTextActive,
                  ]}
                >
                  {t.settings.english}
                </Text>
                {language === 'en' && (
                  <Feather name="check" size={18} color={colors.background} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  language === 'es' && styles.languageOptionActive,
                ]}
                onPress={() => toggleLanguage('es')}
              >
                <Text
                  style={[
                    styles.languageText,
                    language === 'es' && styles.languageTextActive,
                  ]}
                >
                  {t.settings.spanish}
                </Text>
                {language === 'es' && (
                  <Feather name="check" size={18} color={colors.background} />
                )}
              </TouchableOpacity>
            </View>
          </Card>
        </View>

<View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.bankInfo.title}</Text>
            {!isBankEditing && (
              <TouchableOpacity onPress={() => setIsBankEditing(true)}>
                <Feather name="edit-2" size={18} color={colors.yellow} />
              </TouchableOpacity>
            )}
          </View>
          <Card>
            {isBankEditing ? (
              <>
                <Input
                  label={t.bankInfo.fullName}
                  value={bankFullName}
                  onChangeText={setBankFullName}
                  autoCapitalize="words"
                  placeholder="Ej. Juan Pérez García"
                />
                <Input
                  label={t.bankInfo.bankName}
                  value={bankName}
                  onChangeText={setBankName}
                  autoCapitalize="words"
                  placeholder="Ej. Banco Continental"
                />
                <Input
                  label={t.bankInfo.accountNumber}
                  value={bankAccountNumber}
                  onChangeText={setBankAccountNumber}
                  keyboardType="numeric"
                  placeholder="Ej. 1234567890"
                />
                <Input
                  label={t.bankInfo.ruc}
                  value={bankRuc}
                  onChangeText={setBankRuc}
                  keyboardType="numeric"
                  placeholder="Ej. 1234567-8"
                />
                <Input
                  label={t.bankInfo.alias}
                  value={bankAlias}
                  onChangeText={setBankAlias}
                  placeholder="Ej. juanperez"
                />
                <View style={styles.editButtons}>
                  <Button
                    title={t.common.cancel}
                    variant="outline"
                    onPress={() => {
                      setIsBankEditing(false);
                      setBankFullName(owner?.bank_full_name || '');
                      setBankName(owner?.bank_name || '');
                      setBankAccountNumber(owner?.bank_account_number || '');
                      setBankRuc(owner?.bank_ruc || '');
                      setBankAlias(owner?.bank_alias || '');
                    }}
                    style={styles.editButton}
                  />
                  <Button
                    title={t.common.save}
                    onPress={handleSaveBankInfo}
                    loading={savingBank}
                    style={styles.editButton}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.bankInfo.fullName}</Text>
                  <Text style={styles.profileValue}>{owner?.bank_full_name || t.common.notSet}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.bankInfo.bankName}</Text>
                  <Text style={styles.profileValue}>{owner?.bank_name || t.common.notSet}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.bankInfo.accountNumber}</Text>
                  <Text style={styles.profileValue}>{owner?.bank_account_number || t.common.notSet}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.bankInfo.ruc}</Text>
                  <Text style={styles.profileValue}>{owner?.bank_ruc || t.common.notSet}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.bankInfo.alias}</Text>
                  <Text style={styles.profileValue}>{owner?.bank_alias || t.common.notSet}</Text>
                </View>
              </>
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.settings.app}</Text>
          <Card>
            <SettingsRow label={t.settings.version} value="1.0.0" />
          </Card>
        </View>

        <View style={styles.signOutSection}>
          <Button
            title={t.auth.logout}
            onPress={handleSignOut}
            variant="outline"
            loading={isLoading}
            fullWidth
          />
        </View>

        <Text style={styles.footer}>{t.settings.footer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: spacing.lg,
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#facc15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.background,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gray[600],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  profileLabel: {
    ...typography.body,
    color: colors.text.primary,
  },
  profileValue: {
    ...typography.body,
    color: colors.text.secondary,
  },
  editButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  editButton: {
    flex: 1,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  settingsLabel: {
    ...typography.body,
    color: colors.text.primary,
  },
  settingsValue: {
    ...typography.body,
    color: colors.text.secondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  languageSelector: {
    gap: spacing.sm,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  languageOptionActive: {
    backgroundColor: '#facc15',
  },
  languageText: {
    ...typography.body,
    fontWeight: '500',
    color: colors.text.primary,
  },
  languageTextActive: {
    color: colors.background,
    fontWeight: '600',
  },
  signOutSection: {
    marginTop: spacing.xl,
  },
  footer: {
    ...typography.caption,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
