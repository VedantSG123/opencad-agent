import { useEffect, useState } from 'react'

import fallbackLogo from '@/assets/provider-logo-fallback.svg'
import { cn } from '@/lib/utils'

interface ProviderLogoProps {
  providerId: string
  size?: number
  className?: string
}

// Rendered as a CSS mask (not an <img>) so the logo picks up the
// surrounding text color instead of the SVG's own baked-in color, and as a
// mask-image (not inlined markup) so we never execute untrusted remote SVG.
export function ProviderLogo({
  providerId,
  size = 16,
  className,
}: ProviderLogoProps) {
  const remoteSrc = `https://models.dev/logos/${providerId}.svg`
  const [src, setSrc] = useState(remoteSrc)

  useEffect(() => {
    const url = `https://models.dev/logos/${providerId}.svg`
    const probe = new Image()
    probe.onload = () => setSrc(url)
    probe.onerror = () => setSrc(fallbackLogo)
    probe.src = url
  }, [providerId])

  const maskImage = `url("${src}")`

  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{
        width: size,
        height: size,
        maskImage,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskImage: maskImage,
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
      }}
    />
  )
}
