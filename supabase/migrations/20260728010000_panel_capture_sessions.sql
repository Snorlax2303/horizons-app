CREATE TABLE IF NOT EXISTS public.panel_capture_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  panel_connection_id UUID NOT NULL REFERENCES public.panel_connections(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.panel_agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.panel_capture_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_session_id UUID NOT NULL REFERENCES public.panel_capture_sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('page', 'click', 'error')),
  page_url TEXT,
  page_title TEXT,
  selector TEXT,
  element_text TEXT,
  dom_outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  screenshot_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (capture_session_id, sequence)
);

ALTER TABLE public.panel_agent_commands DROP CONSTRAINT IF EXISTS panel_agent_commands_action_check;
ALTER TABLE public.panel_agent_commands ADD CONSTRAINT panel_agent_commands_action_check
  CHECK (action IN ('open_browser', 'close_browser', 'start_capture', 'stop_capture'));

CREATE INDEX IF NOT EXISTS panel_capture_sessions_connection_idx ON public.panel_capture_sessions(panel_connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS panel_capture_events_session_idx ON public.panel_capture_events(capture_session_id, sequence);

ALTER TABLE public.panel_capture_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_capture_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "panel_capture_sessions_owner" ON public.panel_capture_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "panel_capture_events_owner" ON public.panel_capture_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.panel_capture_sessions s WHERE s.id = capture_session_id AND s.user_id = auth.uid()));
