const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "GetPrio Queue API",
    version: "v1",
    description: "Public metadata and health endpoints for the GetPrio developer API preview. Queue operations will be added in a later release."
  },
  servers: [
    { url: "https://api.getprio.online/v1", description: "Production" },
    { url: "https://sandbox-api.getprio.online/v1", description: "Sandbox" }
  ],
  paths: {
    "/": {
      get: {
        operationId: "getApiMetadata",
        summary: "Get API metadata",
        responses: {
          "200": {
            description: "API metadata",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } }
          }
        }
      }
    },
    "/health": {
      get: {
        operationId: "getApiHealth",
        summary: "Check API health",
        responses: {
          "200": {
            description: "API health status",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      Envelope: {
        type: "object",
        required: ["data", "request_id"],
        properties: {
          data: { type: "object", additionalProperties: true },
          request_id: { type: "string" }
        }
      }
    }
  }
};

module.exports = openApiDocument;
