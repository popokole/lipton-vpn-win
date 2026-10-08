import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Порядок важен: шрифты и токены → база → компоненты → каркас и экраны → старые панели.
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/shell.css'
import './styles/home.css'
import './styles/pages.css'
import './styles/onboarding.css'
import './styles/screens.css'
import './styles/app.css'
import 'flag-icons/css/flag-icons.min.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
