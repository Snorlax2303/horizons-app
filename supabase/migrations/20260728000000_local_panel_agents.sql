-- A local panel agent is an outbound-only client running on the operator's computer.
-- Its enrollment secret is stored only as a SHA-256 hash.
CREATE TABLE IF NOT EXISTS public.panel_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  agent_key_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.panel_connections
  ADD COLUMN IF NOT EXISTS browser_location TEXT NOT NULL DEFAULT 'vps'
    CHECK (browser_location IN ('vps', 'local_agent')),
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.panel_agents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.panel_agent_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.panel_agents(id) ON DELETE CASCADE,
  panel_connection_id UUID NOT NULL REFERENCES public.panel_connections(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('open_browser', 'close_browser')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS panel_agents_user_idx ON public.panel_agents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS panel_agent_commands_next_idx ON public.panel_agent_commands(agent_id, status, created_at);
CREATE INDEX IF NOT EXISTS panel_connections_agent_idx ON public.panel_connections(agent_id);

ALTER TABLE public.panel_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_agent_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "panel_agents_owner" ON public.panel_agents FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "panel_agent_commands_owner" ON public.panel_agent_commands FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.panel_agents a WHERE a.id = agent_id AND a.user_id = auth.uid()));

DROP TRIGGER IF EXISTS panel_agents_updated_at ON public.panel_agents;
CREATE TRIGGER panel_agents_updated_at BEFORE UPDATE ON public.panel_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
