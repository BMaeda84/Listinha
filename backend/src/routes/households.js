import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/client.js';

const router = Router();

const DEFAULT_ROOMS = [
  { name: 'Cozinha', icon: '🍳', sort_order: 0 },
  { name: 'Banheiro', icon: '🚿', sort_order: 1 },
  { name: 'Quarto', icon: '🛏️', sort_order: 2 },
  { name: 'Lavanderia', icon: '🧺', sort_order: 3 },
  { name: 'Área Externa', icon: '🌿', sort_order: 4 },
  { name: 'Gatos', icon: '🐱', sort_order: 5 },
];

// Cria um novo domicílio com cômodos padrão
router.post('/', async (req, res) => {
  const { name } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'INSERT INTO households (name) VALUES ($1) RETURNING *',
      [name || 'Minha Casa']
    );
    const household = rows[0];

    for (const room of DEFAULT_ROOMS) {
      await client.query(
        'INSERT INTO rooms (household_id, name, icon, sort_order) VALUES ($1, $2, $3, $4)',
        [household.id, room.name, room.icon, room.sort_order]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(household);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar domicílio' });
  } finally {
    client.release();
  }
});

// Busca domicílio por ID (com cômodos)
router.get('/:id', async (req, res) => {
  try {
    const { rows: hh } = await pool.query(
      'SELECT * FROM households WHERE id = $1',
      [req.params.id]
    );
    if (!hh.length) return res.status(404).json({ error: 'Não encontrado' });

    const { rows: rooms } = await pool.query(
      'SELECT * FROM rooms WHERE household_id = $1 ORDER BY sort_order',
      [req.params.id]
    );

    res.json({ ...hh[0], rooms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
