/**
 * Subscription store using react-native-iap v14 for Google Play Billing.
 *
 * v14 API changes from v12/v13:
 *  - requestSubscription() removed → use requestPurchase({ type: 'subs', request: { google: { skus, subscriptionOffers } } })
 *  - getSubscriptions() removed     → use fetchProducts({ skus, type: 'subs' })
 *  - Android subscriptions require an offerToken fetched from fetchProducts first
 */
import { create } from 'zustand';
import { Alert } from 'react-native';
import { supabase } from '../services/supabase';

// ─── Product IDs — must match Google Play Console subscription IDs ────────────
export const PLAN_PRODUCT_IDS = {
  '1-10':  'plan_basico',    // $10/month — up to 10 units
  '10-30': 'plan_pro',       // $25/month — up to 30 units
  '30-50': 'plan_ilimitado', // $45/month — Unlimited
} as const;

export type PlanType = keyof typeof PLAN_PRODUCT_IDS;

export const PLAN_LIMITS: Record<PlanType, number> = {
  '1-10':  10,
  '10-30': 30,
  '30-50': Infinity,
};

export const PLAN_NAMES: Record<PlanType, string> = {
  '1-10':  'Starter',
  '10-30': 'Pro',
  '30-50': 'Unlimited',
};

export const PLAN_PRICES: Record<PlanType, string> = {
  '1-10':  '$10/month',
  '10-30': '$25/month',
  '30-50': '$45/month',
};

interface SubscriptionState {
  isConnected: boolean;
  isPurchasing: boolean;

  initConnection: () => Promise<void>;
  purchasePlan: (
    planType: PlanType,
    onSuccess: () => void,
    onError: (msg: string) => void
  ) => Promise<void>;
  endConnection: () => void;
}

// Lazy-load react-native-iap so the UI doesn't crash if native module isn't built yet
async function getRNIap() {
  try {
    const mod = await import('react-native-iap');
    return mod;
  } catch {
    return null;
  }
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  isConnected: false,
  isPurchasing: false,

  initConnection: async () => {
    const RNIap = await getRNIap();
    if (!RNIap) return;
    try {
      await RNIap.initConnection();
      set({ isConnected: true });
    } catch (e: any) {
      console.warn('IAP initConnection failed:', e?.message);
    }
  },

  purchasePlan: async (planType, onSuccess, onError) => {
    const RNIap = await getRNIap();
    if (!RNIap) {
      Alert.alert(
        'Billing unavailable',
        'Google Play Billing requires a native build.',
      );
      return;
    }

    if (!get().isConnected) {
      await get().initConnection();
    }

    set({ isPurchasing: true });

    // timeout reference — started after the billing UI is shown, not before
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      const sku = PLAN_PRODUCT_IDS[planType];

      // v14: fetch the subscription to get the offerToken required by Play Billing v5+
      const products = await RNIap.fetchProducts({ skus: [sku], type: 'subs' });
      const product = products[0] as any;

      // offerToken lives inside subscriptionOfferDetails (Android Play Billing v5+)
      const offerToken: string | undefined =
        product?.subscriptionOfferDetails?.[0]?.offerToken ?? undefined;

      // Set up listeners before triggering the purchase dialog
      const purchaseListener = RNIap.purchaseUpdatedListener(async (purchase: any) => {
        if (purchase.productId === sku) {
          if (timeout) clearTimeout(timeout);
          try {
            await RNIap.finishTransaction({ purchase, isConsumable: false });
          } catch {}

          const purchaseToken = purchase.purchaseToken;
          if (purchaseToken) {
            try {
              const session = (await supabase.auth.getSession()).data.session;
              const { error: verifyError } = await supabase.functions.invoke('verify-purchase', {
                body: { purchaseToken, productId: sku },
                headers: { Authorization: `Bearer ${session?.access_token}` },
              });
              if (verifyError) {
                purchaseListener.remove();
                errorListener.remove();
                set({ isPurchasing: false });
                onError('Purchase verification failed. Please contact support.');
                return;
              }
            } catch (verifyErr: any) {
              console.warn('Purchase verification error:', verifyErr?.message);
            }
          }

          purchaseListener.remove();
          errorListener.remove();
          set({ isPurchasing: false });
          onSuccess();
        }
      });

      const errorListener = RNIap.purchaseErrorListener((error: any) => {
        if (error.productId === sku) {
          if (timeout) clearTimeout(timeout);
          purchaseListener.remove();
          errorListener.remove();
          set({ isPurchasing: false });
          onError(error.message || 'Purchase failed');
        }
      });

      // v14: requestPurchase with nested google/android request format
      await RNIap.requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [sku],
            ...(offerToken ? { subscriptionOffers: [{ sku, offerToken }] } : {}),
          },
        },
      } as any);

      // Safety timeout — only fires if the purchase listener never completed.
      // Guard with isPurchasing check because the listener may have already
      // resolved before requestPurchase() returned (race on some devices).
      timeout = setTimeout(() => {
        if (!get().isPurchasing) return;
        set({ isPurchasing: false });
        onError('Purchase timed out. Please check your Google Play account and try again.');
      }, 60000);

    } catch (e: any) {
      if (timeout) clearTimeout(timeout);
      set({ isPurchasing: false });
      onError(e?.message || 'Purchase failed');
    }
  },

  endConnection: async () => {
    const RNIap = await getRNIap();
    if (RNIap) {
      try {
        await RNIap.endConnection();
      } catch {}
    }
    set({ isConnected: false });
  },
}));
