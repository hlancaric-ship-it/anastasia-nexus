import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type { Logger, ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import { randomUUID } from "node:crypto"
import { formatLogLine } from "../../lib/observability/log"

type Options = { channels?: string[] }

/**
 * Lokální / syntetický provider notifikací (náhrada `notification-local`, který vypisuje celé `to` a `data`).
 * Do logu jde jen šablona, kanál a seznam klíčů dat – nikdy adresát, odkazy ani obsah.
 * Skutečné doručení (SMTP / e-mailová služba) se zapojí samostatným providerem se stejným id.
 */
export default class NotificationLogService extends AbstractNotificationProviderService {
  static identifier = "notification-log"
  protected logger_: Logger
  protected options_: Options

  constructor({ logger }: { logger: Logger }, options: Options = {}) {
    super()
    this.logger_ = logger
    this.options_ = options
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    if (!notification) throw new MedusaError(MedusaError.Types.INVALID_DATA, "No notification information provided")
    const id = `synthetic_${randomUUID()}`
    this.logger_.info(formatLogLine("info", "notification", "provider_send", {
      provider: NotificationLogService.identifier,
      template: notification.template,
      channel: notification.channel,
      data_keys: Object.keys(notification.data ?? {}).sort(),
      has_recipient: Boolean(notification.to),
      provider_message_id: id,
    }))
    return { id }
  }
}
