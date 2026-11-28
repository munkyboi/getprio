const SUPPORTED_PUBLIC_JOIN_TYPE = "simple";

function assertPublicJoinFlowSupported(location) {
  const queueType = location?.queueType || "simple";
  if (queueType === SUPPORTED_PUBLIC_JOIN_TYPE) return;

  const error = new Error(
    `This location uses ${queueType} requests. Use the supported booking or service-request flow.`
  );
  error.statusCode = 409;
  error.code = "QUEUE_TYPE_ADMISSION_REQUIRED";
  error.queueType = queueType;
  error.supportedFlow = "booking";
  throw error;
}

module.exports = { assertPublicJoinFlowSupported };
