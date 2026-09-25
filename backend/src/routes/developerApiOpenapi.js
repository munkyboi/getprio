const envelopeResponse = (description, dataSchema) => ({
  description,
  content: { "application/json": { schema: dataSchema ? {
    allOf: [
      { $ref: "#/components/schemas/Envelope" },
      { type: "object", properties: { data: { $ref: "#/components/schemas/" + dataSchema } } }
    ]
  } : { $ref: "#/components/schemas/Envelope" } } }
});

const apiKeyResponses = (successDescription, notFoundDescription = "Developer profile not found.", dataSchema) => ({
  "200": envelopeResponse(successDescription, dataSchema),
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

const queueReadPath = ({ operationId, summary, successDescription, location = false, dataSchema = "QueueSnapshot" }) => ({
  get: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: queueParameters(location),
    responses: apiKeyResponses(successDescription, location ? "Tenant or location not found." : undefined, dataSchema)
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

const queueWritePath = ({ operationId, summary, location = false, dataSchema = "TicketEnvelope" }) => ({
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
      "201": envelopeResponse("Issued queue ticket", dataSchema),
      "400": { description: "Invalid ticket details." },
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:write scope." },
      "404": { description: location ? "Tenant or location not found." : "Tenant not found." },
      "409": { description: "The idempotency key is already in use or queue intake is unavailable." }
    }
  }
});

const queueActionPath = ({ operationId, summary, location = false, dataSchema = "TicketEnvelope" }) => ({
  post: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [...queueParameters(location), idempotencyParameter],
    responses: {
      "200": envelopeResponse("Queue action result", dataSchema),
      "400": { description: "The queue cannot advance until the current ticket is resolved." },
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:write scope." },
      "404": { description: location ? "Tenant or location not found." : "Tenant not found." },
      "409": { description: "Queue intake is unavailable or the idempotency key is already in use." }
    }
  }
});

const queueResolutionPath = ({ operationId, summary, status, location = false, dataSchema = "TicketEnvelope" }) => ({
  post: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [...queueParameters(location), idempotencyParameter],
    responses: {
      "200": envelopeResponse("Current ticket " + status + " result", dataSchema),
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:write scope." },
      "404": { description: location ? "Tenant or location not found." : "Tenant not found." },
      "409": { description: "The current ticket cannot transition to this status." }
    }
  }
});

const queueConfirmationPath = ({ operationId, summary, location = false, dataSchema = "TicketEnvelope" }) => ({
  post: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [...queueParameters(location), idempotencyParameter],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["verification_code"],
            properties: { verification_code: { type: "string", pattern: "^[A-Fa-f0-9]{8}$", description: "The code encoded in the customer's ticket barcode." } },
            additionalProperties: false
          }
        }
      }
    },
    responses: {
      "200": envelopeResponse("Confirmed the current called ticket", dataSchema),
      "400": { description: "Invalid verification code." },
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:write scope." },
      "404": { description: location ? "Tenant or location not found." : "Tenant not found." },
      "409": { description: "The verification code does not match the current called ticket, or there is no called ticket." }
    }
  }
});

const queueTicketActionPath = ({ operationId, summary, action, location = false, dataSchema = "TicketEnvelope" }) => ({
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
      "200": envelopeResponse("Queue ticket " + action + " result", dataSchema),
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:write scope." },
      "404": { description: "Ticket, tenant, or location not found." },
      "409": { description: `Ticket cannot be ${action}d from its current status.` }
    }
  }
});

const queueTicketReadPath = ({ operationId, summary, location = false, dataSchema = "TicketEnvelope" }) => ({
  get: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [
      ...queueParameters(location),
      pathParameter("ticketId", "The opaque queue ticket identifier.")
    ],
    responses: {
      "200": envelopeResponse("Queue ticket status", dataSchema),
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:read scope." },
      "404": { description: "Ticket, tenant, or location not found." }
    }
  }
});

