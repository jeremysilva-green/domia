import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, Image, TouchableOpacity, Modal, Linking, TextInput } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase } from '../../../src/services/supabase';
import { Card, Button, Badge, ConfirmDialog } from '../../../src/components/ui';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { colors, spacing, typography } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';
import { playSound } from '../../../src/utils/sounds';
import {
  schedulePaymentReminders,
  cancelPaymentReminders,
  requestNotificationPermissions,
  setupNotificationChannels,
} from '../../../src/utils/notificationScheduler';
import { AppAlert } from '../../../src/components/ui/AppAlert';

export default function TenantHomeScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantProfile, user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [leaseModalVisible, setLeaseModalVisible] = useState(false);
  const [proofModalVisible, setProofModalVisible] = useState(false);
  const [servicesProofModalVisible, setServicesProofModalVisible] = useState(false);
  const [disconnectModalVisible, setDisconnectModalVisible] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState('');
  const [dialog, setDialog] = useState<{ title: string; message: string; confirmText: string; destructive?: boolean; onConfirm: () => void } | null>(null);

  // Get connection request status
  const { data: connectionRequest, refetch } = useQuery({
    queryKey: ['tenant-connection', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('connection_requests')
        .select(`
          *,
          owner:owners(full_name, email, phone, bank_full_name, bank_name, bank_account_number, bank_ruc, bank_alias, profile_image_url),
          unit:units(unit_number, fine_amount, property:properties(name, address, image_url))
        `)
        .eq('tenant_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!user?.id,
    refetchInterval: 5000,
  });

  // Get lease image URL from tenant record
  const { data: leaseImageUrl, refetch: refetchLease } = useQuery<string | null>({
    queryKey: ['tenant-lease', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('tenants')
        .select('lease_image_url')
        .eq('id', user.id)
        .single();
      return (data as any)?.lease_image_url ?? null;
    },
    enabled: !!user?.id && connectionRequest?.status === 'approved',
  });

  // Get rent payments for rating calculation
  const { data: rentPayments, refetch: refetchPayments } = useQuery({
    queryKey: ['tenant-payments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('rent_payments')
        .select('id, status, paid_date, due_date')
        .eq('tenant_id', user.id);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && connectionRequest?.status === 'approved',
  });

  // Calculate tenant score based on payment history
  const tenantScore = useMemo(() => {
    if (!rentPayments || rentPayments.length === 0) {
      return { score: 0.5, onTimeCount: 0, lateCount: 0, totalPayments: 0 };
    }

    const paidPayments = rentPayments.filter((p: any) => p.status === 'paid');
    if (paidPayments.length === 0) {
      return { score: 0.5, onTimeCount: 0, lateCount: 0, totalPayments: 0 };
    }

    let onTimeCount = 0;
    let lateCount = 0;

    paidPayments.forEach((payment: any) => {
      if (payment.paid_date && payment.due_date) {
        const paidDate = new Date(payment.paid_date);
        const dueDate = new Date(payment.due_date);
        if (paidDate <= dueDate) {
          onTimeCount++;
        } else {
          lateCount++;
        }
      } else {
        onTimeCount++;
      }
    });

    const totalPayments = onTimeCount + lateCount;
    const score = totalPayments > 0 ? onTimeCount / totalPayments : 0.5;

    return { score, onTimeCount, lateCount, totalPayments };
  }, [rentPayments]);

  // Current payment (most recent by due_date)
  const { data: currentPayment, refetch: refetchCurrentPayment } = useQuery({
    queryKey: ['tenant-current-payment', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('rent_payments')
        .select('*')
        .eq('tenant_id', user.id)
        .order('due_date', { ascending: false })
        .limit(1)
        .single();
      return data ?? null;
    },
    enabled: !!user?.id && connectionRequest?.status === 'approved',
  });

  // Mora = days past (due_date + 3-day grace) with accumulated fine
  const moraData = useMemo(() => {
    if (!currentPayment) return null;
    if (currentPayment.status === 'paid' || currentPayment.proof_image_url) return null;
    const today = new Date();
    const dueDate = new Date(currentPayment.due_date);
    const daysSinceDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysInMora = Math.max(0, daysSinceDue - 3);
    if (daysInMora === 0) return null;
    const finePerDay = connectionRequest?.unit?.fine_amount ?? 0;
    return { daysInMora, accumulatedFine: daysInMora * finePerDay, finePerDay };
  }, [currentPayment, connectionRequest]);

  // Pick image from library and upload to Supabase storage, return public URL
  const pickAndUploadImage = async (storagePath: string): Promise<string> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') throw new Error('Photo library permission denied');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) throw new Error('cancelled');
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    const filePath = `${storagePath}.${ext}`;
    const { error } = await supabase.storage
      .from('payment-proofs')
      .upload(filePath, decode(asset.base64!), { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    return supabase.storage.from('payment-proofs').getPublicUrl(filePath).data.publicUrl;
  };

  // Upload proof of rent payment — marks rent as Paid
  const uploadProofMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const publicUrl = await pickAndUploadImage(`${user.id}/rent_${Date.now()}`);
      const { data: result, error } = await supabase.rpc('upload_payment_proof', {
        p_proof_url: publicUrl,
        p_is_services: false,
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);
    },
    onSuccess: () => {
      playSound('paid');
      queryClient.invalidateQueries({ queryKey: ['tenant-current-payment', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-payments', user?.id] });
    },
    onError: (err: any) => { if (err.message !== 'cancelled') AppAlert.alert('Error', err.message); },
  });

  const uploadServicesProofMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const publicUrl = await pickAndUploadImage(`${user.id}/services_${Date.now()}`);
      const { data: result, error } = await supabase.rpc('upload_payment_proof', {
        p_proof_url: publicUrl,
        p_is_services: true,
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);
    },
    onSuccess: () => {
      playSound('notification');
      queryClient.invalidateQueries({ queryKey: ['tenant-current-payment', user?.id] });
    },
    onError: (err: any) => AppAlert.alert('Error', err.message),
  });

  // Set up notification channels once on mount
  useEffect(() => {
    setupNotificationChannels();
    requestNotificationPermissions();
  }, []);

  // Play in-app sounds + schedule background notifications for due dates
  const soundPlayedForPayment = useRef<string | null>(null);
  useEffect(() => {
    if (!currentPayment || currentPayment.status === 'paid' || currentPayment.proof_image_url) {
      // Payment is paid — cancel any pending reminders
      if (currentPayment?.status === 'paid') cancelPaymentReminders();
      return;
    }
    // Avoid replaying the same payment's sound on every re-render
    if (soundPlayedForPayment.current === currentPayment.id) return;

    const today = new Date();
    const dueDate = new Date(currentPayment.due_date);
    const daysSinceDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysInMora = Math.max(0, daysSinceDue - 3);

    if (daysInMora > 0) {
      playSound('passedDueDate');
      soundPlayedForPayment.current = currentPayment.id;
    } else if (daysSinceDue === 0) {
      playSound('dueDate');
      soundPlayedForPayment.current = currentPayment.id;
    }

    // Schedule background notifications (fires at 9 AM on due date and 4 days after)
    schedulePaymentReminders(
      currentPayment.id,
      currentPayment.due_date,
      '🏠 Domia',
      'Tu pago de alquiler vence hoy.',
      'Tu pago está atrasado. Se están acumulando moras.',
    );
  }, [currentPayment]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchPayments(), refetchLease(), refetchCurrentPayment()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Subscribe to real-time connection_requests changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`tenant-home-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connection_requests',
          filter: `tenant_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-connection', user.id] });
          queryClient.invalidateQueries({ queryKey: ['tenant-payments', user.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tenants',
          filter: `id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-connection', user.id] });
          queryClient.invalidateQueries({ queryKey: ['tenant-lease', user.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rent_payments',
          filter: `tenant_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-current-payment', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const submitDisconnectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!user?.id || !connectionRequest?.id) throw new Error('No connection found');

      const unitNumber = (connectionRequest?.unit as any)?.unit_number;
      const propertyName = (connectionRequest?.unit as any)?.property?.name;
      const unitInfo = unitNumber && propertyName ? `${unitNumber} · ${propertyName}` : (unitNumber || propertyName || null);
      const fullReason = `${t.tenantHome.disconnectReasonPrefix} ${reason}`;

      // 1. Save disconnection request (for owner inbox)
      const { error: insertError } = await supabase
        .from('disconnection_requests')
        .insert({
          tenant_id: user.id,
          owner_id: connectionRequest.owner_id,
          tenant_name: connectionRequest.tenant_name,
          tenant_email: connectionRequest.tenant_email,
          tenant_phone: connectionRequest.tenant_phone ?? null,
          unit_info: unitInfo,
          reason: fullReason,
        });
      if (insertError) throw insertError;

      // 2. Mark the connection request as pending disconnection
      const { error: flagError } = await supabase
        .from('connection_requests')
        .update({ disconnection_pending: true } as any)
        .eq('id', connectionRequest.id);
      if (flagError) throw flagError;

      // 3. Send email to owner (best-effort — don't block on failure)
      try {
        await supabase.functions.invoke('send-disconnection-email', {
          body: {
            ownerEmail: (connectionRequest?.owner as any)?.email,
            ownerName: (connectionRequest?.owner as any)?.full_name,
            tenantName: connectionRequest.tenant_name,
            tenantEmail: connectionRequest.tenant_email,
            unitInfo,
            reason: fullReason,
          },
        });
      } catch (_e) {}
    },
    onSuccess: () => {
      setDisconnectModalVisible(false);
      setDisconnectReason('');
      queryClient.invalidateQueries({ queryKey: ['tenant-connection', user?.id] });
    },
    onError: (error: any) => {
      AppAlert.alert(t.common.error, error.message || 'Failed to disconnect. Please try again.');
    },
  });

  const handleWhatsApp = () => {
    const phone = (connectionRequest?.owner as any)?.phone;
    if (!phone) return;
    const digits = phone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${digits}`);
  };

  const handleDisconnect = () => {
    setDisconnectReason('');
    setDisconnectModalVisible(true);
  };

  const isConnected = connectionRequest?.status === 'approved';
  const isPending = connectionRequest?.status === 'pending';

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
        <View style={styles.header}>
          <Image
            source={require('../../../assets/Domia Logo Crop.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.headerRight}
            onPress={() => router.push('/(tenant)/(tabs)/settings')}
          >
            <Text style={styles.tenantName}>{tenantProfile?.full_name?.split(' ')[0] || ''}</Text>
            {tenantProfile?.profile_image_url ? (
              <Image source={{ uri: tenantProfile.profile_image_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>
                  {(tenantProfile?.full_name || 'T')
                    .split(' ')
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {isConnected ? (
          <>
            <Card style={styles.statusCard} padding="none">
              <View style={styles.imageContainer}>
                {(connectionRequest?.unit?.property as any)?.image_url ? (
                  <Image
                    source={{ uri: (connectionRequest?.unit?.property as any).image_url }}
                    style={styles.propertyImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.propertyImagePlaceholder} />
                )}
                <View style={styles.imageOverlay} />
                <View style={styles.overlayContent}>
                  <View style={styles.connectedBadge}>
                    <Feather name="check-circle" size={16} color={colors.success.main} />
                    <Text style={styles.connectedText}>{t.tenantHome.connected}</Text>
                  </View>
                  {connectionRequest?.unit ? (
                    <>
                      <Text style={styles.unitInfo}>
                        {connectionRequest.unit.property?.name}
                        {connectionRequest.unit.unit_number ? ` · ${connectionRequest.unit.unit_number}` : ''}
                      </Text>
                      {connectionRequest.unit.property?.address ? (
                        <Text style={styles.addressInfo}>
                          {connectionRequest.unit.property.address}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.unitPending}>Unit assignment pending</Text>
                  )}
                  <View style={styles.ownerInfo}>
                    <Text style={styles.ownerLabel}>{t.tenantHome.propertyManager}</Text>
                    <View style={styles.ownerNameRow}>
                      {(connectionRequest?.owner as any)?.profile_image_url ? (
                        <Image source={{ uri: (connectionRequest?.owner as any).profile_image_url }} style={styles.ownerAvatar} />
                      ) : (
                        <View style={styles.ownerAvatarFallback}>
                          <Text style={styles.ownerAvatarInitials}>
                            {connectionRequest?.owner?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'O'}
                          </Text>
                        </View>
                      )}
                      <View style={styles.ownerNameAlias}>
                        <Text style={styles.ownerName}>
                          {connectionRequest?.owner?.full_name}
                        </Text>
                        {(connectionRequest?.owner as any)?.bank_alias ? (
                          <Text style={styles.ownerAlias}>
                            {' · Alias: '}{(connectionRequest?.owner as any).bank_alias}
                          </Text>
                        ) : null}
                      </View>
                      {(connectionRequest?.owner as any)?.phone ? (
                        <TouchableOpacity style={styles.whatsappButton} onPress={handleWhatsApp}>
                          <Feather name="message-circle" size={20} color="#ffffff" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            </Card>

            {isConnected && (
              <Card style={styles.pagosCard}>
                <View style={styles.pagosRow}>
                  {/* Payments column */}
                  <View style={styles.pagosColumn}>
                    <View style={styles.pagosTitleRow}>
                      <Feather name="credit-card" size={16} color={colors.yellow} />
                      <Text style={styles.pagosTitleText}>{t.payments.title}</Text>
                    </View>
                    {currentPayment?.status === 'paid' ? (
                      <Badge label={t.payments.alDia} variant="success" size="sm" />
                    ) : currentPayment?.proof_image_url ? (
                      <Badge label={t.payments.pendingConfirmation} variant="warning" size="sm" />
                    ) : moraData ? (
                      <Badge label={`${t.payments.mora} · ${moraData.daysInMora}d`} variant="error" size="sm" />
                    ) : null}
                    {currentPayment?.status !== 'paid' && (
                      currentPayment?.proof_image_url ? (
                        <TouchableOpacity onPress={() => setProofModalVisible(true)} style={styles.pagosProofRow}>
                          <Feather name="check-circle" size={14} color={colors.warning.main} />
                          <Text style={styles.pagosProofText}>{t.payments.proofUploaded}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Button
                          title={t.payments.uploadProof}
                          variant="outline"
                          size="sm"
                          onPress={() => uploadProofMutation.mutate()}
                          loading={uploadProofMutation.isPending}
                          style={styles.pagosUploadBtn}
                        />
                      )
                    )}
                  </View>

                  {/* Vertical divider */}
                  <View style={styles.pagosVerticalDivider} />

                  {/* Servicios column */}
                  <View style={styles.pagosColumn}>
                    <View style={styles.pagosTitleRow}>
                      <Feather name="droplet" size={16} color={colors.yellow} />
                      <Text style={styles.pagosTitleText}>{t.payments.utilities}</Text>
                    </View>
                    {(currentPayment as any)?.services_proof_image_url && (
                      <Badge label={t.payments.pendingConfirmation} variant="warning" size="sm" />
                    )}
                    {(currentPayment as any)?.services_proof_image_url ? (
                      <TouchableOpacity onPress={() => setServicesProofModalVisible(true)} style={styles.pagosProofRow}>
                        <Feather name="check-circle" size={14} color={colors.warning.main} />
                        <Text style={styles.pagosProofText}>{t.payments.proofUploaded}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Button
                        title={t.payments.uploadProof}
                        variant="outline"
                        size="sm"
                        onPress={() => uploadServicesProofMutation.mutate()}
                        loading={uploadServicesProofMutation.isPending}
                        style={styles.pagosUploadBtn}
                      />
                    )}
                  </View>
                </View>
              </Card>
            )}

            {tenantScore.totalPayments > 0 && (
              <Card style={styles.scoreCard}>
                <View style={styles.scoreHeader}>
                  <Text style={styles.scoreTitle}>{t.tenantDetail.rating}</Text>
                  <Text style={styles.scoreStats}>
                    {tenantScore.onTimeCount}/{tenantScore.totalPayments} {t.tenantDetail.onTime}
                  </Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarBackground}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${tenantScore.score * 100}%` },
                        tenantScore.score >= 0.8 && styles.progressBarHigh,
                        tenantScore.score >= 0.5 && tenantScore.score < 0.8 && styles.progressBarMedium,
                        tenantScore.score < 0.5 && styles.progressBarLow,
                      ]}
                    />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressLabel}>{t.tenantDetail.low}</Text>
                    <Text style={styles.progressLabel}>{t.tenantDetail.high}</Text>
                  </View>
                </View>
              </Card>
            )}

            {(connectionRequest?.owner as any)?.bank_name || (connectionRequest?.owner as any)?.bank_account_number ? (
              <Card style={styles.bankCard}>
                <View style={styles.bankHeader}>
                  <Feather name="credit-card" size={18} color={colors.yellow} />
                  <Text style={styles.bankTitle}>{t.bankInfo.title}</Text>
                </View>
                {(connectionRequest?.owner as any)?.bank_full_name ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.fullName}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_full_name}</Text>
                  </View>
                ) : null}
                {(connectionRequest?.owner as any)?.bank_name ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.bankName}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_name}</Text>
                  </View>
                ) : null}
                {(connectionRequest?.owner as any)?.bank_account_number ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.accountNumber}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_account_number}</Text>
                  </View>
                ) : null}
                {(connectionRequest?.owner as any)?.bank_ruc ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.ruc}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_ruc}</Text>
                  </View>
                ) : null}
                {(connectionRequest?.owner as any)?.bank_alias ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.alias}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_alias}</Text>
                  </View>
                ) : null}
              </Card>
            ) : null}

            <View style={styles.actionsSection}>
              <Text style={styles.sectionTitle}>{t.tenantHome.quickActions}</Text>
              <View style={styles.actionsGrid}>
                <Card
                  style={styles.actionCard}
                  onPress={() => router.push('/(tenant)/(tabs)/requests')}
                >
                  <Feather name="tool" size={24} color={colors.yellow} />
                  <Text style={styles.actionTitle}>{t.tenantHome.reportIssue}</Text>
                </Card>
                <Card
                  style={styles.actionCard}
                  onPress={() => {
                    if (leaseImageUrl) {
                      setLeaseModalVisible(true);
                    } else {
                      setDialog({
                        title: t.tenantHome.viewLease,
                        message: t.tenantHome.noLeaseAvailable,
                        confirmText: 'OK',
                        onConfirm: () => setDialog(null),
                      });
                    }
                  }}
                >
                  <Feather name="file-text" size={24} color={colors.yellow} />
                  <Text style={styles.actionTitle}>{t.tenantHome.viewLease}</Text>
                </Card>
              </View>
            </View>

            {(connectionRequest as any)?.disconnection_pending ? (
              <View style={styles.disconnectPendingRow}>
                <Feather name="clock" size={15} color={colors.warning.main} />
                <Text style={styles.disconnectPendingText}>{t.tenantHome.disconnectPending}</Text>
              </View>
            ) : (
              <Button
                title={t.tenantHome.disconnect}
                variant="outline"
                onPress={handleDisconnect}
                fullWidth
                style={styles.disconnectButton}
                textStyle={styles.disconnectText}
              />
            )}
          </>
        ) : isPending ? (
          <Card style={styles.pendingCard}>
            <View style={styles.pendingIcon}>
              <Feather name="clock" size={32} color={colors.warning.main} />
            </View>
            <Text style={styles.pendingTitle}>{t.tenantHome.pendingConnection}</Text>
            <Text style={styles.pendingText}>
              {t.tenantHome.pendingConnectionText.replace('{name}', connectionRequest?.owner?.full_name || '')}
            </Text>
          </Card>
        ) : (
          <Card style={styles.welcomeCard}>
            <View style={styles.welcomeIcon}>
              <Feather name="home" size={32} color={colors.yellow} />
            </View>
            <Text style={styles.welcomeTitle}>{t.tenantHome.getStarted}</Text>
            <Text style={styles.welcomeText}>
              {t.tenantHome.connectFeatures}
            </Text>
            <Button
              title={t.tenantHome.findOwner}
              onPress={() => router.push('/(tenant)/(tabs)/owners')}
              fullWidth
              style={styles.welcomeButton}
            />
          </Card>
        )}
      </ScrollView>

      {/* Proof Image Modal */}
      <Modal
        visible={proofModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProofModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setProofModalVisible(false)}
          >
            <Feather name="x" size={24} color={colors.white} />
          </TouchableOpacity>
          {currentPayment?.proof_image_url && (
            <Image
              source={{ uri: currentPayment.proof_image_url }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Services Proof Image Modal */}
      <Modal
        visible={servicesProofModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setServicesProofModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setServicesProofModalVisible(false)}
          >
            <Feather name="x" size={24} color={colors.white} />
          </TouchableOpacity>
          {(currentPayment as any)?.services_proof_image_url && (
            <Image
              source={{ uri: (currentPayment as any).services_proof_image_url }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Lease Image Modal */}
      <Modal
        visible={leaseModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setLeaseModalVisible(false)}
          >
            <Feather name="x" size={24} color={colors.white} />
          </TouchableOpacity>
          {leaseImageUrl && (
            <Image
              source={{ uri: leaseImageUrl }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
      {/* Disconnection Request Modal */}
      <Modal
        visible={disconnectModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDisconnectModalVisible(false)}
      >
        <View style={styles.disconnectModalOverlay}>
          <View style={styles.disconnectModalCard}>
            <View style={styles.disconnectModalHeader}>
              <Text style={styles.disconnectModalTitle}>{t.tenantHome.disconnectRequestTitle}</Text>
              <TouchableOpacity onPress={() => setDisconnectModalVisible(false)}>
                <Feather name="x" size={22} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.disconnectModalSubtitle}>{t.tenantHome.disconnectRequestSubtitle}</Text>
            <Text style={styles.disconnectReasonPrefix}>{t.tenantHome.disconnectReasonPrefix}</Text>
            <TextInput
              style={styles.disconnectReasonInput}
              value={disconnectReason}
              onChangeText={setDisconnectReason}
              placeholder={t.tenantHome.disconnectReasonPlaceholder}
              placeholderTextColor={colors.text.disabled}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.disconnectModalActions}>
              <Button
                title={t.common.cancel}
                variant="outline"
                onPress={() => setDisconnectModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={t.tenantHome.disconnectSend}
                onPress={() => {
                  if (!disconnectReason.trim()) {
                    AppAlert.alert('', t.tenantHome.disconnectReasonPlaceholder);
                    return;
                  }
                  submitDisconnectMutation.mutate(disconnectReason.trim());
                }}
                loading={submitDisconnectMutation.isPending}
                style={{ flex: 1, borderColor: colors.error.main }}
              />
            </View>
          </View>
        </View>
      </Modal>
      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title || ''}
        message={dialog?.message}
        confirmText={dialog?.confirmText}
        cancelText={t.common.cancel}
        destructive={dialog?.destructive}
        onConfirm={() => { dialog?.onConfirm(); setDialog(null); }}
        onCancel={() => setDialog(null)}
      />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logo: {
    height: 50,
    width: 150,
    marginLeft: -8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tenantName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#facc15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.background,
  },
  statusCard: {
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  imageContainer: {
    position: 'relative',
    minHeight: 200,
  },
  propertyImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  propertyImagePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.success.light,
    borderRadius: 20,
    marginBottom: spacing.sm,
  },
  connectedText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.success.main,
  },
  unitInfo: {
    ...typography.h2,
    fontWeight: '700',
    color: '#facc15',
    marginTop: spacing.xs,
  },
  unitPending: {
    ...typography.body,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  addressInfo: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.75)',
    marginTop: spacing.xs,
  },
  ownerInfo: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  ownerLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.6)',
    paddingLeft: 40,
  },
  ownerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  ownerNameAlias: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  ownerName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.white,
  },
  ownerAlias: {
    ...typography.body,
    color: 'rgba(255,255,255,0.7)',
  },
  scoreCard: {
    marginBottom: spacing.lg,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  scoreTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  scoreStats: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  progressBarContainer: {
    marginTop: spacing.xs,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: colors.gray[700],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressBarHigh: {
    backgroundColor: colors.success.main,
  },
  progressBarMedium: {
    backgroundColor: colors.warning.main,
  },
  progressBarLow: {
    backgroundColor: colors.error.main,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  progressLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  bankCard: {
    marginBottom: spacing.lg,
  },
  bankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  bankTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text.primary,
  },
  bankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  bankLabel: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    flex: 1,
  },
  bankValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 2,
    textAlign: 'right',
  },
  actionsSection: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  actionTitle: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text.primary,
  },
  pendingCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  pendingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warning.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pendingTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  pendingText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  welcomeCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  welcomeTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  welcomeText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  welcomeButton: {
    marginTop: spacing.sm,
  },
  ownerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: spacing.sm,
  },
  ownerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#facc15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  ownerAvatarInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  whatsappButton: {
    marginLeft: spacing.sm,
    padding: 2,
  },
  disconnectButton: {
    marginTop: spacing.xl,
    borderColor: colors.error.main,
  },
  disconnectText: {
    color: colors.error.main,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: spacing.sm,
  },
  modalImage: {
    width: '100%',
    height: '80%',
  },
  pagosCard: {
    marginBottom: spacing.lg,
  },
  pagosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  pagosTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pagosTitleText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text.primary,
  },
  pagosDate: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  pagosFineLine: {
    ...typography.bodySmall,
    color: colors.error.main,
    marginBottom: spacing.sm,
  },
  pagosProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pagosProofText: {
    ...typography.caption,
    color: colors.warning.main,
    flex: 1,
  },
  pagosUploadBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  pagosRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pagosColumn: {
    flex: 1,
  },
  pagosVerticalDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: spacing.md,
    alignSelf: 'stretch',
  },
  disconnectModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  disconnectModalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  disconnectModalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: spacing.sm,
  },
  disconnectModalTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  disconnectModalSubtitle: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  disconnectReasonPrefix: {
    ...typography.body,
    color: colors.text.primary,
    fontStyle: 'italic' as const,
    marginBottom: spacing.sm,
  },
  disconnectReasonInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text.primary,
    minHeight: 100,
    textAlignVertical: 'top' as const,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disconnectModalActions: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
  },
  disconnectPendingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  disconnectPendingText: {
    ...typography.bodySmall,
    color: colors.warning.main,
    fontStyle: 'italic' as const,
    flexShrink: 1,
  },
});
