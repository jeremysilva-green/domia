import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { Owner, UserRole } from '../types';

const PENDING_EMAIL_CONFIRMATION_KEY = 'domus.pendingEmailConfirmation';

interface TenantProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  ruc: string | null;
  razon_social: string | null;
  unit_id: string | null;
  owner_id: string | null;
  status: string;
  profile_image_url: string | null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  owner: Owner | null;
  tenantProfile: TenantProfile | null;
  userRole: UserRole | null;
  isLoading: boolean;
  isInitialized: boolean;
  pendingLoginRedirect: boolean;
  pendingEmailConfirmation: boolean;

  initialize: () => Promise<void>;
  setPendingLoginRedirect: (v: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setUserRole: (role: UserRole) => void;
  refreshSession: () => Promise<void>;
  syncSession: (session: import('@supabase/supabase-js').Session) => Promise<void>;
  fetchOwnerProfile: () => Promise<void>;
  fetchTenantProfile: () => Promise<void>;
  updateTenantProfile: (data: Partial<TenantProfile>) => Promise<void>;
  updateOwnerProfile: (data: {
    profile_image_url?: string | null;
    full_name?: string;
    phone?: string | null;
    bank_full_name?: string | null;
    bank_name?: string | null;
    bank_account_number?: string | null;
    bank_ruc?: string | null;
    bank_alias?: string | null;
  }) => Promise<void>;
  completeOnboarding: (params: {
    displayName: string;
    planType: string;
    productId: string;
  }) => Promise<void>;
  upgradePlan: (planType: string, productId: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  owner: null,
  tenantProfile: null,
  userRole: null,
  isLoading: false,
  isInitialized: false,
  pendingLoginRedirect: false,
  pendingEmailConfirmation: false,

  setPendingLoginRedirect: (v) => set({ pendingLoginRedirect: v }),

  initialize: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      set({ session, user: session?.user ?? null });

      if (session?.user) {
        // Get user role from metadata
        const role = session.user.user_metadata?.role as UserRole | undefined;
        set({ userRole: role || null });

        if (role === 'owner') {
          await get().fetchOwnerProfile();
        } else if (role === 'tenant') {
          await get().fetchTenantProfile();
        }
      } else {
        // No session — check if user just registered and needs to confirm email
        const pending = await AsyncStorage.getItem(PENDING_EMAIL_CONFIRMATION_KEY);
        if (pending) set({ pendingEmailConfirmation: true });
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
        if (session?.user) {
          const role = session.user.user_metadata?.role as UserRole | undefined;
          set({ userRole: role || null });
          // Clear pending confirmation flag — a valid session means the user confirmed their email
          AsyncStorage.removeItem(PENDING_EMAIL_CONFIRMATION_KEY);
          set({ pendingEmailConfirmation: false });
          // Fire-and-forget — do NOT await here. Supabase awaits all subscribers
          // inside _notifyAllSubscribers, so awaiting fetchOwnerProfile would block
          // _callRefreshToken and cause the entire auth flow to hang indefinitely.
          if (role === 'owner') get().fetchOwnerProfile();
          else if (role === 'tenant') get().fetchTenantProfile();
        } else {
          set({ owner: null, tenantProfile: null, userRole: null });
        }
      });
    } finally {
      set({ isInitialized: true });
    }
  },

  setUserRole: (role: UserRole) => {
    set({ userRole: role });
  },

  refreshSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await get().syncSession(session);
  },

  syncSession: async (session) => {
    set({ session, user: session.user });
    const role = session.user.user_metadata?.role as UserRole | undefined;
    set({ userRole: role || null });
    // Clear pending confirmation flag — a valid session means email was confirmed
    await AsyncStorage.removeItem(PENDING_EMAIL_CONFIRMATION_KEY);
    set({ pendingEmailConfirmation: false });
    if (role === 'owner') await get().fetchOwnerProfile();
    else if (role === 'tenant') await get().fetchTenantProfile();
  },

  fetchOwnerProfile: async () => {
    const user = get().user;
    if (!user) return;

    try {
      // Try to fetch existing owner profile
      const { data, error } = await supabase
        .from('owners')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        set({ owner: data });
        return;
      }

      // If no profile exists, create one from user metadata
      if (error?.code === 'PGRST116') {
        const metadata = user.user_metadata;
        const { data: newOwner, error: insertError } = await (supabase
          .from('owners') as any)
          .insert({
            id: user.id,
            email: user.email!,
            full_name: metadata?.full_name || 'Owner',
            phone: metadata?.phone || null,
          })
          .select()
          .single();

        if (!insertError && newOwner) {
          set({ owner: newOwner as Owner });
        }
      }
    } catch (_) {
      // Network error — owner stays null, index.tsx will retry
    }
  },

  fetchTenantProfile: async () => {
    const user = get().user;
    if (!user) return;

    // For tenant users, we store their profile info in user metadata
    // or fetch from a tenant_users table if connected to an owner
    const metadata = user.user_metadata;

    set({
      tenantProfile: {
        id: user.id,
        full_name: metadata?.full_name || null,
        email: user.email || null,
        phone: metadata?.phone || null,
        ruc: metadata?.ruc || null,
        razon_social: metadata?.razon_social || null,
        unit_id: metadata?.unit_id || null,
        owner_id: metadata?.owner_id || null,
        status: metadata?.owner_id ? 'connected' : 'pending',
        profile_image_url: metadata?.profile_image_url || null,
      },
    });
  },

  updateTenantProfile: async (data: Partial<TenantProfile>) => {
    const user = get().user;
    if (!user) return;

    const { error } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        ...data,
      },
    });

    if (!error) {
      const currentProfile = get().tenantProfile;
      set({
        tenantProfile: currentProfile ? { ...currentProfile, ...data } : null,
      });
    }
  },

  updateOwnerProfile: async (data) => {
    const owner = get().owner;
    if (!owner) return;

    const { data: updated, error } = await supabase
      .from('owners')
      .update(data)
      .eq('id', owner.id)
      .select()
      .single();

    if (!error && updated) {
      set({ owner: updated });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Clear the pending confirmation flag — user has signed in successfully
      await AsyncStorage.removeItem(PENDING_EMAIL_CONFIRMATION_KEY);
      set({ pendingEmailConfirmation: false });

      // Set role from user metadata
      const role = data.user?.user_metadata?.role as UserRole | undefined;
      set({ userRole: role || null });
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password, fullName, role) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          },
          emailRedirectTo: 'domus://',
        },
      });
      if (error) throw error;

      // Flag that this user needs to confirm their email before signing in
      await AsyncStorage.setItem(PENDING_EMAIL_CONFIRMATION_KEY, 'true');
      set({ userRole: role, pendingEmailConfirmation: true });

      // Owner profile is created automatically by database trigger
      // Tenant profile is stored in user metadata
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem(PENDING_EMAIL_CONFIRMATION_KEY);
      set({ session: null, user: null, owner: null, tenantProfile: null, userRole: null, pendingEmailConfirmation: false });
    } finally {
      set({ isLoading: false });
    }
  },

  resetPassword: async (email) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  completeOnboarding: async ({ displayName, planType, productId }) => {
    const owner = get().owner;
    if (!owner) throw new Error('Owner profile not loaded. Please restart the app.');

    const { data, error } = await (supabase
      .from('owners') as any)
      .update({
        onboarding_completed: true,
        display_name: displayName,
        plan_type: planType,
        subscription_status: 'trial',
        trial_started_at: new Date().toISOString(),
        subscription_product_id: productId,
      })
      .eq('id', owner.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Subscription setup failed. Please try again.');

    set({ owner: data });
  },

  upgradePlan: async (planType, productId) => {
    const owner = get().owner;
    if (!owner) return;

    const { error } = await (supabase
      .from('owners') as any)
      .update({ plan_type: planType, subscription_product_id: productId })
      .eq('id', owner.id);

    if (error) throw error;

    await get().fetchOwnerProfile();
  },

  deleteAccount: async () => {
    set({ isLoading: true });
    try {
      // Refresh the session first so the token is never expired when the function is called
      const { data: refreshData } = await supabase.auth.refreshSession();
      const token = refreshData?.session?.access_token ?? get().session?.access_token;
      const { error } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      set({ session: null, user: null, owner: null, tenantProfile: null, userRole: null });
    } finally {
      set({ isLoading: false });
    }
  },
}));
