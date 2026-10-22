const releaseControls = require("../config/releaseControls");

function assertKnownControl(controlName) {
  if (!Object.prototype.hasOwnProperty.call(releaseControls.RELEASE_CONTROL_ENV_KEYS, controlName)) {
    throw new Error(`Unknown release control: ${controlName}`);
  }
}

function disabledError(controlName) {
  const error = new Error("This feature is not available.");
  error.statusCode = 404;
  error.code = "RELEASE_CONTROL_DISABLED";
  error.releaseControl = controlName;
  return error;
}

function assertReleaseControl(controlName, controls = releaseControls) {
  assertKnownControl(controlName);
  if (controls[controlName] !== true) throw disabledError(controlName);
}

function requireReleaseControl(controlName, controls = releaseControls) {
  assertKnownControl(controlName);
  return (_req, _res, next) => {
    try {
      assertReleaseControl(controlName, controls);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  assertReleaseControl,
  requireReleaseControl
};
