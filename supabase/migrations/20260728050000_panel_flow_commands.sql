ALTER TABLE public.panel_agent_commands DROP CONSTRAINT IF EXISTS panel_agent_commands_action_check;
ALTER TABLE public.panel_agent_commands ADD CONSTRAINT panel_agent_commands_action_check
  CHECK (action IN ('open_browser', 'close_browser', 'start_capture', 'stop_capture', 'run_panel_flow'));
