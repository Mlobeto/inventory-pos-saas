import { useState } from 'react';
import type { PaginationMeta } from '../types/api.types';

export function usePagination(initialPage = 1, initialLimit = 20) {
  const [page, setPage] = useState(initialPage);
  const [limit] = useState(initialLimit);

  function goToPage(p: number) {
    setPage(p);
  }

  function nextPage(meta: PaginationMeta) {
    if (meta.hasNextPage) setPage((p) => p + 1);
  }

  function prevPage(meta: PaginationMeta) {
    if (meta.hasPrevPage) setPage((p) => p - 1);
  }

  return { page, limit, goToPage, nextPage, prevPage };
}
