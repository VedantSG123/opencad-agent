import { useCallback, useEffect, useState } from 'react'
import type { UserPreferences, UserPreferencesPatch } from 'shared'

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)

  useEffect(() => {
    window.electron?.getUserPreferences().then((res) => {
      if (res.success) setPreferences(res.data)
    })
  }, [])

  const updatePreferences = useCallback((patch: UserPreferencesPatch) => {
    window.electron?.updateUserPreferences(patch).then((res) => {
      if (res.success) setPreferences(res.data)
    })
  }, [])

  return { preferences, updatePreferences }
}
