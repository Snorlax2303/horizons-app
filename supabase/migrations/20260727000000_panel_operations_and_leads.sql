-- Panel connections and per-server automation targets. Apply after reviewing
-- the production schema; these tables intentionally do not modify existing
-- customers.server_ids data.
CREATE TABLE IF NOT EXISTS public.panel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  automation_mode TEXT NOT NULL DEFAULT 'manual' CHECK (automation_mode IN ('manual', 'automatic')),
  capabilities JSONB NOT NULL DEFAULT '{"lookup": true, "create_test": false, "renew": false}'::jsonb,
  session_status TEXT NOT NULL DEFAULT 'reconnect_required' CHECK (session_status IN ('connected', 'expired', 'reconnect_required', 'blocked')),
  proxy_label TEXT,
  encrypted_session BYTEA,
  session_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_panel_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  panel_connection_id UUID REFERENCES public.panel_connections(id) ON DELETE SET NULL,
  external_customer_id TEXT,
  external_username TEXT,
  external_plan TEXT,
  screens INTEGER NOT NULL DEFAULT 1 CHECK (screens > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.panel_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_event_id UUID REFERENCES public.payment_events(id) ON DELETE SET NULL,
  automation_job_id UUID REFERENCES public.automation_jobs(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_panel_target_id UUID REFERENCES public.customer_panel_targets(id) ON DELETE SET NULL,
  panel_connection_id UUID REFERENCES public.panel_connections(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create_test', 'renew_customer', 'lookup_customer')),
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('queued', 'processing', 'pending_approval', 'completed', 'failed', 'cancelled')),
  idempotency_key TEXT NOT NULL UNIQUE,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'new'
    CHECK (lifecycle_stage IN ('new', 'in_service', 'qualified', 'test_sent', 'payment_pending', 'converted', 'lost')),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  reward_status TEXT NOT NULL DEFAULT 'pending' CHECK (reward_status IN ('pending', 'eligible', 'granted', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS panel_connections_user_idx ON public.panel_connections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_panel_targets_customer_idx ON public.customer_panel_targets(customer_id, active);
CREATE INDEX IF NOT EXISTS panel_operations_user_status_idx ON public.panel_operations(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS panel_operations_payment_idx ON public.panel_operations(payment_event_id);
CREATE INDEX IF NOT EXISTS prospects_lifecycle_idx ON public.prospects(user_id, lifecycle_stage, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_events_prospect_idx ON public.lead_events(prospect_id, created_at DESC);

ALTER TABLE public.panel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_panel_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "panel_connections_owner" ON public.panel_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customer_panel_targets_owner" ON public.customer_panel_targets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "panel_operations_owner" ON public.panel_operations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lead_events_owner" ON public.lead_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "referral_links_owner" ON public.referral_links FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS panel_connections_updated_at ON public.panel_connections;
CREATE TRIGGER panel_connections_updated_at BEFORE UPDATE ON public.panel_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS customer_panel_targets_updated_at ON public.customer_panel_targets;
CREATE TRIGGER customer_panel_targets_updated_at BEFORE UPDATE ON public.customer_panel_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS panel_operations_updated_at ON public.panel_operations;
CREATE TRIGGER panel_operations_updated_at BEFORE UPDATE ON public.panel_operations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
