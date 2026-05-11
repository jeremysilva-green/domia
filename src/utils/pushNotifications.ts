import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../services/supabase';

const PROJECT_ID = '4a116f40-1165-4ef4-b408-4ba19f4b246e';

export async function registerPushToken(userId: string): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const token = tokenData.data;

    await supabase
      .from('push_tokens' as any)
      .upsert({ user_id: userId, token }, { onConflict: 'user_id,token' });
  } catch (e) {
    console.warn('Push token registration failed:', e);
  }
}

// Send a push notification to another user via the edge function (best-effort)
export async function sendPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', {
      body: { userId, title, body, data: data ?? {} },
    });
  } catch (e) {
    console.warn('sendPush failed:', e);
  }
}

// Configure how notifications appear when the app is in the foreground
export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
