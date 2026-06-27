import { TextDecoder } from 'node:util';



export function fixVietnameseMojibakeText(value: unknown): string {
    if (typeof value !== "string" || !value) return "";
    
    let text = value;
  
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

export const fixAgentLogDisplayOutput = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

    const output = { ...(value as Record<string, unknown>) };
    if (typeof output.message === 'string') output.message = fixVietnameseMojibakeText(output.message);
    if (typeof output.errorMessage === 'string') output.errorMessage = fixVietnameseMojibakeText(output.errorMessage);

    if (output.notification && typeof output.notification === 'object' && !Array.isArray(output.notification)) {
        const notification = { ...(output.notification as Record<string, unknown>) };
        if (typeof notification.title === 'string') notification.title = fixVietnameseMojibakeText(notification.title);
        if (typeof notification.description === 'string') notification.description = fixVietnameseMojibakeText(notification.description);
        output.notification = notification;
    }

    return output;
};

export const fixAgentLogDisplayOutputJson = (value?: string | null): string | undefined | null => {
    if (!value) return value;
    try {
        const parsed = JSON.parse(value);
        return JSON.stringify(fixAgentLogDisplayOutput(parsed));
    } catch {
        return value;
    }
};
