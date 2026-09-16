const envelopeResponse = (description) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } }
});

const apiKeyResponses = (successDescription, notFoundDescription = "Developer profile not found.") => ({
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

const idempotencyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 128 },
  description: "A unique key for this ticket issuance attempt. Retrying the same key returns the original ticket."
};

const queueParameters = (location = false) => [
  pathParameter("tenantSlug", "The developer project profile slug. This legacy path parameter name is retained for v1 compatibility."),
  ...(location ? [pathParameter("locationSlug", "The profile-owned queue slug. This legacy path parameter name is retained for v1 compatibility.")] : [])
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

const queueWritePath = ({ operationId, summary, location = false }) => ({
  post: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [...queueParameters(location), idempotencyParameter],
    requestBody: {
      required: true,
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/IssueTicketRequest" } }
      }
    },
    responses: {
      "201": envelopeResponse("Issued queue ticket"),
      "400": { description: "Invalid ticket details." },
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:write scope." },
      "404": { description: location ? "Tenant or location not found." : "Tenant not found." },
      "409": { description: "The idempotency key is already in use or queue intake is unavailable." }
    }
  }
});

const queueActionPath = ({ operationId, summary, location = false }) => ({
  post: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [...queueParameters(location), idempotencyParameter],
    responses: {
      "200": envelopeResponse("Queue action result"),
      "400": { description: "The queue cannot advance until the current ticket is resolved." },
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:write scope." },
      "404": { description: location ? "Tenant or location not found." : "Tenant not found." },
      "409": { description: "Queue intake is unavailable or the idempotency key is already in use." }
    }
  }
});

const queueResolutionPath = ({ operationId, summary, status, location = false }) => ({
  post: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [...queueParameters(location), idempotencyParameter],
    responses: {
      "200": envelopeResponse(`Current ticket ${status} result`),
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:write scope." },
      "404": { description: location ? "Tenant or location not found." : "Tenant not found." },
      "409": { description: "The current ticket cannot transition to this status." }
    }
  }
});

const queueTicketActionPath = ({ operationId, summary, action, location = false }) => ({
  post: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [
      ...queueParameters(location),
      pathParameter("ticketId", "The opaque queue ticket identifier."),
      idempotencyParameter
    ],
    responses: {
      "200": envelopeResponse(`Queue ticket ${action} result`),
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:write scope." },
      "404": { description: "Ticket, tenant, or location not found." },
      "409": { description: `Ticket cannot be ${action}d from its current status.` }
    }
  }
});

const queueTicketReadPath = ({ operationId, summary, location = false }) => ({
  get: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [
      ...queueParameters(location),
      pathParameter("ticketId", "The opaque queue ticket identifier.")
    ],
    responses: {
      "200": envelopeResponse("Queue ticket status"),
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:read scope." },
      "404": { description: "Ticket, tenant, or location not found." }
    }
  }
});

