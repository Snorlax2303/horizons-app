CREATE TABLE IF NOT EXISTS public.referral_program_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_month_discount NUMERIC(12,2) NOT NULL DEFAULT 5.00 CHECK (first_month_discount >= 0),
  referral_credit NUMERIC(12,2) NOT NULL DEFAULT 15.00 CHECK (referral_credit >= 0),
  milestone_referrals INTEGER NOT NULL DEFAULT 3 CHECK (milestone_referrals > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_referral_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  referral_link_id UUID NOT NULL REFERENCES public.referral_links(id) ON DELETE RESTRICT,
  first_month_discount NUMERIC(12,2) NOT NULL CHECK (first_month_discount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'cancelled')),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  beneficiary_customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  referral_reward_id UUID REFERENCES public.referral_rewards(id) ON DELETE SET NULL,
  benefit_type TEXT NOT NULL CHECK (benefit_type IN ('credit', 'free_month')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  cycle_month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'eligible' CHECK (status IN ('eligible', 'applied', 'cancelled')),
  applied_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_benefits_customer_cycle_idx ON public.referral_benefits(beneficiary_customer_id, cycle_month, status);
CREATE INDEX IF NOT EXISTS customer_referral_offers_customer_idx ON public.customer_referral_offers(customer_id, status);

ALTER TABLE public.referral_program_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_referral_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_benefits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_program_settings_owner" ON public.referral_program_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customer_referral_offers_owner" ON public.customer_referral_offers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "referral_benefits_owner" ON public.referral_benefits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.referral_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS referral_program_settings_updated_at ON public.referral_program_settings;
CREATE TRIGGER referral_program_settings_updated_at BEFORE UPDATE ON public.referral_program_settings
  FOR EACH ROW EXECUTE FUNCTION public.referral_settings_updated_at();
