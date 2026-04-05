-- Create api_configs table for storing integration credentials
CREATE TABLE api_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  config_key TEXT NOT NULL,
  config_value TEXT NOT NULL, -- In a real production environment, ensure this column stores encrypted data
  provider TEXT NOT NULL CHECK (provider IN ('wapi', 'gemini', 'openai', 'other')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, config_key)
);

-- Index for faster lookups
CREATE INDEX idx_api_configs_user_provider ON api_configs(user_id, provider);

-- Trigger for updated_at
CREATE TRIGGER update_api_configs_updated_at BEFORE UPDATE ON api_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();