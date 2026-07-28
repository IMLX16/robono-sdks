import {
  createRobonoBackendAdapter,
  RobonoServer,
  verifyRobonoWebhook,
  type ConnectionCapabilities,
  type EndpointConnection,
  type RobonoAuthorizationContext,
  type RobonoClientPushPayload,
} from "../../dist/index.js";

const apiKey = process.env.ROBONO_API_KEY;
if (!apiKey) throw new Error("ROBONO_API_KEY is required");
const robono = new RobonoServer({ apiKey });

declare const accounts: {
  findActiveUser(id: string): Promise<{ id: string } | null>;
};
declare const yourAuth: {
  findUser(request: Request): Promise<{ id: string } | null>;
};

async function authorizeRobono({
  action,
  userId,
}: RobonoAuthorizationContext) {
  const user = await accounts.findActiveUser(userId);
  return Boolean(user && action === "networks.list");
}

export const handleRobono = createRobonoBackendAdapter({
  robono,
  authenticate: async (request) =>
    (await yourAuth.findUser(request))?.id ?? null,
  authorize: authorizeRobono,
});

export const minimumCapabilities = {
  allowed_outbound_message_kinds: ["text"],
  allowed_inbound_message_kinds: ["text"],
  text: { max_characters: 1_000 },
} satisfies ConnectionCapabilities;

export async function markFirstMessageRead(
  connection: EndpointConnection,
  externalUserId: string,
) {
  const history = await robono.endpointMessages.list({
    connection,
    external_user_id: externalUserId,
    limit: 50,
  });
  const firstMessage = history.messages[0];
  if (!firstMessage) return;
  await robono.endpointMessages.mark({
    connection,
    external_user_id: externalUserId,
    message_id: firstMessage.message_id,
    event: "read",
  });
}

export async function verifyExample(
  rawBody: string,
  request: Request,
) {
  const webhookSecret = process.env.ROBONO_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("ROBONO_WEBHOOK_SECRET is required");
  return verifyRobonoWebhook(rawBody, request.headers, webhookSecret);
}

export function readPushDiagnostics(event: RobonoClientPushPayload) {
  if (event.event !== "diagnostic.push_requested") return null;
  return {
    diagnosticId: event.push_diagnostic_id,
    diagnosticToken: event.diagnostic_token,
  };
}
