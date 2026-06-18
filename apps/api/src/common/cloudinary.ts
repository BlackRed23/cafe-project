import { v2 as cloudinary } from 'cloudinary';

const PRODUCT_IMAGE_FOLDER = 'cafe-products';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.Cloud_Name,
    api_key: process.env.CLOUDINARY_API_KEY || process.env.API_Key,
    api_secret: process.env.CLOUDINARY_API_SECRET || process.env.API_Secret
});

export const extractCloudinaryPublicId = (imageUrl: string | null | undefined): string | null => {
    if (!imageUrl) return null;

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.Cloud_Name;
    if (!cloudName) {
        console.warn('[cloudinary] Cannot extract public_id because Cloudinary cloud name is not configured.');
        return null;
    }

    try {
        const parsedUrl = new URL(imageUrl);

        if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'res.cloudinary.com') {
            return null;
        }

        const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
        const uploadIndex = pathParts.findIndex((segment) => segment === 'upload');

        if (pathParts[0] !== cloudName || pathParts[1] !== 'image' || uploadIndex === -1) {
            return null;
        }

        const afterUploadParts = pathParts.slice(uploadIndex + 1);
        const versionIndex = afterUploadParts.findIndex((segment) => /^v\d+$/.test(segment));
        const publicIdParts = versionIndex >= 0 ? afterUploadParts.slice(versionIndex + 1) : afterUploadParts;
        const publicIdWithExtension = publicIdParts.join('/');
        const publicId = decodeURIComponent(publicIdWithExtension.replace(/\.[^/.]+$/, ''));

        if (!publicId || (publicId !== PRODUCT_IMAGE_FOLDER && !publicId.startsWith(`${PRODUCT_IMAGE_FOLDER}/`))) {
            return null;
        }

        return publicId;
    } catch {
        return null;
    }
};

export const deleteCloudinaryImage = async (publicId: string): Promise<{ result: string }> => {
    if (!publicId || (publicId !== PRODUCT_IMAGE_FOLDER && !publicId.startsWith(`${PRODUCT_IMAGE_FOLDER}/`))) {
        throw new Error(`Refused to delete Cloudinary image outside ${PRODUCT_IMAGE_FOLDER}.`);
    }

    try {
        const result = await cloudinary.uploader.destroy(publicId);
        const destroyResult = result.result ?? 'unknown';

        if (destroyResult !== 'ok') {
            throw new Error(`Cloudinary destroy returned result "${destroyResult}".`);
        }

        return { result: destroyResult };
    } catch (error: any) {
        throw new Error(`Failed to delete Cloudinary image "${publicId}": ${error.message || 'Unknown error.'}`);
    }
};

export { cloudinary, PRODUCT_IMAGE_FOLDER };
