import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '1mb' }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const LIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const SCOUT_CACHE_TTL_MS = 5 * 60 * 1000;
const liveCache = new Map<string, { payload: Record<string, unknown>; expiresAt: number }>();
const scoutCache = new Map<string, { payload: Record<string, unknown>; expiresAt: number }>();

function mapGeminiError(error: unknown, fallbackMessage: string): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const statusProp = (error as { status?: number })?.status;

  if (statusProp === 429 || raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Đã vượt giới hạn lượt gọi Gemini API miễn phí (429 RESOURCE_EXHAUSTED). Vui lòng đợi ít phút hoặc chọn API key có bật thanh toán trong Settings > Secrets để tăng hạn mức.',
    };
  }
  if (statusProp === 403 || raw.includes('403') || raw.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message:
        'API key hiện tại không có quyền truy cập (403). Vui lòng kiểm tra GEMINI_API_KEY trong Settings > Secrets.',
    };
  }
  if (statusProp === 400 || raw.includes('API_KEY_INVALID')) {
    return {
      status: 400,
      message:
        'GEMINI_API_KEY chưa hợp lệ. Vui lòng cập nhật lại trong Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: raw || fallbackMessage,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.post('/api/transfers/live', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY chưa được cấu hình trong Settings > Secrets.',
    });
    return;
  }

  const leagueFilter =
    typeof req.body?.league === 'string'
      ? req.body.league.slice(0, 60)
      : 'Premier League, La Liga, Serie A, Bundesliga, Ligue 1';

  const cached = liveCache.get(leagueFilter);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.payload);
    return;
  }

  try {
    const prompt = `Tìm kiếm và tổng hợp 6 tin tức thị trường chuyển nhượng bóng đá quốc tế mới nhất và đáng chú ý nhất hiện nay (ưu tiên ${leagueFilter}).
Trả về kết quả DƯỚI DẠNG JSON THUẦN (không markdown code fence) theo đúng cấu trúc mảng JSON sau:
[
  {
    "title": "Tiêu đề ngắn gọn bằng tiếng Việt (tối đa 120 ký tự)",
    "summary": "Tóm tắt 2 câu bằng tiếng Việt rõ ràng về thương vụ, mức phí hoặc tin đồn mới nhất.",
    "category": "transfer" | "rumor" | "official",
    "playerName": "Tên cầu thủ thực tế",
    "clubTag": "Tên CLB liên quan",
    "feeText": "VD: €75M hoặc Free hoặc Loan",
    "isBreaking": true | false
  }
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawText = (response.text ?? '[]').trim();
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let items: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        items = parsed;
      }
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) items = parsed;
        } catch {
          items = [];
        }
      }
    }

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources = groundingChunks
      .map((chunk: { web?: { uri?: string; title?: string } }) => ({
        uri: chunk.web?.uri ?? '',
        title: chunk.web?.title ?? 'Nguồn tin bóng đá',
      }))
      .filter((s: { uri: string }) => Boolean(s.uri))
      .slice(0, 6);

    const payload = {
      items: items.slice(0, 8),
      sources,
      updatedAt: new Date().toISOString(),
    };

    if (payload.items.length > 0) {
      liveCache.set(leagueFilter, { payload, expiresAt: Date.now() + LIVE_CACHE_TTL_MS });
    }

    res.json(payload);
  } catch (error) {
    const mapped = mapGeminiError(error, 'Không thể tải tin chuyển nhượng thời gian thực.');
    console.warn(`Live transfer notice (${mapped.status}): ${mapped.message}`);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

app.post('/api/tactics/scout', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({ error: 'GEMINI_API_KEY chưa được cấu hình trong Settings > Secrets.' });
    return;
  }

  const { clubName, formation, mentality, opponentName, opponentManager, opponentFormation } =
    req.body ?? {};
  const cacheKey = `${clubName}-${formation}-${mentality}-${opponentName}-${opponentFormation}`;
  const cached = scoutCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.payload);
    return;
  }

  try {
    const prompt = `Bạn là trợ lý phân tích chiến thuật bóng đá chuyên nghiệp (phong cách Football Manager).
Đội của tôi: ${String(clubName ?? 'CLB').slice(0, 60)}, sơ đồ ${String(formation ?? '4-3-3').slice(0, 16)}, tâm lý ${String(mentality ?? 'Balanced').slice(0, 24)}.
Đối thủ: ${String(opponentName ?? 'Đối thủ').slice(0, 60)} (HLV ${String(opponentManager ?? 'HLV').slice(0, 60)}, sơ đồ ${String(opponentFormation ?? '4-3-3').slice(0, 16)}).
Hãy đưa ra 3 gợi ý điều chỉnh chiến thuật ngắn gọn, thực tế bằng tiếng Việt (tối đa 160 từ tổng cộng) để khắc chế lối chơi của HLV đối thủ.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
    });

    const payload = {
      report: (response.text ?? '').trim(),
      generatedAt: new Date().toISOString(),
    };
    if (payload.report) {
      scoutCache.set(cacheKey, { payload, expiresAt: Date.now() + SCOUT_CACHE_TTL_MS });
    }
    res.json(payload);
  } catch (error) {
    const mapped = mapGeminiError(error, 'Không thể phân tích chiến thuật.');
    console.warn(`Tactical scout notice (${mapped.status}): ${mapped.message}`);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      plugins: disableHmr
        ? [
            {
              name: 'disable-vite-client-ws',
              transform(code, id) {
                if (id.replace(/\\/g, '/').endsWith('vite/dist/client/client.mjs')) {
                  return code.replace(
                    /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
                    'const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} }); /* HMR disabled */'
                  );
                }
              },
            },
          ]
        : [],
      server: {
        middlewareMode: true,
        ...(disableHmr ? { hmr: false, ws: false } : { ws: { server: httpServer } }),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Touchline XI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
