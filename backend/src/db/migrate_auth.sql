-- Migração: suporte a usuários e membros de household

-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Membros de cada household (N usuários por casa, 1 casa por usuário por ora)
CREATE TABLE IF NOT EXISTS household_members (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  role         VARCHAR(20) DEFAULT 'member',  -- 'owner' | 'member'
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- Código de convite (8 chars) e dono da casa
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS invite_code VARCHAR(8) UNIQUE,
  ADD COLUMN IF NOT EXISTS owner_id    UUID REFERENCES users(id);

-- Quem adicionou cada item (auditoria leve)
ALTER TABLE list_items
  ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES users(id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_household_members_user     ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_users_email                ON users(email);
