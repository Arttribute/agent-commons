// src/pinata/pinata.controller.ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  Get,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PinataService } from './pinata.service';

@Controller('pinata')
export class PinataController {
  constructor(private readonly pinataService: PinataService) {}

  /**
   * Endpoint to upload a file via multipart/form-data.
   * POST /pinata/upload
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const result = await this.pinataService.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return result;
  }

  /**
   * Endpoint to upload a file using a base64-encoded string.
   * POST /pinata/upload/base64
   * Expected JSON body: { "base64": "<base64_string>", "fileName": "example.txt", "mimeType": "text/plain" }
   */
  @Post('upload/base64')
  async uploadFileBase64(
    @Body() body: { base64: string; fileName: string; mimeType: string },
  ) {
    const { base64, fileName, mimeType } = body;
    const result = await this.pinataService.uploadFileFromBase64(
      base64,
      fileName,
      mimeType,
    );
    return result;
  }

  /**
   * Endpoint to fetch a file from IPFS by CID.
   * GET /pinata/fetch/:cid
   */
  @Get('fetch/:cid')
  async fetchFile(@Param('cid') cid: string) {
    const data = await this.pinataService.fetchFile(cid);
    return data;
  }
}
