export interface ChatMessage {
  id?: number;
  role: 'system' | 'assistant' | 'user';
  model: string;
  content: string;
  type?: 'loading' | 'canceled' | 'error';
  startTime: number;
  endTime: number;
  relevantDocs?: RelevantDocument[];
}

export interface IngestDocumentType {
  originalname: string;
  fileBuffer: Buffer;
  fileType: string;
}
