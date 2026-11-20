import { GoogleGenAI } from '@google/genai';

interface VercelReq {
  method?: string;
  body?: { league?: unknown };
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
  const leagueFilter =
    typeof req.body?.league === 'string'
      ? req.body.league.slice(0, 60)
      : 'Premier League, La Liga, Serie A, Bundesliga, Ligue 1';

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
      if (Array.isArray(parsed)) items = parsed;
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

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');
    res.status(200).json({
      items: items.slice(0, 8),
      sources,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: raw || 'Không thể tải tin chuyển nhượng thời gian thực.' });
  }
}
