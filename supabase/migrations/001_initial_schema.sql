-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Planos table
CREATE TABLE planos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT,
  valor_padrao DECIMAL(10, 2) NOT NULL,
  qtd_acessos_padrao INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Clientes table
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  telefone_e164 TEXT NOT NULL,
  plano_id UUID REFERENCES planos(id),
  qtd_acessos INTEGER,
  valor DECIMAL(10, 2),
  dia_vencimento INTEGER CHECK (dia_vencimento >= 1 AND dia_vencimento <= 28),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Templates table
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  is_padrao BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campanhas table
CREATE TABLE campanhas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referencia_mes INTEGER CHECK (referencia_mes >= 0 AND referencia_mes <= 11),
  referencia_ano INTEGER,
  template_id UUID REFERENCES templates(id),
  segmento TEXT,
  status TEXT DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'agendado', 'executando', 'concluido', 'cancelado')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Envios table
CREATE TABLE envios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campanha_id UUID REFERENCES campanhas(id),
  cliente_id UUID REFERENCES clientes(id),
  telefone_destino TEXT NOT NULL,
  mensagem_renderizada TEXT NOT NULL,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'entregue', 'falha')),
  tentativas INTEGER DEFAULT 0,
  wapi_message_id TEXT,
  error_detail TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campanha_id, cliente_id)
);

-- Audit logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  entidade TEXT NOT NULL,
  entidade_id UUID,
  acao TEXT NOT NULL,
  diff_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_clientes_plano ON clientes(plano_id);
CREATE INDEX idx_clientes_status ON clientes(status);
CREATE INDEX idx_clientes_telefone ON clientes(telefone_e164);
CREATE INDEX idx_campanhas_status ON campanhas(status);
CREATE INDEX idx_envios_campanha ON envios(campanha_id);
CREATE INDEX idx_envios_status ON envios(status);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entidade ON audit_logs(entidade, entidade_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planos_updated_at BEFORE UPDATE ON planos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campanhas_updated_at BEFORE UPDATE ON campanhas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_envios_updated_at BEFORE UPDATE ON envios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();