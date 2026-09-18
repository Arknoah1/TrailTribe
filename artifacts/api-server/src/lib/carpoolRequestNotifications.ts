import { db, carpoolOffersTable, eventsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail, isDeliverableEmailAddress } from "./email";
import { addEmailLinks, createEmailLink } from "./emailLinks";
import { logger } from "./logger";
import { createNotification } from "./notifications";
import { getShortNamePrefix } from "../routes/settings";

type Requester = {
  id: number;
  firstName: string;
  lastName: string;
};

export async function notifyDriversOfCarpoolRequest({
  eventId,
  riderId,
  requester,
}: {
  eventId: number;
  riderId: number;
  requester: Requester;
}): Promise<void> {
  const offers = await db
    .select({ driverUserId: carpoolOffersTable.driverUserId })
    .from(carpoolOffersTable)
    .where(eq(carpoolOffersTable.eventId, eventId));

  const driverIds = [...new Set(
    offers
      .map((offer) => offer.driverUserId)
      .filter((driverId) => driverId !== requester.id),
  )];
  if (driverIds.length === 0) return;

  const [event, rider, orgPrefix] = await Promise.all([
    db.query.eventsTable.findFirst({ where: eq(eventsTable.id, eventId) }),
    db.query.usersTable.findFirst({ where: eq(usersTable.id, riderId) }),
    getShortNamePrefix(),
  ]);

  const requesterName = `${requester.firstName} ${requester.lastName}`;
  const riderName = rider ? `${rider.firstName} ${rider.lastName}` : requesterName;
  const eventName = event?.title ?? "this event";

  await Promise.all(driverIds.map(async (driverId) => {
    try {
      await createNotification(
        driverId,
        "carpool_request_posted",
        "New Ride Request",
        `${requesterName} posted a ride request for this event.`,
        `/carpools/${eventId}`,
      );
    } catch (err) {
      logger.error({ err, driverId, eventId }, "[carpools] ride request in-app notification error");
    }

    try {
      const driver = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, driverId),
      });
      if (
        !driver
        || !driver.notificationsEnabled
        || !driver.emailNotifications
        || driver.notificationPreferences?.carpoolUpdates === false
        || !isDeliverableEmailAddress(driver.email)
      ) {
        return;
      }

      const requestDescription = riderId === requester.id
        ? `${riderName} posted a ride request for ${eventName}.`
        : `${riderName} needs a ride to ${eventName}. ${requesterName} posted the request.`;
      const message = addEmailLinks(
        [
          `Hi ${driver.firstName},`,
          "",
          requestDescription,
          "",
          "Head to TrailTeam to view the request and coordinate a ride.",
          "— TrailTeam",
        ].join("\n"),
        [createEmailLink(`/carpools/${eventId}`, "View carpool board")],
      );
      const result = await sendEmail({
        to: driver.email,
        subject: `${orgPrefix}New ride request for ${eventName}`,
        ...message,
      });
      if (result.status === "failed") {
        logger.error(
          { err: result.error, driverId, eventId },
          "[carpools] ride request email failed",
        );
      }
    } catch (err) {
      logger.error({ err, driverId, eventId }, "[carpools] ride request email error");
    }
  }));
}