import { Router } from 'express';
import pool from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return typeof v === 'string' && UUID_RE.test(v); }

// Cria nova lista de compras
router.post('/', async (req, res) => {
  const { name } = req.body;
  const householdId = req.user.householdId;
  try {
    const { rows } = await pool.query(
      'INSERT INTO shopping_lists (household_id, name) VALUES ($1, $2) RETURNING *',
      [householdId, name?.trim().slice(0, 100) || 'Lista de Compras']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar lista' });
  }
});

// Lista todas as listas do household do usuário logado
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sl.*, COUNT(li.id)::int AS total_items,
              COUNT(li.checked_at)::int AS checked_items
       FROM shopping_lists sl
       LEFT JOIN list_items li ON li.list_id = sl.id
       WHERE sl.household_id = $1
       GROUP BY sl.id
       ORDER BY sl.created_at DESC`,
      [req.user.householdId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Busca lista com todos os itens (verifica ownership)
router.get('/:id', async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const { rows: list } = await pool.query(
      'SELECT * FROM shopping_lists WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (!list.length) return res.status(404).json({ error: 'Não encontrada' });

    const { rows: items } = await pool.query(
      `SELECT li.*, p.name, p.brand, p.size_unit, p.category, p.fingerprint,
              u.name AS added_by_name,
              r.name AS room_name, r.icon AS room_icon
       FROM list_items li
       JOIN products p ON p.id = li.product_id
       LEFT JOIN rooms r ON r.id = li.room_id
       LEFT JOIN users u ON u.id = li.added_by
       WHERE li.list_id = $1
       ORDER BY r.sort_order NULLS LAST, p.name`,
      [req.params.id]
    );

    res.json({ ...list[0], items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Marca item como comprado / desmarca (verifica ownership via list)
router.patch('/items/:itemId/check', async (req, res) => {
  if (!isValidUUID(req.params.itemId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const { checked } = req.body;
  try {
    // Verifica que o item pertence ao household do usuário
    const { rows: check } = await pool.query(
      `SELECT li.id FROM list_items li
       JOIN shopping_lists sl ON sl.id = li.list_id
       WHERE li.id = $1 AND sl.household_id = $2`,
      [req.params.itemId, req.user.householdId]
    );
    if (!check.length) return res.status(403).json({ error: 'Não autorizado' });

    const { rows } = await pool.query(
      `UPDATE list_items
       SET checked_at = $1,
           qty_bought = CASE WHEN $1::TIMESTAMPTZ IS NOT NULL THEN qty_needed ELSE 0 END
       WHERE id = $2 RETURNING *`,
      [checked ? new Date() : null, req.params.itemId]
    );
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
       WHERE id = $1 AND household_id = $2 RETURNING *`,
      [req.params.id, req.user.householdId]
    );
    if (!list.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const { rows: checkedItems } = await client.query(
      `SELECT product_id, qty_bought FROM list_items
       WHERE list_id = $1 AND checked_at IS NOT NULL`,
      [req.params.id]
    );

    for (const item of checkedItems) {
      await client.query(
        'INSERT INTO purchase_history (product_id, household_id, qty) VALUES ($1, $2, $3)',
        [item.product_id, req.user.householdId, item.qty_bought]
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
