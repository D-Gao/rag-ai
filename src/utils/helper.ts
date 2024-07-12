import * as path from 'path';

export const extractExt = (fileName: string) => {
  return path.extname(fileName);
};
