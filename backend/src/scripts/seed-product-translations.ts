/**
 * Seed vícejazyčných překladů produktů (EN / RU) do Medusa DB metadata:
 *   product.metadata.translations = {
 *     en: { title, subtitle, description },
 *     ru: { title, subtitle, description }
 *   }
 *
 * Spuštění:
 *   npx medusa exec src/scripts/seed-product-translations.ts
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

export const PRODUCT_TRANSLATIONS: Record<
  string,
  {
    en: { title: string; subtitle?: string; description?: string }
    ru: { title: string; subtitle?: string; description?: string }
  }
> = {
  "bio-plet-krem": {
    en: { title: "Your Face Cream", subtitle: "Bio face cream with nourishing herbal oils." },
    ru: { title: "Ваш крем для лица", subtitle: "Био-крем для лица с питательными растительными маслами." },
  },
  "pletova-voda": {
    en: { title: "Your Skin Tonic", subtitle: "Gentle herbal skin tonic for daily skin care." },
    ru: { title: "Ваша цветочная вода для лица", subtitle: "Нежная травяная вода для ежедневного ухода за кожей лица." },
  },
  "bio-sprchovy-gel": {
    en: { title: "Your Shower Gel", subtitle: "Gentle revitalising natural shower gel." },
    ru: { title: "Ваш гель для душа", subtitle: "Мягкий восстанавливающий натуральный гель для душа." },
  },
  "mineralny-ochranny-krem-pre-citlivu-pokozku": {
    en: { title: "MINERAL PROTECT 200ml", subtitle: "Mineral protective emulsion for sensitive skin." },
    ru: { title: "MINERAL PROTECT 200ml", subtitle: "Минеральная защитная эмульсия для чувствительной кожи." },
  },
  "chripka-prasok": {
    en: { title: "FLU POWDER", subtitle: "Herbal powdered blend for cold and flu relief." },
    ru: { title: "ПРОТИВОПРОСТУДНЫЙ ПОРОШОК", subtitle: "Травяной порошковый сбор при простуде и гриппе." },
  },
  "antibioticky-prasok": {
    en: { title: "JANČA Herbal Antibiotic Blend", subtitle: "Traditional natural herbal blend by Jiří Janča." },
    ru: { title: "Антибиотическая травяная смесь ЯНЧИ", subtitle: "Традиционный травяной сбор по рецепту Иржи Янчи." },
  },
  "nic-nemusis": {
    en: { title: "Nothing Is Required", subtitle: "Personal transformation and mindfulness programme." },
    ru: { title: "Ничего не нужно", subtitle: "Программа личной трансформации и осознанности." },
  },
  "osviezit-plet": {
    en: { title: "Your Refreshing Skin Tonic", subtitle: "Refreshing herbal tonic for vibrant hydration." },
    ru: { title: "Ваша освежающая вода для лица", subtitle: "Освежающая травяная вода для глубокого увлажнения." },
  },
  "reset-40-plus": {
    en: { title: "AI ANASTASIA RESET 40+", subtitle: "16-week holistic longevity & vitality programme." },
    ru: { title: "AI ANASTASIA RESET 40+", subtitle: "16-недельная программа долголетия и энергии." },
  },
  "online-zdravotna-konzultacia": {
    en: { title: "Online Health Consultation", subtitle: "Individual consultation with Lucia Rogožanová." },
    ru: { title: "Онлайн-консультация по здоровью", subtitle: "Индивидуальная consultation с Луцией Рогожановой." },
  },
  "personalizovany-zdravotny-protokol-pro": {
    en: { title: "Personalised Health Protocol", subtitle: "Comprehensive individual health and lifestyle protocol." },
    ru: { title: "Персонализированный протокол здоровья", subtitle: "Комплексный индивидуальный протокол здоровья и образа жизни." },
  },
  "supervizia": {
    en: { title: "Supervision", subtitle: "Professional supervision and mentoring consultation." },
    ru: { title: "Супервизия", subtitle: "Профессиональная супервизия и менторская консультация." },
  },
  "astrologia-zdravie-predispozicia": {
    en: { title: "Astrological Health & Predisposition Profile", subtitle: "Individual astrological profile of health and vitality." },
    ru: { title: "Астрологический профиль здоровья и предрасположенностей", subtitle: "Индивидуальный астрологический профиль здоровья и жизненных сил." },
  },
  "vyuka-vedomeho-vnimania": {
    en: { title: "Conscious Perception Study", subtitle: "52-week year-long development of conscious perception." },
    ru: { title: "Обучение осознанному восприятию", subtitle: "Годовая программа развития осознанного восприятия (52 недели)." },
  },
  "darcekovy-poukaz-50": {
    en: { title: "Gift voucher €50" },
    ru: { title: "Подарочный сертификат 50 €" },
  },
  "darcekovy-poukaz-100": {
    en: { title: "Gift voucher €100" },
    ru: { title: "Подарочный сертификат 100 €" },
  },
  "darcekovy-poukaz-200": {
    en: { title: "Gift voucher €200" },
    ru: { title: "Подарочный сертификат 200 €" },
  },
}

export default async function seedProductTranslations({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  logger.info("[seed-product-translations] Načítavam produkty z Medusa DB...")
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "metadata"],
  })

  let updatedCount = 0
  for (const product of products || []) {
    const handle = String(product.handle || "").toLowerCase()
    const tr = PRODUCT_TRANSLATIONS[handle]
    if (!tr) continue

    const currentMeta = (product.metadata as Record<string, any>) || {}
    const newTranslations = {
      ...(currentMeta.translations || {}),
      en: { ...(currentMeta.translations?.en || {}), ...tr.en },
      ru: { ...(currentMeta.translations?.ru || {}), ...tr.ru },
    }

    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: product.id,
            metadata: {
              ...currentMeta,
              translations: newTranslations,
            },
          },
        ],
      },
    })
    logger.info(`[seed-product-translations] Aktualizovaný produkt: ${product.title} (${handle})`)
    updatedCount++
  }

  logger.info(`[seed-product-translations] Hotovo: aktualizovaných ${updatedCount} produktov.`)
}
