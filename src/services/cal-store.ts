/**
 * Maps Cal.com booking IDs to HubSpot contact/meeting IDs.
 * Stored as JSON blobs in R2 (env.CDN).
 */
export type BookingStatus = "created" | "rescheduled" | "cancelled";

export interface StoredBooking {
  bookingId: string;
  hubspotContactId?: string;
  hubspotMeetingId?: string;
  email: string;
  startTime?: string;
  endTime?: string;
  status: BookingStatus;
  updatedAt: string;
}

// Helper to generate the storage path
const getPath = (bookingId: string) => `webhooks/cal-bookings/${bookingId}.json`;

export async function getBooking(env: Env, bookingId: string): Promise<StoredBooking | null> {
  const obj = await env.CDN.get(getPath(bookingId));
  return obj ? await obj.json<StoredBooking>() : null;
}

export async function saveBooking(env: Env, data: Omit<StoredBooking, "updatedAt">): Promise<StoredBooking> {
  const record: StoredBooking = { ...data, updatedAt: new Date().toISOString() };
  await env.CDN.put(getPath(data.bookingId), JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
  });
  return record;
}

export async function updateBookingStatus(env: Env, bookingId: string, status: BookingStatus): Promise<StoredBooking | null> {
  const existing = await getBooking(env, bookingId);
  if (!existing) return null;

  return await saveBooking(env, { ...existing, status });
}

export async function deleteBooking(env: Env, bookingId: string): Promise<void> {
  await env.CDN.delete(getPath(bookingId));
}