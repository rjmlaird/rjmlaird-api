import { Hono } from "hono";
import { json } from "../../lib/jsonResponse";
import { upsertContact, createMeeting } from "../../services/hubspot";
import { saveBooking, updateBookingStatus } from "../../services/cal-store";

const IGNORED_SLUGS = ["leicesterspaceweek", "spaceintegrity", "spaceimpactforum", "greenorbitdigital", "greenorbitacademy", "greenorbitspace"];

const cal = new Hono<{ Bindings: Env }>();

/** HMAC-SHA256 over the raw request body, compared timing-safely against
 *  the X-Cal-Signature-256 header, per Cal.com's webhook verification spec. */
async function verifyCalSignature(rawBody: string, signatureHeader: string | null, secret: string | undefined): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expectedHex = [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (expectedHex.length !== signatureHeader.length) return false;

  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

cal.post("/", async (c) => {
  try {
    const rawBody = await c.req.text();
    const signature = c.req.header("x-cal-signature-256") ?? null;

    const valid = await verifyCalSignature(rawBody, signature, c.env.CAL_WEBHOOK_SECRET);
    if (!valid) {
      return json({ error: "Invalid signature" }, 401);
    }

    const body = JSON.parse(rawBody);
    const { triggerEvent, payload } = body;
    const slug = payload?.eventType?.slug;
    const bookingId = payload?.uid;

    if (triggerEvent === "BOOKING_CREATED") {
      const attendee = payload.attendees?.[0];
      const nameParts = (attendee?.name || "").split(" ");

      // 1. Sync to HubSpot first (if not an internal-only event), so we can
      //    store the resulting IDs alongside the booking record.
      let hubspotContactId: string | undefined;
      let hubspotMeetingId: string | undefined;

      if (!IGNORED_SLUGS.includes(slug)) {
        hubspotContactId = await upsertContact(c.env, {
          email: attendee?.email,
          firstname: nameParts[0],
          lastname: nameParts.slice(1).join(" "),
        });

        if (hubspotContactId) {
          const meeting = await createMeeting(c.env, {
            subject: payload.eventType?.title || "New Meeting",
            startTime: payload.startTime,
            endTime: payload.endTime,
            contactId: hubspotContactId,
          });
          hubspotMeetingId = meeting?.engagement?.id;
        }
      }

      // 2. Log to R2, now including the HubSpot IDs if we have them.
      await saveBooking(c.env, {
        bookingId,
        email: attendee?.email,
        startTime: payload.startTime,
        endTime: payload.endTime,
        status: "created",
        hubspotContactId,
        hubspotMeetingId,
      });
    } else if (triggerEvent === "BOOKING_RESCHEDULED") {
      await updateBookingStatus(c.env, bookingId, "rescheduled");
    } else if (triggerEvent === "BOOKING_CANCELLED") {
      await updateBookingStatus(c.env, bookingId, "cancelled");
    }

    return json({ status: "success" }, 200);
  } catch (error) {
    console.error("Webhook processing error:", error);
    return json({ error: "Internal Server Error" }, 500);
  }
});

export default cal;
