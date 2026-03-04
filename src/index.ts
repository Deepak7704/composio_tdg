import { Composio } from "@composio/core";
import { OpenRouter } from "@openrouter/sdk";
import * as readline from "node:readline/promises";
import { writeFile } from "node:fs/promises";
import { queryActionsPrompt } from "./prompts/queryActions";
const composio = new Composio();
const openRouter = new OpenRouter();

const tools = await composio.tools.getRawComposioTools({
  toolkits: ["googlesuper"],
  limit: 1000,
});

await writeFile("googlesuper_tools.json", JSON.stringify(tools, null, 2), "utf-8");
console.log("Tools written to googlesuper_tools.json");

const generateQueryActions = async (query: string) => {
  

  const result = await openRouter.chat.send({
    chatGenerationParams: {
      messages: [
        { role: "system", content: queryActionsPrompt },
        { role: "user", content: query },
      ],
      model: "openai/gpt-4o",
      provider: { zdr: true, sort: "price" },
      stream: false,
    },
  });

  return result?.choices[0]?.message?.content as string;
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const query = await rl.question("Hello, how can I help you today?\n> ");
rl.close();

if (!query.trim()) {
  console.error("Please provide a query");
  process.exit(1);
}

console.log("Making request to OpenRouter...");
const actions = await generateQueryActions(query);
console.log("result query actions");
console.log(actions);