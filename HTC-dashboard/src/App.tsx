import './App.css'
import StreamPlayer from './components/StreamPlayer'
import { LandingPage } from './pages/LandingPage'

function App() {
    return (
        <div>
            <h1>Hello World</h1>
            <StreamPlayer streamId="stream-1" />
            {/* <LandingPage /> */}
        </div>

    )
}

export default App
