import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  UseInterceptors,
  UploadedFiles,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatOpenAI } from '@langchain/openai';
import { CreateKnowledgeDto } from './dto/create-kb.dto';
import { multerOptions } from 'src/utils/multer.config';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CreateKnowledgeChunkDto } from './dto/create-kb-chunks.dto';
import * as path from 'path';
import * as fs from 'fs';
import { MergeKnowledgeChunkDto } from './dto/merege-kb-chunks.dto';
import { extractExt } from 'src/utils/helper';
import * as mime from 'mime-types';
import { IngestDocumentType } from 'src/types/chat';

const rootDir = path.resolve(__dirname, '..');
const uploadDir = path.join(rootDir, 'uploads');

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatModel: ChatOpenAI,
  ) {}

  @Post('/normal')
  async sendChat(@Body() createChatDto: CreateChatDto, @Res() res: Response) {
    const readableStream = await this.chatService.sendChat(createChatDto);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    readableStream.pipe(res);
    readableStream.on('close', () => {
      console.log(readableStream);
    });
  }

  @Post('/rag')
  async sendKBChat(@Body() createChatDto: CreateChatDto, @Res() res: Response) {
    const readableStream = await this.chatService.sendKBChat(createChatDto);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    readableStream.pipe(res);
    readableStream.on('close', () => {
      console.log(readableStream);
    });
  }

  @Post('/knowledgebases')
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions))
  async createKnowledgebase(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() createKnowledgeDto: CreateKnowledgeDto,
    @Res() res: Response,
  ) {
    if (files.length === 0) {
      res.status(400).send('Must upload at least one file');
    } else {
      const convertedFiles: IngestDocumentType[] = files.map((file) => {
        return {
          originalname: file.originalname,
          fileBuffer: file.buffer,
          fileType: file.mimetype,
        };
      });
      await this.chatService.createKB(convertedFiles);
      res.status(201).send('knowledge base created');
    }
  }

  @Post('/uploadKBChunks')
  @UseInterceptors(FilesInterceptor('chunk', 10, multerOptions))
  async handleKnowledgebaseChunks(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() createKnowledgeChunkDto: CreateKnowledgeChunkDto,
    @Res() res: Response,
  ) {
    if (files.length === 0) {
      res.status(400).send('Must upload at least one file');
    } else {
      //get the

      console.log(uploadDir);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }

      //create the temporary file directory named file hash for chunks storage
      const fileDir = path.resolve(uploadDir, createKnowledgeChunkDto.fileHash);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir);
      }
      const chunkData = files[0].buffer;
      const chunkFilePath = `${fileDir}/${createKnowledgeChunkDto.chunkHash}`;

      if (fs.existsSync(chunkFilePath)) {
        res.status(201).send('chunks already exists');
      } else {
        try {
          await fs.promises.writeFile(chunkFilePath, chunkData);
          console.log(`chunk-${chunkFilePath} saved to temporary folder`);
        } catch (error) {
          console.error(error);
        }
        /* await this.chatService.createKB(files, createKnowledgeDto); */
        res
          .status(201)
          .send(
            'chunk: ' +
              createKnowledgeChunkDto.chunkHash +
              ' uploaded successfully',
          );
      }
    }
  }

  @Post('/mergeKBChunks')
  async mergeeKnowledgebaseChunks(
    @Body() mergeKnowledgeChunkDto: MergeKnowledgeChunkDto,
  ) {
    console.log(`mergeKBChunks`);
    console.log(mergeKnowledgeChunkDto);
    console.log(`mergeKBChunks`);
    const fileDir = path.resolve(uploadDir, mergeKnowledgeChunkDto.fileHash);
    if (!fs.existsSync(fileDir)) {
      return 'failed to merge';
    }
    const filePath = path.resolve(
      uploadDir,
      mergeKnowledgeChunkDto.fileHash +
        extractExt(mergeKnowledgeChunkDto.fileName),
    );

    const chunks = await fs.promises.readdir(fileDir);
    console.log(chunks);

    const sortedChunks = chunks.sort((a, b) => {
      return parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]);
    });

    const tasks = sortedChunks.map((chunkName, index) => {
      return new Promise<void>((resolve) => {
        const chunkPath = path.resolve(fileDir, chunkName);
        const readStream = fs.createReadStream(chunkPath);
        const writeStream = fs.createWriteStream(filePath, {
          start: index * mergeKnowledgeChunkDto.chunkSize,
          //end: (index + 1) * mergeKnowledgeChunkDto.chunkSize,
        });
        readStream.on('end', () => {
          resolve();
        });
        readStream.pipe(writeStream);
      });
    });

    await Promise.all(tasks);
    fs.rmSync(fileDir, { recursive: true });

    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = mime.lookup(filePath);

    const files: IngestDocumentType[] = [
      {
        originalname: mergeKnowledgeChunkDto.fileName,
        fileBuffer: fileBuffer,
        fileType: mimeType as string,
      },
    ];
    //call the vertor embedding function to process the document
    await this.chatService.ingestDocument(files);
    return 'merge successfully and document is added to vector store';
  }

  @Get('/verifyUpload')
  async verifyUpload(@Query('fileHash') fileHash: string) {
    console.log(fileHash);
    const fileDir = path.resolve(uploadDir, fileHash);
    if (!fs.existsSync(fileDir)) {
      return {
        uploadedChunks: [],
      };
    } else {
      const chunks = await fs.promises.readdir(fileDir);
      return {
        uploadedChunks: [...chunks],
      };
    }
  }

  @Get('/collections')
  findAllCollections() {
    return this.chatService.findAllCollections();
  }

  @Get('/collection/:collectionName')
  findOne(@Param('collectionName') collectionName: string) {
    return this.chatService.findOneCollection(collectionName);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateChatDto: UpdateChatDto) {
    return this.chatService.update(+id, updateChatDto);
  }

  @Delete('/collection/delete')
  remove(@Query('colname') colname: string, @Query('docname') docname: string) {
    return this.chatService.removeDocumentsFromCollections(colname, docname);
  }
}
