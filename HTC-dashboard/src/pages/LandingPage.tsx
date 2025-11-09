import { AlertsProvider } from "../contexts/AlertsProvider"
import { PriorityAlerts } from "../components/PriorityAlerts"
export function LandingPage(){
  return(
    <>
    {/* Insert the Videos Component Here afterwards  */}
    <AlertsProvider>
      <PriorityAlerts/>
    </AlertsProvider>
    </>
  )
}