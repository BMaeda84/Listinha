import { Router } from 'express';
import pool from '../db/client.js';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

// Cria nova lista de compras
router.post('/', async (req, res) => {
  const { household_id, name } = req.body;
  if (!isValidUUID(household_id)) {
    return res.status(400).json({ error: 'household_id inválido' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO shopping_lists (household_id, name) VALUES ($1, $2) RETURNING *',
      [household_id, name || 'Lista de Compras']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar lista' });
  }
});

// Lista todas as listas de um domicílio
router.get('/household/:householdId', async (req, res) => {
  if (!isValidUUID(req.params.householdId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT sl.*, COUNT(li.id) AS total_items,
              COUNT(li.checked_at) AS checked_items
       FROM shopping_lists sl
       LEFT JOIN list_items li ON li.list_id = sl.id
       WHERE sl.household_id = $1
       GROUP BY sl.id
       ORDER BY sl.created_at DESC`,
      [req.params.householdId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Busca lista com todos os itens
router.get('/:id', async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const { rows: list } = await pool.query(
      'SELECT * FROM shopping_lists WHERE id = $1',
      [req.params.id]
    );
    if (!list.length) return res.status(404).json({ error: 'Não encontrada' });

    const { rows: items } = await pool.query(
      `SELECT li.*, p.name, p.brand, p.size_unit, p.category, p.fingerprint,
              r.name AS room_name, r.icon AS room_icon
       FROM list_items li
       JOIN products p ON p.id = li.product_id
       LEFT JOIN rooms r ON r.id = li.room_id
       WHERE li.list_id = $1
       ORDER BY r.sort_order, p.name`,
      [req.params.id]
    );

    res.json({ ...list[0], items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Marca item como comprado / desmarca
router.patch('/items/:itemId/check', async (req, res) => {
  if (!isValidUUID(req.params.itemId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const { checked } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE list_items
       SET checked_at = $1, qty_bought = CASE WHEN $1::TIMESTAMPTZ IS NOT NULL THEN qty_needed ELSE 0 END
       WHERE id = $2
       RETURNING *`,
      [checked ? new Date() : null, req.params.itemId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Finaliza uma lista e registra no histórico de compras
router.patch('/:id/complete', async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: list } = await client.query(
      `UPDATE shopping_lists SET status = 'done', completed_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!list.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    // Registra itens comprados no histórico
    const { rows: checkedItems } = await client.query(
      `SELECT li.product_id, li.qty_bought, sl.household_id
       FROM list_items li
       JOIN shopping_lists sl ON sl.id = li.list_id
       WHERE li.list_id = $1 AND li.checked_at IS NOT NULL`,
      [req.params.id]
    );

    for (const item of checkedItems) {
      await client.query(
        'INSERT INTO purchase_history (product_id, household_id, qty) VALUES ($1, $2, $3)',
        [item.product_id, item.household_id, item.qty_bought]
      );
    }

    await client.query('COMMIT');
    res.json(list[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

export default router;
