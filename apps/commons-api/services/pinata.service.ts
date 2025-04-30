import { PinataSDK } from "pinata-web3";
import { Buffer } from "buffer";
import fs from "fs";
import path from "path";

export class PinataService {
  private pinata: PinataSDK;

  constructor() {
    this.pinata = new PinataSDK({
      pinataJwt: process.env.PINATA_JWT,
      pinataGateway: process.env.GATEWAY_URL,
    });
  }

  /**
   * Upload a file to IPFS via Pinata using a Buffer.
   * @param fileBuffer - The file content as a Buffer.
   * @param fileName - The name of the file.
   * @param mimeType - The MIME type (e.g. 'text/plain').
   */
  public async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<any> {
    try {
      // Create a Blob from the file buffer (Node 18+).
      const blob = new Blob([fileBuffer]);
      // Create a File from the blob.
      const file = new File([blob], fileName, { type: mimeType });
      const result = await this.pinata.upload.file(file);
      console.log(`File uploaded to IPFS. CID: ${result.IpfsHash}`);
      return result;
    } catch (error) {
      console.error("Error uploading file to Pinata", error);
      throw error;
    }
  }

  /**
   * Upload a file to IPFS via Pinata using a base64 string.
   */
  public async uploadFileFromBase64(
    base64String: string,
    fileName: string,
    mimeType: string
  ): Promise<any> {
    try {
      const fileBuffer = Buffer.from(base64String, "base64");
      return this.uploadFile(fileBuffer, fileName, mimeType);
    } catch (error) {
      console.error("Error uploading file from base64 to Pinata", error);
      throw error;
    }
  }

  /**
   * Fetch the file content from IPFS via the Pinata gateway.
   */
  public async fetchFile(cid: string): Promise<any> {
    try {
      const response = await this.pinata.gateways.get(cid);
      return response.data;
    } catch (error) {
      console.error("Error fetching file from Pinata", error);
      throw error;
    }
  }

  /**
   * Upload a file from disk.
   */
  public async uploadFileFromDisk(filePath: string): Promise<any> {
    try {
      const absolutePath = path.resolve(filePath);
      const fileBuffer = fs.readFileSync(absolutePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType =
        ext === ".txt" ? "text/plain" : "application/octet-stream";
      return this.uploadFile(fileBuffer, fileName, mimeType);
    } catch (error) {
      console.error("Error reading file from disk", error);
      throw error;
    }
  }

  /**
   * Upload JSON content as a file.
   */
  public async uploadJsonFile(json: any, fileName: string): Promise<any> {
    try {
      const fileBuffer = Buffer.from(JSON.stringify(json, null, 2));
      return this.uploadFile(fileBuffer, fileName, "application/json");
    } catch (error) {
      console.error("Error uploading JSON file to Pinata", error);
      throw error;
    }
  }
}
