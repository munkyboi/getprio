const COPY_FALLBACK = "Could not copy the URL. Select and copy it from the field above.";

export async function copyQueueBoardUrl(
  url: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
): Promise<string> {
  try {
    if (!clipboard?.writeText) return COPY_FALLBACK;
    await clipboard.writeText(url);
    return "Board URL copied.";
  } catch {
    return COPY_FALLBACK;
  }
}
