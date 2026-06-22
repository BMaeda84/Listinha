import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/client.js';

const router = Router();

const SALT_ROUNDS = 12;

function generateInviteCode() {
  // 8 chars alfanuméricos maiúsculos, fáceis de digitar
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function signToken(user) {
  return jwt.sign(
    {
      userId:      user.id,
      householdId: user.household_id,
      name:        user.name,
      email:       user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '90d' }
  );
}

/** POST /api/auth/register — cria usuário + household */
router.post('/register', async (req, res) => {
  const { name, email, password, houseName } = req.body;

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows: [user] } = await client.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [name.trim().slice(0, 100), email.toLowerCase().trim(), password_hash]
    );

    // Gera invite_code único
    let invite_code;
    let attempts = 0;
    do {
      invite_code = generateInviteCode();
      const { rows } = await client.query(
        'SELECT id FROM households WHERE invite_code = $1',
        [invite_code]
      );
      if (!rows.length) break;
      attempts++;
    } while (attempts < 10);

    const { rows: [household] } = await client.query(
      `INSERT INTO households (name, owner_id, invite_code)
       VALUES ($1, $2, $3) RETURNING *`,
      [houseName?.trim().slice(0, 100) || 'Minha Casa', user.id, invite_code]
    );

    await client.query(
      `INSERT INTO household_members (household_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [household.id, user.id]
    );

    // Cômodos padrão
    const defaultRooms = [
      { name: 'Cozinha',     icon: '🍳', sort_order: 1 },
      { name: 'Banheiro',    icon: '🚿', sort_order: 2 },
      { name: 'Lavanderia',  icon: '🧺', sort_order: 3 },
      { name: 'Quarto',      icon: '🛏️', sort_order: 4 },
      { name: 'Gatos',       icon: '🐱', sort_order: 5 },
      { name: 'Outros',      icon: '📦', sort_order: 6 },
    ];
    for (const room of defaultRooms) {
      await client.query(
        'INSERT INTO rooms (household_id, name, icon, sort_order) VALUES ($1, $2, $3, $4)',
        [household.id, room.name, room.icon, room.sort_order]
      );
    }

    await client.query('COMMIT');

    const token = signToken({ ...user, household_id: household.id });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      household: { id: household.id, name: household.name, invite_code: household.invite_code },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro no registro:', err);
    res.status(500).json({ error: 'Erro ao criar conta' });
  } finally {
    client.release();
  }
});

/** POST /api/auth/login */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  }

  try {
    const { rows: [user] } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    // Busca o household do usuário
    const { rows: [member] } = await pool.query(
      `SELECT hm.household_id, h.name AS household_name, h.invite_code
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
       WHERE hm.user_id = $1
       ORDER BY hm.joined_at
       LIMIT 1`,
      [user.id]
    );

    if (!member) {
      return res.status(403).json({ error: 'Usuário sem household. Crie uma conta novamente.' });
    }

    const token = signToken({ ...user, household_id: member.household_id });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      household: {
        id:          member.household_id,
        name:        member.household_name,
        invite_code: member.invite_code,
      },
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

/** POST /api/auth/join — entrar em household via código de convite */
router.post('/join', async (req, res) => {
  const { name, email, password, invite_code } = req.body;

  if (!name?.trim() || !email?.trim() || !password || !invite_code?.trim()) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [household] } = await client.query(
      'SELECT * FROM households WHERE invite_code = $1',
      [invite_code.trim().toUpperCase()]
    );
    if (!household) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Código de convite inválido' });
    }

    const { rows: existing } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows: [user] } = await client.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [name.trim().slice(0, 100), email.toLowerCase().trim(), password_hash]
    );

    // Verifica se já é membro (não deveria, mas por segurança)
    const { rows: alreadyMember } = await client.query(
      'SELECT id FROM household_members WHERE household_id = $1 AND user_id = $2',
      [household.id, user.id]
    );
    if (!alreadyMember.length) {
      await client.query(
        `INSERT INTO household_members (household_id, user_id, role)
         VALUES ($1, $2, 'member')`,
        [household.id, user.id]
      );
    }

    await client.query('COMMIT');

    const token = signToken({ ...user, household_id: household.id });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      household: { id: household.id, name: household.name },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro no join:', err);
    res.status(500).json({ error: 'Erro ao entrar na casa' });
  } finally {
    client.release();
  }
});

/** GET /api/auth/me — retorna dados do usuário logado */
router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);

    const { rows: [member] } = await pool.query(
      `SELECT hm.role, h.name AS household_name, h.invite_code
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
       WHERE hm.user_id = $1 AND hm.household_id = $2`,
      [payload.userId, payload.householdId]
    );

    res.json({
      user: { id: payload.userId, name: payload.name, email: payload.email },
      household: {
        id:          payload.householdId,
        name:        member?.household_name,
        invite_code: member?.invite_code,
        role:        member?.role,
      },
    });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

export default router;
