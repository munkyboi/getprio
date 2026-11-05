export function requiresPlatformSignIn(error: unknown) {
  if (!(error instanceof Error) || !("status" in error)) return false

  const status = Number(error.status)
  if (status === 400 || status === 401) return true
  return status === 403 && "code" in error && error.code === "CSRF_VALIDATION_FAILED"
}
