import { prisma } from '@cafe-project/database';
import bcrypt from 'bcrypt';

export const registerUserService = async (data: any) => {
    const { name, email, password } = data;

    // 1. Kiểm tra email đã tồn tại trong DB chưa
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        throw new Error('Email này đã được đăng ký!');
    }

    // 2. Mã hóa (Hash) mật khẩu với độ khó là 10 (salt rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Lưu vào Database
    const newUser = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
        },
    });

    // 4. Trả về thông tin user (loại bỏ mật khẩu để bảo mật)
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
};