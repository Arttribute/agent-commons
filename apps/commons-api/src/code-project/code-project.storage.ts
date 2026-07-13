import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { BuiltAsset } from './code-project.types';

@Injectable()
export class CodeProjectStorage {
  private client?: S3Client;

  async publish(prefix: string, assets: BuiltAsset[]) {
    const bucket = this.bucket();
    await Promise.all(
      assets.map((asset) =>
        this.s3().send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `${prefix}/${asset.path}`,
            Body: asset.content,
            ContentType: asset.contentType,
            CacheControl: asset.cacheControl,
          }),
        ),
      ),
    );
  }

  async put(prefix: string, asset: BuiltAsset) {
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: `${prefix}/${asset.path}`,
        Body: asset.content,
        ContentType: asset.contentType,
        CacheControl: asset.cacheControl,
      }),
    );
  }

  async get(prefix: string, path: string) {
    const object = await this.s3().send(
      new GetObjectCommand({
        Bucket: this.bucket(),
        Key: `${prefix}/${path}`,
      }),
    );
    if (!object.Body) return null;
    return {
      bytes: Buffer.from(await object.Body.transformToByteArray()),
      contentType: object.ContentType ?? 'application/octet-stream',
      cacheControl: object.CacheControl ?? 'public, max-age=300',
    };
  }

  deploymentPrefix(projectId: string, deploymentId: string) {
    const root = (
      process.env.AGENT_FILES_S3_PREFIX || 'agent-commons-files'
    ).replace(/^\/+|\/+$/g, '');
    return `${root}/code-projects/${projectId}/${deploymentId}`;
  }

  private bucket() {
    const bucket = process.env.AGENT_FILES_S3_BUCKET;
    if (!bucket) {
      throw new ServiceUnavailableException(
        'Project publishing is not configured: AGENT_FILES_S3_BUCKET is missing',
      );
    }
    return bucket;
  }

  private s3() {
    this.client ??= new S3Client({
      region:
        process.env.AGENT_FILES_S3_REGION ||
        process.env.AWS_REGION ||
        'us-east-1',
      endpoint: process.env.AGENT_FILES_S3_ENDPOINT,
      forcePathStyle: process.env.AGENT_FILES_S3_FORCE_PATH_STYLE === 'true',
      credentials:
        process.env.AGENT_FILES_AWS_ACCESS_KEY_ID &&
        process.env.AGENT_FILES_AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AGENT_FILES_AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AGENT_FILES_AWS_SECRET_ACCESS_KEY,
              sessionToken: process.env.AGENT_FILES_AWS_SESSION_TOKEN,
            }
          : undefined,
    });
    return this.client;
  }
}
