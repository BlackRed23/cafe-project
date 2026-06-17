import nodemailer from 'nodemailer';
import { PurchaseRequestStatus } from '@cafe-project/database';
import { prisma } from '../../common/prisma';
import { HttpError } from '../../common/http-error';
import { agentRepository } from '../agent/agent.repository';

// Check email pattern
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailService = {
    getSmtpConfig() {
        const host = process.env.SMTP_HOST;
        const port = Number(process.env.SMTP_PORT) || 587;
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;
        const from = process.env.SMTP_FROM || `"Cafe AI System" <${user}>`;

        if (!host || !user || !pass) {
            throw new HttpError(
                500,
                'SMTP configuration is missing. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.'
            );
        }

        return { host, port, user, pass, from };
    },

    async getPreview(id: string) {
        const request = await prisma.purchaseRequest.findUnique({
            where: { id },
            include: {
                supplier: true,
                items: {
                    include: {
                        product: true,
                        inventory: true
                    }
                }
            }
        });

        if (!request) {
            throw new HttpError(404, 'Purchase request not found.');
        }

        if (request.status !== PurchaseRequestStatus.APPROVED && request.status !== PurchaseRequestStatus.SENT) {
            throw new HttpError(400, 'Purchase request must be APPROVED or SENT to preview email.');
        }

        const supplierEmail = request.supplier.email || '';
        const isValidEmail = EMAIL_REGEX.test(supplierEmail);

        // Calculate default subject and body
        const defaultSubject = `Yêu cầu nhập hàng - Đơn hàng ${request.requestNumber}`;
        
        let defaultBody = '';
        if (request.emailContent) {
            defaultBody = request.emailContent;
        } else {
            const itemsText = request.items
                .map((item, idx) => {
                    const price = item.unitPrice ? Number(item.unitPrice) : 0;
                    const subtotal = item.quantity * price;
                    const unit = item.inventory?.unit || 'cái';
                    return `${idx + 1}. ${item.product.name} (${item.product.sku})
   - Số lượng: ${item.quantity} ${unit}
   - Đơn giá: ${price.toLocaleString('vi-VN')} VND
   - Thành tiền: ${subtotal.toLocaleString('vi-VN')} VND`;
                })
                .join('\n\n');

            defaultBody = `Kính gửi đối tác ${request.supplier.name},

Chúng tôi gửi email này để yêu cầu nhập hàng với thông tin chi tiết dưới đây:

Mã yêu cầu: ${request.requestNumber}
Chi tiết các sản phẩm cần nhập:

${itemsText}

Tổng cộng: ${Number(request.totalAmount).toLocaleString('vi-VN')} VND

Quý đối tác vui lòng phản hồi email này để xác nhận đơn hàng và thời gian giao hàng dự kiến.

Trân trọng,
Cafe AI System`;
        }

        let smtpConfigured = true;
        try {
            this.getSmtpConfig();
        } catch {
            smtpConfigured = false;
        }

        const canSend =
            request.status === PurchaseRequestStatus.APPROVED &&
            isValidEmail &&
            smtpConfigured &&
            request.retryCount < 3;

        return {
            to: supplierEmail,
            subject: defaultSubject,
            body: defaultBody,
            canSend,
            emailStatus: request.status === PurchaseRequestStatus.SENT ? 'SENT' : (request.retryCount > 0 ? 'FAILED' : 'PENDING'),
            retryCount: request.retryCount,
            lastEmailError: request.lastEmailError
        };
    },

    async sendEmail(id: string, subject: string, body: string, userId: string, to?: string) {
        const request = await prisma.purchaseRequest.findUnique({
            where: { id },
            include: {
                supplier: true
            }
        });

        if (!request) {
            throw new HttpError(404, 'Purchase request not found.');
        }

        if (request.status !== PurchaseRequestStatus.APPROVED) {
            throw new HttpError(400, 'Only approved purchase requests can be emailed.');
        }

        const supplierEmail = to || request.supplier.email;
        if (!supplierEmail || !EMAIL_REGEX.test(supplierEmail)) {
            throw new HttpError(400, 'Supplier does not have a valid email address.');
        }

        if (request.retryCount >= 3) {
            throw new HttpError(400, 'Maximum retry limit (3) exceeded. Cannot send or retry email.');
        }

        try {
            // Get SMTP configuration (throws error if missing)
            const smtp = this.getSmtpConfig();

            const transporter = nodemailer.createTransport({
                host: smtp.host,
                port: smtp.port,
                secure: smtp.port === 465,
                auth: {
                    user: smtp.user,
                    pass: smtp.pass
                }
            });

            await transporter.sendMail({
                from: smtp.from,
                to: supplierEmail,
                subject: subject,
                text: body
            });

            // Update database on success
            const updatedRequest = await prisma.purchaseRequest.update({
                where: { id },
                data: {
                    status: PurchaseRequestStatus.SENT,
                    emailSentAt: new Date(),
                    emailContent: body,
                    lastEmailError: null
                }
            });

            // Log successful action
            await agentRepository.createLog({
                action: 'SEND_SUPPLIER_EMAIL',
                result: 'SUCCESS',
                reference_type: 'purchase_request',
                reference_id: id,
                creator: userId ? { connect: { id: userId } } : undefined
            });

            return updatedRequest;
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown SMTP error';

            // Update database on failure
            await prisma.purchaseRequest.update({
                where: { id },
                data: {
                    retryCount: {
                        increment: 1
                    },
                    lastEmailError: errorMessage
                }
            });

            // Log failed action
            await agentRepository.createLog({
                action: 'SEND_SUPPLIER_EMAIL',
                result: 'FAILED',
                error_message: errorMessage,
                reference_type: 'purchase_request',
                reference_id: id,
                creator: userId ? { connect: { id: userId } } : undefined
            });

            throw new HttpError(500, `Failed to send email: ${errorMessage}`);
        }
    },

    async retryEmail(id: string, subject: string, body: string, userId: string, to?: string) {
        const request = await prisma.purchaseRequest.findUnique({
            where: { id }
        });

        if (!request) {
            throw new HttpError(404, 'Purchase request not found.');
        }

        if (request.status !== PurchaseRequestStatus.APPROVED) {
            throw new HttpError(400, 'Only approved purchase requests can be retried.');
        }

        if (request.retryCount >= 3) {
            throw new HttpError(400, 'Maximum retry limit (3) exceeded. Cannot retry email.');
        }

        return this.sendEmail(id, subject, body, userId, to);
    }
};
