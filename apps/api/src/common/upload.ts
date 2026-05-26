import multer from 'multer';
import { HttpError } from './http-error';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
            callback(new HttpError(400, 'Only image files are allowed.'));
            return;
        }

        callback(null, true);
    }
});
