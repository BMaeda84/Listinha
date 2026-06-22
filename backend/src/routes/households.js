import { Router } from 'express';
import pool from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Retorna o household do usuário logado (com cômodos e membros)
router.get('/me', async (req, res) => {
  try {
    const { rows: hh } = await pool.query(
      'SELECT * FROM households WHERE id = $1',
      [req.user.householdId]
    );
    if (!hh.length) return res.status(404).json({ error: 'Não encontrado' });

    const { rows: rooms } = await pool.query(
      'SELECT * FROM rooms WHERE household_id = $1 ORDER BY sort_order',
      [req.user.householdId]
    );

    const { rows: members } = await pool.query(
      `SELECT u.id, u.name, u.email, hm.role, hm.joined_at
       FROM household_members hm
       JOIN users u ON u.id = hm.user_id
       WHERE hm.household_id = $1
       ORDER BY hm.joined_at`,
      [req.user.householdId]
    );

    res.json({ ...hh[0], rooms, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
