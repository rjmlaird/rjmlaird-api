export interface CalBookingData {
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
}

async function hubspotFetch<T>(env: Env, path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.HUBSPOT_PRIVATE_APP_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "No error body");
    console.error(`HubSpot API Error (${res.status}):`, errorBody);
    throw new Error(`HubSpot API (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function upsertContact(env: Env, booking: CalBookingData) {
  const properties = {
    email: booking.email,
    firstname: booking.firstname,
    lastname: booking.lastname,
    phone: booking.phone,
    company: booking.company,
  };

  const response = await hubspotFetch<{ results?: Array<{ id: string }> }>(
    env,
    "/crm/v3/objects/contacts/batch/upsert",
    {
      method: "POST",
      body: JSON.stringify({
        inputs: [{ idProperty: "email", id: booking.email, properties }],
      }),
    }
  );
  return response.results?.[0]?.id;
}

export async function createMeeting(env: Env, input: {
  subject: string;
  startTime?: string;
  endTime?: string;
  contactId?: string;
}) {
  const body = {
    engagement: {
      type: "MEETING",
      active: true,
    },
    associations: {
      contactIds: input.contactId ? [parseInt(input.contactId, 10)] : [],
    },
    metadata: {
      title: input.subject,
      body: "Meeting booked via Cal.com",
      startTime: input.startTime ? new Date(input.startTime).getTime() : Date.now(),
      endTime: input.endTime ? new Date(input.endTime).getTime() : Date.now() + 3600000,
    },
  };

  return hubspotFetch<{ engagement: { id: string } }>(env, "/engagements/v1/engagements", {
    method: "POST",
    body: JSON.stringify(body),
  });
}