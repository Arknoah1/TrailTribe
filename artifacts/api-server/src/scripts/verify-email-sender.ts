import { FROM_ADDRESS, sendEmail, stopEmailHealthCheck } from "../lib/email";

const recipient = process.env.EMAIL_TEST_TO?.trim();
const replyTo = process.env.EMAIL_TEST_REPLY_TO?.trim();

if (!recipient) {
  console.error(
    "Set EMAIL_TEST_TO to the inbox that should receive the sender verification message.",
  );
  process.exitCode = 1;
} else {
  const result = await sendEmail({
    to: recipient,
    subject: "Sender name verification — Methow Cycling Team",
    text: [
      "This is a controlled sender-name verification message.",
      "",
      "Confirm that your inbox displays Methow Cycling Team as the sender.",
      "If a Reply-To address was supplied, confirm that replying targets that address.",
    ].join("\n"),
    ...(replyTo ? { replyTo } : {}),
  });

  console.log(
    JSON.stringify({
      status: result.status,
      from: FROM_ADDRESS,
      replyToConfigured: Boolean(replyTo),
    }),
  );

  if (result.status !== "sent") {
    process.exitCode = 1;
  }
}

stopEmailHealthCheck();