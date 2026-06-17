import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PlanViewer from './components/PlanViewer.jsx'

const isViewer = window.location.hash.startsWith('#view=') || window.location.hash.startsWith('#plan=')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isViewer ? <PlanViewer /> : <App />}
  </StrictMode>,
)
