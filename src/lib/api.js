const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL;

async function get(action, params = {}) {
  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res  = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  const text = await res.text();
  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error);
  return data;
}

async function post(body) {
  const res  = await fetch(SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error);
  return data;
}

export const api = {
  getFleet:       ()     => get("getFleet"),
  getHistory:     ()     => get("getHistory"),
  getConfig:      ()     => get("getConfig"),
  verifyStaff:    (body) => post({ action: "verifyStaff",    ...body }),
  checkOut:       (body) => post({ action: "checkOut",       ...body }),
  markReturned:   (body) => post({ action: "markReturned",   ...body }),
  extendBooking:  (body) => post({ action: "extendBooking",  ...body }),
  setMaintenance: (body) => post({ action: "setMaintenance", ...body }),
  setGarage:      (body) => post({ action: "setGarage",      ...body }),
  setAvailable:   (body) => post({ action: "setAvailable",   ...body }),
  updateLocation: (body) => post({ action: "updateLocation", ...body }),
  addStaff:       (body) => post({ action: "addStaff",       ...body }),
  addLocation:    (name) => post({ action: "addLocation",    name }),
};
