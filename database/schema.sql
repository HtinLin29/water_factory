-- Water Factory Tracker — Supabase schema
-- Reverse-engineered from src/app/api/* routes and src/lib/types.ts
-- Run in the Supabase SQL editor on a fresh project, then configure auth + storage.

-- =============================================================================
-- Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Core tables
-- =============================================================================

CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE managers (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'manager'
    CHECK (role IN ('manager', 'super_admin')),
  city_id uuid REFERENCES cities (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT managers_role_city_check CHECK (
    (role = 'super_admin' AND city_id IS NULL)
    OR (role = 'manager' AND city_id IS NOT NULL)
  )
);

CREATE TABLE product_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  unit_type text NOT NULL CHECK (unit_type IN ('single', 'pack')),
  pack_size integer,
  is_daily_cycle boolean NOT NULL DEFAULT false,
  CONSTRAINT product_types_pack_size_check CHECK (
    (unit_type = 'pack' AND pack_size IS NOT NULL AND pack_size > 0)
    OR (unit_type = 'single' AND pack_size IS NULL)
  )
);

CREATE TABLE stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  product_type_id uuid NOT NULL REFERENCES product_types (id) ON DELETE CASCADE,
  current_quantity integer NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  UNIQUE (city_id, product_type_id)
);

CREATE TABLE price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id uuid NOT NULL REFERENCES product_types (id) ON DELETE CASCADE,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  set_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX price_history_product_effective_idx
  ON price_history (product_type_id, effective_from DESC);

CREATE TABLE app_settings (
  setting_key text PRIMARY KEY,
  setting_value jsonb NOT NULL,
  updated_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  phone text,
  salary numeric(12, 2),
  license_front_url text,
  license_back_url text,
  created_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX drivers_city_status_idx ON drivers (city_id, status);

CREATE TABLE driver_account_balance (
  driver_id uuid PRIMARY KEY REFERENCES drivers (id) ON DELETE CASCADE,
  balance_owed numeric(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE daily_production (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  product_type_id uuid NOT NULL REFERENCES product_types (id) ON DELETE CASCADE,
  previous_stock integer NOT NULL DEFAULT 0 CHECK (previous_stock >= 0),
  quantity_produced integer NOT NULL CHECK (quantity_produced > 0),
  current_stock integer NOT NULL CHECK (current_stock >= 0),
  recorded_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX daily_production_date_city_idx
  ON daily_production (date, city_id, product_type_id);

CREATE TABLE pack_restocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  product_type_id uuid NOT NULL REFERENCES product_types (id) ON DELETE CASCADE,
  packs_added integer NOT NULL CHECK (packs_added > 0),
  recorded_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pack_restocks_city_created_idx
  ON pack_restocks (city_id, created_at DESC);

CREATE TABLE dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers (id) ON DELETE RESTRICT,
  product_type_id uuid NOT NULL REFERENCES product_types (id) ON DELETE RESTRICT,
  quantity_taken integer NOT NULL CHECK (quantity_taken > 0),
  status text NOT NULL DEFAULT 'out' CHECK (status IN ('out', 'settled')),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  dispatched_by uuid REFERENCES managers (id) ON DELETE SET NULL
);

CREATE INDEX dispatches_city_dispatched_idx
  ON dispatches (city_id, dispatched_at DESC);
CREATE INDEX dispatches_driver_status_idx
  ON dispatches (driver_id, status);

CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL UNIQUE REFERENCES dispatches (id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  quantity_sold integer NOT NULL CHECK (quantity_sold >= 0),
  quantity_returned integer NOT NULL CHECK (quantity_returned >= 0),
  price_at_settlement numeric(12, 2) NOT NULL CHECK (price_at_settlement >= 0),
  expected_cash numeric(12, 2) NOT NULL DEFAULT 0,
  cash_received numeric(12, 2) NOT NULL DEFAULT 0,
  cash_discrepancy numeric(12, 2) NOT NULL DEFAULT 0,
  settled_at timestamptz NOT NULL DEFAULT now(),
  settled_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  notes text
);

CREATE INDEX settlements_city_settled_idx
  ON settlements (city_id, settled_at DESC);

CREATE TABLE factory_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  sale_time timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'transfer')),
  amount_paid numeric(12, 2) NOT NULL CHECK (amount_paid >= 0),
  notes text,
  recorded_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX factory_sales_city_date_idx
  ON factory_sales (city_id, sale_date DESC);

CREATE TABLE factory_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_sale_id uuid NOT NULL REFERENCES factory_sales (id) ON DELETE CASCADE,
  product_type_id uuid NOT NULL REFERENCES product_types (id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  price_at_sale numeric(12, 2) NOT NULL CHECK (price_at_sale >= 0),
  subtotal numeric(12, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX factory_sale_items_sale_idx
  ON factory_sale_items (factory_sale_id);

CREATE TABLE factory_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_sale_id uuid NOT NULL REFERENCES factory_sales (id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'transfer')),
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  recorded_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE factory_use (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  use_date date NOT NULL DEFAULT CURRENT_DATE,
  use_time timestamptz NOT NULL DEFAULT now(),
  note text,
  recorded_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX factory_use_city_date_idx
  ON factory_use (city_id, use_date DESC);

CREATE TABLE factory_use_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_use_id uuid NOT NULL REFERENCES factory_use (id) ON DELETE CASCADE,
  product_type_id uuid NOT NULL REFERENCES product_types (id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0)
);

CREATE INDEX factory_use_items_use_idx
  ON factory_use_items (factory_use_id);

CREATE TABLE driver_cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers (id) ON DELETE CASCADE,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('discrepancy', 'payment', 'adjustment')),
  amount numeric(12, 2) NOT NULL,
  settlement_id uuid REFERENCES settlements (id) ON DELETE SET NULL,
  description text,
  recorded_by uuid REFERENCES managers (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX driver_cash_transactions_driver_idx
  ON driver_cash_transactions (driver_id, created_at DESC);

CREATE TABLE monthly_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  product_type_id uuid NOT NULL REFERENCES product_types (id) ON DELETE CASCADE,
  total_produced integer NOT NULL DEFAULT 0,
  total_sold integer NOT NULL DEFAULT 0,
  total_returned integer NOT NULL DEFAULT 0,
  total_dispatched integer NOT NULL DEFAULT 0,
  total_revenue numeric(14, 2) NOT NULL DEFAULT 0,
  total_cash_discrepancy numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, city_id, product_type_id)
);

CREATE TABLE edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  changed_by uuid NOT NULL REFERENCES managers (id) ON DELETE CASCADE,
  reason text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX edit_log_table_record_idx ON edit_log (table_name, record_id);

-- =============================================================================
-- Seed reference data
-- =============================================================================

INSERT INTO product_types (name, unit_type, pack_size, is_daily_cycle) VALUES
  ('20L', 'single', NULL, true),
  ('350ml', 'pack', 10, false),
  ('1L', 'pack', 10, false)
ON CONFLICT (name) DO NOTHING;

-- Add your branch cities here, then run ensureStockLedgerForCity logic or insert stock rows.
-- INSERT INTO cities (name) VALUES ('Khamti'), ('Sintgaing');

-- =============================================================================
-- Auth / access helper functions (used by RLS)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM managers WHERE id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM managers WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.manager_city_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT city_id FROM managers WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.manager_has_city_access(p_city_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR p_city_id = public.manager_city_id();
$$;

-- =============================================================================
-- Inventory / pricing helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_price_at(
  p_product_type_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT price
  FROM price_history
  WHERE product_type_id = p_product_type_id
    AND effective_from <= p_at
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ensure_stock_ledger_row(
  p_city_id uuid,
  p_product_type_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO stock_ledger (city_id, product_type_id, current_quantity)
  VALUES (p_city_id, p_product_type_id, 0)
  ON CONFLICT (city_id, product_type_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_stock_ledger(
  p_city_id uuid,
  p_product_type_id uuid,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current integer;
BEGIN
  PERFORM public.ensure_stock_ledger_row(p_city_id, p_product_type_id);

  SELECT current_quantity
  INTO v_current
  FROM stock_ledger
  WHERE city_id = p_city_id
    AND product_type_id = p_product_type_id
  FOR UPDATE;

  IF v_current + p_delta < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for this product';
  END IF;

  UPDATE stock_ledger
  SET current_quantity = current_quantity + p_delta
  WHERE city_id = p_city_id
    AND product_type_id = p_product_type_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_edit(
  p_table_name text,
  p_record_id uuid,
  p_changed_by uuid,
  p_reason text,
  p_old_values jsonb,
  p_new_values jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO edit_log (
    table_name,
    record_id,
    changed_by,
    reason,
    old_values,
    new_values
  ) VALUES (
    p_table_name,
    p_record_id,
    p_changed_by,
    p_reason,
    p_old_values,
    p_new_values
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stock_units_for_packs(
  p_product_type_id uuid,
  p_packs integer
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_pack_size integer;
BEGIN
  SELECT pack_size
  INTO v_pack_size
  FROM product_types
  WHERE id = p_product_type_id;

  IF v_pack_size IS NULL THEN
    RAISE EXCEPTION 'Product is not sold in packs';
  END IF;

  RETURN p_packs * v_pack_size;
END;
$$;

-- =============================================================================
-- Trigger functions
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_app_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_app_settings_updated_at();

CREATE OR REPLACE FUNCTION public.create_driver_account_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO driver_account_balance (driver_id, balance_owed)
  VALUES (NEW.id, 0)
  ON CONFLICT (driver_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER drivers_create_account_balance
  AFTER INSERT ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.create_driver_account_balance();

CREATE OR REPLACE FUNCTION public.seed_stock_ledger_for_city()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO stock_ledger (city_id, product_type_id, current_quantity)
  SELECT NEW.id, pt.id, 0
  FROM product_types pt
  ON CONFLICT (city_id, product_type_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cities_seed_stock_ledger
  AFTER INSERT ON cities
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_stock_ledger_for_city();

-- =============================================================================
-- RPC functions called from API routes
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_dispatch(
  p_driver_id uuid,
  p_product_type_id uuid,
  p_quantity integer,
  p_manager_id uuid,
  p_city_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispatch_id uuid;
  v_driver_city uuid;
  v_driver_status text;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive whole number';
  END IF;

  SELECT city_id, status
  INTO v_driver_city, v_driver_status
  FROM drivers
  WHERE id = p_driver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;

  IF v_driver_status <> 'active' THEN
    RAISE EXCEPTION 'Driver is inactive';
  END IF;

  IF v_driver_city <> p_city_id THEN
    RAISE EXCEPTION 'Driver does not belong to this city';
  END IF;

  PERFORM public.adjust_stock_ledger(p_city_id, p_product_type_id, -p_quantity);

  INSERT INTO dispatches (
    city_id,
    driver_id,
    product_type_id,
    quantity_taken,
    status,
    dispatched_by
  ) VALUES (
    p_city_id,
    p_driver_id,
    p_product_type_id,
    p_quantity,
    'out',
    p_manager_id
  )
  RETURNING id INTO v_dispatch_id;

  RETURN v_dispatch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_dispatch(
  p_id uuid,
  p_quantity_taken integer,
  p_reason text,
  p_manager_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old dispatches%ROWTYPE;
  v_delta integer;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required for edits';
  END IF;

  SELECT * INTO v_old FROM dispatches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispatch not found';
  END IF;

  IF v_old.status <> 'out' THEN
    RAISE EXCEPTION 'Only outstanding dispatches can be edited';
  END IF;

  IF p_quantity_taken IS NULL OR p_quantity_taken <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive whole number';
  END IF;

  v_delta := p_quantity_taken - v_old.quantity_taken;
  IF v_delta > 0 THEN
    PERFORM public.adjust_stock_ledger(v_old.city_id, v_old.product_type_id, -v_delta);
  ELSIF v_delta < 0 THEN
    PERFORM public.adjust_stock_ledger(v_old.city_id, v_old.product_type_id, -v_delta);
  END IF;

  UPDATE dispatches
  SET quantity_taken = p_quantity_taken
  WHERE id = p_id;

  PERFORM public.log_edit(
    'dispatches',
    p_id,
    p_manager_id,
    p_reason,
    to_jsonb(v_old),
    jsonb_build_object('quantity_taken', p_quantity_taken)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_settlement(
  p_dispatch_id uuid,
  p_quantity_sold integer,
  p_cash_received numeric,
  p_manager_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispatch dispatches%ROWTYPE;
  v_price numeric(12, 2);
  v_returned integer;
  v_expected_cash numeric(12, 2);
  v_discrepancy numeric(12, 2);
  v_settlement_id uuid;
BEGIN
  SELECT * INTO v_dispatch
  FROM dispatches
  WHERE id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispatch not found';
  END IF;

  IF v_dispatch.status <> 'out' THEN
    RAISE EXCEPTION 'Dispatch already settled';
  END IF;

  IF p_quantity_sold IS NULL OR p_quantity_sold < 0 THEN
    RAISE EXCEPTION 'Quantity sold must be a non-negative whole number';
  END IF;

  IF p_quantity_sold > v_dispatch.quantity_taken THEN
    RAISE EXCEPTION 'Cannot sell more than taken';
  END IF;

  v_returned := v_dispatch.quantity_taken - p_quantity_sold;
  v_price := COALESCE(public.get_price_at(v_dispatch.product_type_id, now()), 0);
  v_expected_cash := round(p_quantity_sold * v_price, 2);
  v_discrepancy := round(COALESCE(p_cash_received, 0) - v_expected_cash, 2);

  INSERT INTO settlements (
    dispatch_id,
    city_id,
    quantity_sold,
    quantity_returned,
    price_at_settlement,
    expected_cash,
    cash_received,
    cash_discrepancy,
    settled_by,
    notes
  ) VALUES (
    p_dispatch_id,
    v_dispatch.city_id,
    p_quantity_sold,
    v_returned,
    v_price,
    v_expected_cash,
    COALESCE(p_cash_received, 0),
    v_discrepancy,
    p_manager_id,
    p_notes
  )
  RETURNING id INTO v_settlement_id;

  UPDATE dispatches
  SET status = 'settled'
  WHERE id = p_dispatch_id;

  IF v_returned > 0 THEN
    PERFORM public.adjust_stock_ledger(
      v_dispatch.city_id,
      v_dispatch.product_type_id,
      v_returned
    );
  END IF;

  IF v_discrepancy <> 0 THEN
    UPDATE driver_account_balance
    SET balance_owed = balance_owed - v_discrepancy
    WHERE driver_id = v_dispatch.driver_id;

    INSERT INTO driver_cash_transactions (
      driver_id,
      transaction_type,
      amount,
      settlement_id,
      description,
      recorded_by
    ) VALUES (
      v_dispatch.driver_id,
      'discrepancy',
      v_discrepancy,
      v_settlement_id,
      'Cash discrepancy on settlement',
      p_manager_id
    );
  END IF;

  RETURN v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_settlement(
  p_id uuid,
  p_quantity_sold integer,
  p_cash_received numeric,
  p_reason text,
  p_manager_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old settlements%ROWTYPE;
  v_dispatch dispatches%ROWTYPE;
  v_price numeric(12, 2);
  v_returned integer;
  v_expected_cash numeric(12, 2);
  v_discrepancy numeric(12, 2);
  v_old_discrepancy numeric(12, 2);
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required for edits';
  END IF;

  SELECT * INTO v_old FROM settlements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found';
  END IF;

  SELECT * INTO v_dispatch FROM dispatches WHERE id = v_old.dispatch_id FOR UPDATE;

  IF p_quantity_sold IS NULL OR p_quantity_sold < 0 THEN
    RAISE EXCEPTION 'Quantity sold must be a non-negative whole number';
  END IF;

  IF p_quantity_sold > v_dispatch.quantity_taken THEN
    RAISE EXCEPTION 'Cannot sell more than taken';
  END IF;

  v_old_discrepancy := v_old.cash_discrepancy;
  v_returned := v_dispatch.quantity_taken - p_quantity_sold;
  v_price := v_old.price_at_settlement;
  v_expected_cash := round(p_quantity_sold * v_price, 2);
  v_discrepancy := round(COALESCE(p_cash_received, 0) - v_expected_cash, 2);

  IF v_returned <> v_old.quantity_returned THEN
    PERFORM public.adjust_stock_ledger(
      v_dispatch.city_id,
      v_dispatch.product_type_id,
      v_returned - v_old.quantity_returned
    );
  END IF;

  UPDATE settlements
  SET
    quantity_sold = p_quantity_sold,
    quantity_returned = v_returned,
    expected_cash = v_expected_cash,
    cash_received = COALESCE(p_cash_received, 0),
    cash_discrepancy = v_discrepancy
  WHERE id = p_id;

  IF v_discrepancy <> v_old_discrepancy THEN
    UPDATE driver_account_balance
    SET balance_owed = balance_owed + v_old_discrepancy - v_discrepancy
    WHERE driver_id = v_dispatch.driver_id;
  END IF;

  PERFORM public.log_edit(
    'settlements',
    p_id,
    p_manager_id,
    p_reason,
    to_jsonb(v_old),
    jsonb_build_object(
      'quantity_sold', p_quantity_sold,
      'cash_received', p_cash_received,
      'cash_discrepancy', v_discrepancy
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_daily_production(
  p_date date,
  p_product_type_id uuid,
  p_quantity_produced integer,
  p_manager_id uuid,
  p_city_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous integer;
  v_current integer;
  v_row daily_production%ROWTYPE;
  v_is_daily boolean;
BEGIN
  IF p_quantity_produced IS NULL OR p_quantity_produced <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive whole number';
  END IF;

  SELECT is_daily_cycle INTO v_is_daily
  FROM product_types
  WHERE id = p_product_type_id;

  IF NOT FOUND OR NOT v_is_daily THEN
    RAISE EXCEPTION 'Product is not a daily-cycle product';
  END IF;

  PERFORM public.ensure_stock_ledger_row(p_city_id, p_product_type_id);

  SELECT current_quantity
  INTO v_previous
  FROM stock_ledger
  WHERE city_id = p_city_id
    AND product_type_id = p_product_type_id
  FOR UPDATE;

  v_current := v_previous + p_quantity_produced;

  INSERT INTO daily_production (
    date,
    city_id,
    product_type_id,
    previous_stock,
    quantity_produced,
    current_stock,
    recorded_by
  ) VALUES (
    p_date,
    p_city_id,
    p_product_type_id,
    v_previous,
    p_quantity_produced,
    v_current,
    p_manager_id
  )
  RETURNING * INTO v_row;

  UPDATE stock_ledger
  SET current_quantity = v_current
  WHERE city_id = p_city_id
    AND product_type_id = p_product_type_id;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_daily_production(
  p_id uuid,
  p_quantity_produced integer,
  p_reason text,
  p_manager_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old daily_production%ROWTYPE;
  v_delta integer;
  v_new_current integer;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required for edits';
  END IF;

  SELECT * INTO v_old FROM daily_production WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production record not found';
  END IF;

  IF p_quantity_produced IS NULL OR p_quantity_produced <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive whole number';
  END IF;

  v_delta := p_quantity_produced - v_old.quantity_produced;
  v_new_current := v_old.previous_stock + p_quantity_produced;

  UPDATE daily_production
  SET
    quantity_produced = p_quantity_produced,
    current_stock = v_new_current
  WHERE id = p_id;

  PERFORM public.adjust_stock_ledger(v_old.city_id, v_old.product_type_id, v_delta);

  PERFORM public.log_edit(
    'daily_production',
    p_id,
    p_manager_id,
    p_reason,
    to_jsonb(v_old),
    jsonb_build_object('quantity_produced', p_quantity_produced)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_pack_restock(
  p_product_type_id uuid,
  p_packs_added integer,
  p_manager_id uuid,
  p_city_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_units integer;
  v_row pack_restocks%ROWTYPE;
  v_is_daily boolean;
BEGIN
  IF p_packs_added IS NULL OR p_packs_added <= 0 THEN
    RAISE EXCEPTION 'Packs must be a positive whole number';
  END IF;

  SELECT is_daily_cycle INTO v_is_daily
  FROM product_types
  WHERE id = p_product_type_id;

  IF NOT FOUND OR v_is_daily THEN
    RAISE EXCEPTION 'Product is not a pack product';
  END IF;

  v_units := public.stock_units_for_packs(p_product_type_id, p_packs_added);

  INSERT INTO pack_restocks (
    city_id,
    product_type_id,
    packs_added,
    recorded_by
  ) VALUES (
    p_city_id,
    p_product_type_id,
    p_packs_added,
    p_manager_id
  )
  RETURNING * INTO v_row;

  PERFORM public.adjust_stock_ledger(p_city_id, p_product_type_id, v_units);

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_factory_sale(
  p_items jsonb,
  p_payment_method text,
  p_amount_paid numeric,
  p_notes text,
  p_manager_id uuid,
  p_city_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_item jsonb;
  v_product_type_id uuid;
  v_quantity integer;
  v_price numeric(12, 2);
  v_subtotal numeric(12, 2);
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  IF p_payment_method NOT IN ('cash', 'transfer') THEN
    RAISE EXCEPTION 'Payment method must be cash or transfer';
  END IF;

  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'Valid amount_paid is required';
  END IF;

  INSERT INTO factory_sales (
    city_id,
    payment_method,
    amount_paid,
    notes,
    recorded_by
  ) VALUES (
    p_city_id,
    p_payment_method,
    p_amount_paid,
    p_notes,
    p_manager_id
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_type_id := (v_item ->> 'product_type_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Each item quantity must be positive';
    END IF;

    v_price := COALESCE(public.get_price_at(v_product_type_id, now()), 0);
    v_subtotal := round(v_quantity * v_price, 2);

    INSERT INTO factory_sale_items (
      factory_sale_id,
      product_type_id,
      quantity,
      price_at_sale,
      subtotal
    ) VALUES (
      v_sale_id,
      v_product_type_id,
      v_quantity,
      v_price,
      v_subtotal
    );

    PERFORM public.adjust_stock_ledger(p_city_id, v_product_type_id, -v_quantity);
  END LOOP;

  INSERT INTO factory_sale_payments (
    factory_sale_id,
    payment_method,
    amount,
    recorded_by
  ) VALUES (
    v_sale_id,
    p_payment_method,
    p_amount_paid,
    p_manager_id
  );

  RETURN jsonb_build_object('sale_id', v_sale_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_factory_use(
  p_items jsonb,
  p_note text,
  p_manager_id uuid,
  p_city_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_use_id uuid;
  v_item jsonb;
  v_product_type_id uuid;
  v_quantity integer;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  INSERT INTO factory_use (
    city_id,
    note,
    recorded_by
  ) VALUES (
    p_city_id,
    p_note,
    p_manager_id
  )
  RETURNING id INTO v_use_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_type_id := (v_item ->> 'product_type_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Each item quantity must be positive';
    END IF;

    INSERT INTO factory_use_items (
      factory_use_id,
      product_type_id,
      quantity
    ) VALUES (
      v_use_id,
      v_product_type_id,
      v_quantity
    );

    PERFORM public.adjust_stock_ledger(p_city_id, v_product_type_id, -v_quantity);
  END LOOP;

  RETURN jsonb_build_object('use_id', v_use_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_driver_payment(
  p_driver_id uuid,
  p_amount numeric,
  p_notes text,
  p_manager_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Driver and positive payment amount required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM drivers WHERE id = p_driver_id) THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;

  INSERT INTO driver_cash_transactions (
    driver_id,
    transaction_type,
    amount,
    description,
    recorded_by
  ) VALUES (
    p_driver_id,
    'payment',
    p_amount,
    p_notes,
    p_manager_id
  )
  RETURNING id INTO v_tx_id;

  UPDATE driver_account_balance
  SET balance_owed = balance_owed - p_amount
  WHERE driver_id = p_driver_id;

  RETURN v_tx_id;
END;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_account_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_production ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_restocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_use ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_use_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_log ENABLE ROW LEVEL SECURITY;

-- Cities
CREATE POLICY cities_select_authenticated ON cities
  FOR SELECT TO authenticated
  USING (public.is_manager());

CREATE POLICY cities_write_super_admin ON cities
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Managers
CREATE POLICY managers_select_self_or_super ON managers
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin());

CREATE POLICY managers_write_super_admin ON managers
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Product catalog
CREATE POLICY product_types_select ON product_types
  FOR SELECT TO authenticated
  USING (public.is_manager());

CREATE POLICY product_types_write_super_admin ON product_types
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- City-scoped inventory and operations
CREATE POLICY stock_ledger_city_access ON stock_ledger
  FOR ALL TO authenticated
  USING (public.manager_has_city_access(city_id))
  WITH CHECK (public.manager_has_city_access(city_id));

CREATE POLICY daily_production_city_access ON daily_production
  FOR ALL TO authenticated
  USING (public.manager_has_city_access(city_id))
  WITH CHECK (public.manager_has_city_access(city_id));

CREATE POLICY pack_restocks_city_access ON pack_restocks
  FOR ALL TO authenticated
  USING (public.manager_has_city_access(city_id))
  WITH CHECK (public.manager_has_city_access(city_id));

CREATE POLICY dispatches_city_access ON dispatches
  FOR ALL TO authenticated
  USING (public.manager_has_city_access(city_id))
  WITH CHECK (public.manager_has_city_access(city_id));

CREATE POLICY settlements_city_access ON settlements
  FOR ALL TO authenticated
  USING (public.manager_has_city_access(city_id))
  WITH CHECK (public.manager_has_city_access(city_id));

CREATE POLICY factory_sales_city_access ON factory_sales
  FOR ALL TO authenticated
  USING (public.manager_has_city_access(city_id))
  WITH CHECK (public.manager_has_city_access(city_id));

CREATE POLICY factory_use_city_access ON factory_use
  FOR ALL TO authenticated
  USING (public.manager_has_city_access(city_id))
  WITH CHECK (public.manager_has_city_access(city_id));

CREATE POLICY monthly_archives_city_access ON monthly_archives
  FOR ALL TO authenticated
  USING (public.manager_has_city_access(city_id))
  WITH CHECK (public.manager_has_city_access(city_id));

-- Drivers and balances inherit city from drivers.city_id
CREATE POLICY drivers_city_access ON drivers
  FOR ALL TO authenticated
  USING (public.manager_has_city_access(city_id))
  WITH CHECK (public.manager_has_city_access(city_id));

CREATE POLICY driver_account_balance_city_access ON driver_account_balance
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = driver_account_balance.driver_id
        AND public.manager_has_city_access(d.city_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = driver_account_balance.driver_id
        AND public.manager_has_city_access(d.city_id)
    )
  );

CREATE POLICY driver_cash_transactions_city_access ON driver_cash_transactions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = driver_cash_transactions.driver_id
        AND public.manager_has_city_access(d.city_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = driver_cash_transactions.driver_id
        AND public.manager_has_city_access(d.city_id)
    )
  );

-- Child tables follow parent access
CREATE POLICY factory_sale_items_access ON factory_sale_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM factory_sales s
      WHERE s.id = factory_sale_items.factory_sale_id
        AND public.manager_has_city_access(s.city_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factory_sales s
      WHERE s.id = factory_sale_items.factory_sale_id
        AND public.manager_has_city_access(s.city_id)
    )
  );

CREATE POLICY factory_sale_payments_access ON factory_sale_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM factory_sales s
      WHERE s.id = factory_sale_payments.factory_sale_id
        AND public.manager_has_city_access(s.city_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factory_sales s
      WHERE s.id = factory_sale_payments.factory_sale_id
        AND public.manager_has_city_access(s.city_id)
    )
  );

CREATE POLICY factory_use_items_access ON factory_use_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM factory_use u
      WHERE u.id = factory_use_items.factory_use_id
        AND public.manager_has_city_access(u.city_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factory_use u
      WHERE u.id = factory_use_items.factory_use_id
        AND public.manager_has_city_access(u.city_id)
    )
  );

-- Shared reference / settings data
CREATE POLICY price_history_select ON price_history
  FOR SELECT TO authenticated
  USING (public.is_manager());

CREATE POLICY price_history_write ON price_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());

CREATE POLICY app_settings_select ON app_settings
  FOR SELECT TO authenticated
  USING (public.is_manager());

CREATE POLICY app_settings_write ON app_settings
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY edit_log_select ON edit_log
  FOR SELECT TO authenticated
  USING (public.is_manager());

CREATE POLICY edit_log_insert ON edit_log
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid() OR public.is_super_admin());

-- =============================================================================
-- Storage bucket (driver license uploads — used by /api/drivers/profile)
-- =============================================================================
-- Create in Supabase dashboard or via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('driver-licenses', 'driver-licenses', true);
-- Then add storage policies allowing authenticated managers to upload/read objects
-- under paths matching their city's drivers.
