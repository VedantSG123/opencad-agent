export function formatRelativeTime(dateString: string): string {
  const diffDays = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 86_400_000,
  )
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) {
    const w = Math.floor(diffDays / 7)
    return `${w} week${w === 1 ? '' : 's'} ago`
  }
  return new Date(dateString).toLocaleDateString()
}

export function truncatePath(path: string, max = 40): string {
  return path.length > max ? `…${path.slice(-(max - 1))}` : path
}
