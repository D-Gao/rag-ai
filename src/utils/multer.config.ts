import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const multerOptions: MulterOptions = {
  storage: memoryStorage(), // Use memory storage to keep files in memory
  limits: {
    fileSize: 5 * 1024 * 1024, // Limit file size to 5MB
  },
};
