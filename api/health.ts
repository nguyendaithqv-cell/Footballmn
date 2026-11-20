interface VercelReq {
  method?: string;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

export default function handler(_req: VercelReq, res: VercelRes) {
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
}
