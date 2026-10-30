import {createRoot} from 'react-dom/client'
import OptionsApp from './OptionsApp'
import '../ui/theme.css'

const rootElement = document.getElementById('root')

if (!rootElement) throw new Error('Options root element not found')

createRoot(rootElement).render(<OptionsApp />)
