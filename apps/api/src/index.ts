import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import { prisma } from '@cafe-project/database';
// Import trực tiếp từ package database của bạn

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

// API kiểm tra trạng thái Server
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'OK', message: 'Cafe AI Server is running!' });
});

// API test kết nối Database (Lấy danh sách người dùng)
app.get('/test-db', async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany();
        res.json({
            message: 'Kết nối Database thành công!',
            data: users
        });
    } catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({ error: 'Lỗi kết nối cơ sở dữ liệu' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});