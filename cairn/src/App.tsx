import { Sidebar } from './components/Sidebar'
import { MapView } from './components/MapView'
import './App.css'

export function App() {
  return (
    <div className="app">
      <Sidebar />
      <div className="app__map">
        <MapView />
      </div>
    </div>
  )
}
