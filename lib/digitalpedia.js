const BASE_URL = process.env.DP_BASE_URL || "https://pay.digitalpedia.web.id/api";
const API_KEY = process.env.DP_API_KEY;

async function call(pathname, body) {
  if (!API_KEY || API_KEY === "YOUR_API_KEY") {
    throw new Error(
      "DP_API_KEY belum diisi di .env — ambil dulu dari dashboard DigitalPedia."
    );
  }

  const res = await fetch(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);

  if (!data) {
    throw new Error(`Respons tidak valid dari gateway (HTTP ${res.status})`);
  }

  return { httpStatus: res.status, data };
}

export function createDeposit(amount) {
  return call("/deposit/create", { amount });
}

export function checkDepositStatus(depositId) {
  return call("/deposit/status", { deposit_id: depositId });
}

export function cancelDeposit(depositId) {
  return call("/deposit/cancel", { deposit_id: depositId });
}
