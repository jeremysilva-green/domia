import { Tables, UserRole } from './database.types';

export type Owner = Tables<'owners'>;
export type Property = Tables<'properties'>;
export type Unit = Tables<'units'>;
export type Tenant = Tables<'tenants'>;
export type RentPayment = Tables<'rent_payments'>;
export type MaintenanceRequest = Tables<'maintenance_requests'>;
export type MaintenanceImage = Tables<'maintenance_images'>;
export type ConnectionRequest = Tables<'connection_requests'>;

export type { UserRole };

export type RentStatus = 'paid' | 'due' | 'late' | 'partial';
export type MaintenanceStatus = 'submitted' | 'in_progress' | 'completed' | 'cancelled';
export type UnitStatus = 'occupied' | 'vacant' | 'maintenance';
export type TenantStatus = 'pending' | 'active' | 'inactive';
export type MaintenanceCategory = 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'other';
export type MaintenanceUrgency = 'low' | 'normal' | 'high' | 'emergency';
export type PropertyType = 'house' | 'apartment' | 'condo' | 'commercial';

export interface PropertyWithUnits extends Property {
  units: UnitWithTenant[];
}

export interface UnitWithTenant extends Unit {
  tenant?: TenantWithRentStatus | null;
}

export interface TenantWithRentStatus extends Tenant {
  current_rent_status?: RentStatus;
}

export interface TenantWithDetails extends Tenant {
  unit?: Unit & {
    property?: Property;
  };
  rent_payments?: RentPayment[];
  maintenance_requests?: MaintenanceRequest[];
}

export interface MaintenanceRequestWithImages extends MaintenanceRequest {
  images?: MaintenanceImage[];
  tenant?: Tenant;
  unit?: Unit & {
    property?: Property;
  };
}

export interface DashboardStats {
  totalRentExpected: number;
  totalRentCollected: number;
  latePaymentsCount: number;
  activeMaintenanceCount: number;
  propertiesCount: number;
  occupiedUnitsCount: number;
  totalUnitsCount: number;
}

export interface ExpiringLease {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  leaseEnd: string;
  daysUntilExpiry: number;
}
