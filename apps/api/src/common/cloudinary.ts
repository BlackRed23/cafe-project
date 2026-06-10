import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.Cloud_Name,
    api_key: process.env.CLOUDINARY_API_KEY || process.env.API_Key,
    api_secret: process.env.CLOUDINARY_API_SECRET || process.env.API_Secret
});

export { cloudinary };
