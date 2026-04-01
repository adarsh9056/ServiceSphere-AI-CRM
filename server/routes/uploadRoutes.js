const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { UserRole } = require('@prisma/client');
const { getTokenFromRequest } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const { prisma } = require('../graphql/resolvers');
const { validateUploadedFile, contentDispositionMode } = require('../services/attachmentPolicy');
const {
  UPLOAD_ROOT,
  ensureLocalDir,
  persistUploadedFile,
  isS3Key,
  resolveLocalPath,
  getPresignedReadUrlDisposition,
  useS3,
} = require('../services/storageService');

const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 15 * 1024 * 1024);

function jwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret';
}

async function userFromRequest(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret());
    return prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    });
  } catch {
    return null;
  }
}

function registerUploadRoutes(app) {
  ensureLocalDir();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tmp = path.join(UPLOAD_ROOT, '.tmp', crypto.randomBytes(8).toString('hex'));
      fs.mkdirSync(tmp, { recursive: true });
      cb(null, tmp);
    },
    filename: (_req, file, cb) => {
      const safe = path.basename(file.originalname).replace(/[^\w.\-()+ ]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES },
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      const user = await userFromRequest(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Missing file' });
      }

      const v = validateUploadedFile(req.file, MAX_BYTES);
      if (!v.ok) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (_) {}
        return res.status(400).json({ error: v.error || 'Invalid file' });
      }

      const leadId = req.body.leadId || null;
      if (leadId) {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (_) {}
          return res.status(404).json({ error: 'Lead not found' });
        }
        if (user.role === UserRole.SALESPERSON && lead.assignedToId !== user.id) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (_) {}
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      const stored = await persistUploadedFile(req.file, v.mimeType);
      const att = await prisma.attachment.create({
        data: {
          fileName: req.file.originalname || 'upload',
          mimeType: v.mimeType,
          storageKey: stored.storageKey,
          sizeBytes: req.file.size,
          leadId,
          uploadedById: user.id,
        },
      });
      const base = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
      const downloadUrl = base ? `${base}/api/files/${att.id}` : `/api/files/${att.id}`;
      return res.json({
        id: att.id,
        fileName: att.fileName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        downloadUrl,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Upload failed' });
    }
  });

  app.get('/api/files/:id', async (req, res) => {
    try {
      const user = await userFromRequest(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const att = await prisma.attachment.findUnique({
        where: { id: req.params.id },
        include: { lead: true },
      });
      if (!att) return res.status(404).end();
      if (att.leadId) {
        const lead = att.lead;
        if (user.role === UserRole.SALESPERSON && lead.assignedToId !== user.id) {
          return res.status(403).end();
        }
      }

      const disp = contentDispositionMode(att.mimeType);

      if (isS3Key(att.storageKey)) {
        if (!useS3()) return res.status(500).end();
        const url = await getPresignedReadUrlDisposition(
          att.storageKey,
          att.fileName,
          att.mimeType,
          disp,
        );
        return res.redirect(302, url);
      }

      const abs = resolveLocalPath(att.storageKey);
      if (!abs || !fs.existsSync(abs)) return res.status(404).end();
      res.setHeader('Content-Type', att.mimeType);
      res.setHeader(
        'Content-Disposition',
        `${disp}; filename="${encodeURIComponent(att.fileName)}"`,
      );
      return fs.createReadStream(abs).pipe(res);
    } catch (e) {
      return res.status(500).end();
    }
  });
}

module.exports = { registerUploadRoutes, UPLOAD_ROOT };
