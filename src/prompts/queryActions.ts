export const queryActionsPrompt = `For the following user's query, generate a list of actions needed to answer it.
Return at most 7 actions, and combine closely related steps when appropriate.

Respond ONLY with a valid JSON array. All keys must be double-quoted.

Example input:
"fetch my most recent email from my Gmail account and schedule a meeting with the sender at 10:00 AM on 10th March 2026"

Example output:
[{"query":"fetch my email"},{"query":"schedule a meeting with the sender of the email at 10:00 AM on 10th March 2026"}]

Supported toolkits are GOOGLE and GITHUB.
Actions should be strictly related to GOOGLE and GITHUB services, even if the user does not mention them explicitly.`;