ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS referral_link_id UUID REFERENCES public.referral_links(id) ON DELETE SET NULL;

ALTER TABLE public.referral_links
  ADD COLUMN IF NOT EXISTS reward_value NUMERIC(12,2) NOT NULL DEFAULT 15.00;

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_link_id UUID NOT NULL REFERENCES public.referral_links(id) ON DELETE RESTRICT,
  referred_customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reward_value NUMERIC(12,2) NOT NULL CHECK (reward_value >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'eligible', 'granted', 'cancelled')),
  eligible_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referred_customer_id)
);

CREATE INDEX IF NOT EXISTS prospects_referral_link_idx ON public.prospects(referral_link_id);
CREATE INDEX IF NOT EXISTS referral_rewards_user_status_idx ON public.referral_rewards(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_rewards_referred_customer_idx ON public.referral_rewards(referred_customer_id);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_rewards_owner" ON public.referral_rewards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
