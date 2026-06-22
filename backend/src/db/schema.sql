-- Schema do banco de dados da Listinha

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Domicílio (unidade familiar)
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL DEFAULT 'Minha Casa',
  pin_hash VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cômodos da casa
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(10) DEFAULT '📦',
  sort_order INT DEFAULT 0
);

-- Catálogo de produtos identificados
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  brand VARCHAR(100),
  barcode VARCHAR(50),
  size_unit VARCHAR(50),   -- "3kg", "500ml", etc.
  category VARCHAR(50),    -- "limpeza", "alimentação", "gatos", "higiene", etc.
  fingerprint VARCHAR(200) UNIQUE,  -- marca+produto+tamanho normalizado
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Listas de compras
CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL DEFAULT 'Lista de Compras',
  status VARCHAR(20) DEFAULT 'open',  -- 'open' | 'done'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Itens de uma lista
CREATE TABLE IF NOT EXISTS list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID REFERENCES shopping_lists(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  room_id UUID REFERENCES rooms(id),
  qty_needed INT DEFAULT 1,
  qty_bought INT DEFAULT 0,
  checked_at TIMESTAMPTZ,
  note VARCHAR(300)
);

-- Sessões de escaneamento
CREATE TABLE IF NOT EXISTS scan_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID REFERENCES shopping_lists(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id),
  mode VARCHAR(20) DEFAULT 'home',  -- 'home' | 'store'
  scene_anchor TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Histórico de compras (para inferência de padrões)
CREATE TABLE IF NOT EXISTS purchase_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  qty INT DEFAULT 1,
  purchased_at TIMESTAMPTZ DEFAULT NOW()
);

-- Padrões de recompra inferidos
CREATE TABLE IF NOT EXISTS restock_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) UNIQUE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  avg_days_interval FLOAT,
  next_predicted_at TIMESTAMPTZ,
  confidence FLOAT DEFAULT 0.0,  -- 0.0 a 1.0
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais de cômodos padrão (inseridos junto com novo household via app)
-- INSERT é feito pela aplicação ao criar o household
