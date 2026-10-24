import { ThemeProvider } from '@falkordb/ui'
import GraphView from './pages/GraphView'

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey={null}>
      <GraphView />
    </ThemeProvider>
  )
}

export default App
