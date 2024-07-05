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
} from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatOpenAI } from '@langchain/openai';
import { CreateKnowledgeDto } from './dto/create-kb.dto';
import { multerOptions } from 'src/utils/multer.config';
import { FilesInterceptor } from '@nestjs/platform-express';

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
      await this.chatService.createKB(files, createKnowledgeDto);
      res.status(201).send('knowledge base created');
    }
  }

  @Get()
  findAll() {
    return this.chatService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.chatService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateChatDto: UpdateChatDto) {
    return this.chatService.update(+id, updateChatDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.chatService.remove(+id);
  }
}
