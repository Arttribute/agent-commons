import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

type UploadArgs = {
  file: Pick<File, "name" | "type">;
  data: Buffer;
  keyPrefix?: string;
};

export function isS3MediaStorageConfigured() {
  return Boolean(
    process.env.COURSE_MEDIA_S3_BUCKET &&
      process.env.COURSE_MEDIA_S3_REGION &&
      (process.env.COURSE_MEDIA_CDN_URL || process.env.COURSE_MEDIA_PUBLIC_URL)
  );
}

export async function uploadCourseMediaToS3({
  file,
  data,
  keyPrefix = "course-media",
}: UploadArgs) {
  const bucket = process.env.COURSE_MEDIA_S3_BUCKET;
  const region = process.env.COURSE_MEDIA_S3_REGION;
  const publicBaseUrl =
    process.env.COURSE_MEDIA_CDN_URL || process.env.COURSE_MEDIA_PUBLIC_URL;

  if (!bucket || !region || !publicBaseUrl) {
    throw new Error("Course media S3 storage is not configured.");
  }

  const key = [
    keyPrefix.replace(/^\/|\/$/g, ""),
    new Date().toISOString().slice(0, 10),
    `${crypto.randomUUID()}-${safeFilename(file.name)}`,
  ].join("/");

  const client = createCourseMediaS3Client(region);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: file.type,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;
}

function createCourseMediaS3Client(region: string) {
  const roleArn = process.env.AWS_ROLE_ARN || process.env.COURSE_MEDIA_AWS_ROLE_ARN;
  if (!roleArn) return new S3Client({ region });

  return new S3Client({
    region,
    credentials: awsCredentialsProvider({
      roleArn,
      audience: "https://sts.amazonaws.com",
      clientConfig: { region },
      roleSessionName: "commonlab-course-media",
    }),
  });
}

function safeFilename(filename: string) {
  const cleaned = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "asset";
}