const queueTicketQrPath = ({ operationId, summary, location = false }) => ({
  get: {
    operationId,
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [
      ...queueParameters(location),
      pathParameter("ticketId", "The opaque queue ticket identifier.")
    ],
    responses: {
      "200": envelopeResponse("Sandbox ticket QR code", "TicketQrEnvelope"),
      "401": { description: "Missing or invalid API key." },
      "403": { description: "API key is missing the queues:read scope." },
      "404": { description: "Ticket, tenant, or location not found, or QR claims are not available in Production." },
      "409": { description: "The ticket does not have a QR code available." }
    }
  }
});

const queueTicketEventsPath = ({ operationId, summary, location = false, dataSchema = "TicketEvents" }) => ({
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
      "200": envelopeResponse("Queue ticket lifecycle events", dataSchema),
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
        responses: { "200": envelopeResponse("Developer profiles", "ProfileList"), "401": { description: "Missing or invalid API key." }, "403": { description: "API key is missing the profiles:read scope." } }
      },
      post: {
        operationId: "createProfile",
        summary: "Create a private developer profile",
        security: [{ ApiKeyAuth: [] }],
        parameters: [idempotencyParameter],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["slug", "display_name"], properties: { slug: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$" }, display_name: { type: "string", maxLength: 120 } }, additionalProperties: false } } } },
        responses: { "201": envelopeResponse("Created developer profile", "ProfileEnvelope"), "400": { description: "Invalid profile details." }, "401": { description: "Missing or invalid API key." }, "403": { description: "API key is missing the profiles:write scope." }, "409": { description: "Profile slug already exists." } }
      }
    },
    "/profiles/{profileSlug}": {
      patch: {
        operationId: "updateProfile",
        summary: "Update profile metadata or save a directory draft",
        security: [{ ApiKeyAuth: [] }],
        parameters: [pathParameter("profileSlug", "The immutable developer profile slug."), idempotencyParameter],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { display_name: { type: "string", maxLength: 120 }, directory_content: { type: "object", properties: { description: { type: "string", maxLength: 1000 }, website_url: { type: "string", format: "uri" } }, additionalProperties: false } }, additionalProperties: false } } } },
        responses: { "200": envelopeResponse("Updated developer profile", "ProfileEnvelope"), "400": { description: "Invalid profile details." }, "401": { description: "Missing or invalid API key." }, "403": { description: "API key is missing the profiles:write scope." }, "404": { description: "Developer profile not found." } }
      }
    },
    "/profiles/{profileSlug}/queues": {
      get: {
        operationId: "listProfileQueues",
        summary: "List queues for a developer profile",
        security: [{ ApiKeyAuth: [] }],
        parameters: [pathParameter("profileSlug", "The developer profile slug.")],
        responses: { "200": envelopeResponse("Profile queues", "ProfileQueues"), "401": { description: "Missing or invalid API key." }, "403": { description: "API key is missing the queues:read scope." }, "404": { description: "Developer profile not found." } }
      },
      post: {
        operationId: "createProfileQueue",
        summary: "Create a queue for a developer profile",
        security: [{ ApiKeyAuth: [] }],
        parameters: [pathParameter("profileSlug", "The developer profile slug."), idempotencyParameter],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["slug", "display_name"], properties: { slug: { type: "string" }, display_name: { type: "string", maxLength: 120 }, session_state: { type: "string", enum: ["open", "paused", "closing", "closed"] }, intake_enabled: { type: "boolean" }, queue_prefix: { type: "string", pattern: "^[A-Z0-9]{1,4}$", description: "Defaults to the first four alphanumeric characters of slug." }, average_service_minutes: { type: "integer", minimum: 1, maximum: 120, default: 15 }, notification_threshold: { type: "integer", minimum: 1, maximum: 10, default: 2 } }, additionalProperties: false } } } },
        responses: { "201": envelopeResponse("Created profile queue", "QueueEnvelope"), "400": { description: "Invalid queue details." }, "401": { description: "Missing or invalid API key." }, "403": { description: "API key is missing the queues:write scope." }, "404": { description: "Developer profile not found." }, "409": { description: "Queue slug already exists." } }
      }
    },
    "/profiles/{profileSlug}/queues/{queueSlug}": {
      patch: {
        operationId: "updateProfileQueue",
        summary: "Update a developer profile queue",
        security: [{ ApiKeyAuth: [] }],
        parameters: [pathParameter("profileSlug", "The developer profile slug."), pathParameter("queueSlug", "The queue slug."), idempotencyParameter],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { display_name: { type: "string", maxLength: 120 }, session_state: { type: "string", enum: ["open", "paused", "closing", "closed"] }, intake_enabled: { type: "boolean" }, queue_prefix: { type: "string", pattern: "^[A-Z0-9]{1,4}$" }, average_service_minutes: { type: "integer", minimum: 1, maximum: 120 }, notification_threshold: { type: "integer", minimum: 1, maximum: 10 }, resource_version: { type: "integer", minimum: 1 } }, additionalProperties: false } } } },
        responses: { "200": envelopeResponse("Updated profile queue", "QueueEnvelope"), "400": { description: "Invalid queue details." }, "401": { description: "Missing or invalid API key." }, "403": { description: "API key is missing the queues:write scope." }, "404": { description: "Developer profile or queue not found." }, "409": { description: "Queue update conflict." } }
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
    "/queues/{tenantSlug}/current/confirm": queueConfirmationPath({
      operationId: "confirmCurrentQueueTicket",
      summary: "Confirm the customer for the current called ticket"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/current/confirm": queueConfirmationPath({
      operationId: "confirmCurrentLocationQueueTicket",
      summary: "Confirm the customer for the current called ticket at a location",
      location: true
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
    "/queues/{tenantSlug}/tickets/{ticketId}/qr": queueTicketQrPath({
      operationId: "getQueueTicketQr",
      summary: "Generate a Sandbox ticket QR code"
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/tickets/{ticketId}": queueTicketReadPath({
      operationId: "getLocationQueueTicket",
      summary: "Read a location queue ticket status",
      location: true
    }),
    "/queues/{tenantSlug}/locations/{locationSlug}/tickets/{ticketId}/qr": queueTicketQrPath({
      operationId: "getLocationQueueTicketQr",
      summary: "Generate a Sandbox location ticket QR code",
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
      Profile: {
        type: "object",
        required: ["id", "slug", "display_name", "directory_status", "directory_content", "created_at", "updated_at"],
        properties: {
          id: { type: "string", description: "Opaque profile identifier." },
          slug: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$" },
          display_name: { type: "string" },
          directory_status: { type: "string", enum: ["private", "draft", "published"] },
          directory_content: { $ref: "#/components/schemas/DirectoryContent" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      DirectoryContent: {
        type: "object",
        required: ["description", "website_url"],
        properties: {
          description: { type: "string" },
          website_url: { type: "string", format: "uri" }
        }
      },
      Queue: {
        type: "object",
        required: ["id", "slug", "display_name", "session_state", "intake_enabled", "joining_enabled", "priority_ratio", "queue_prefix", "average_service_minutes", "notification_threshold", "resource_version", "created_at", "updated_at"],
        properties: {
          id: { type: "string", description: "Opaque queue identifier." },
          slug: { type: "string" },
          display_name: { type: "string" },
          session_state: { type: "string", enum: ["open", "paused", "closing", "closed"] },
          intake_enabled: { type: "boolean" },
          joining_enabled: { type: "boolean" },
          priority_ratio: { type: "number" },
          queue_prefix: { type: "string", pattern: "^[A-Z0-9]{1,4}$" },
          average_service_minutes: { type: "integer", minimum: 1, maximum: 120 },
          notification_threshold: { type: "integer", minimum: 1, maximum: 10 },
          resource_version: { type: "integer", minimum: 1 },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      Ticket: {
        type: "object",
        required: ["id", "ticket_number", "sequence", "status", "queue_id", "verification_code", "resource_version", "created_at", "updated_at"],
        properties: {
          id: { type: "string", description: "Opaque ticket identifier." },
          ticket_number: { type: "string" },
          sequence: { type: "integer" },
          display_label: { type: ["string", "null"] },
          status: { type: "string", enum: ["waiting", "called", "served", "skipped", "cancelled", "unserved", "expired"] },
          queue_id: { type: "string" },
          external_reference: { type: ["string", "null"] },
          verification_code: { type: "string", pattern: "^[A-F0-9]{8}$", description: "The code encoded in the customer's ticket barcode." },
          customer_confirmed_at: { type: ["string", "null"], format: "date-time" },
          status_reason: { type: ["string", "null"] },
          called_at: { type: ["string", "null"], format: "date-time" },
          served_at: { type: ["string", "null"], format: "date-time" },
          skipped_at: { type: ["string", "null"], format: "date-time" },
          cancelled_at: { type: ["string", "null"], format: "date-time" },
          unserved_at: { type: ["string", "null"], format: "date-time" },
          terminal_at: { type: ["string", "null"], format: "date-time" },
          resource_version: { type: "integer", minimum: 1 },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      ProfileList: {
        type: "object",
        required: ["profiles"],
        properties: { profiles: { type: "array", items: { $ref: "#/components/schemas/Profile" } } }
      },
      ProfileEnvelope: {
        type: "object",
        required: ["profile"],
        properties: { profile: { $ref: "#/components/schemas/Profile" } }
      },
      ProfileQueues: {
        type: "object",
        required: ["profile", "queues"],
        properties: {
          profile: { $ref: "#/components/schemas/Profile" },
          queues: { type: "array", items: { $ref: "#/components/schemas/Queue" } }
        }
      },
      QueueEnvelope: {
        type: "object",
        required: ["queue"],
        properties: {
          queue: { $ref: "#/components/schemas/Queue" },
          queueEvents: { type: "array", items: { type: "object" } }
        }
      },
      QueueSnapshot: {
        type: "object",
        required: ["profile", "queue", "queue_intake", "stats", "current", "next_up", "overflow", "skipped"],
        properties: {
          profile: { $ref: "#/components/schemas/Profile" },
          queue: { $ref: "#/components/schemas/Queue" },
          queue_intake: { type: "object", required: ["state"], properties: { state: { type: "string", enum: ["open", "closed"] } } },
          stats: { type: "object", properties: { waiting_count: { type: "integer" }, called_count: { type: "integer" } } },
          current: { anyOf: [{ $ref: "#/components/schemas/Ticket" }, { type: "null" }] },
          next_up: { type: "array", items: { $ref: "#/components/schemas/Ticket" } },
          overflow: { type: "array", items: { $ref: "#/components/schemas/Ticket" } },
          skipped: { type: "array", items: { $ref: "#/components/schemas/Ticket" } }
        }
      },
      TicketEnvelope: {
        type: "object",
        required: ["ticket"],
        properties: { ticket: { anyOf: [{ $ref: "#/components/schemas/Ticket" }, { type: "null" }] } }
      },
      TicketQrEnvelope: {
        type: "object",
        required: ["qr"],
        properties: {
          qr: {
            type: "object",
            required: ["ticket_id", "ticket_number", "verification_code", "environment", "content_type", "data_url"],
            properties: {
              ticket_id: { type: "string", description: "Opaque queue ticket identifier." },
              ticket_number: { type: "string" },
              verification_code: { type: "string", pattern: "^[A-F0-9]{8}$", description: "The code encoded in the QR image." },
              environment: { type: "string", enum: ["sandbox"] },
              content_type: { type: "string", enum: ["image/png"] },
              data_url: { type: "string", description: "A PNG data URL containing the generated QR image." }
            }
          }
        }
      },
      TicketEvents: {
        type: "object",
        required: ["events", "next_cursor"],
        properties: {
          events: { type: "array", items: { $ref: "#/components/schemas/TicketEvent" } },
          next_cursor: { type: ["string", "null"] }
        }
      },
      TicketEvent: {
        type: "object",
        required: ["id", "ticket_id", "queue_id", "type", "resource_version", "occurred_at"],
        properties: {
          id: { type: "string" },
          ticket_id: { type: "string" },
          queue_id: { type: "string" },
          type: { type: "string" },
          resource_version: { type: "integer" },
          from_status: { type: ["string", "null"] },
          to_status: { type: ["string", "null"] },
          occurred_at: { type: "string", format: "date-time" }
        }
      },
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
          recipient_email: { type: "string", maxLength: 320, description: "Optional contact email when the integration has a lawful delivery purpose. In Sandbox, a matching provisioned test-account email links the ticket to that account's mobile feed." }
        },
        additionalProperties: false
      }
    }
  }
};

module.exports = openApiDocument;
