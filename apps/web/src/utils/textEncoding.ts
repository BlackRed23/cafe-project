export function fixVietnameseMojibakeText(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  
  let text = value;

  // We only replace exact strings because decoding Latin-1 to UTF-8
  // might break correctly encoded words if they are mixed together.
  const replacements: Record<string, string> = {
    "Sáº£n pháº©m": "Sản phẩm",
    "Sáº£n": "Sản",
    "pháº©m": "phẩm",
    "Ä‘ã": "đã",
    "Ä‘ang": "đang",
    "Ä‘á»§": "đủ",
    "Ä‘áº¿n": "đến",
    "Ä‘": "đ",
    "yÃªu cáº§u": "yêu cầu",
    "yÃªu": "yêu",
    "cáº§u": "cầu",
    "nháºp hÃ ng": "nhập hàng",
    "nháºp hàng": "nhập hàng",
    "nháºp": "nhập",
    "hÃ ng": "hàng",
    "khÃ´ng": "không",
    "cÃ³": "có",
    "tá»“n kho": "tồn kho",
    "tÃ¬m tháº¥y": "tìm thấy",
    "tháº¥y": "thấy",
    "vá»«a": "vừa",
    "háº¿t": "hết",
    "bá»‹": "bị",
    "lá»—i": "lỗi",
    "cáº£nh bÃ¡o": "cảnh báo",
    "thÃ nh cÃ´ng": "thành công",
    "tháº¥t báº¡i": "thất bại",
    "táº¡o": "tạo",
    "hoáº¡t Ä‘á»™ng": "hoạt động",
    "chá»": "chờ",
    "cáºp nháºt": "cập nhật",
    "Ã": "í",
    "áº": "ặ",
    "Æ": "ư",
  };

  for (const [bad, good] of Object.entries(replacements)) {
    text = text.replaceAll(bad, good);
  }

  return text;
}
