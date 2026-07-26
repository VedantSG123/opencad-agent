import { Button, Input } from '@heroui/react'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Icon } from '@/components/icons/HugeIcon'
import { useInvalidateProviders } from '@/hooks/useProviders'
import type { Provider } from '@/types/provider'

interface ApiKeyConnectFormProps {
  provider: Provider
  onDone: () => void
}

export function ApiKeyConnectForm({
  provider,
  onDone,
}: ApiKeyConnectFormProps) {
  const envVars = provider.env && provider.env.length > 0 ? provider.env : []
  const [values, setValues] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [encryptionAvailable, setEncryptionAvailable] = useState<
    boolean | null
  >(null)
  const { invalidateProviders } = useInvalidateProviders()
  const firstInputRef = useRef<HTMLInputElement>(null)

  const isElectron = !!window.electron

  useEffect(() => {
    if (!window.electron) return
    void window.electron.isEncryptionAvailable().then((res) => {
      if (res.success) setEncryptionAvailable(res.data)
    })
  }, [])

  // autoFocus alone loses the focus race when this form mounts as the
  // result of a tab switch (the tab trigger keeps focus from the click) —
  // grab it explicitly once the browser has settled.
  useEffect(() => {
    const raf = requestAnimationFrame(() => firstInputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [])

  const isComplete = envVars.every((envVar) => values[envVar]?.trim())

  async function handleSubmit() {
    if (!window.electron || !isComplete) return
    setIsSubmitting(true)
    try {
      const keys = Object.fromEntries(
        envVars.map((envVar) => [envVar, values[envVar].trim()]),
      )
      const res = await window.electron.storeCredential(provider.id, {
        type: 'api_key',
        keys,
      })
      if (!res.success) throw new Error(res.error.message)
      await invalidateProviders()
      toast.success(`${provider.name} connected`)
      onDone()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to connect provider',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isElectron) {
    return (
      <div className='flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground'>
        <Icon icon={Alert02Icon} size={16} className='shrink-0 mt-0.5' />
        <p>
          Connecting via API key requires the desktop app so your key can be
          stored securely in the OS keychain.
        </p>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-4'>
      {encryptionAvailable === false && (
        <div className='flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning'>
          <Icon icon={Alert02Icon} size={16} className='shrink-0 mt-0.5' />
          <p>
            OS-level encryption isn&apos;t available on this system. Your key
            will be stored with weaker protection.
          </p>
        </div>
      )}

      {envVars.map((envVar, index) => (
        <div key={envVar} className='flex flex-col gap-1.5'>
          <label
            htmlFor={`api-key-${envVar}`}
            className='text-sm font-semibold'
          >
            API Key
          </label>
          <Input
            ref={index === 0 ? firstInputRef : undefined}
            id={`api-key-${envVar}`}
            type='password'
            placeholder={`Enter your ${envVar}`}
            value={values[envVar] ?? ''}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [envVar]: e.target.value }))
            }
            autoFocus={index === 0}
          />
          <p className='text-xs text-muted-foreground'>
            Stored as the {envVar} environment variable.
          </p>
        </div>
      ))}

      <Button
        className='bg-primary text-white self-start'
        onPress={() => void handleSubmit()}
        isDisabled={!isComplete || isSubmitting}
      >
        {isSubmitting ? 'Connecting…' : 'Connect'}
      </Button>
    </div>
  )
}
