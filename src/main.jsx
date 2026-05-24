import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PlanViewer from './components/PlanViewer.jsx'

const isViewer = window.location.hash.startsWith('#view=')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isViewer ? <PlanViewer /> : <App />}
  </StrictMode>,
)
