import { useState } from "react"
import { AlertsProvider } from "../contexts/AlertsProvider"
import { PriorityAlerts } from "../components/PriorityAlerts"
export function LandingPage(){
  const [currentVideo, setCurrentVideo] = useState("")

  return(
    <>
    {/* Insert the Videos Component Here afterwards  */}
    <AlertsProvider>
      <PriorityAlerts/>
    </AlertsProvider>
    </>
  )
}