// src/pinata/pinata.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PinataSDK } from 'pinata-web3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PinataService {
  private readonly logger = new Logger(PinataService.name);
  private pinata: PinataSDK;

  constructor() {
    // Initialize the PinataSDK with env variables.
    this.pinata = new PinataSDK({
      pinataJwt: process.env.PINATA_JWT,
      pinataGateway: process.env.GATEWAY_URL,
    });
  }

  /**
   * Upload a file to IPFS via Pinata using a Buffer.
   * @param fileBuffer - The file content as a Buffer.
   * @param fileName - The name of the file.
   * @param mimeType - The MIME type (e.g. "text/plain").
   * @returns The upload result, including the IPFS hash.
   */
  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<any> {
    try {
      // Create a Blob from the file buffer. (Node v18+ supports Blob natively.)
      const blob = new Blob([fileBuffer]);
      // Create a File object from the blob.
      const file = new File([blob], fileName, { type: mimeType });
      const result = await this.pinata.upload.file(file);
      this.logger.log(`File uploaded to IPFS. CID: ${result.IpfsHash}`);
      return result;
    } catch (error) {
      this.logger.error('Error uploading file to Pinata', error);
      throw error;
    }
  }

  /**
   * Upload a file to IPFS via Pinata using a base64 string.
   * @param base64String - The file content encoded in base64.
   * @param fileName - The name of the file.
   * @param mimeType - The MIME type (e.g. "text/plain").
   * @returns The upload result, including the IPFS hash.
   */
  async uploadFileFromBase64(
    base64String: string,
    fileName: string,
    mimeType: string,
  ): Promise<any> {
    try {
      // Convert base64 string to Buffer.
      const fileBuffer = Buffer.from(base64String, 'base64');
      return this.uploadFile(fileBuffer, fileName, mimeType);
    } catch (error) {
      this.logger.error('Error uploading file from base64 to Pinata', error);
      throw error;
    }
  }

  /**
   * Fetch the file content from IPFS via the Pinata gateway.
   * @param cid - The IPFS CID.
   * @returns The fetched file data.
   */
  async fetchFile(cid: string): Promise<any> {
    try {
      const response = await this.pinata.gateways.get(cid);
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching file from Pinata', error);
      throw error;
    }
  }

  /**
   * (Optional) Upload a file from disk.
   * @param filePath - The path to the file.
   */
  async uploadFileFromDisk(filePath: string): Promise<any> {
    try {
      const absolutePath = path.resolve(filePath);
      const fileBuffer = fs.readFileSync(absolutePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType =
        ext === '.txt' ? 'text/plain' : 'application/octet-stream';
      return this.uploadFile(fileBuffer, fileName, mimeType);
    } catch (error) {
      this.logger.error('Error reading file from disk', error);
      throw error;
    }
  }
}
