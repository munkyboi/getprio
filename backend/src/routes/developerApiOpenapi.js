const envelopeResponse = (description) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } }
});

const apiKeyResponses = (successDescription, notFoundDescription = "Tenant not found.") => ({
  "200": envelopeResponse(successDescription),
  "401": { description: "Missing or invalid API key." },
  "403": { description: "API key is missing the queues:read scope." },
  "404": { description: notFoundDescription }
});

const pathParameter = (name, description) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
  ...(description ? { description } : {})
});

const queueParameters = (location = false) => [
  pathParameter("tenantSlug", "The active GetPrio tenant slug."),
  ...(location ? [pathParameter("locationSlug")] : [])
];

const queueReadPath = ({ operationId, summary, successDescription, location = false }) => ({
  get: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: queueParameters(location),
    responses: apiKeyResponses(successDescription, location ? "Tenant or location not found." : undefined)
  }
});

const queueStreamPath = ({ operationId, summary, location = false }) => ({
  get: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: queueParameters(location),
    responses: {
      "200": { description: "Server-Sent Events stream of queue snapshots." },
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:read scope." },
      "404": { description: location ? "Tenant or location not found." : "Tenant not found." }
    }
  }
});

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
        responses: { "200": envelopeResponse("API metadata") }
      }
    },
    "/health": {
      get: {
        operationId: "getApiHealth",
        summary: "Check API health",
        responses: { "200": envelopeResponse("API health status") }
      }
    },
    "/queues/{tenantSlug}": queueReadPath({
      operationId: "getQueueSnapshot",
      summary: "Read a public queue snapshot",
      successDescription: "Queue snapshot"
    }),
    "/queues/{tenantSlug}/locations": queueReadPath({
      operationId: "listQueueLocations",
      summary: "List active queue locations",
      successDescription: "Active queue locations"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}": queueReadPath({
      operationId: "getLocationQueueSnapshot",
      summary: "Read a location queue snapshot",
      successDescription: "Location queue snapshot",
      location: true
    }),
    "/queues/{tenantSlug}/stream": queueStreamPath({
      operationId: "streamQueueSnapshots",
      summary: "Stream queue snapshot updates"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/stream": queueStreamPath({
      operationId: "streamLocationQueueSnapshots",
      summary: "Stream location queue snapshot updates",
      location: true
    })
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
