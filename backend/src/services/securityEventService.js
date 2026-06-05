const authSecurityEventRepository = require("../repositories/authSecurityEvents");

async function logSecurityEvent(event, options = {}) {
  return authSecurityEventRepository.createSecurityEvent(event, options);
}

module.exports = {
  logSecurityEvent
};
