export class CreateKnowledgeDto {
  name: string;
  description: string;
  embedding: string;
  isPublic: boolean;
  knowledgeBaseId: number | null;
  //uploadedFiles: MultiPartData[];
  urls: string[];
  pageParser: PageParser;
  maxDepth: number;
  excludeGlobs: string[];
}
export type PageParser = 'default' | 'jinaReader';
