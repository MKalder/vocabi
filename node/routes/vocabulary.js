import { Router } from 'express';
import { pool } from '../db/pool.js';

export const router = Router();

router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT 
        id,
        input_text,
        target_lang,
        translation,
        meaning,
        example,
        tip,
        type,
        context,
        source_url,
        status,
        mastered,
        interval_days,
        ease_factor,
        review_count,
        next_review,
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

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'DELETE FROM translations WHERE id = $1 RETURNING id',
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: 'Not found' });
        }

        res.json({ deleted: true, id: result.rows[0].id });
    } catch (err) {
        console.error('DELETE /vocabulary/:id error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/sm2-stats', async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT
        ROUND(AVG(ease_factor)::numeric, 2)    AS avg_ease_factor,
        ROUND(AVG(interval_days)::numeric, 1)  AS avg_interval_days,
        ROUND(AVG(review_count)::numeric, 1)   AS avg_review_count,
        COUNT(*) FILTER (WHERE mastered = true)  AS mastered_count,
        COUNT(*) FILTER (WHERE review_count = 0) AS never_reviewed_count,
        COUNT(*) FILTER (WHERE review_count > 0) AS in_progress_count
      FROM translations
      WHERE status = 'done'
    `);
        res.json(rows[0]);
    } catch (err) {
        console.error('GET /vocabulary/sm2-stats error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});



