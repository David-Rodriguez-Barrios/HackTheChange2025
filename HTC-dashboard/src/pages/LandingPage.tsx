import { useState } from "react"
import { AlertsProvider } from "../contexts/AlertsProvider"
import { PriorityAlerts } from "../components/PriorityAlerts"
import { AllStreams } from "../components/AllStreams"
export function LandingPage() {

  return (
    <>
      {/* Insert the Videos Component Here afterwards  */}
      <AllStreams />
      <AlertsProvider>
        <PriorityAlerts />
      </AlertsProvider>
    </>
  )
}