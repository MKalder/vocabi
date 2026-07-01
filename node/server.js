import express from 'express';
import { config } from './config.js';
import { router as translateRouter } from './routes/translate.js';
import { startWorker } from './services/queueService.js';
import { router as vocabularyRouter } from './routes/vocabulary.js';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.get('/', (req, res) => res.send('<h1>VocAbi Running</h1>'));
app.use('/translate', translateRouter);
app.use('/vocabulary', vocabularyRouter);

await startWorker();

app.listen(config.port, '127.0.0.1', () =>
    console.log(`VocAbi runs on port ${config.port}`)
);

