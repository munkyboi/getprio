/**
 * Parses and clamps pagination parameters from query string.
 * @param {object} query - Express request query object.
 * @returns {object} { page, pageSize, offset }
 */
function parsePaginationParams(query) {
  let page = parseInt(query.page, 10);
  
  if (isNaN(page) || page < 1) {
    page = 1;
  }

  // Treat legacy `limit` as a temporary `pageSize` alias with `page = 1`
  let pageSizeVal = query.pageSize;
  if (pageSizeVal === undefined && query.limit !== undefined) {
    pageSizeVal = query.limit;
    if (query.page === undefined) {
      page = 1;
    }
  }

  let pageSize = parseInt(pageSizeVal, 10);
  if (isNaN(pageSize) || pageSize < 1) {
    pageSize = 10;
  }

  if (pageSize > 100) {
    pageSize = 100;
  }

  const offset = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    offset
  };
}

/**
 * Shapes pagination metadata.
 * @param {number} totalItems - Total count of items matching filters.
 * @param {number} page - Current page number.
 * @param {number} pageSize - Number of items per page.
 * @returns {object} { page, pageSize, totalItems, totalPages }
 */
function formatPaginationMetadata(totalItems, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    page,
    pageSize,
    totalItems,
    totalPages
  };
}

module.exports = {
  parsePaginationParams,
  formatPaginationMetadata
};
