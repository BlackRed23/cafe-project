const MOJIBAKE_PATTERNS = [
  "Ã",
  "Â",
  "Ä",
  "Å",
  "Æ",
  "áº",
  "á»",
  "â€",
  "Ä‘",
  "nhÃ",
  "sáº",
  "tá»",
];

const WINDOWS_1252_REVERSE: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

const FALLBACK_REPLACEMENTS: Array<[string, string]> = [
  ["AI Agent Ä‘Ã£ táº¡o yÃªu cáº§u nháº­p hÃ ng cho sáº£n pháº©m nÃ y.", "AI Agent đã tạo yêu cầu nhập hàng cho sản phẩm này."],
  ["AI Agent Ä‘Ã£ táº¡o yÃªu cáº§u nháº­p hÃ ng cho sáº£n pháº©m nÃ y.", "AI Agent đã tạo yêu cầu nhập hàng cho sản phẩm này."],
  ["Sáº£n pháº©m tá»“n kho tháº¥p nhÆ°ng chÆ°a cÃ³ nhÃ  cung cáº¥p há»£p lá»‡.", "Sản phẩm tồn kho thấp nhưng chưa có nhà cung cấp hợp lệ."],
  ["Sáº£n pháº©m tá»“n kho tháº¥p nhÆ°ng chÆ°a cÃ³ nhÃ  cung cáº¥p há»£p lá»‡.", "Sản phẩm tồn kho thấp nhưng chưa có nhà cung cấp hợp lệ."],
  ["yÃªu cáº§u nháº­p hÃ ng", "yêu cầu nhập hàng"],
  ["yÃªu cáº§u nháº­p hÃ ng", "yêu cầu nhập hàng"],
  ["sáº£n pháº©m", "sản phẩm"],
  ["nhÃ  cung cáº¥p", "nhà cung cấp"],
  ["nhÃ  cung cáº¥p", "nhà cung cấp"],
  ["tá»“n kho tháº¥p", "tồn kho thấp"],
  ["há»£p lá»‡", "hợp lệ"],
  ["Ä‘Ã£", "đã"],
  ["chÆ°a cÃ³", "chưa có"],
];

const mojibakeScore = (text: string): number =>
  MOJIBAKE_PATTERNS.reduce((score, pattern) => score + text.split(pattern).length - 1, 0);

const hasMojibake = (text: string): boolean => mojibakeScore(text) > 0;

const decodeWindows1252AsUtf8 = (text: string): string | null => {
  const bytes: number[] = [];

  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) return null;
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    const mapped = WINDOWS_1252_REVERSE[code];
    if (mapped === undefined) return null;
    bytes.push(mapped);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
};

const applyFallbackReplacements = (text: string): string =>
  FALLBACK_REPLACEMENTS.reduce((next, [from, to]) => next.split(from).join(to), text);

export function fixVietnameseMojibakeText(value: unknown): string {
  if (typeof value !== "string") return "";
  if (!hasMojibake(value)) return value;

  let best = value;
  let bestScore = mojibakeScore(value);
  let current = value;

  for (let i = 0; i < 2; i += 1) {
    const decoded = decodeWindows1252AsUtf8(current);
    if (!decoded || decoded === current) break;

    const score = mojibakeScore(decoded);
    if (score < bestScore) {
      best = decoded;
      bestScore = score;
    }
    current = decoded;
  }

  const fallback = applyFallbackReplacements(best);
  return mojibakeScore(fallback) <= bestScore ? fallback : best;
}
