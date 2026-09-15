const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "GetPrio Queue API",
    version: "v1",
    description: "Versioned GetPrio queue API. Metadata and health are public; queue snapshots require a sandbox or production API key with the queues:read scope."
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
    },
    "/queues/{tenantSlug}": {
      get: {
        operationId: "getQueueSnapshot",
        summary: "Read a public queue snapshot",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: "tenantSlug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The active GetPrio tenant slug."
          }
        ],
        responses: {
          "200": {
            description: "Queue snapshot",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } }
          },
          "401": { description: "Missing or invalid API key." },
          "403": { description: "API key is missing the queues:read scope." },
          "404": { description: "Tenant not found." }
        }
      }
    },
    "/queues/{tenantSlug}/locations": {
      get: {
        operationId: "listQueueLocations",
        summary: "List active queue locations",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: "tenantSlug",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "Active queue locations",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } }
          },
          "401": { description: "Missing or invalid API key." },
          "403": { description: "API key is missing the queues:read scope." },
          "404": { description: "Tenant not found." }
        }
      }
    },
    "/queues/{tenantSlug}/locations/{locationSlug}": {
      get: {
        operationId: "getLocationQueueSnapshot",
        summary: "Read a location queue snapshot",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: "tenantSlug",
            in: "path",
            required: true,
            schema: { type: "string" }
          },
          {
            name: "locationSlug",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "Location queue snapshot",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } }
          },
          "401": { description: "Missing or invalid API key." },
          "403": { description: "API key is missing the queues:read scope." },
          "404": { description: "Tenant or location not found." }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Use a key issued for the matching API host environment."
      }
    },
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
