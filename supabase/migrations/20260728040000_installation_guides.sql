CREATE TABLE IF NOT EXISTS public.installation_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  device_category TEXT NOT NULL CHECK (device_category IN ('smart_tv', 'android_tv', 'tv_box', 'mobile', 'computer', 'console', 'other')),
  manufacturer TEXT,
  model_hint TEXT,
  platform TEXT,
  recommended_panel TEXT CHECK (recommended_panel IN ('unix', 'union', 'now')),
  installation_method TEXT NOT NULL CHECK (installation_method IN ('app_store', 'downloader', 'direct_site', 'dns', 'other')),
  app_name TEXT,
  instructions TEXT NOT NULL,
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS installation_guides_lookup_idx ON public.installation_guides(user_id, active, device_category, manufacturer);
ALTER TABLE public.installation_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "installation_guides_owner" ON public.installation_guides FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS installation_guides_updated_at ON public.installation_guides;
CREATE TRIGGER installation_guides_updated_at BEFORE UPDATE ON public.installation_guides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
