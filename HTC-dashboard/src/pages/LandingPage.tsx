import { AlertsProvider } from "../contexts/AlertsProvider"
import { PriorityAlerts } from "../components/PriorityAlerts"
import { AllStreams } from "../components/AllStreams"
import "./LandingPage.css"
export function LandingPage() {

  return (
    <AlertsProvider>
      <div className="landing-layout">
        <div className="landing-main">
          <AllStreams />
        </div>
        <div className="landing-sidebar">
          <PriorityAlerts />
        </div>
      </div>
    </AlertsProvider>
  )
}