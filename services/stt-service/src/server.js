import http from 'http';
import express from 'express';
import sttRouter from './routes/stt.js'
import ttsRouter from './routes/tts.js'

const app = express();
const PORT = process.env.STT_SERVICE_PORT || 4004;

app.use(express.json());
app.use("/stt", sttRouter);
app.use("/tts", ttsRouter);

app.get('/health', (req, res) => {
    res.json({ service: 'stt-service', status: 'ok' });
});

const httpServer = http.createServer(app);

httpServer.listen(PORT, () => {
    console.log(`stt-service running on http://localhost:${PORT}`);
});
