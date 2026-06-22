import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db/client.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Normaliza texto para gerar fingerprint do produto.
 * Ex: "Omo Pó 3kg" → "omo_po_3kg"
 */
function makeFingerprint(brand, name, sizeUnit) {
  const parts = [brand, name, sizeUnit]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return parts;
}

/**
 * POST /api/scan/frame
 * Analisa um frame da câmera via Claude Vision.
 * Retorna lista de itens novos (não presentes no registry da sessão).
 */
router.post('/frame', async (req, res) => {
  const { image_base64, room_name, already_seen, scene_anchor, household_id } = req.body;

  if (!image_base64) {
    return res.status(400).json({ error: 'Imagem obrigatória' });
  }

  // Monta o prompt com contexto da sessão para evitar duplicatas
  const alreadySeenText = already_seen?.length
    ? `\nItens JÁ identificados nesta sessão (NÃO inclua na resposta):\n${already_seen.map(i => `- ${i}`).join('\n')}`
    : '';

  const sceneContext = scene_anchor
    ? `\nContexto do local: ${scene_anchor}`
    : '';

  const prompt = `Você está ajudando a montar uma lista de compras doméstica em português brasileiro.
Cômodo atual: ${room_name || 'Não especificado'}${sceneContext}${alreadySeenText}

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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image_base64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    let parsed;
    try {
      const raw = response.content[0].text.trim();
      parsed = JSON.parse(raw);
    } catch {
      // Claude às vezes inclui markdown mesmo pedindo JSON puro
      const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { items: [], scene_description: '' };
    }

    // Adiciona fingerprint a cada item e filtra por confiança mínima
    const items = (parsed.items || [])
      .filter(item => (item.confidence || 0) >= 0.6)
      .map(item => ({
        ...item,
        fingerprint: makeFingerprint(item.brand, item.name, item.size_unit),
      }));

    res.json({
      items,
      scene_description: parsed.scene_description || '',
    });
  } catch (err) {
    console.error('Erro Claude Vision:', err);
    res.status(500).json({ error: 'Erro ao analisar imagem' });
  }
});

/**
 * POST /api/scan/barcode
 * Resolve um código de barras para produto.
 * Primeiro busca no catálogo local; fallback futuro: Open Food Facts.
 */
router.post('/barcode', async (req, res) => {
  const { barcode, household_id } = req.body;

  if (!barcode) return res.status(400).json({ error: 'Código obrigatório' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE barcode = $1 AND (household_id = $2 OR household_id IS NULL)',
      [barcode, household_id]
    );

    if (rows.length) {
      return res.json({ found: true, product: rows[0] });
    }

    // Produto não encontrado no catálogo local
    res.json({ found: false, barcode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/scan/add-item
 * Adiciona um item identificado à lista, criando o produto se necessário.
 */
router.post('/add-item', async (req, res) => {
  const { list_id, room_id, household_id, product_data, qty } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Upsert do produto no catálogo
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
          product_data.name,
          product_data.brand || null,
          product_data.barcode || null,
          product_data.size_unit || null,
          product_data.category || 'outros',
          fp,
        ]
      );
      product = rows[0];
    }

    // Verifica se item já está na lista
    const { rows: existingItem } = await client.query(
      'SELECT * FROM list_items WHERE list_id = $1 AND product_id = $2',
      [list_id, product.id]
    );

    let item;
    if (existingItem.length) {
      // Incrementa quantidade se item já existe
      const { rows } = await client.query(
        'UPDATE list_items SET qty_needed = qty_needed + $1 WHERE id = $2 RETURNING *',
        [qty || 1, existingItem[0].id]
      );
      item = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO list_items (list_id, product_id, room_id, qty_needed)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [list_id, product.id, room_id || null, qty || 1]
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
