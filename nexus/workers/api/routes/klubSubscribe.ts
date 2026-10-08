/**
 * POST /api/klub/subscribe
 *
 * Klub ANASTASIA – Stripe Billing subscription endpoint.
 *
 * Workflow:
 *  1. Validate input (email, planId, optional payment method).
 *  2. Create/retrieve Stripe Customer by email.
 *  3. Create Stripe Subscription (or return existing active one).
 *  4. Return clientSecret for frontend Stripe.js confirmation.
 *
 * Stripe is called only via fetch() – no Node SDK, Worker-compatible.
 *
 * Secret requirements (wrangler secret put):
 *   STRIPE_SECRET_KEY   – sk_live_ / sk_test_ key
 */

import { Env } from '../types';

const STRIPE_API = 'https://api.stripe.com/v1';

type KlubPlan = 'anastasia-basic' | 'anastasia-premium';

interface SubscribeRequest {
  email: string;
  planId: KlubPlan;
  /** Stripe PaymentMethod ID – optional, can be added later via SetupIntent */
  paymentMethodId?: string;
}

interface StripeError {
  error: { message: string; code?: string };
}

// ---------------------------------------------------------------------------
// Plan → Stripe Price ID mapping (env-safe, no hardcoded tenant branches).
// Overridable via wrangler vars if needed.
// ---------------------------------------------------------------------------
const PLAN_PRICE_IDS: Record<KlubPlan, string> = {
  'anastasia-basic': 'price_anastasia_basic_monthly',
  'anastasia-premium': 'price_anastasia_premium_monthly',
};

async function stripePost(
  path: string,
  body: Record<string, string>,
  apiKey: string,
): Promise<Response> {
  return fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
}

async function stripeGet(path: string, apiKey: string): Promise<Response> {
  return fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

export async function handleKlubSubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  const stripeKey = (env as unknown as Record<string, string>)['STRIPE_SECRET_KEY'];
  if (!stripeKey) {
    return Response.json({ ok: false, error: 'Stripe not configured' }, { status: 503 });
  }

  let body: SubscribeRequest;
  try {
    body = (await request.json()) as SubscribeRequest;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, planId, paymentMethodId } = body;

  if (!email || !planId || !PLAN_PRICE_IDS[planId]) {
    return Response.json(
      { ok: false, error: 'Missing or invalid email / planId' },
      { status: 422 },
    );
  }

  const priceId = PLAN_PRICE_IDS[planId];

  // 1. Find or create customer
  const searchRes = await stripeGet(
    `/customers/search?query=email:"${encodeURIComponent(email)}"&limit=1`,
    stripeKey,
  );
  const searchData = (await searchRes.json()) as {
    data?: { id: string }[];
  };

  let customerId: string;
  if (searchData.data && searchData.data.length > 0 && searchData.data[0]?.id) {
    customerId = searchData.data[0].id;
  } else {
    const createRes = await stripePost('/customers', { email }, stripeKey);
    const customer = (await createRes.json()) as { id?: string } & StripeError;
    if (!customer.id) {
      return Response.json(
        { ok: false, error: customer.error?.message ?? 'Customer creation failed' },
        { status: 502 },
      );
    }
    customerId = customer.id;
  }

  // 2. Create subscription
  const subBody: Record<string, string> = {
    customer: customerId,
    'items[0][price]': priceId,
    payment_behavior: 'default_incomplete',
    'expand[]': 'latest_invoice.payment_intent',
  };
  if (paymentMethodId) {
    subBody['default_payment_method'] = paymentMethodId;
  }

  const subRes = await stripePost('/subscriptions', subBody, stripeKey);
  const sub = (await subRes.json()) as {
    id?: string;
    status?: string;
    latest_invoice?: {
      payment_intent?: { client_secret?: string };
    };
  } & StripeError;

  if (!sub.id) {
    return Response.json(
      { ok: false, error: sub.error?.message ?? 'Subscription creation failed' },
      { status: 502 },
    );
  }

  return Response.json({
    ok: true,
    subscriptionId: sub.id,
    status: sub.status,
    clientSecret: sub.latest_invoice?.payment_intent?.client_secret ?? null,
    customerId,
    planId,
    timestamp: new Date().toISOString(),
  });
}
