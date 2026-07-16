import { Hono } from "hono";
import { json } from "../../lib/jsonResponse";
import { upsertContact, createMeeting } from "../../services/hubspot";
import { saveBooking } from "../../services/cal-store";

const IGNORED_SLUGS = ["leicesterspaceweek", "spaceintegrity", "spaceimpactforum", "greenorbitdigital", "greenorbitacademy", "greenorbitspace"];

const cal = new Hono<{ Bindings: Env }>();

cal.post("/", async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body) return json({ error: "Invalid JSON" }, 400);

    const { triggerEvent, payload } = body;
    const slug = payload.eventType?.slug;
    
    if (triggerEvent === "BOOKING_CREATED") {
      const attendee = payload.attendees?.[0];
      const nameParts = (attendee?.name || "").split(" ");

      // 1. Log to R2
      await saveBooking(c.env, {
        bookingId: payload.uid,
        email: attendee?.email,
        startTime: payload.startTime,
        endTime: payload.endTime,
        status: "created",
      });

      // 2. Sync to HubSpot (if not an internal-only event)
      if (!IGNORED_SLUGS.includes(slug)) {
        const contactId = await upsertContact(c.env, {
          email: attendee?.email,
          firstname: nameParts[0],
          lastname: nameParts.slice(1).join(" "),
        });

        if (contactId) {
          await createMeeting(c.env, {
            subject: payload.eventType?.title || "New Meeting",
            startTime: payload.startTime,
            endTime: payload.endTime,
            contactId,
          });
        }
      }
    }

    return json({ status: "success" }, 200);
  } catch (error) {
    console.error("Webhook processing error:", error);
    return json({ error: "Internal Server Error" }, 500);
  }
});

export default cal;