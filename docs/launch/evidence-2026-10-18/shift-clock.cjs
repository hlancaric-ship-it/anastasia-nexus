// Len lokálny E2E: posunie hodiny procesu o CLOCK_SHIFT_MS (simulácia dňa obnovy bez zásahu do DB).
const shift = Number(process.env.CLOCK_SHIFT_MS || 0)
if (shift) {
  const RealDate = Date
  class ShiftedDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + shift) } static now() { return RealDate.now() + shift } }
  global.Date = ShiftedDate
}
