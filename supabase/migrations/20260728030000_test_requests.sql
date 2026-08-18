CREATE TABLE IF NOT EXISTS public.test_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  panel_connection_id UUID REFERENCES public.panel_connections(id) ON DELETE SET NULL,
  panel_provider TEXT NOT NULL CHECK (panel_provider IN ('unix', 'union', 'now')),
  adult_profile BOOLEAN NOT NULL DEFAULT false,
  requested_screens INTEGER NOT NULL DEFAULT 1 CHECK (requested_screens = 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'creating', 'sent', 'converted', 'expired', 'cancelled')),
  client_reference TEXT,
  external_username TEXT,
  valid_until TIMESTAMPTZ,
  instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_requests_user_status_idx ON public.test_requests(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS test_requests_prospect_idx ON public.test_requests(prospect_id, created_at DESC);
ALTER TABLE public.test_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test_requests_owner" ON public.test_requests FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS test_requests_updated_at ON public.test_requests;
CREATE TRIGGER test_requests_updated_at BEFORE UPDATE ON public.test_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
