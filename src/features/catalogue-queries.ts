import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/Auth';
import type { Product } from '../api/types';

export function useProductFamily(enabled = true) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: [user?.id, user?.businessId, user?.membershipId, 'product-family'],
    enabled,
    queryFn: async ({ signal }) => {
      const all: Product[] = [];
      // Spring has no parent filter. Read every page so variants/parent choices
      // are complete, including archived children that explain archive conflicts.
      for (let offset = 0; ; offset += 200) {
        const page = await api<Product[]>(
          `/api/products?includeInactive=true&limit=200&offset=${offset}`,
          'GET',
          undefined,
          false,
          signal,
        );
        all.push(...page);
        if (page.length < 200) return all;
      }
    },
  });
}
