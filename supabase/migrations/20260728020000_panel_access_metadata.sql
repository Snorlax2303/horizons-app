-- Common operational metadata for one customer access in an external panel.
-- Passwords are deliberately excluded: they remain only in the source panel.
ALTER TABLE public.customer_panel_targets
  ADD COLUMN IF NOT EXISTS access_type TEXT NOT NULL DEFAULT 'direct'
    CHECK (access_type IN ('test', 'direct', 'converted_test', 'additional_screen')),
  ADD COLUMN IF NOT EXISTS adult_profile BOOLEAN,
  ADD COLUMN IF NOT EXISTS test_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (test_status IN ('not_applicable', 'active', 'converted', 'expired', 'cancelled')),
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS customer_panel_targets_validity_idx
  ON public.customer_panel_targets(user_id, active, valid_until);

COMMENT ON COLUMN public.customer_panel_targets.access_type IS
  'test, direct sale, converted test, or additional screen created after a test.';
COMMENT ON COLUMN public.customer_panel_targets.adult_profile IS
  'Whether this individual access includes adult content; null when the panel does not expose the option.';
COMMENT ON COLUMN public.customer_panel_targets.test_status IS
  'Lifecycle for tests. Direct accesses use not_applicable.';
COMMENT ON COLUMN public.customer_panel_targets.valid_until IS
  'Expiration confirmed in the external panel. No password is stored in Horizons.';
