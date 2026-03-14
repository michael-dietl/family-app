#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import PocketBase from 'pocketbase';
import sharp from 'sharp';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', '3gp', 'mpeg', 'mpg', 'ogg', 'flv']);
const VIDEO_MIME_OVERRIDES = new Map([
  ['mp4', 'video/mp4'],
  ['mov', 'video/quicktime'],
  ['3gp', 'video/3gpp'],
  ['mkv', 'video/x-matroska'],
  ['avi', 'video/x-msvideo'],
  ['webm', 'video/webm'],
  ['mpeg', 'video/mpeg'],
  ['mpg', 'video/mpeg'],
  ['ogg', 'video/ogg'],
  ['flv', 'video/x-flv']
]);
const DEFAULT_SOURCE_DIRECTORY = './import-galleries';
const DEFAULT_TARGET_LONG_EDGE = 1920;
const DEFAULT_MIN_LONG_EDGE = 1920;
const CLI_NAME = 'scripts/import-pocketbase-galleries.mjs';

function parseOptions(rawArgs) {
  const result = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith('--')) continue;
    const trimmed = arg.slice(2);
    const [key, value] = trimmed.split('=');
    if (value !== undefined) {
      result[key] = value;
      continue;
    }
    const next = rawArgs[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  return value === 'true';
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeFilterValue(value) {
  return value.replace(/"/g, '\\"');
}

function formatMimeType(format, forceVideo = false) {
  if (!format) return 'image/jpeg';
  const normalized = format.toLowerCase();
  const overrideVideo = VIDEO_MIME_OVERRIDES.get(normalized);
  if (overrideVideo) return overrideVideo;
  if (!forceVideo && (normalized === 'jpg' || normalized === 'jpeg')) return 'image/jpeg';
  if (!forceVideo && IMAGE_EXTENSIONS.has(normalized)) return `image/${normalized}`;
  if (forceVideo) return `video/${normalized}`;
  return `image/${normalized}`;
}

function detectMediaType(filename) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (!ext) return null;
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  if (!isImage && !isVideo) return null;
  return {
    extension: ext,
    type: isImage ? 'image' : 'video'
  };
}

function printHelp() {
  console.log(`
Usage:
  node ${CLI_NAME} --url=http://localhost:8090 --identity=user --password=secret [OPTIONS]

Options:
  --source=PATH             Base folder that contains a directory per gallery (default: ${DEFAULT_SOURCE_DIRECTORY})
  --url=POCKETBASE_URL      Base URL of the PocketBase instance (required unless --dry-run is set)
  --identity=USER           Username or email for login (aliases: --username, --email)
  --password=SECRET         Password for the identity (required unless --dry-run is set)
  --force-new               Always create a gallery even if a matching name already exists
  --dry-run                 Scan folders but skip any PocketBase writes
  --target-long-edge=VALUE  Maximum long edge for resized photos (default: ${DEFAULT_TARGET_LONG_EDGE})
  --min-long-edge=VALUE     Do not use resized image if its long edge falls below this (default: ${DEFAULT_MIN_LONG_EDGE})
  --help                    Show this help text
`);
}

async function ensureDirectory(dir) {
  try {
    const stats = await fs.stat(dir);
    if (!stats.isDirectory()) {
      throw new Error(`${dir} is not a directory`);
    }
  } catch (error) {
    throw new Error(`Source directory is not readable: ${error.message}`);
  }
}

async function findGalleryByName(pb, name) {
  try {
    const filter = `name="${escapeFilterValue(name)}"`;
    const list = await pb.collection('galleries').getList(1, 1, { filter });
    return list.items?.[0] ?? null;
  } catch (error) {
    console.warn('Gallery lookup failed, continuing as if it does not exist', error.message);
    return null;
  }
}

async function createGallery(pb, name, authorId) {
  return pb.collection('galleries').create({
    name,
    description: 'Imported via CLI',
    showOnMapAndTimeline: true,
    pb_author: authorId,
    updated: new Date().toISOString()
  });
}

async function createPhotoRecord(pb, galleryReference, filename, width, height, filesize, mimeType, authorId, isVideo = false) {
  return pb.collection('photos').create({
    foreignID: null,
    galleryId: galleryReference,
    filename,
    width,
    height,
    filesize,
    mimeType,
    isVideo,
    dateTaken: null,
    camera: null,
    lens: null,
    focalLength: null,
    aperture: null,
    shutterSpeed: null,
    iso: null,
    pb_author: authorId,
    updated: new Date().toISOString()
  });
}

async function uploadPhotoFile(pb, recordId, buffer, filename, mimeType) {
  const formData = new FormData();
  formData.append('picture', new Blob([buffer], { type: mimeType }), filename);
  return pb.collection('photos').update(recordId, formData);
}

async function optimizeImage(filePath, targetLongEdge, minLongEdge) {
  const input = await fs.readFile(filePath);
  const originalMeta = await sharp(input).metadata();
  const pipeline = sharp(input)
    .rotate()
    .resize({ width: targetLongEdge, height: targetLongEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, chromaSubsampling: '4:4:4' })
    .withMetadata({ exif: originalMeta.exif, icc: originalMeta.icc });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const finalLongEdge = Math.max(info.width ?? 0, info.height ?? 0);
  if (finalLongEdge < minLongEdge) {
    return {
      buffer: input,
      width: originalMeta.width ?? 0,
      height: originalMeta.height ?? 0,
      mimeType: formatMimeType(originalMeta.format)
    };
  }

  return {
    buffer: data,
    width: info.width ?? originalMeta.width ?? 0,
    height: info.height ?? originalMeta.height ?? 0,
    mimeType: 'image/jpeg'
  };
}

async function loadVideoFile(filePath, extension) {
  const buffer = await fs.readFile(filePath);
  return {
    buffer,
    width: 0,
    height: 0,
    mimeType: formatMimeType(extension, true)
  };
}

async function scanMediaUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const mediaFiles = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const media = detectMediaType(entry.name);
    if (!media) continue;
    mediaFiles.push({ filename: entry.name, ...media });
  }
  return mediaFiles.sort((a, b) => a.filename.localeCompare(b.filename, 'en', { numeric: true }));
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const sourceDirectory = path.resolve(options.source || DEFAULT_SOURCE_DIRECTORY);
  const pbUrl = options.url;
  const identity = options.identity || options.username || options.email;
  const password = options.password;
  const dryRun = toBoolean(options['dry-run']);
  const forceNewGallery = toBoolean(options['force-new']);

  const targetLongEdge = Math.max(toNumber(options['target-long-edge'], DEFAULT_TARGET_LONG_EDGE), DEFAULT_MIN_LONG_EDGE);
  const minLongEdge = Math.min(toNumber(options['min-long-edge'], DEFAULT_MIN_LONG_EDGE), targetLongEdge);

  if (!dryRun) {
    if (!pbUrl || !identity || !password) {
      console.error('Missing --url, --identity, or --password');
      printHelp();
      process.exit(1);
    }
  }

  await ensureDirectory(sourceDirectory);

  const galleryDirs = (await fs.readdir(sourceDirectory, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

  if (galleryDirs.length === 0) {
    console.log('No gallery folders found in', sourceDirectory);
    return;
  }

  const pb = dryRun ? null : new PocketBase(pbUrl);
  let pbAuthorId = null;
  if (pb && !dryRun) {
    await pb.collection('users').authWithPassword(identity, password);
    pbAuthorId = pb.authStore.model?.id ?? null;
    console.log('Authenticated with PocketBase, user id:', pbAuthorId ?? 'unknown');
  }

  const summary = { galleries: 0, media: 0 };

  for (const dirent of galleryDirs) {
    const galleryName = dirent.name;
    const fullGalleryPath = path.join(sourceDirectory, dirent.name);
    const mediaFiles = await scanMediaUnder(fullGalleryPath);
    if (mediaFiles.length === 0) {
      console.log(`Skipping empty gallery ${galleryName}`);
      continue;
    }

    let galleryId = `dry-run-${galleryName}`;
    if (!dryRun) {
      if (!forceNewGallery) {
        const existing = await findGalleryByName(pb, galleryName);
        if (existing) {
          galleryId = existing.id;
          console.log(`Reusing gallery ${galleryName} (${galleryId})`);
        }
      }
      if (galleryId === `dry-run-${galleryName}`) {
        const created = await createGallery(pb, galleryName, pbAuthorId);
        galleryId = created.id;
        console.log(`Created gallery ${galleryName} (${galleryId})`);
      }
    } else {
      console.log(`Dry run: would create gallery ${galleryName}`);
    }

    summary.galleries += 1;

    for (const { filename, type, extension } of mediaFiles) {
      const filePath = path.join(fullGalleryPath, filename);
      const isVideo = type === 'video';
      try {
        const optimized = isVideo
          ? await loadVideoFile(filePath, extension)
          : await optimizeImage(filePath, targetLongEdge, minLongEdge);
        if (dryRun) {
          const mediaLabel = isVideo ? 'video' : 'photo';
          const sizeLabel = isVideo ? 'video file' : `${optimized.width}x${optimized.height}`;
          console.log(`Dry run: would upload ${mediaLabel} ${filename} (${sizeLabel})`);
        } else {
          const photoRecord = await createPhotoRecord(
            pb,
            0,
            filename,
            optimized.width,
            optimized.height,
            optimized.buffer.length,
            optimized.mimeType,
            pbAuthorId,
            isVideo
          );
          await uploadPhotoFile(pb, photoRecord.id, optimized.buffer, filename, optimized.mimeType);
          console.log(`Uploaded ${filename} to ${galleryName}`);
        }
        summary.media += 1;
      } catch (error) {
        console.warn(`Failed to import ${filename} from ${galleryName}:`, error.message);
      }
    }
  }

  console.log(`
Imported ${summary.galleries} galleries and ${summary.media} media items (dry run: ${dryRun}).
`);
}

await main().catch(error => {
  console.error('Import failed:', error);
  process.exit(1);
});
