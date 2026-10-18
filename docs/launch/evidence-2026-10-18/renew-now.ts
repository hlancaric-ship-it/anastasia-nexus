// Spustí obnovu jedného členstva tak, ako ju spúšťa job membership-billing, len s časom tesne po konci obdobia.
// Použitie: MBR=mbr_… medusa exec <tento súbor>. DB sa nemení ručne.
import { runMembershipBilling } from '/Users/lucky/anastasia-nexus-claude-integration/backend/src/lib/membership/billing'
import { MEMBERSHIP_MODULE } from '/Users/lucky/anastasia-nexus-claude-integration/backend/src/modules/membership'
export default async function renewNow({ container }: any) {
  const id = process.env.MBR
  if (!id) throw new Error('MBR chýba')
  const service: any = container.resolve(MEMBERSHIP_MODULE)
  const [m] = await service.listMemberships({ id }, { take: 1 })
  if (!m) throw new Error('členstvo neexistuje')
  const now = new Date(new Date(m.period_end).getTime() + (Number(process.env.OFFSET_MIN || 1)) * 60000)
  // Celý proces beží „v budúcnosti“ (ako job tesne po konci obdobia) — aj interné new Date() v settle().
  const RealDate = Date, shift = now.getTime() - RealDate.now()
  class ShiftedDate extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(RealDate.now() + shift) } static now() { return RealDate.now() + shift } }
  ;(globalThis as any).Date = ShiftedDate
  const result = await runMembershipBilling(container, id, now)
  ;(globalThis as any).Date = RealDate
  console.log('RENEW_RESULT', JSON.stringify({ id, now: now.toISOString(), before: m.period_end, result: { status: result.status } }))
}
