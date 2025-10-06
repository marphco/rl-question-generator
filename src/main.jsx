import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4f46e5' },
    background: {
      default: '#0b1020',   // page background
      paper:  '#121833'     // card background
    },
    text: {
      primary:   '#e5e7eb',
      secondary: '#94a3b8'
    }
  },
  shape: { borderRadius: 14 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { border: '1px solid rgba(148,163,184,.15)' }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: '#0f172a' } // inputs leggibili su dark
      }
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 }
      }
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
