import { Readable } from "stream";
import { mongo } from "mongoose";
import LabWorkspace from "@/models/LabWorkspace";

const bucketName = "labWorkspaces";

function bucket() {
  const db = LabWorkspace.db.db;
  if (!db) throw new Error("Lab workspace storage is unavailable.");
  return new mongo.GridFSBucket(db, { bucketName });
}

export async function uploadLabFile(
  bytes: Buffer,
  filename: string,
  mimeType: string,
) {
  const upload = bucket().openUploadStream(filename, {
    contentType: mimeType,
    metadata: { private: true },
  });
  await new Promise<void>((resolve, reject) => {
    Readable.from(bytes).pipe(upload).on("error", reject).on("finish", resolve);
  });
  return upload.id;
}

export async function deleteLabFiles(ids: Array<unknown>) {
  const storage = bucket();
  await Promise.allSettled(
    ids
      .filter(Boolean)
      .map((id) => storage.delete(new mongo.ObjectId(String(id)))),
  );
}

export function streamLabFile(id: unknown) {
  return bucket().openDownloadStream(new mongo.ObjectId(String(id)));
}

export function streamResponse(
  id: unknown,
  options: {
    filename: string;
    mimeType: string;
    size?: number;
    download?: boolean;
  },
) {
  const stream = streamLabFile(id);
  const body = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
      stream.on("end", () => controller.close());
      stream.on("error", (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    },
  });
  const disposition = options.download ? "attachment" : "inline";
  const headers: Record<string, string> = {
    "Content-Type": options.mimeType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(options.filename)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (options.size !== undefined)
    headers["Content-Length"] = String(options.size);
  return new Response(body, { headers });
}
