import { Router } from 'express';
import { pool } from '../db/pool.js';

export const router = Router();

router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT 
        id,
        input_text,
        translation,
        meaning,
        example,
        tip,
        type,
        context,
        source_url,
        status,
        created_at
      FROM translations
      WHERE status = 'done'
      ORDER BY created_at DESC
    `);
        res.json(rows);
    } catch (err) {
        console.error('GET /vocabulary error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                    AS total,
        COUNT(*) FILTER (WHERE type = 'vocabulary') AS vocabulary_count,
        COUNT(*) FILTER (WHERE type = 'phrase')     AS phrase_count
      FROM translations
      WHERE status = 'done'
    `);
        res.json(rows[0]);
    } catch (err) {
        console.error('GET /vocabulary/stats error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});