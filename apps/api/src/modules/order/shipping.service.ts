export type ShippingZone = 'INNER_CITY' | 'OUTER_CITY' | 'PROVINCE';

const FREE_SHIPPING_THRESHOLD = 500_000;

const INNER_CITY_KEYWORDS = [
    'hồ chí minh', 'tp.hcm', 'tp. hcm', 'tphcm',
    'quận 1', 'quận 2', 'quận 3', 'quận 4', 'quận 5',
    'quận 6', 'quận 7', 'quận 8', 'quận 9', 'quận 10',
    'quận 11', 'quận 12', 'bình thạnh', 'gò vấp',
    'tân bình', 'tân phú', 'phú nhuận', 'bình tân',
    'thủ đức', 'củ chi', 'hóc môn', 'bình chánh',
    'nhà bè', 'cần giờ',
];

const OUTER_CITY_KEYWORDS = [
    'bình dương', 'đồng nai', 'long an',
    'bà rịa', 'vũng tàu', 'tây ninh',
];

const SHIPPING_FEE_BY_ZONE: Record<ShippingZone, number> = {
    INNER_CITY: 20_000,
    OUTER_CITY: 35_000,
    PROVINCE: 50_000,
};

/**
 * Xác định khu vực vận chuyển dựa trên địa chỉ nhận hàng.
 * Cửa hàng đặt tại TP.HCM, tính phí theo khoảng cách từ đây.
 */
export function detectShippingZone(address: string): ShippingZone {
    const normalized = address.toLowerCase().trim();
    if (INNER_CITY_KEYWORDS.some((kw) => normalized.includes(kw))) return 'INNER_CITY';
    if (OUTER_CITY_KEYWORDS.some((kw) => normalized.includes(kw))) return 'OUTER_CITY';
    return 'PROVINCE';
}

/**
 * Tính phí vận chuyển.
 * Miễn phí nếu subtotal (tiền hàng thuần) >= 500.000đ.
 */
export function calculateShippingFee(zone: ShippingZone, subtotal: number): number {
    if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
    return SHIPPING_FEE_BY_ZONE[zone];
}
