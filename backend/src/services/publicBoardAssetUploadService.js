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

module.exports = { createAsset };
