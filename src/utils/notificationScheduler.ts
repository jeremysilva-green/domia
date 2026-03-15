import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Notification channel IDs (Android)
const CHANNEL_DUE_DATE = 'due-date';
const CHANNEL_PASSED_DUE = 'passed-due-date';

// Tag used to identify and cancel previously scheduled payment reminders
const DUE_DATE_TAG = 'rent-due-date';
const PASSED_DUE_TAG = 'rent-passed-due';

/**
 * Set up Android notification channels with custom sounds.
 * Must be called once at app startup (before any notifications are scheduled).
 */
export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_DUE_DATE, {
    name: 'Rent Due Date',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'snd_due_date.mp3',
    vibrationPattern: [0, 250, 250, 250],
  });

  await Notifications.setNotificationChannelAsync(CHANNEL_PASSED_DUE, {
    name: 'Rent Past Due',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'snd_passed_due.mp3',
    vibrationPattern: [0, 500, 250, 500],
  });
}

/**
 * Request notification permissions. Returns true if granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Schedule due-date and past-due notifications for a payment.
 * Cancels any previously scheduled ones for the same payment first.
 * @param paymentId  The rent_payment row ID (used to avoid double-scheduling)
 * @param dueDate    The ISO date string of the payment's due date (e.g. "2026-03-15")
 * @param title      Localised notification title
 * @param bodyDue    Localised body for the due-date notification
 * @param bodyPassed Localised body for the past-due notification
 */
export async function schedulePaymentReminders(
  paymentId: string,
  dueDate: string,
  title: string,
  bodyDue: string,
  bodyPassed: string,
) {
  // Cancel any existing reminders before rescheduling
  await cancelPaymentReminders();

  const due = new Date(dueDate);
  due.setHours(9, 0, 0, 0); // 9 AM on the due date

  const now = new Date();

  // Due-date notification (only schedule if it hasn't passed yet)
  if (due > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${DUE_DATE_TAG}-${paymentId}`,
      content: {
        title,
        body: bodyDue,
        sound: Platform.OS === 'ios' ? 'snd_due_date.mp3' : undefined,
        data: { type: 'due-date', paymentId },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_DUE_DATE } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due },
    });
  }

  // Past-due notification: 3-day grace period + 1 day = due + 4 days at 9 AM
  const passedDue = new Date(dueDate);
  passedDue.setDate(passedDue.getDate() + 4);
  passedDue.setHours(9, 0, 0, 0);

  if (passedDue > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${PASSED_DUE_TAG}-${paymentId}`,
      content: {
        title,
        body: bodyPassed,
        sound: Platform.OS === 'ios' ? 'snd_passed_due.mp3' : undefined,
        data: { type: 'passed-due', paymentId },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_PASSED_DUE } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: passedDue },
    });
  }
}

/**
 * Cancel all scheduled payment reminders (call when payment is marked paid).
 */
export async function cancelPaymentReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (
      n.identifier.startsWith(DUE_DATE_TAG) ||
      n.identifier.startsWith(PASSED_DUE_TAG)
    ) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}
