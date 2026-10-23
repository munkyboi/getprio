export function collectionPage<T>(items: T[], search: string, status: string, requestedPage: number, searchText: (item: T) => string, statusOf: (item: T) => string, pageSize = 10) {
  const query = search.trim().toLocaleLowerCase();
  const matching = items.filter((item) => (!query || searchText(item).toLocaleLowerCase().includes(query)) && (!status || statusOf(item) === status));
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.max(1, Math.min(Math.trunc(requestedPage) || 1, pages));
  const offset = (page - 1) * pageSize;
  return { items: matching.slice(offset, offset + pageSize), total: matching.length, pages, page, start: matching.length ? offset + 1 : 0, end: Math.min(offset + pageSize, matching.length) };
}
