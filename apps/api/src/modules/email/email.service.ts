import nodemailer from 'nodemailer';
import { PurchaseRequestStatus } from '@cafe-project/database';
import { prisma } from '../../common/prisma';
import { HttpError } from '../../common/http-error';
import { createAgentLogViaAgentService } from '../agent/agent.client';
import { buildPurchaseRequestEmailDraft } from '../purchase/purchase.service';

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
                supplier: { include: { products: true } },
                items: {
                    include: {
                        product: true,
                        inventory: {
                            include: {
                                product: {
                                    include: { category: true }
                                }
                            }
                        }
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
        const emailDraft = buildPurchaseRequestEmailDraft(request as any);

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
            subject: emailDraft.subject,
            body: emailDraft.body,
            canSend,
            emailStatus: request.status === PurchaseRequestStatus.SENT ? 'SENT' : (request.retryCount > 0 ? 'FAILED' : 'PENDING'),
            retryCount: request.retryCount,
            lastEmailError: request.lastEmailError
        };
    },

    async sendEmail(id: string, subject: string, body: string, userId: string, to: string) {
        const request = await prisma.purchaseRequest.findUnique({
            where: { id },
            include: {
                supplier: true,
                items: { include: { product: true } }
            }
        });

        if (!request) {
            throw new HttpError(404, 'Purchase request not found.');
        }

        if (request.status !== PurchaseRequestStatus.APPROVED) {
            throw new HttpError(400, 'Only approved purchase requests can be emailed.');
        }

        const isPendingDelete = request.items.some(item => item.product.pendingDeleteUntil);
        if (isPendingDelete) {
            await createAgentLogViaAgentService({
                action: 'SEND_SUPPLIER_EMAIL_BLOCKED',
                result: 'SKIPPED',
                reason: 'PRODUCT_PENDING_DELETE',
                message: 'Không thể gửi email vì sản phẩm đang chờ xoá.',
                reference_type: 'PurchaseRequest',
                reference_id: id,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            throw new HttpError(400, 'Không thể gửi email vì sản phẩm đang chờ xoá.');
        }

        const recipientEmail = to.trim();
        if (!recipientEmail) {
            await createAgentLogViaAgentService({
                action: 'SEND_SUPPLIER_EMAIL',
                result: 'FAILED',
                reason: 'SUPPLIER_EMAIL_MISSING',
                message: 'Gửi email thất bại vì nhà cung cấp chưa có email.',
                reference_type: 'PurchaseRequest',
                reference_id: id,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            throw new HttpError(400, 'Nhà cung cấp chưa có email. Vui lòng cập nhật email nhà cung cấp trước khi gửi.');
        }

        if (!EMAIL_REGEX.test(recipientEmail)) {
            await createAgentLogViaAgentService({
                action: 'SEND_SUPPLIER_EMAIL',
                result: 'FAILED',
                reason: 'SUPPLIER_EMAIL_INVALID',
                message: 'Gửi email thất bại vì email nhà cung cấp không hợp lệ.',
                reference_type: 'PurchaseRequest',
                reference_id: id,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            throw new HttpError(400, 'Email nhà cung cấp không hợp lệ.');
        }

        if (request.supplier?.status === 'INACTIVE') {
            let suggestedSuppliers: any[] = [];
            const productId = request.items?.[0]?.productId;
            if (productId) {
                const altSupplierProducts = await prisma.supplierProduct.findMany({
                    where: {
                        productId,
                        supplierId: { not: request.supplier.id },
                        supplier: { status: 'ACTIVE' }
                    },
                    include: { supplier: true },
                    orderBy: [
                        { isPreferred: 'desc' },
                        { leadTimeDays: 'asc' },
                        { price: 'asc' }
                    ]
                });
                suggestedSuppliers = altSupplierProducts.map(sp => ({
                    supplierId: sp.supplierId,
                    supplierName: sp.supplier.name,
                    isPreferred: sp.isPreferred,
                    leadTimeDays: sp.leadTimeDays,
                    moq: sp.minOrderQuantity,
                    purchasePrice: Number(sp.price)
                }));
            }

            const errorMessage = "Nhà cung cấp của yêu cầu nhập hàng đang bị tắt. Vui lòng mở lại nhà cung cấp hoặc đổi nhà cung cấp trước khi gửi email.";
            await createAgentLogViaAgentService({
                action: 'SEND_SUPPLIER_EMAIL_BLOCKED',
                result: 'SKIPPED',
                reason: 'PURCHASE_REQUEST_SUPPLIER_INACTIVE',
                error_message: errorMessage,
                message: "Không gửi email vì nhà cung cấp của yêu cầu nhập hàng đang bị tắt.",
                reference_type: 'PurchaseRequest',
                reference_id: id,
                creator: userId ? { connect: { id: userId } } : undefined,
                output: JSON.stringify({
                    purchaseRequestId: id,
                    supplierId: request.supplier.id,
                    supplierName: request.supplier.name,
                    supplierStatus: 'INACTIVE',
                    productId,
                    productName: request.items?.[0]?.product?.name,
                    suggestedSuppliers,
                    notification: {
                        title: "Không thể gửi email",
                        description: "Nhà cung cấp của yêu cầu nhập hàng đang bị tắt. Vui lòng mở lại hoặc đổi nhà cung cấp.",
                        actionLabel: "Xem yêu cầu nhập hàng",
                        actionUrl: `/admin/purchase-requests/${id}`
                    }
                })
            });

            throw new HttpError(400, errorMessage);
        }

        if (request.retryCount >= 3) {
            throw new HttpError(400, 'Maximum retry limit (3) exceeded. Cannot send or retry email.');
        }

        try {
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
                to: recipientEmail,
                subject,
                text: body
            });

            const updatedRequest = await prisma.purchaseRequest.update({
                where: { id },
                data: {
                    status: PurchaseRequestStatus.SENT,
                    emailSentAt: new Date(),
                    emailContent: body,
                    lastEmailError: null
                }
            });

            await createAgentLogViaAgentService({
                action: 'SEND_SUPPLIER_EMAIL',
                result: 'SUCCESS',
                reference_type: 'purchase_request',
                reference_id: id,
                creator: userId ? { connect: { id: userId } } : undefined
            });

            return updatedRequest;
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown SMTP error';

            await prisma.purchaseRequest.update({
                where: { id },
                data: {
                    retryCount: {
                        increment: 1
                    },
                    lastEmailError: errorMessage
                }
            });

            await createAgentLogViaAgentService({
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

    async retryEmail(id: string, subject: string, body: string, userId: string, to: string) {
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
