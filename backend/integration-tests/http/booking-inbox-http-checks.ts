import { createHmac } from 'node:crypto'

/** Real signed HTTP route + native booking service/PostgreSQL; no Worker or booking writes are mocked. */
export async function verifyBookingInboxHttp({ api, options, container, orderId, bookingId, stage, evidence }: any) {
  const previous = process.env.NEXUS_BOOKING_SYNC_SECRET
  const secret = 'synthetic-booking-sync-secret-for-http-only'
  process.env.NEXUS_BOOKING_SYNC_SECRET = secret
  const bookings = container.resolve('booking')
  const endpoint = '/hooks/nexus/booking-order'
  const send = async (patch: Record<string,unknown> = {}, headers: Record<string,string> = {}, signingSecret = secret) => {
    const body = JSON.stringify({ version:1,tenantId:process.env.NEXUS_TENANT_ID,operationId:'bksync_synthetic',orderId,mode:'inspect',...patch })
    const timestamp = String(Math.floor(Date.now()/1000))
    return api.post(endpoint,body,{...options,headers:{...options.headers,'content-type':'application/json',
      'x-nexus-timestamp':timestamp,'x-nexus-signature':createHmac('sha256',signingSecret).update(`${timestamp}.${body}`).digest('hex'),...headers}})
  }
  try {
    if (stage === 'unpaid') {
      expect((await api.post(endpoint,{},options)).status).toBe(401)
      expect((await send({}, {}, 'synthetic-wrong-signing-secret-32-chars')).status).toBe(401)
      expect((await send({tenantId:'other'})).status).toBe(403)
      expect((await send({paid:true})).status).toBe(400)
      expect((await send({}, {origin:'https://browser.example.test'})).status).toBe(403)
      expect((await send({orderId:'order_synthetic_missing'})).status).toBe(404)
      const inspected = await send()
      expect(inspected.status).toBe(200)
      expect(inspected.data).toMatchObject({ synchronized:true,result:'HELD',orderId })
      const synced = await send({mode:'synchronize'})
      expect(synced.data).toMatchObject({synchronized:true,result:'HELD'})
      expect((await bookings.retrieveBooking(bookingId)).status).toBe('held')
      evidence.push({scenario:'BOOKING_INBOX_SIGNED_UNPAID_AND_AUTH',status:'PASS',unpaidRemainsHeld:true,foreignTenant:403,unsigned:401,clientPaid:400})
    } else if (stage === 'paid') {
      // Simulate a missed native subscriber after authoritative payment capture.
      await bookings.updateBookings({id:bookingId,status:'held'})
      expect((await send()).data).toMatchObject({synchronized:false,result:'MISMATCH'})
      const repaired = await send({mode:'synchronize'})
      expect(repaired.status).toBe(200)
      expect(repaired.data).toMatchObject({synchronized:true,result:'CONFIRMED',orderId})
      expect((await bookings.retrieveBooking(bookingId)).status).toBe('confirmed')
      expect((await send({mode:'synchronize'})).data).toMatchObject({synchronized:true,result:'CONFIRMED'})
      expect((await send()).data).toMatchObject({synchronized:true,result:'CONFIRMED'})
      expect(JSON.stringify(repaired.data)).not.toContain('customer_id')
      expect(JSON.stringify(repaired.data)).not.toContain('captured_amount')
      evidence.push({scenario:'BOOKING_INBOX_PAID_REPAIR_READBACK_REPLAY',status:'PASS',nativeRepair:true,authoritativeReadback:true})
    } else {
      const synced = await send({mode:'synchronize'})
      expect(synced.status).toBe(200)
      expect(synced.data).toMatchObject({synchronized:true,result:'CANCELED'})
      expect((await bookings.retrieveBooking(bookingId)).status).toBe('canceled')
      evidence.push({scenario:'BOOKING_INBOX_CANCELED_NOT_REVIVED',status:'PASS'})
    }
  } finally {
    if(previous===undefined) delete process.env.NEXUS_BOOKING_SYNC_SECRET
    else process.env.NEXUS_BOOKING_SYNC_SECRET=previous
  }
}
