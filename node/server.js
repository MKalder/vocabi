import express from 'express';

const port = 3000;
const app = express();
app.use(express.json());

app.post('/translate', async (req, res) => {
    const { text, targetLang = 'English' } = req.body;

    const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'qwen2.5:latest',
            prompt: `Translate this word or sentence into ${targetLang} and explain the meaning of it in english: "${text}"`,
            stream: false
        })
    });

    const data = await response.json();
    res.json({ result: data.response });
});

app.listen(port, () => console.log(`VocAbi runs locallay on port ${port}`));