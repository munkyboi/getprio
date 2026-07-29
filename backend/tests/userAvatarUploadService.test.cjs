const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadService({ env = {}, updateUser = async () => null, send = async () => {} } = {}) {
  const target = require.resolve("../src/services/userAvatarUploadService.js");
  const originals = new Map();
  const mocks = {
    "../config/env": {
      b2Region: "us-east-005",
      b2S3Endpoint: "https://s3.example.test",
      b2BucketPublicBoard: "public-assets",
      b2KeyId: "key-id",
      b2ApplicationKey: "application-key",
      b2PublicBaseUrl: "https://cdn.example.test",
      ...env
    },
    "../repositories/users": { updateUser },
    "@aws-sdk/client-s3": {
      PutObjectCommand: class PutObjectCommand {
        constructor(input) {
          this.input = input;
        }
      },
      S3Client: class S3Client {
        send(command) {
          return send(command);
        }
      }
    }
  };

  for (const [request, exports] of Object.entries(mocks)) {
    const resolved = require.resolve(request, { paths: [path.dirname(target)] });
    originals.set(resolved, require.cache[resolved]);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  }

  try {
    delete require.cache[target];
    return require(target);
  } finally {
    delete require.cache[target];
    for (const [resolved, original] of originals) {
      if (original) require.cache[resolved] = original;
      else delete require.cache[resolved];
    }
  }
}

test("avatar upload stores an immutable public image and updates the user", async () => {
  const commands = [];
  const updates = [];
  const service = loadService({
    send: async (command) => {
      commands.push(command.input);
    },
    updateUser: async (userId, changes) => {
      updates.push({ userId, changes });
      return { _id: userId, avatarUrl: changes.avatarUrl };
    }
  });

  const result = await service.uploadAvatar({
    user: { _id: "42" },
    fileName: "portrait.png",
    contentType: "image/png",
    fileBuffer: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("avatar")
    ])
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].Bucket, "public-assets");
  assert.match(commands[0].Key, /^user-avatars\/users\/42\/.+\.png$/);
  assert.equal(commands[0].ContentType, "image/png");
  assert.equal(commands[0].CacheControl, "public, max-age=31536000, immutable");
  assert.match(result.avatarUrl, /^https:\/\/cdn\.example\.test\/file\/public-assets\/user-avatars\/users\/42\//);
  assert.deepEqual(updates, [{ userId: "42", changes: { avatarUrl: result.avatarUrl } }]);
});

test("avatar upload rejects unsupported files and oversized images", async () => {
  const service = loadService();

  await assert.rejects(
    () => service.uploadAvatar({
      user: { _id: "42" },
      fileName: "portrait.gif",
      contentType: "image/gif",
      fileBuffer: Buffer.from("avatar")
    }),
    { statusCode: 400, message: "Only JPEG, PNG, and WebP avatar images are supported." }
  );

  await assert.rejects(
    () => service.uploadAvatar({
      user: { _id: "42" },
      fileName: "portrait.png",
      contentType: "image/png",
      fileBuffer: Buffer.alloc(service.MAX_UPLOAD_BYTES + 1)
    }),
    { statusCode: 400, message: "Avatar image must be between 1 byte and 5 MB." }
  );

  await assert.rejects(
    () => service.uploadAvatar({
      user: { _id: "42" },
      fileName: "portrait.png",
      contentType: "image/png",
      fileBuffer: Buffer.from("not-a-png")
    }),
    { statusCode: 400, message: "Avatar image content does not match the selected format." }
  );
});
