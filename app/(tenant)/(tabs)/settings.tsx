import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Localization from 'expo-localization';
import { Feather } from '@expo/vector-icons';

const COUNTRY_PHONE_EXAMPLES: Record<string, string> = {
  PY: '+595 981 123 456',
  AR: '+54 11 1234 5678',
  BR: '+55 11 91234 5678',
  UY: '+598 91 234 567',
  BO: '+591 71234567',
  CL: '+56 9 1234 5678',
  PE: '+51 987 654 321',
  CO: '+57 300 123 4567',
  VE: '+58 412 123 4567',
  MX: '+52 55 1234 5678',
  US: '+1 (555) 123-4567',
  ES: '+34 612 345 678',
};

function getPhonePlaceholder(): string {
  const region = Localization.getLocales()[0]?.regionCode ?? '';
  return COUNTRY_PHONE_EXAMPLES[region] ?? '+1 (555) 123-4567';
}
import { useAuthStore } from '../../../src/stores/authStore';
import { useI18n, Language } from '../../../src/i18n';
import { Card, Button, Input } from '../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { supabase } from '../../../src/services/supabase';

export default function TenantSettingsScreen() {
  const { tenantProfile, user, signOut, isLoading, updateTenantProfile } = useAuthStore();
  const { t, language, setLanguage } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(tenantProfile?.full_name || '');
  const [phone, setPhone] = useState(tenantProfile?.phone || '');
  const [ruc, setRuc] = useState((tenantProfile as any)?.ruc || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
      const filePath = `tenant-${user!.id}.${ext}`;

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

      await updateTenantProfile({ profile_image_url: publicUrl } as any);

      // Sync to tenants table so the owner can see the photo (e.g. on maintenance cards)
      await supabase
        .from('tenants')
        .update({ profile_image_url: publicUrl })
        .eq('id', user!.id);
    } catch (err: any) {
      Alert.alert(t.common.error, err.message || 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
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

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateTenantProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        ruc: ruc.trim() || null,
      } as any);

      // Sync to tenants table so the owner sees updated info immediately
      await supabase
        .from('tenants')
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          ruc: ruc.trim() || null,
        } as any)
        .eq('id', user!.id);

      setIsEditing(false);
      Alert.alert(t.common.success, 'Profile updated successfully');
    } catch (error: any) {
      Alert.alert(t.common.error, error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
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
            {tenantProfile?.profile_image_url ? (
              <Image source={{ uri: tenantProfile.profile_image_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>
                  {(tenantProfile?.full_name || 'T')
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
                  label="RUC"
                  value={ruc}
                  onChangeText={setRuc}
                  keyboardType="numeric"
                  placeholder="0000000000001"
                />
                <Input
                  label={t.settings.phone}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder={getPhonePlaceholder()}
                />
                <View style={styles.editButtons}>
                  <Button
                    title={t.common.cancel}
                    variant="outline"
                    onPress={() => {
                      setIsEditing(false);
                      setFullName(tenantProfile?.full_name || '');
                      setPhone(tenantProfile?.phone || '');
                      setRuc((tenantProfile as any)?.ruc || '');
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
                  <Text style={styles.profileValue}>
                    {tenantProfile?.full_name || t.common.notSet}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>RUC</Text>
                  <Text style={styles.profileValue}>
                    {(tenantProfile as any)?.ruc || t.common.notSet}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.settings.email}</Text>
                  <Text style={styles.profileValue}>
                    {user?.email || t.common.notSet}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>{t.settings.phone}</Text>
                  <Text style={styles.profileValue}>
                    {tenantProfile?.phone || t.common.notSet}
                  </Text>
                </View>
              </>
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitleSimple}>{t.settings.language}</Text>
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
          <Text style={styles.sectionTitleSimple}>{t.settings.app}</Text>
          <Card>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>{t.settings.version}</Text>
              <Text style={styles.profileValue}>1.0.0</Text>
            </View>
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

        <Text style={styles.footer}>
          Domia - {language === 'es' ? 'Administración de Propiedades' : 'Property Management'}
          {'\n'}{language === 'es' ? 'Para Inquilinos' : 'For Tenants'}
        </Text>
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
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitleSimple: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  editButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  editButton: {
    flex: 1,
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
