import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { normalizeRequestId, REQUEST_ID_HEADER, runWithRequestId } from "./log"

/**
 * Globální middleware: každý požadavek dostane `x-request-id` (převzaté bezpečné z Workeru, jinak nové),
 * vrátí ho v odpovědi a celé zpracování (route, workflow, subscribery spuštěné synchronně) běží
 * v AsyncLocalStorage kontextu, takže `logEvent` ID doplní sám.
 */
export function requestIdMiddleware(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const requestId = normalizeRequestId(req.headers?.[REQUEST_ID_HEADER])
  ;(req as MedusaRequest & { requestId?: string }).requestId = requestId
  res.setHeader(REQUEST_ID_HEADER, requestId)
  runWithRequestId(requestId, () => next())
}
