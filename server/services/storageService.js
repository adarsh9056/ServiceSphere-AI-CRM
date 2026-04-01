const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

function bucket() {
  return process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || '';
}

function useS3() {
  return !!bucket();
}

let s3Client = null;
function getS3() {
  if (!useS3()) return null;
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    });
  }
  return s3Client;
}

function ensureLocalDir() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

/** @returns {Promise<{ storageKey: string; absPath?: string }>} */
async function persistUploadedFile(file, validatedMime) {
  if (useS3()) {
    const client = getS3();
    const objectKey = `attachments/${crypto.randomBytes(16).toString('hex')}/${path.basename(file.originalname || 'file').replace(/[^\w.\-()+ ]/g, '_')}`;
    const body = fs.readFileSync(file.path);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: objectKey,
        Body: body,
        ContentType: validatedMime,
      }),
    );
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}
    return { storageKey: `s3:${objectKey}` };
  }

  ensureLocalDir();
  const sub = crypto.randomBytes(8).toString('hex');
  const dir = path.join(UPLOAD_ROOT, sub);
  fs.mkdirSync(dir, { recursive: true });
  const safeName = path.basename(file.originalname || 'upload').replace(/[^\w.\-()+ ]/g, '_');
  const dest = path.join(dir, `${Date.now()}-${safeName}`);
  fs.renameSync(file.path, dest);
  const rel = path.relative(UPLOAD_ROOT, dest).replace(/\\/g, '/');
  return { storageKey: rel, absPath: dest };
}

function isS3Key(storageKey) {
  return String(storageKey || '').startsWith('s3:');
}

function s3ObjectKey(storageKey) {
  return String(storageKey).slice(3);
}

async function getPresignedReadUrl(storageKey, attachmentFileName, mimeType) {
  const client = getS3();
  const ttl = Number(process.env.S3_PRESIGN_SECONDS || 120);
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: s3ObjectKey(storageKey),
    ResponseContentType: mimeType,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(attachmentFileName)}"`,
  });
  return getSignedUrl(client, cmd, { expiresIn: ttl });
}

async function getPresignedReadUrlDisposition(storageKey, attachmentFileName, mimeType, disposition) {
  const client = getS3();
  const ttl = Number(process.env.S3_PRESIGN_SECONDS || 120);
  const cd =
    disposition === 'inline'
      ? `inline; filename="${encodeURIComponent(attachmentFileName)}"`
      : `attachment; filename="${encodeURIComponent(attachmentFileName)}"`;
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: s3ObjectKey(storageKey),
    ResponseContentType: mimeType,
    ResponseContentDisposition: cd,
  });
  return getSignedUrl(client, cmd, { expiresIn: ttl });
}

function resolveLocalPath(storageKey) {
  const abs = path.resolve(UPLOAD_ROOT, storageKey);
  const rootResolved = path.resolve(UPLOAD_ROOT);
  if (!abs.startsWith(rootResolved)) return null;
  return abs;
}

module.exports = {
  UPLOAD_ROOT,
  useS3,
  persistUploadedFile,
  isS3Key,
  getPresignedReadUrl,
  getPresignedReadUrlDisposition,
  resolveLocalPath,
  ensureLocalDir,
};
