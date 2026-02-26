import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { Owner, UserRole } from '../types';

interface TenantProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  ruc: string | null;
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

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setUserRole: (role: UserRole) => void;
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
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  owner: null,
  tenantProfile: null,
  userRole: null,
  isLoading: false,
  isInitialized: false,

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
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ session, user: session?.user ?? null });
        if (session?.user) {
          const role = session.user.user_metadata?.role as UserRole | undefined;
          set({ userRole: role || null });

          if (role === 'owner') {
            await get().fetchOwnerProfile();
          } else if (role === 'tenant') {
            await get().fetchTenantProfile();
          }
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

  fetchOwnerProfile: async () => {
    const user = get().user;
    if (!user) return;

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
        },
      });
      if (error) throw error;

      set({ userRole: role });

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
      set({ session: null, user: null, owner: null, tenantProfile: null, userRole: null });
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
}));
