const { PutObjectCommand } = require("@aws-sdk/client-s3");

async function createAsset({
  create,
  tenant,
  location,
  assetType,
  objectKey,
  publicUrl,
  fileName,
  contentType,
  sizeBytes,
  user,
  cleanup
}) {
  try {
    return await create({
      tenantId: tenant._id,
      locationId: location?._id,
      assetType,
      objectKey,
      publicUrl,
      fileName,
      contentType,
      sizeBytes,
      userId: user?._id
    });
  } catch (error) {
    await cleanup?.();
    throw error;
  }
}

async function uploadPublicBoardObject({
  assertConfigured,
  getS3Client,
  bucket,
  objectKey,
  publicUrl,
  contentType,
  body
}) {
  assertConfigured();
  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
    Body: body
  }));
  return { objectKey, publicUrl };
}

async function createBinaryAsset({ applicationUpload, legacyUpload, remoteUpload, create, record }) {
  const applicationAsset = await applicationUpload();
  const localAsset = applicationAsset || await legacyUpload();
  const resolvedAsset = localAsset || await remoteUpload();
  const asset = await createAsset({
    create,
    ...record,
    objectKey: resolvedAsset.objectKey,
    publicUrl: resolvedAsset.publicUrl,
    cleanup: applicationAsset?.cleanup
  });
  return { asset };
}

module.exports = { createAsset, createBinaryAsset, uploadPublicBoardObject };
