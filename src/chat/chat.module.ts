import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';
import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { RedisDocstore } from './embedding/redis.doc.store';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
// Provider factory function
const chatOpenAIProvider = {
  provide: ChatOpenAI,
  useFactory: (configService: ConfigService) => {
    const openAIApiKey = configService.get<string>('OPENAI_API_KEY');
    const baseURL = configService.get<string>('OPENAI_ENDPOINT');
    const modelName = configService.get<string>('OPENAI_MODEL_NAME'); // Assuming you have this configuration

    return new ChatOpenAI({
      configuration: {
        baseURL,
      },
      openAIApiKey,
      modelName,
    });
  },
  inject: [ConfigService],
};

const embeddingRetrieverOpenAIProvider = {
  provide: ParentDocumentRetriever,
  useFactory: async (configService: ConfigService) => {
    const openAIApiKey = configService.get<string>('OPENAI_API_KEY');
    const baseURL = configService.get<string>('OPENAI_ENDPOINT');
    const modelName = configService.get<string>('OPENAI_EMBEDDING_NAME'); // Assuming you have this configuration
    const collectionName = configService.get<string>('COLLECTION_NAME');

    const embedding = new OpenAIEmbeddings({
      configuration: {
        baseURL: baseURL,
      },
      modelName: modelName,
      openAIApiKey: openAIApiKey,
    });
    const vectorStore = new Chroma(embedding, {
      collectionName,
      url: process.env.CHROMADB_URL,
    });
    await vectorStore.ensureCollection();

    return new ParentDocumentRetriever({
      vectorstore: vectorStore,
      docstore: new RedisDocstore(collectionName),
      parentSplitter: new RecursiveCharacterTextSplitter({
        chunkOverlap: 200,
        chunkSize: 1000,
      }),
      childSplitter: new RecursiveCharacterTextSplitter({
        chunkOverlap: 50,
        chunkSize: 200,
      }),
      childK: 20,
      parentK: 10,
    });
  },
  inject: [ConfigService],
};

@Module({
  controllers: [ChatController],
  providers: [
    ChatService,
    chatOpenAIProvider,
    embeddingRetrieverOpenAIProvider,
  ],
})
export class ChatModule {}
