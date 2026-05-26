import cron from 'node-cron';
import dotenv from 'dotenv';
import { prisma } from '@cafe-project/database';

dotenv.config();

const apiKeys = [
    process.env.GEMINI_API_KEY1,
    process.env.GEMINI_API_KEY2,
    process.env.GEMINI_API_KEY3
].filter(Boolean) as string[];

if (apiKeys.length === 0) {
    console.error('❌ Lỗi: Chưa cấu hình ít nhất một GEMINI_API_KEY (1, 2, 3) trong file apps/agent/.env');
    process.exit(1);
}

console.log('🤖 AI Agent Worker đang khởi động (Chế độ Caching)...');

const fetchSlogan = async () => {
    console.log(`\n[${new Date().toLocaleTimeString()}] ⏳ Đang gọi Google REST API v1 để tạo slogan...`);

    const fallbackSlogan = "Cà phê pha máy, sảng khoái cả ngày! Chào mừng bạn trở lại làm việc.";
    let finalSlogan = fallbackSlogan;
    let isSuccess = false;

    for (const currentKey of apiKeys) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${currentKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: "Viết đúng 1 câu slogan thật ngắn gọn, hài hước và tràn đầy năng lượng (dưới 20 chữ) bằng tiếng Việt để chào mừng nhân viên quản trị quán cafe bắt đầu ca làm việc ngày mới."
                        }]
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`Google API responded with status ${response.status}`);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                finalSlogan = data.candidates[0].content.parts[0].text.trim();
                isSuccess = true;
                break;
            }
            
        } catch (error: any) {
            console.warn('❌ Lỗi khi gọi Gemini API với key hiện tại:', error.message || error);
        }
    }

    if (!isSuccess) {
        console.log('⚠️ Tất cả các key đều lỗi. Đang sử dụng câu slogan mặc định.');
        finalSlogan = fallbackSlogan;
    }

    try {
        await prisma.systemSetting.upsert({
            where: { key: 'DAILY_SLOGAN' },
            update: { value: finalSlogan },
            create: { key: 'DAILY_SLOGAN', value: finalSlogan }
        });
        console.log(`✅ Đã cập nhật slogan vào DB: "${finalSlogan}"`);
    } catch (dbError: any) {
        console.error('❌ Lỗi khi lưu vào Database:', dbError.message || dbError);
    }
};

// Chạy ngay lập tức 1 lần khi server vừa khởi động
fetchSlogan();

// Lên lịch chạy lúc 00:00 mỗi đêm
cron.schedule('0 0 * * *', fetchSlogan);

console.log('✅ AI Agent đã kết nối thành công và sẽ tạo slogan mới vào 00:00 mỗi đêm!');
