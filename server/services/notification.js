require("dotenv").config();

const twilio = require("twilio");

const client =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN
    ? twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      )
    : null;

// ======================================================
// SMS
// ======================================================

async function sendSMS(message) {
  if (!client) {
    console.log(
      "Twilio not configured - SMS skipped"
    );

    return false;
  }

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.ALERT_PHONE_NUMBER,
    });

    console.log("SMS SENT");

    return true;
  } catch (error) {
    console.error(
      "SMS ERROR:",
      error.message
    );

    return false;
  }
}

// ======================================================
// PHONE CALL
// ======================================================

async function makeCall(message) {
  if (!client) {
    console.log(
      "Twilio not configured - call skipped"
    );

    return false;
  }

  try {
    const safeMessage =
      message
        .replace(/&/g, "and")
        .replace(/</g, "")
        .replace(/>/g, "");

    await client.calls.create({
      twiml: `
        <Response>
          <Say language="en-IN">
            ${safeMessage}
          </Say>
        </Response>
      `,

      from: process.env.TWILIO_PHONE_NUMBER,

      to: process.env.ALERT_PHONE_NUMBER,
    });

    console.log("PHONE CALL SENT");

    return true;
  } catch (error) {
    console.error(
      "CALL ERROR:",
      error.message
    );

    return false;
  }
}

module.exports = {
  sendSMS,
  makeCall,
};