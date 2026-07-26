import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import axiosInstance from '@/lib/axios'
import type {
  AuthenticatedStatus,
  OAuthAuthorization,
  OAuthCallbackResult,
  Provider,
} from '@/types/provider'

const PROVIDERS_KEY = ['providers'] as const
const AUTHENTICATED_PROVIDERS_KEY = ['providers', 'authenticated'] as const

export function useProviders() {
  return useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: () =>
      axiosInstance
        .get<Record<string, Provider>>('/providers')
        .then((r) => r.data),
  })
}

export function useAuthenticatedProviders() {
  return useQuery({
    queryKey: AUTHENTICATED_PROVIDERS_KEY,
    queryFn: () =>
      axiosInstance
        .get<AuthenticatedStatus>('/providers/authenticated')
        .then((r) => r.data),
  })
}

export function useInvalidateProviders() {
  const queryClient = useQueryClient()
  return {
    invalidateProviders: async () => {
      await queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY })
      await queryClient.invalidateQueries({
        queryKey: AUTHENTICATED_PROVIDERS_KEY,
      })
    },
  }
}

export function useDisconnectProvider() {
  return useMutation({
    mutationFn: (providerId: string) =>
      axiosInstance.delete(`/providers/${providerId}`).then(() => undefined),
  })
}

export function useAuthorizeOAuth() {
  return useMutation({
    mutationFn: (providerId: string) =>
      axiosInstance
        .post<OAuthAuthorization>(
          `/providers/auth/oauth/${providerId}/authorize`,
        )
        .then((r) => r.data),
  })
}

export function useCompleteOAuth() {
  return useMutation({
    mutationFn: (providerId: string) =>
      axiosInstance
        .post<OAuthCallbackResult>(
          `/providers/auth/oauth/${providerId}/callback`,
        )
        .then((r) => r.data),
  })
}
