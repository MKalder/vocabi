import { pool } from './pool.js';

export async function insertJob(text, targetLang, sourceUrl) {
    const { rows } = await pool.query(
        `INSERT INTO translations (input_text, target_lang, source_url, status)
     VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [text, targetLang, sourceUrl || null]
    );
    return rows[0].id;
}

export async function getJob(id) {
    const { rows } = await pool.query(
        'SELECT id, status, result, error FROM translations WHERE id = $1',
        [id]
    );
    return rows[0];
}

export async function claimNextJob() {
    const { rows } = await pool.query(`
    UPDATE translations SET status = 'processing'
    WHERE id = (
      SELECT id FROM translations
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
    return rows[0] || null;
}

export async function markDone(id, result) {
    await pool.query(
        `UPDATE translations SET status = 'done', result = $1 WHERE id = $2`,
        [result, id]
    );
}

export async function markFailed(id, error) {
    await pool.query(
        `UPDATE translations SET status = 'failed', error = $1 WHERE id = $2`,
        [error, id]
    );
}