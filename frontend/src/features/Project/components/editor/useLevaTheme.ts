const neutralTheme = {
  colors: {
    elevation1: 'var(--overlay)', // Panel root — matches other floating/overlay surfaces
    elevation2: 'var(--default)', // Row/input background
    elevation3: 'var(--border)', // Folder background / hover
    highlight1: 'var(--muted)', // Muted labels
    highlight2: 'var(--foreground)', // Regular text/values
    highlight3: 'var(--foreground)', // Active state
    accent1: 'var(--accent)',
    accent2: 'var(--accent-hover)',
    accent3: 'var(--accent-hover)',
    vivid1: 'var(--danger)',
    folderWidgetColor: 'var(--border)',
    folderTextColor: 'var(--muted)',
    toolTipBackground: 'var(--overlay)',
    toolTipText: 'var(--overlay-foreground)',
  },
  sizes: {
    rootWidth: '288px',
    controlWidth: '130px',
  },
}

// Every color is a CSS variable, so it already tracks the app's light/dark
// class automatically — no need to branch on the resolved theme in JS.
export function useLevaTheme() {
  return neutralTheme
}
