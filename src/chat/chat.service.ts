/* eslint-disable @typescript-eslint/no-unused-vars */
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { Readable } from 'stream';
import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document';
import {
  normalizeMessages,
  resolveCoreference,
  serializeMessages,
} from './coref';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { SYSTEM_TEMPLATE } from 'src/utils/models';
import { formatDocumentsAsString } from 'langchain/util/document';
import { CreateKnowledgeDto } from './dto/create-kb.dto';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { DocxLoader } from 'langchain/document_loaders/fs/docx';
import { CSVLoader } from 'langchain/document_loaders/fs/csv';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { JSONLoader } from 'langchain/document_loaders/fs/json';
import { ChromaClient } from 'chromadb';
import { createRedisClient } from './embedding/redis.doc.store';
import { IngestDocumentType } from 'src/types/chat';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly chatModel: ChatOpenAI,
    private readonly retriever: ParentDocumentRetriever,
  ) {}

  async sendChat(createChatDto: CreateChatDto) {
    const messages = createChatDto.messages;

    const response = await this.chatModel?.stream(
      messages.map((message) => {
        return [message.role, message.content];
      }),
    );

    return Readable.from(
      (async function* () {
        for await (const chunk of response) {
          console.log(`Received chunk: ${JSON.stringify(chunk)}`);
          const message = {
            message: {
              role: 'assistant',
              content: chunk?.content,
            },
          };
          yield `${JSON.stringify(message)} \n\n`;
        }
      })(),
    );
  }

  async sendKBChat(createChatDto: CreateChatDto) {
    const messages = createChatDto.messages;
    const query = messages[messages.length - 1].content;

    const reformulatedResult = await resolveCoreference(
      query,
      normalizeMessages(messages),
      this.configService.get('OPENAI_API_KEY'),
      this.configService.get('OPENAI_MODEL_NAME'),
    );

    const reformulatedQuery = reformulatedResult.output || query;
    console.log('Reformulated query: ', reformulatedQuery);

    const relevant_docs =
      await this.retriever.getRelevantDocuments(reformulatedQuery);
    console.log('Relevant documents: ', relevant_docs);

    /**
     * 
     * rerank & compress documnets to top N so reduce llm's computing resources
     * 
     *let rerankedDocuments = relevant_docs
      if ((process.env.COHERE_API_KEY || process.env.COHERE_BASE_URL) && process.env.COHERE_MODEL) {
        const options = {
          apiKey: process.env.COHERE_API_KEY,
          baseUrl: process.env.COHERE_BASE_URL,
          model: process.env.COHERE_MODEL,
          topN: 4
        }
        console.log("Cohere Rerank Options: ", options)
        const cohereRerank = new CohereRerank(options)
        rerankedDocuments = await cohereRerank.compressDocuments(relevant_docs, reformulatedQuery)
        console.log("Cohere reranked documents: ", rerankedDocuments)
      }
     */

    const chain = RunnableSequence.from([
      {
        question: (input: { question: string; chatHistory?: string }) =>
          input.question,
        chatHistory: (input: { question: string; chatHistory?: string }) =>
          input.chatHistory ?? '',
        context: async () => {
          return formatDocumentsAsString(relevant_docs);
        },
      },
      PromptTemplate.fromTemplate(SYSTEM_TEMPLATE),
      this.chatModel,
    ]);

    const response = await chain.stream({
      question: query,
      chatHistory: serializeMessages(messages),
    });

    return Readable.from(
      (async function* () {
        for await (const chunk of response) {
          if (chunk?.content !== undefined) {
            const message = {
              message: {
                role: 'assistant',
                content: chunk?.content,
              },
            };
            yield `${JSON.stringify(message)} \n\n`;
          }
        }

        /* const docsChunk = {
          type: 'relevant_documents',
          relevant_documents: relevant_docs,
        };
        yield `${JSON.stringify(docsChunk)} \n\n`; */
      })(),
    );
  }

  async createKB(uploadedFiles: IngestDocumentType[]) {
    try {
      await this.ingestDocument(uploadedFiles);
    } catch (e) {
      throw e;
    }
    return true;
  }

  async findAllCollections() {
    const result = await fetch(
      this.configService.get('CHROMADB_URL') + '/api/v1/collections',
    );
    const data = await result.json();

    /* console.log(this.retriever.vectorstore);
    console.log(
      await this.retriever.docstore.mget([
        'f715f0eb-d191-4587-8b45-ff16f7615de8',
      ]),
    ); */
    /* this.retriever.vectorstore.delete({
      ids: ['8eefbc6f-3ab1-4a59-8bfb-9baf63148e70'],
    }); */
    const client = new ChromaClient({
      path: this.configService.get<string>('CHROMADB_URL'),
    });

    const col = await client.getCollection({ name: 'gao-collection' });
    /* await col.
    console.log(await col.count()); */
    //await col.delete({ ids: ['87cc58a0-3d57-11ef-a8ea-0377a9f8b16a'] });

    return data;
  }

  async findOneCollection(collectionName: string) {
    const client = new ChromaClient({
      path: this.configService.get<string>('CHROMADB_URL'),
    });
    const col = await client.getCollection({ name: collectionName });
    console.log(await col.get());
    const colDetails = await col.get();

    //console.log(colDetails);
    const metadatas = colDetails.metadatas;
    const docs: { name: string; type: string }[] = [];

    metadatas.forEach((chunk) => {
      const el = {
        name: chunk.source as string,
        type: chunk.blobType as string,
      };
      const isDuplicate = docs.some(
        (item) => item.name === el.name && item.type === el.type,
      );
      if (!isDuplicate) docs.push(el);
    });

    console.log(docs);

    return docs;
  }

  update(id: number, updateChatDto: UpdateChatDto) {
    return `This action updates a #${updateChatDto} chat`;
  }

  async removeDocumentsFromCollections(colname: string, docname: string) {
    const client = new ChromaClient({
      path: this.configService.get<string>('CHROMADB_URL'),
    });
    const col = await client.getCollection({ name: colname });

    const idsToDelete = [];
    const idsRedisToDelete = new Set<string>();
    const colDetails = await col.get();
    const ids = colDetails.ids;
    const metadatas = colDetails.metadatas;

    for (let i = 0; i < ids.length; i++) {
      if (metadatas[i].source === docname) {
        idsToDelete.push(ids[i]);
        idsRedisToDelete.add(metadatas[i].doc_id as string);
      }
    }
    console.log(idsRedisToDelete);
    //delete from chromadb
    const res = await col.delete({ ids: idsToDelete });
    //delete from redis

    this.deleteKeys(colname, idsRedisToDelete);
    return `removed #${colname + docname}`;
  }

  private async deleteKeys(colname: string, keys: Set<string>) {
    const keysArray = [...keys];
    const redisInstance = createRedisClient();
    try {
      for (let i = 0; i < keysArray.length; i++) {
        await redisInstance.del(colname + ':' + keysArray[i]);
      }
    } catch (error) {
      console.error(`Error deleting keys:`, error);
    } finally {
      redisInstance.disconnect();
    }
  }
  ingestDocument = async (files: IngestDocumentType[]) => {
    const docs = [];

    for (const file of files) {
      const loadedDocs = await this.loadDocuments(file);
      console.log(loadedDocs);
      loadedDocs.forEach((doc) => (doc.metadata.source = file.originalname));
      docs.push(...loadedDocs);
    }
    await this.retriever.addDocuments(docs);
    console.log(`${docs.length} documents added to collection.`);
  };

  private loadDocuments = async (file: IngestDocumentType) => {
    const Loaders = {
      pdf: PDFLoader,
      json: JSONLoader,
      csv: CSVLoader,
      docx: DocxLoader,
      doc: DocxLoader,
      txt: TextLoader,
      md: TextLoader,
    } as const;

    const ext = (
      file.originalname?.match(/\.(\w+)$/)?.[1] || 'txt'
    ).toLowerCase() as keyof typeof Loaders;
    if (!Loaders[ext]) {
      throw new Error(`Unsupported file type: ${ext}`);
    }
    const blob = new Blob([file.fileBuffer], { type: file.fileType });
    return new Loaders[ext](blob).load();
  };
}
