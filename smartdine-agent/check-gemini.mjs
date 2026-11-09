
import { loadEnvFile } from "node:process";

loadEnvFile(".env.local");

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing.");
  process.exit(1);
}

async function main() {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: {
          "x-goog-api-key": apiKey,
        },
      }
    );

    console.log("HTTP status:", response.status);

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        data.error?.message ?? data
      );
      return;
    }

    console.log("\nAvailable Gemini models:\n");

    for (const model of data.models ?? []) {
      if (
        model.supportedGenerationMethods?.includes(
          "generateContent"
        )
      ) {
        console.log(model.name);
      }
    }
  } catch (error) {
    console.error("Connection error:", error);
  }
}

main();
