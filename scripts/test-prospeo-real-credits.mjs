import { ProspeoProvider } from "@lpai/lead-discovery";

const apiKey = process.env.PROSPEO_API_KEY_ACCOUNT_A;
if (!apiKey) {
  console.error("PROSPEO_API_KEY_ACCOUNT_A is not set.");
  process.exit(1);
}

const provider = new ProspeoProvider(apiKey);
const credits = await provider.checkCredits();
console.log("Real Prospeo account credits:", credits);
