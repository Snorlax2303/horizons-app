CREATE TABLE IF NOT EXISTS public.panel_notification_settings (
  panel_connection_id UUID PRIMARY KEY REFERENCES public.panel_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL CHECK (whatsapp_number ~ '^[0-9]{8,32}$'),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.panel_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "panel_notification_settings_owner" ON public.panel_notification_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS panel_notification_settings_updated_at ON public.panel_notification_settings;
CREATE TRIGGER panel_notification_settings_updated_at BEFORE UPDATE ON public.panel_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
