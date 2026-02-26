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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../../../src/services/supabase';
import { Button, Input, Card } from '../../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../../src/constants/theme';

type RequestType = 'maintenance' | 'complaint';

export default function PublicMaintenanceRequestScreen() {
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [requestType, setRequestType] = useState<RequestType>('maintenance');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<{ uri: string; type: 'image' | 'video' }[]>([]);
  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    title?: string;
    description?: string;
  }>({});
  const [submitted, setSubmitted] = useState(false);

  // Verify owner exists
  const { data: owner, isLoading: ownerLoading } = useQuery({
    queryKey: ['owner-verify', ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('owners')
        .select('id, full_name')
        .eq('id', ownerId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!ownerId,
  });

  const submitRequest = useMutation({
    mutationFn: async () => {
      if (!ownerId) throw new Error('Invalid link');

      // Create maintenance request with owner_id (public submission)
      const { data: request, error: requestError } = await (supabase
        .from('maintenance_requests') as any)
        .insert({
          owner_id: ownerId,
          tenant_id: null,
          unit_id: null,
          title: title.trim(),
          description: description.trim(),
          category: requestType === 'complaint' ? 'other' : 'other',
          urgency: 'normal',
          submitter_name: name.trim(),
          submitter_phone: phone.trim(),
          owner_notes: requestType === 'complaint' ? 'Queja' : 'Solicitud de mantenimiento',
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Upload media files
      for (let i = 0; i < media.length; i++) {
        const item = media[i];
        const ext = item.type === 'video' ? 'mp4' : 'jpg';
        const fileName = `${request.id}/${Date.now()}-${i}.${ext}`;

        try {
          const base64 = await FileSystem.readAsStringAsync(item.uri, {
            encoding: 'base64',
          });

          const { error: uploadError } = await supabase.storage
            .from('maintenance-images')
            .upload(fileName, decode(base64), {
              contentType: item.type === 'video' ? 'video/mp4' : 'image/jpeg',
            });

          if (!uploadError) {
            await supabase.from('maintenance_images').insert({
              maintenance_request_id: request.id,
              storage_path: fileName,
            });
          }
        } catch (e) {
          console.error('Upload error:', e);
        }
      }

      return request;
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to submit request');
    },
  });

  const pickMedia = async () => {
    if (media.length >= 5) {
      Alert.alert('Limit Reached', 'You can only upload up to 5 files');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMedia([
        ...media,
        {
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'image',
        },
      ]);
    }
  };

  const removeMedia = (index: number) => {
    setMedia(media.filter((_, i) => i !== index));
  };

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = 'Please enter your name';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Please enter your phone number';
    }

    if (!title.trim()) {
      newErrors.title = 'Please provide a brief title';
    }

    if (!description.trim()) {
      newErrors.description = 'Please describe the issue';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    submitRequest.mutate();
  };

  if (ownerLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!owner) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Feather name="alert-circle" size={48} color={colors.error.main} />
          <Text style={styles.errorTitle}>Invalid Link</Text>
          <Text style={styles.errorMessage}>
            This maintenance request link is not valid. Please contact your property manager for a new link.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <View style={styles.successIcon}>
            <Feather name="check" size={40} color={colors.success.main} />
          </View>
          <Text style={styles.successTitle}>Request Submitted</Text>
          <Text style={styles.successMessage}>
            Your request has been submitted successfully. Your property manager will review it and contact you soon.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Submit a Request</Text>
        <Text style={styles.headerSubtitle}>
          Property managed by {owner.full_name}
        </Text>
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
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Your Information</Text>
            <Input
              label="Your Name"
              placeholder="John Doe"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              error={errors.name}
            />
            <Input
              label="Phone Number"
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={errors.phone}
            />
          </Card>

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Request Type</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  requestType === 'maintenance' && styles.typeButtonActive,
                ]}
                onPress={() => setRequestType('maintenance')}
              >
                <Feather
                  name="tool"
                  size={20}
                  color={requestType === 'maintenance' ? colors.yellow : colors.text.secondary}
                />
                <Text
                  style={[
                    styles.typeText,
                    requestType === 'maintenance' && styles.typeTextActive,
                  ]}
                >
                  Maintenance
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  requestType === 'complaint' && styles.typeButtonActive,
                ]}
                onPress={() => setRequestType('complaint')}
              >
                <Feather
                  name="message-circle"
                  size={20}
                  color={requestType === 'complaint' ? colors.yellow : colors.text.secondary}
                />
                <Text
                  style={[
                    styles.typeText,
                    requestType === 'complaint' && styles.typeTextActive,
                  ]}
                >
                  Complaint
                </Text>
              </TouchableOpacity>
            </View>
          </Card>

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Details</Text>
            <Input
              label={requestType === 'maintenance' ? 'Problem' : 'Subject'}
              placeholder={
                requestType === 'maintenance'
                  ? 'e.g., Leaky faucet in bathroom'
                  : 'e.g., Noise complaint'
              }
              value={title}
              onChangeText={setTitle}
              error={errors.title}
            />
            <Input
              label="Description"
              placeholder="Please describe the issue in detail..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              error={errors.description}
            />
          </Card>

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Photos / Videos (Optional)</Text>
            <Text style={styles.mediaHint}>
              Add up to 5 photos or videos to help explain the issue
            </Text>
            <View style={styles.mediaGrid}>
              {media.map((item, index) => (
                <View key={index} style={styles.mediaContainer}>
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                  {item.type === 'video' && (
                    <View style={styles.videoOverlay}>
                      <Feather name="play" size={20} color={colors.white} />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.removeMediaButton}
                    onPress={() => removeMedia(index)}
                  >
                    <Feather name="x" size={14} color={colors.white} />
                  </TouchableOpacity>
                </View>
              ))}
              {media.length < 5 && (
                <TouchableOpacity style={styles.addMediaButton} onPress={pickMedia}>
                  <Feather name="plus" size={24} color={colors.text.secondary} />
                  <Text style={styles.addMediaLabel}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>

          <Button
            title="Submit Request"
            onPress={handleSubmit}
            loading={submitRequest.isPending}
            fullWidth
            style={styles.submitButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text.primary,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  errorTitle: {
    ...typography.h2,
    color: colors.text.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  formCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typeButtonActive: {
    borderColor: '#facc15',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
  },
  typeText: {
    ...typography.body,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  typeTextActive: {
    color: '#facc15',
  },
  mediaHint: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  mediaContainer: {
    position: 'relative',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeMediaButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMediaButton: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMediaLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.md,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  successMessage: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
