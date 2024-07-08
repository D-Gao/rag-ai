/* eslint-disable @typescript-eslint/no-unused-vars */
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatOpenAI } from '@langchain/openai';
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

  async createKB(
    uploadedFiles: Express.Multer.File[],
    createKnowledgeDto: CreateKnowledgeDto,
  ) {
    try {
      await this.ingestDocument(uploadedFiles);
    } catch (e) {
      throw e;
    }
    return true;
  }

  findAll() {
    return `This action returns all chat`;
  }

  findOne(id: number) {
    return `This action returns a #${id} chat`;
  }

  update(id: number, updateChatDto: UpdateChatDto) {
    return `This action updates a #${updateChatDto} chat`;
  }

  remove(id: number) {
    return `This action removes a #${id} chat`;
  }

  private ingestDocument = async (files: Express.Multer.File[]) => {
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

  private loadDocuments = async (file: Express.Multer.File) => {
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
    const blob = new Blob([file.buffer], { type: file.mimetype });
    return new Loaders[ext](blob).load();
  };
}