const queueTicketEventsPath = ({ operationId, summary, location = false }) => ({
  get: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [
      ...queueParameters(location),
      pathParameter("ticketId", "The opaque queue ticket identifier."),
      {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        description: "Maximum number of lifecycle events to return."
      },
      {
        name: "cursor",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Cursor from a previous response to continue through the event history."
      }
    ],
    responses: {
      "200": envelopeResponse("Queue ticket lifecycle events"),
      "400": { description: "The event limit is invalid." },
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:read scope." },
      "404": { description: "Ticket, tenant, or location not found." }
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
    "/profiles": {
      get: {
        operationId: "listProfiles",
        summary: "List developer profiles",
        security: [{ ApiKeyAuth: [] }],
        responses: { "200": envelopeResponse("Developer profiles"), "401": { description: "Missing or invalid API key." }, "403": { description: "API key is missing the profiles:read scope." } }
      },
      post: {
        operationId: "createProfile",
        summary: "Create a private developer profile",
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["slug", "display_name"], properties: { slug: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$" }, display_name: { type: "string", maxLength: 120 } }, additionalProperties: false } } } },
        responses: { "201": envelopeResponse("Created developer profile"), "400": { description: "Invalid profile details." }, "401": { description: "Missing or invalid API key." }, "403": { description: "API key is missing the profiles:write scope." }, "409": { description: "Profile slug already exists." } }
      }
    },
    "/profiles/{profileSlug}": {
      patch: {
        operationId: "updateProfile",
        summary: "Update profile metadata or save a directory draft",
        security: [{ ApiKeyAuth: [] }],
        parameters: [pathParameter("profileSlug", "The immutable developer profile slug."), idempotencyParameter],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { display_name: { type: "string", maxLength: 120 }, directory_content: { type: "object", properties: { description: { type: "string", maxLength: 1000 }, website_url: { type: "string", format: "uri" } }, additionalProperties: false } }, additionalProperties: false } } } },
        responses: { "200": envelopeResponse("Updated developer profile"), "400": { description: "Invalid profile details." }, "401": { description: "Missing or invalid API key." }, "403": { description: "API key is missing the profiles:write scope." }, "404": { description: "Developer profile not found." } }
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
    "/queues/{tenantSlug}/tickets": queueWritePath({
      operationId: "issueQueueTicket",
      summary: "Issue a queue ticket"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/tickets": queueWritePath({
      operationId: "issueLocationQueueTicket",
      summary: "Issue a queue ticket at a location",
      location: true
    }),
    "/queues/{tenantSlug}/call-next": queueActionPath({
      operationId: "callNextQueueTicket",
      summary: "Call the next waiting ticket"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/call-next": queueActionPath({
      operationId: "callNextLocationQueueTicket",
      summary: "Call the next waiting ticket at a location",
      location: true
    }),
    "/queues/{tenantSlug}/current/serve": queueResolutionPath({
      operationId: "serveCurrentQueueTicket",
      summary: "Serve the current called ticket",
      status: "served"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/current/serve": queueResolutionPath({
      operationId: "serveCurrentLocationQueueTicket",
      summary: "Serve the current called ticket at a location",
      status: "served",
      location: true
    }),
    "/queues/{tenantSlug}/current/skip": queueResolutionPath({
      operationId: "skipCurrentQueueTicket",
      summary: "Skip the current called ticket",
      status: "skipped"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/current/skip": queueResolutionPath({
      operationId: "skipCurrentLocationQueueTicket",
      summary: "Skip the current called ticket at a location",
      status: "skipped",
      location: true
    }),
    "/queues/{tenantSlug}/tickets/{ticketId}/cancel": queueTicketActionPath({
      operationId: "cancelQueueTicket",
      summary: "Cancel a waiting queue ticket",
      action: "cancel"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/tickets/{ticketId}/cancel": queueTicketActionPath({
      operationId: "cancelLocationQueueTicket",
      summary: "Cancel a waiting queue ticket at a location",
      action: "cancel",
      location: true
    }),
    "/queues/{tenantSlug}/tickets/{ticketId}/restore": queueTicketActionPath({
      operationId: "restoreQueueTicket",
      summary: "Restore a skipped queue ticket",
      action: "restore"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/tickets/{ticketId}/restore": queueTicketActionPath({
      operationId: "restoreLocationQueueTicket",
      summary: "Restore a skipped queue ticket at a location",
      action: "restore",
      location: true
    }),
    "/queues/{tenantSlug}/tickets/{ticketId}": queueTicketReadPath({
      operationId: "getQueueTicket",
      summary: "Read a queue ticket status"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/tickets/{ticketId}": queueTicketReadPath({
      operationId: "getLocationQueueTicket",
      summary: "Read a location queue ticket status",
      location: true
    }),
    "/queues/{tenantSlug}/tickets/{ticketId}/events": queueTicketEventsPath({
      operationId: "listQueueTicketEvents",
      summary: "List a queue ticket's lifecycle events"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/tickets/{ticketId}/events": queueTicketEventsPath({
      operationId: "listLocationQueueTicketEvents",
      summary: "List a location queue ticket's lifecycle events",
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
      },
      IssueTicketRequest: {
        type: "object",
        properties: {
          display_label: { type: "string", maxLength: 120, description: "Optional display-only label. Do not send a customer name." },
          external_reference: { type: "string", maxLength: 160, description: "Optional opaque reference, unique within the project and environment." },
          recipient_email: { type: "string", maxLength: 320, description: "Optional contact email when the integration has a lawful delivery purpose." }
        },
        additionalProperties: false
      }
    }
  }
};

module.exports = openApiDocument;
