// Quick standalone smoke test for the Brevo email provider.
// Run with: node scripts/test-brevo.mjs
import { createEmailProvider } from "../packages/communications/dist/index.js";

const provider = createEmailProvider();

const result = await provider.send({
  to: process.env.TEST_RECIPIENT_EMAIL,
  subject: "London Property AI — test email",
  html: "<p>This is a live test send from the Brevo integration.</p>",
  text: "This is a live test send from the Brevo integration.",
});

console.log("Send succeeded:", result);
