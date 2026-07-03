export interface Manager {
  id: string;
  name: string;
  email: string;
  created_at: string;
  city_id?: string | null;
  role?: ManagerRole;
  cities?: City | null;
}

export type ManagerRole = 'manager' | 'super_admin';

export interface City {
  id: string;
  name: string;
  created_at?: string;
}

export interface Driver {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  city_id?: string;
  phone?: string | null;
  salary?: number | null;
  license_front_url?: string | null;
  license_back_url?: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ProductType {
  id: string;
  name: string;
  unit_type: 'single' | 'pack';
  pack_size: number | null;
  is_daily_cycle: boolean;
}

export interface StockLedger {
  id: string;
  product_type_id: string;
  city_id?: string;
  current_quantity: number;
  product_types?: ProductType;
}

export interface DailyProduction {
  id: string;
  date: string;
  product_type_id: string;
  previous_stock: number;
  quantity_produced: number;
  current_stock: number;
  recorded_by: string | null;
  created_at: string;
}

export interface PackRestock {
  id: string;
  product_type_id: string;
  packs_added: number;
  recorded_by: string | null;
  created_at: string;
}

export interface Dispatch {
  id: string;
  driver_id: string;
  product_type_id: string;
  quantity_taken: number;
  status: 'out' | 'settled';
  dispatched_at: string;
  dispatched_by: string | null;
  drivers?: Driver;
  product_types?: ProductType;
}

export interface Settlement {
  id: string;
  dispatch_id: string;
  quantity_sold: number;
  quantity_returned: number;
  price_at_settlement: number;
  expected_cash: number;
  cash_received: number;
  cash_discrepancy: number;
  settled_at: string;
  settled_by: string | null;
  notes: string | null;
}

export interface PriceHistory {
  id: string;
  product_type_id: string;
  price: number;
  effective_from: string;
  set_by: string | null;
}

export interface LowStockThresholds {
  '20L': number;
  '350ml': number;
  '1L': number;
}

export interface DriverStatus {
  driver: Driver;
  status: 'settled' | 'still_out' | 'did_not_go';
  outDispatches: Dispatch[];
}

export interface ReportSummary {
  productType: ProductType;
  cityId?: string;
  cityName?: string;
  totalProduced: number;
  totalDispatched: number;
  totalSold: number;
  totalReturned: number;
  totalRevenue: number;
  totalCashDiscrepancy: number;
}

export interface FactorySalesSummary {
  productType: ProductType;
  cityId?: string;
  cityName?: string;
  quantitySold: number;
  revenue: number;
}

export interface FactorySalesTotals {
  salesCount: number;
  totalRevenue: number;
  byProduct: { product: string; quantity: number; revenue: number }[];
}

export interface FactoryUseSummary {
  productType: ProductType;
  cityId?: string;
  cityName?: string;
  quantityUsed: number;
  equivalentValue: number;
}

export interface FactoryUseTotals {
  useCount: number;
  totalEquivalentValue: number;
  byProduct: { product: string; quantity: number; equivalentValue: number }[];
}

export interface StockBreakdown {
  usedInternallyToday: number;
  soldFactoryToday: number;
  dispatchedToday: number;
}

export interface DriverLeaderboardEntry {
  driver: Driver;
  totalSold: number;
  byProduct: Record<string, number>;
}

export interface DriverCashTransaction {
  id: string;
  driver_id: string;
  transaction_type: 'discrepancy' | 'payment' | 'adjustment';
  amount: number;
  settlement_id: string | null;
  description: string | null;
  created_at: string;
}

export interface CityDashboardSnapshot {
  cityId: string;
  cityName: string;
  stock20L: number;
  soldToday: number;
  driversStillOut: number;
}

export interface DriverSummary extends Driver {
  todayDispatchCount: number;
  balanceOwed: number;
  owesShop: number;
  creditBalance: number;
  todayDispatches: (Dispatch & { settlements?: Settlement[] })[];
  cashTransactions: DriverCashTransaction[];
}
