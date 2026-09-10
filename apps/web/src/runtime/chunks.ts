const chunkErrorPatterns = [
  /failed to load chunk/i,
  /loading chunk .* failed/i,
  /chunkloaderror/i,
  /failed to fetch dynamically imported module/i,
];

export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return chunkErrorPatterns.some((pattern) => pattern.test(message));
}

export function deploymentReloadUrl(href: string, revision = Date.now()) {
  const url = new URL(href);
  url.searchParams.set('_operis_reload', String(revision));
  return url.toString();
}
