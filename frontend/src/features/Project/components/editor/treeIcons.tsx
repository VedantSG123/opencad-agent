import {
  FileEmpty02Icon,
  Folder01Icon,
  FolderOpenIcon,
} from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'

function iconComponent(
  iconData: Parameters<typeof Icon>[0]['icon'],
): React.ComponentType<{ className?: string }> {
  return function IconComponent({ className }: { className?: string }) {
    return <Icon icon={iconData} className={className} />
  }
}

export const FileIconComponent = iconComponent(FileEmpty02Icon)
export const FolderIconComponent = iconComponent(Folder01Icon)
export const FolderOpenIconComponent = iconComponent(FolderOpenIcon)
