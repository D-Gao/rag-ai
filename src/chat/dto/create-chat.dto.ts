export class CreateChatDto {
  knowledgebaseId: number;
  messages: {
    role: 'user' | 'assistant';
    content: string;
  }[];
  stream: boolean;
}
