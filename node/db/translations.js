import { pool } from './pool.js';

export async function insertJob(text, type, context, targetLang, sourceUrl) {
    const { rows } = await pool.query(
        `INSERT INTO translations 
     (input_text, type, context, target_lang, source_url, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
        [text, type, context || null, targetLang, sourceUrl || null]
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

export async function markDone(id, parsed) {
    await pool.query(
        `UPDATE translations 
     SET status = 'done', 
         result = $1,
         translation = $2,
         meaning = $3,
         example = $4,
         tip = $5
     WHERE id = $6`,
        [parsed.raw, parsed.translation, parsed.meaning, parsed.example, parsed.tip, id]
    );
}

export async function markFailed(id, error) {
    await pool.query(
        `UPDATE translations SET status = 'failed', error = $1 WHERE id = $2`,
        [error, id]
    );
}

export async function recoverStuckJobs() {
    const { rows } = await pool.query(`
    UPDATE translations 
    SET status = 'pending' 
    WHERE status = 'processing'
    RETURNING id
  `);
    return rows.length;
}

export async function failStuckProcessingJobs(timeoutMinutes = 3) {
    const { rows } = await pool.query(
        `UPDATE translations 
     SET status = 'failed', 
         error = 'Timeout: job stuck in processing'
     WHERE status = 'processing' 
       AND created_at < NOW() - ($1 || ' minutes')::interval
     RETURNING id`,
        [timeoutMinutes]
    );
    return rows.length;
}




