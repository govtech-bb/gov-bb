import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import AnalyticsPage from './AnalyticsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnalyticsPage />
  </StrictMode>,
)
