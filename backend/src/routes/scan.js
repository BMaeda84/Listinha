import { Router } from 'express';
import OpenAI from 'openai';
import pool from '../db/client.js';

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

// Remove caracteres que poderiam injetar instruções no prompt do Claude
function sanitizeForPrompt(str, maxLen = 100) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>\[\]{}\\`]/g, '')
    .replace(/\n|\r/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function makeFingerprint(brand, name, sizeUnit) {
  const parts = [brand, name, sizeUnit]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return parts;
}

/**
 * POST /api/scan/frame
 */
router.post('/frame', async (req, res) => {
  const { image_base64, room_name, already_seen, scene_anchor, household_id } = req.body;

  if (!image_base64 || typeof image_base64 !== 'string') {
    return res.status(400).json({ error: 'Imagem obrigatória' });
  }

  // Imagem base64 JPEG ~1MB ≈ 1.37M chars
  if (image_base64.length > 2_000_000) {
    return res.status(400).json({ error: 'Imagem muito grande (máx 1.5MB)' });
  }

  // Sanitiza entradas que vão para o prompt — evita prompt injection
  const safeRoomName = sanitizeForPrompt(room_name, 50);
  const safeAnchor = sanitizeForPrompt(scene_anchor, 150);

  // already_seen deve ser array de strings curtas (nomes de exibição, não fingerprints)
  const safeAlreadySeen = Array.isArray(already_seen)
    ? already_seen
        .filter(s => typeof s === 'string')
        .map(s => sanitizeForPrompt(s, 80))
        .slice(0, 50)  // máx 50 itens por sessão
    : [];

  const alreadySeenText = safeAlreadySeen.length
    ? `\nItens JÁ identificados nesta sessão (NÃO inclua na resposta):\n${safeAlreadySeen.map(i => `- ${i}`).join('\n')}`
    : '';

  const sceneContext = safeAnchor
    ? `\nContexto do local: ${safeAnchor}`
    : '';

  const prompt = `Você está ajudando a montar uma lista de compras doméstica em português brasileiro.
Cômodo atual: ${safeRoomName || 'Não especificado'}${sceneContext}${alreadySeenText}

Analise esta imagem e identifique produtos domésticos visíveis (alimentos, limpeza, higiene, ração para animais, etc.).

Retorne SOMENTE itens que NÃO estejam na lista de "já identificados" acima.
Para cada item novo, responda em JSON puro (sem markdown):

{
  "items": [
    {
      "name": "nome do produto",
      "brand": "marca (ou null se não visível)",
      "size_unit": "tamanho/quantidade (ex: 3kg, 500ml, ou null)",
      "category": "uma de: alimentação | limpeza | higiene | gatos | outros",
      "qty_visible": 1,
      "confidence": 0.9
    }
  ],
  "scene_description": "descrição curta do local/cena para uso futuro"
}

Se não houver itens novos, retorne: { "items": [], "scene_description": "..." }
Retorne APENAS o JSON, sem texto adicional.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${image_base64}`,
                detail: 'low',  // menor custo; suficiente para identificar produtos
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    let parsed;
    const raw = response.choices[0].message.content?.trim() ?? '';
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { items: [], scene_description: '' };
    }

    const VALID_CATEGORIES = new Set(['alimentação', 'limpeza', 'higiene', 'gatos', 'outros']);

    const items = (parsed.items || [])
      .filter(item => item && typeof item.name === 'string' && (item.confidence || 0) >= 0.6)
      .map(item => ({
        name: String(item.name).slice(0, 200),
        brand: item.brand ? String(item.brand).slice(0, 100) : null,
        size_unit: item.size_unit ? String(item.size_unit).slice(0, 50) : null,
        category: VALID_CATEGORIES.has(item.category) ? item.category : 'outros',
        qty_visible: Math.min(Math.max(1, parseInt(item.qty_visible) || 1), 99),
        confidence: item.confidence,
        fingerprint: makeFingerprint(item.brand, item.name, item.size_unit),
        // Nome de exibição para incluir em already_seen nas próximas chamadas
        display_name: [item.brand, item.name, item.size_unit].filter(Boolean).join(' ').slice(0, 80),
      }));

    res.json({
      items,
      scene_description: sanitizeForPrompt(parsed.scene_description, 150),
    });
  } catch (err) {
    console.error('Erro Claude Vision:', err);
    res.status(500).json({ error: 'Erro ao analisar imagem' });
  }
});

/**
 * POST /api/scan/barcode
 */
router.post('/barcode', async (req, res) => {
  const { barcode, household_id } = req.body;

  if (!barcode || typeof barcode !== 'string') {
    return res.status(400).json({ error: 'Código obrigatório' });
  }
  if (barcode.length > 50) {
    return res.status(400).json({ error: 'Código inválido' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE barcode = $1 AND (household_id = $2 OR household_id IS NULL)',
      [barcode, household_id || null]
    );

    if (rows.length) {
      return res.json({ found: true, product: rows[0] });
    }
    res.json({ found: false, barcode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/scan/add-item
 */
router.post('/add-item', async (req, res) => {
  const { list_id, room_id, household_id, product_data, qty } = req.body;

  // Validação de campos obrigatórios e formatos
  if (!isValidUUID(list_id)) {
    return res.status(400).json({ error: 'list_id inválido' });
  }
  if (!isValidUUID(household_id)) {
    return res.status(400).json({ error: 'household_id inválido' });
  }
  if (!product_data || typeof product_data.name !== 'string' || !product_data.name.trim()) {
    return res.status(400).json({ error: 'Nome do produto obrigatório' });
  }

  const safeQty = Math.min(Math.max(1, parseInt(qty) || 1), 99);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // IDOR: confirma que list_id pertence ao household_id
    const { rows: listCheck } = await client.query(
      'SELECT id FROM shopping_lists WHERE id = $1 AND household_id = $2 AND status = $3',
      [list_id, household_id, 'open']
    );
    if (!listCheck.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Lista não encontrada ou não autorizada' });
    }

    // Valida room_id se fornecido
    if (room_id !== undefined && room_id !== null && !isValidUUID(room_id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'room_id inválido' });
    }

    const fp = product_data.fingerprint || makeFingerprint(
      product_data.brand, product_data.name, product_data.size_unit
    );

    let product;
    const { rows: existing } = await client.query(
      'SELECT * FROM products WHERE fingerprint = $1',
      [fp]
    );

    if (existing.length) {
      product = existing[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO products (household_id, name, brand, barcode, size_unit, category, fingerprint)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          household_id,
          product_data.name.trim().slice(0, 200),
          product_data.brand ? String(product_data.brand).slice(0, 100) : null,
          product_data.barcode ? String(product_data.barcode).slice(0, 50) : null,
          product_data.size_unit ? String(product_data.size_unit).slice(0, 50) : null,
          product_data.category || 'outros',
          fp,
        ]
      );
      product = rows[0];
    }

    const { rows: existingItem } = await client.query(
      'SELECT * FROM list_items WHERE list_id = $1 AND product_id = $2',
      [list_id, product.id]
    );

    let item;
    if (existingItem.length) {
      const { rows } = await client.query(
        'UPDATE list_items SET qty_needed = qty_needed + $1 WHERE id = $2 RETURNING *',
        [safeQty, existingItem[0].id]
      );
      item = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO list_items (list_id, product_id, room_id, qty_needed)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [list_id, product.id, room_id || null, safeQty]
      );
      item = rows[0];
    }

    await client.query('COMMIT');
    res.status(201).json({ item, product });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar item' });
  } finally {
    client.release();
  }
});

export default router;
