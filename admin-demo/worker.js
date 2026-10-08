const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/state") {
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT data FROM demo_state WHERE id = ?")
          .bind("current")
          .first();
        return new Response(row?.data ?? "null", { headers: JSON_HEADERS });
      }

      if (request.method === "PUT") {
        const length = Number(request.headers.get("content-length") || 0);
        if (length > 1_000_000) {
          return Response.json({ error: "State is too large" }, { status: 413, headers: JSON_HEADERS });
        }
        let state;
        try {
          state = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400, headers: JSON_HEADERS });
        }
        if (!state || typeof state !== "object" || !state.collections || typeof state.collections !== "object") {
          return Response.json({ error: "Invalid state document" }, { status: 400, headers: JSON_HEADERS });
        }
        await env.DB.prepare(
          "INSERT INTO demo_state (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP"
        ).bind("current", JSON.stringify(state)).run();
        return Response.json({ saved: true }, { headers: JSON_HEADERS });
      }

      return new Response("Method not allowed", {
        status: 405,
        headers: { ...JSON_HEADERS, allow: "GET, PUT" }
      });
    }

    if (url.pathname === "/api/media" && request.method === "POST") {
      const mime = request.headers.get("content-type") || "";
      const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
      const extension = extensions[mime.toLowerCase()];
      if (!extension) {
        return Response.json({ error: "Unsupported image format" }, { status: 415, headers: JSON_HEADERS });
      }
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 5_000_000) {
        return Response.json({ error: "Image must be 5 MB or smaller" }, { status: 413, headers: JSON_HEADERS });
      }
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 5_000_000) {
        return Response.json({ error: "Image must be between 1 byte and 5 MB" }, { status: 413, headers: JSON_HEADERS });
      }
      const key = `${crypto.randomUUID()}.${extension}`;
      await env.MEDIA.put(key, bytes, {
        httpMetadata: { contentType: mime, cacheControl: "public, max-age=31536000, immutable" }
      });
      return Response.json({ key, url: `/api/media/${key}` }, { headers: JSON_HEADERS });
    }

    if (url.pathname.startsWith("/api/media/")) {
      const key = url.pathname.slice("/api/media/".length);
      if (!/^[0-9a-f-]+\.(jpg|png|webp|gif)$/i.test(key)) {
        return Response.json({ error: "Invalid media key" }, { status: 400, headers: JSON_HEADERS });
      }
      if (request.method === "DELETE") {
        await env.MEDIA.delete(key);
        return Response.json({ deleted: true }, { headers: JSON_HEADERS });
      }
      if (request.method === "GET") {
        const image = await env.MEDIA.get(key);
        if (!image) return new Response("Not found", { status: 404 });
        const headers = new Headers();
        image.writeHttpMetadata(headers);
        headers.set("etag", image.httpEtag);
        headers.set("x-content-type-options", "nosniff");
        return new Response(image.body, { headers });
      }
    }

    // --- NEXUS API ENDPOINTS ---
    if (url.pathname === "/api/nexus/pricing" && request.method === "POST") {
      try {
        const payload = await request.json();
        const { price = 0, salePrice = null, costPrice = null, maxDiscount = 25, minMargin = 30, rounding = "90" } = payload;
        const base = Number(price || 0);
        let finalP = salePrice !== null && salePrice !== undefined ? Number(salePrice) : base;
        let disc = base > 0 ? ((base - finalP) / base) * 100 : 0;
        let capped = false;
        if (disc > maxDiscount) {
          finalP = base * (1 - maxDiscount / 100);
          disc = maxDiscount;
          capped = true;
        }
        if (rounding === "90") finalP = Math.floor(finalP) + 0.90;
        else if (rounding === "round0") finalP = Math.ceil(finalP);
        else finalP = Math.round(finalP * 100) / 100;

        let margin = null;
        let underMargin = false;
        if (costPrice !== null && costPrice > 0 && finalP > 0) {
          margin = ((finalP - costPrice) / finalP) * 100;
          if (margin < minMargin) underMargin = true;
        }
        return Response.json({
          basePrice: base,
          salePrice: salePrice,
          costPrice: costPrice,
          finalPrice: finalP,
          discountPercent: disc,
          marginPercent: margin,
          underMarginFloor: underMargin,
          cappedByMaxDiscount: capped,
          timestamp: new Date().toISOString()
        }, { headers: JSON_HEADERS });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 400, headers: JSON_HEADERS });
      }
    }

    if (url.pathname === "/api/nexus/safeorder" && request.method === "POST") {
      try {
        const payload = await request.json();
        const { orderSum = 0, paymentMethod = "", customerEmail = "", codLimit = 120, tempmailBlock = true } = payload;
        let score = 10;
        const factors = [];
        const isCod = (paymentMethod || "").toLowerCase().includes("prevzatí") || (paymentMethod || "").toLowerCase().includes("dobierk");
        const email = (customerEmail || "").toLowerCase();

        if (isCod) {
          score += 20;
          factors.push("Platba na dobierku (+20)");
          if (orderSum > codLimit) {
            score += 35;
            factors.push(`Dobierka nad limit ${codLimit} € (+35)`);
          }
        } else {
          factors.push("Bezpečná CardPay / SEPA platba (-10)");
          score = Math.max(0, score - 10);
        }

        const tempDomains = ["mailinator.com", "tempmail.com", "10minutemail.com", "trashmail.com"];
        if (tempmailBlock && tempDomains.some(d => email.includes(d))) {
          score += 45;
          factors.push("Dočasná e-mailová adresa (+45)");
        }

        if (orderSum > 300) {
          score += 25;
          factors.push("Vysoká hodnota objednávky >300 € (+25)");
        }

        let decision = "ALLOW";
        if (score >= 70) decision = "BLOCK";
        else if (score >= 40) decision = "REVIEW";

        return Response.json({
          score: Math.min(100, score),
          decision,
          factors,
          statusText: `${decision} · ${decision === "ALLOW" ? "Automaticky schválené" : decision === "REVIEW" ? "Vyžaduje kontrolu" : "Zablokované"}`,
          timestamp: new Date().toISOString()
        }, { headers: JSON_HEADERS });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 400, headers: JSON_HEADERS });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
