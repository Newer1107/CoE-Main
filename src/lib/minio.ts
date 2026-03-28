import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';

const rawEndpoint = process.env.MINIO_ENDPOINT || 'localhost';

let endPoint = rawEndpoint;
let useSSL = process.env.MINIO_USE_SSL === 'true';
let port = parseInt(process.env.MINIO_PORT || '9000');

// Support MINIO_ENDPOINT as either host (minio.example.com) or full URL (https://minio.example.com).
if (/^https?:\/\//i.test(rawEndpoint)) {
  const parsed = new URL(rawEndpoint);
  endPoint = parsed.hostname;

  if (!process.env.MINIO_PORT) {
    port = parsed.port ? parseInt(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  }

  if (typeof process.env.MINIO_USE_SSL === 'undefined') {
    useSSL = parsed.protocol === 'https:';
  }
} else {
  endPoint = rawEndpoint.replace(/\/$/, '');
}

const minioClient = new Minio.Client({
  endPoint,
  port,
  useSSL,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const BUCKET = process.env.MINIO_BUCKET || 'coe-assets';

const toProxyUrl = (objectKey: string) => {
  const encodedPath = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/api/storage/${encodedPath}`;
};

export const initMinio = async () => {
  try {
    const exists = await minioClient.bucketExists(BUCKET);
    if (!exists) {
      await minioClient.makeBucket(BUCKET);
      console.log(`[MinIO] Bucket "${BUCKET}" created.`);
    }
  } catch (err) {
    console.error('[MinIO] Init error:', (err as Error).message);
  }
};

export const uploadFile = async (folder: string, file: { buffer: Buffer; originalname: string; mimetype: string; size: number }) => {
  const ext = file.originalname.split('.').pop();
  const objectKey = `${folder}/${uuidv4()}.${ext}`;
  await minioClient.putObject(BUCKET, objectKey, file.buffer, file.size, {
    'Content-Type': file.mimetype,
  });
  return objectKey;
};

export const uploadFileWithObjectKey = async (
  objectKey: string,
  file: { buffer: Buffer; mimetype: string; size: number }
) => {
  await minioClient.putObject(BUCKET, objectKey, file.buffer, file.size, {
    'Content-Type': file.mimetype,
  });
  return objectKey;
};

export const getSignedUrl = async (objectKey: string, expiry = 3600) => {
  // When MinIO is HTTP-only, proxy through the app so browsers never request insecure URLs directly.
  if (!useSSL || process.env.MINIO_USE_PROXY === 'true') {
    return toProxyUrl(objectKey);
  }
  return await minioClient.presignedGetObject(BUCKET, objectKey, expiry);
};

export const deleteFile = async (objectKey: string) => {
  await minioClient.removeObject(BUCKET, objectKey);
};

export const getObjectStream = async (objectKey: string) => {
  return await minioClient.getObject(BUCKET, objectKey);
};

export const getObjectStat = async (objectKey: string) => {
  return await minioClient.statObject(BUCKET, objectKey);
};
