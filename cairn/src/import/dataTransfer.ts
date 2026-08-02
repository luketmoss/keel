/** True only for a drag carrying files — text or link drags must not trigger the drop overlay. */
export function dataTransferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes('Files')
}

export function filesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return []
  return Array.from(dataTransfer.files)
}
