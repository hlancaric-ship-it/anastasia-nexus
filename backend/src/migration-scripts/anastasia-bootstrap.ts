import type { MedusaContainer } from "@medusajs/framework"
import anastasiaBootstrap from "../scripts/anastasia-bootstrap"

/**
 * Data migration script: Medusa ho spustí jednou na prostředí po DB migracích
 * (`medusa db:migrate`, na Medusa Cloud automaticky při deployi; `medusa exec` tam není).
 * Bootstrap je idempotentní, takže nevadí ani prostředí, kde už byl spuštěn ručně.
 * Při chybě se skript nezapíše jako hotový a Medusa ho zopakuje při dalším db:migrate/deployi.
 */
export default async function anastasiaBootstrapMigration({ container }: { container: MedusaContainer }) {
  await anastasiaBootstrap({ container })
}
