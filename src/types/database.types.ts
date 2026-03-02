export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      owners: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          profile_image_url: string | null;
          bank_full_name: string | null;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_ruc: string | null;
          bank_alias: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          phone?: string | null;
          profile_image_url?: string | null;
          bank_full_name?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_ruc?: string | null;
          bank_alias?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          phone?: string | null;
          profile_image_url?: string | null;
          bank_full_name?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_ruc?: string | null;
          bank_alias?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          address: string;
          city: string | null;
          property_type: 'house' | 'apartment' | 'condo' | 'commercial' | null;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          address: string;
          city?: string | null;
          property_type?: 'house' | 'apartment' | 'condo' | 'commercial' | null;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          address?: string;
          city?: string | null;
          property_type?: 'house' | 'apartment' | 'condo' | 'commercial' | null;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          }
        ];
      };
      units: {
        Row: {
          id: string;
          property_id: string;
          unit_number: string;
          bedrooms: number;
          bathrooms: number;
          rent_amount: number;
          currency: string;
          status: 'occupied' | 'vacant' | 'maintenance';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          unit_number: string;
          bedrooms?: number;
          bathrooms?: number;
          rent_amount: number;
          currency?: string;
          status?: 'occupied' | 'vacant' | 'maintenance';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          unit_number?: string;
          bedrooms?: number;
          bathrooms?: number;
          rent_amount?: number;
          currency?: string;
          status?: 'occupied' | 'vacant' | 'maintenance';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "units_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          }
        ];
      };
      tenants: {
        Row: {
          id: string;
          unit_id: string | null;
          owner_id: string;
          portal_token: string;
          onboarding_token: string;
          onboarding_completed: boolean;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          ruc: string | null;
          rent_amount: number | null;
          lease_start: string | null;
          lease_end: string | null;
          lease_image_url: string | null;
          status: 'pending' | 'active' | 'inactive';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id?: string | null;
          owner_id: string;
          portal_token?: string;
          onboarding_token?: string;
          onboarding_completed?: boolean;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          ruc?: string | null;
          rent_amount?: number | null;
          lease_start?: string | null;
          lease_end?: string | null;
          lease_image_url?: string | null;
          status?: 'pending' | 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string | null;
          owner_id?: string;
          portal_token?: string;
          onboarding_token?: string;
          onboarding_completed?: boolean;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          ruc?: string | null;
          rent_amount?: number | null;
          lease_start?: string | null;
          lease_end?: string | null;
          lease_image_url?: string | null;
          status?: 'pending' | 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenants_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenants_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          }
        ];
      };
      rent_payments: {
        Row: {
          id: string;
          tenant_id: string;
          period_month: number;
          period_year: number;
          amount_due: number;
          amount_paid: number;
          due_date: string;
          paid_date: string | null;
          status: 'paid' | 'due' | 'late' | 'partial';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          period_month: number;
          period_year: number;
          amount_due: number;
          amount_paid?: number;
          due_date: string;
          paid_date?: string | null;
          status?: 'paid' | 'due' | 'late' | 'partial';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          period_month?: number;
          period_year?: number;
          amount_due?: number;
          amount_paid?: number;
          due_date?: string;
          paid_date?: string | null;
          status?: 'paid' | 'due' | 'late' | 'partial';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rent_payments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      maintenance_requests: {
        Row: {
          id: string;
          tenant_id: string | null;
          owner_id: string | null;
          unit_id: string | null;
          title: string;
          description: string;
          category: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'other' | null;
          urgency: 'low' | 'normal' | 'high' | 'emergency';
          status: 'submitted' | 'in_progress' | 'completed' | 'cancelled';
          estimated_cost: number | null;
          actual_cost: number | null;
          owner_notes: string | null;
          submitter_name: string | null;
          submitter_phone: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          owner_id?: string | null;
          unit_id?: string | null;
          title: string;
          description: string;
          category?: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'other' | null;
          urgency?: 'low' | 'normal' | 'high' | 'emergency';
          status?: 'submitted' | 'in_progress' | 'completed' | 'cancelled';
          estimated_cost?: number | null;
          actual_cost?: number | null;
          owner_notes?: string | null;
          submitter_name?: string | null;
          submitter_phone?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          owner_id?: string | null;
          unit_id?: string | null;
          title?: string;
          description?: string;
          category?: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'other' | null;
          urgency?: 'low' | 'normal' | 'high' | 'emergency';
          status?: 'submitted' | 'in_progress' | 'completed' | 'cancelled';
          estimated_cost?: number | null;
          actual_cost?: number | null;
          owner_notes?: string | null;
          submitter_name?: string | null;
          submitter_phone?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_requests_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          }
        ];
      };
      maintenance_images: {
        Row: {
          id: string;
          maintenance_request_id: string;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          maintenance_request_id: string;
          storage_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          maintenance_request_id?: string;
          storage_path?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_images_maintenance_request_id_fkey";
            columns: ["maintenance_request_id"];
            isOneToOne: false;
            referencedRelation: "maintenance_requests";
            referencedColumns: ["id"];
          }
        ];
      };
      connection_requests: {
        Row: {
          id: string;
          tenant_id: string;
          owner_id: string;
          tenant_name: string;
          tenant_email: string;
          tenant_phone: string | null;
          status: 'pending' | 'approved' | 'rejected';
          unit_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          owner_id: string;
          tenant_name: string;
          tenant_email: string;
          tenant_phone?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          unit_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          owner_id?: string;
          tenant_name?: string;
          tenant_email?: string;
          tenant_phone?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          unit_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connection_requests_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_requests_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}

export type UserRole = 'owner' | 'tenant';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
