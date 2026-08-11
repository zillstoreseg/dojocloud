import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';

export interface StoredFile {
  url: string;
  key: string;
  size: number;
  contentType: string;
}

export const UPLOAD_LIMITS = {
  image: { maxBytes: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  document: {
    maxBytes: 10 * 1024 * 1024,
    types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },
} as const;

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

function safeExtension(filename: string, contentType: string): string {
  const fromName = path.extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, '');
  if (fromName && fromName.length <= 6) return fromName;
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
  };
  return map[contentType] ?? '.bin';
}

function validate(file: File, kind: keyof typeof UPLOAD_LIMITS) {
  const limit = UPLOAD_LIMITS[kind];
  if (file.size > limit.maxBytes) {
    throw new UploadError(`حجم الملف يتجاوز ${Math.round(limit.maxBytes / 1024 / 1024)} ميجابايت`);
  }
  if (!(limit.types as readonly string[]).includes(file.type)) {
    throw new UploadError('نوع الملف غير مدعوم');
  }
}

/**
 * Stores an uploaded file and returns its public URL.
 *
 * `folder` is a caller-controlled bucket path (e.g. `certificates/<trainerId>`);
 * the stored filename is always a fresh UUID, so a hostile original filename
 * can never traverse or overwrite anything.
 */
export async function uploadFile(
  file: File,
  folder: string,
  kind: keyof typeof UPLOAD_LIMITS = 'document',
): Promise<StoredFile> {
  validate(file, kind);

  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\.\./g, '');
  const key = `${safeFolder}/${randomUUID()}${safeExtension(file.name, file.type)}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (env.STORAGE_DRIVER === 's3') {
    return uploadToS3(key, bytes, file.type);
  }

  const target = path.join(process.cwd(), 'public', 'uploads', key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);

  return { url: `/uploads/${key}`, key, size: file.size, contentType: file.type };
}

/**
 * S3-compatible upload via signature-free presigned PUT is not available, so we
 * use the AWS REST API through fetch with SigV4 handled by the runtime SDK when
 * configured. Kept behind the same interface so switching drivers needs no
 * call-site changes.
 */
async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<StoredFile> {
  const { S3_ENDPOINT, S3_BUCKET, S3_PUBLIC_URL } = env;
  if (!S3_ENDPOINT || !S3_BUCKET) {
    throw new UploadError('S3 storage is selected but S3_ENDPOINT/S3_BUCKET are missing');
  }

  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3').catch(() => {
    throw new UploadError('Install @aws-sdk/client-s3 to use the s3 storage driver');
  });

  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
    },
  });

  await client.send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );

  const base = S3_PUBLIC_URL ?? `${S3_ENDPOINT}/${S3_BUCKET}`;
  return { url: `${base}/${key}`, key, size: body.byteLength, contentType };
}

export async function deleteFile(key: string): Promise<void> {
  if (env.STORAGE_DRIVER === 's3') {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3').catch(() => ({
      S3Client: null,
      DeleteObjectCommand: null,
    }));
    if (!S3Client || !DeleteObjectCommand) return;
    const client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
      },
    });
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return;
  }

  const target = path.join(process.cwd(), 'public', 'uploads', key);
  await unlink(target).catch(() => undefined);
}
