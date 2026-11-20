import { GoogleGenAI } from '@google/genai';

interface VercelReq {
  method?: string;
  body?: {
    clubName?: unknown;
    formation?: unknown;
    mentality?: unknown;
    opponentName?: unknown;
    opponentManager?: unknown;
    opponentFormation?: unknown;
  };
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    res.status(503).json({
      error: 'GEMINI_API_KEY chưa được cấu hình trong Environment Variables trên Vercel.',
    });
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const { clubName, formation, mentality, opponentName, opponentManager, opponentFormation } =
    req.body ?? {};

  try {
    const prompt = `Bạn là trợ lý phân tích chiến thuật bóng đá chuyên nghiệp (phong cách Football Manager).
Đội của tôi: ${String(clubName ?? 'CLB').slice(0, 60)}, sơ đồ ${String(formation ?? '4-3-3').slice(0, 16)}, tâm lý ${String(mentality ?? 'Balanced').slice(0, 24)}.
Đối thủ: ${String(opponentName ?? 'Đối thủ').slice(0, 60)} (HLV ${String(opponentManager ?? 'HLV').slice(0, 60)}, sơ đồ ${String(opponentFormation ?? '4-3-3').slice(0, 16)}).
Hãy đưa ra 3 gợi ý điều chỉnh chiến thuật ngắn gọn, thực tế bằng tiếng Việt (tối đa 160 từ tổng cộng) để khắc chế lối chơi của HLV đối thủ.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).json({
      report: (response.text ?? '').trim(),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: raw || 'Không thể phân tích chiến thuật.' });
  }
}
