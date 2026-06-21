import type { Response } from 'express';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { cloudinary } from '../../common/cloudinary';

const uploadToCloudinary = (fileBuffer: Buffer): Promise<{ secure_url: string; public_id: string }> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'cafe-products'
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else if (result) {
                    resolve(result);
                } else {
                    reject(new Error('Unknown upload error.'));
                }
            }
        );
        stream.end(fileBuffer);
    });
};

export const uploadProductImage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // 1. Verify Cloudinary credentials
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.Cloud_Name;
    const apiKey = process.env.CLOUDINARY_API_KEY || process.env.API_Key;
    const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.API_Secret;

    if (!cloudName || !apiKey || !apiSecret) {
        sendError(res, 400, 'Cloudinary is not configured on this server.');
        return;
    }

    // 2. Validate request file
    if (!req.file) {
        sendError(res, 400, 'Please select an image file to upload.');
        return;
    }

    try {
        // 3. Upload to Cloudinary
        const result = await uploadToCloudinary(req.file.buffer);
        sendSuccess(res, 200, 'Image uploaded successfully.', {
            imageUrl: result.secure_url,
            imagePublicId: result.public_id
        });
    } catch (error: any) {
        console.error('[upload] Cloudinary upload error:', error);
        sendError(res, 500, error.message || 'Failed to upload image to Cloudinary.');
    }
};
