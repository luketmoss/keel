import { useRef, useState, type DragEvent } from 'react'
import { Sidebar } from './components/Sidebar'
import { MapView } from './components/MapView'
import { ImportPanel } from './components/ImportPanel'
import { DropOverlay } from './components/DropOverlay'
import { useTrackImport } from './import/useTrackImport'
import { dataTransferHasFiles, filesFromDataTransfer } from './import/dataTransfer'
import './App.css'

export function App() {
  const trackImport = useTrackImport()
  const [dragActive, setDragActive] = useState(false)
  /* Nested elements each fire their own enter/leave as the pointer crosses
     them, so a plain boolean flickers the overlay off mid-drag — a depth
     counter only clears it once the drag has actually left the window. */
  const dragDepth = useRef(0)

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragActive(true)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragActive(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    const files = filesFromDataTransfer(event.dataTransfer)
    if (files.length > 0) void trackImport.importFiles(files)
  }

  return (
    <div
      className="app"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar>
        <ImportPanel {...trackImport} />
      </Sidebar>
      <div className="app__map">
        <MapView files={trackImport.files} />
      </div>
      {dragActive && <DropOverlay />}
    </div>
  )
}
