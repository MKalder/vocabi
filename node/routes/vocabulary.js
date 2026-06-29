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

router.patch('/:id/review', async (req, res) => {
    try {
        const { rating } = req.body; // 'hard', 'good', 'easy'
        const id = req.params.id;

        // Aktuelle Karte holen
        const { rows } = await pool.query(
            'SELECT interval_days, ease_factor, review_count FROM translations WHERE id = $1',
            [id]
        );

        if (!rows.length) return res.status(404).json({ error: 'Not found' });

        let { interval_days, ease_factor, review_count } = rows[0];

        // SM-2 Algorithmus
        if (rating === 'hard') {
            interval_days = 1;
            ease_factor = Math.max(1.3, ease_factor - 0.2);
        } else if (rating === 'good') {
            interval_days = review_count === 0 ? 1
                : review_count === 1 ? 3
                    : Math.round(interval_days * ease_factor);
        } else if (rating === 'easy') {
            interval_days = review_count === 0 ? 1
                : review_count === 1 ? 3
                    : Math.round(interval_days * ease_factor * 1.3);
            ease_factor = Math.min(4.0, ease_factor + 0.1);
        }

        review_count += 1;
        const mastered = ease_factor >= 3.0 && interval_days >= 21;

        const next_review = new Date();
        next_review.setDate(next_review.getDate() + interval_days);

        await pool.query(
            `UPDATE translations 
       SET interval_days = $1,
           ease_factor   = $2,
           review_count  = $3,
           mastered      = $4,
           next_review   = $5
       WHERE id = $6`,
            [interval_days, ease_factor, review_count, mastered, next_review, id]
        );

        res.json({ interval_days, ease_factor, review_count, mastered, next_review });
    } catch (err) {
        console.error('PATCH /vocabulary/:id/review error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});