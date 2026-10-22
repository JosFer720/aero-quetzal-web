import { StrictMode, type ComponentType } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"

export function montar(Pagina: ComponentType) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Pagina />
    </StrictMode>,
  )
}
