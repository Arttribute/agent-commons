import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

type UploadArgs = {
  file: Pick<File, "name" | "type">;
  data: Buffer;
  keyPrefix?: string;
};

export function isS3MediaStorageConfigured() {
  return Boolean(
    environmentValue("COURSE_MEDIA_S3_BUCKET") &&
      environmentValue("COURSE_MEDIA_S3_REGION") &&
      (environmentValue("COURSE_MEDIA_CDN_URL") ||
        environmentValue("COURSE_MEDIA_PUBLIC_URL"))
  );
}

export async function uploadCourseMediaToS3({
  file,
  data,
  keyPrefix = "course-media",
}: UploadArgs) {
  const bucket = environmentValue("COURSE_MEDIA_S3_BUCKET");
  const region = environmentValue("COURSE_MEDIA_S3_REGION");
  const publicBaseUrl =
    environmentValue("COURSE_MEDIA_CDN_URL") ||
    environmentValue("COURSE_MEDIA_PUBLIC_URL");

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

export async function createCourseMediaUpload({
  fileName,
  contentType,
  keyPrefix = "course-media",
}: {
  fileName: string;
  contentType: string;
  keyPrefix?: string;
}) {
  const bucket = environmentValue("COURSE_MEDIA_S3_BUCKET");
  const region = environmentValue("COURSE_MEDIA_S3_REGION");
  const publicBaseUrl =
    environmentValue("COURSE_MEDIA_CDN_URL") ||
    environmentValue("COURSE_MEDIA_PUBLIC_URL");
  if (!bucket || !region || !publicBaseUrl) {
    throw new Error("Course media S3 storage is not configured.");
  }
  const key = [
    keyPrefix.replace(/^\/|\/$/g, ""),
    new Date().toISOString().slice(0, 10),
    `${crypto.randomUUID()}-${safeFilename(fileName)}`,
  ].join("/");
  const client = createCourseMediaS3Client(region);
  const uploadUrl = await getSignedUrl(
    client as never,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }) as never,
    { expiresIn: 10 * 60 },
  );
  return {
    uploadUrl,
    url: `${publicBaseUrl.replace(/\/+$/, "")}/${key}`,
    key,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  };
}

function createCourseMediaS3Client(region: string) {
  const roleArn = resolveCourseMediaAwsRoleArn();
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

export function resolveCourseMediaAwsRoleArn(
  environment?: Partial<
    Record<"COURSE_MEDIA_AWS_ROLE_ARN" | "AWS_ROLE_ARN", string | undefined>
  >,
) {
  const source = environment || process.env;
  const roleArn = [
    source.COURSE_MEDIA_AWS_ROLE_ARN,
    source.AWS_ROLE_ARN,
  ]
    .map((value) => value?.trim())
    .find(Boolean);
  if (!roleArn) return undefined;

  const [prefix, partition, service, region, accountId, resource] =
    roleArn.split(":");
  const isIamRoleArn =
    prefix === "arn" &&
    Boolean(partition) &&
    service === "iam" &&
    region === "" &&
    /^\d{12}$/.test(accountId || "") &&
    Boolean(resource?.startsWith("role/") && resource.length > "role/".length) &&
    !/\s/.test(roleArn);
  if (!isIamRoleArn) {
    throw new Error(
      "Course media AWS role ARN is invalid. Configure COURSE_MEDIA_AWS_ROLE_ARN with a complete IAM role ARN.",
    );
  }
  return roleArn;
}

function environmentValue(name: string) {
  return process.env[name]?.trim() || undefined;
}

function safeFilename(filename: string) {
  const cleaned = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "asset";
}
