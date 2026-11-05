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

async function createBinaryAsset({
  applicationStore,
  legacyStore,
  purpose,
  tenant,
  location,
  actorUserId,
  contentType,
  body,
  assertConfigured,
  getS3Client,
  bucket,
  objectKey,
  publicUrl,
  create,
  record
}) {
  const applicationAsset = await applicationStore({ purpose, tenant, location, actorUserId, contentType, body });
  const localAsset = applicationAsset || await legacyStore({ tenant, location, contentType, body });
  const resolvedAsset = localAsset || await uploadPublicBoardObject({
    assertConfigured, getS3Client, bucket, objectKey, publicUrl, contentType, body
  });
  const asset = await createAsset({
    create,
    ...record,
    objectKey: resolvedAsset.objectKey,
    publicUrl: resolvedAsset.publicUrl,
    cleanup: applicationAsset?.cleanup
  });
  return { asset };
}

function buildBinaryAssetContext(
  applicationStore,
  legacyStore,
  tenant,
  location,
  actorUserId,
  contentType,
  body,
  assertConfigured,
  getS3Client,
  bucket,
  objectKey,
  publicUrl
) {
  return {
    applicationStore,
    legacyStore,
    tenant,
    location,
    actorUserId,
    contentType,
    body,
    assertConfigured,
    getS3Client,
    bucket,
    objectKey,
    publicUrl
  };
}

module.exports = { buildBinaryAssetContext, createAsset, createBinaryAsset, uploadPublicBoardObject };
