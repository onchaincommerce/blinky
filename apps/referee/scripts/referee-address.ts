import "dotenv/config";

import { CdpClient } from "@coinbase/cdp-sdk";

async function main() {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const walletSecret = process.env.CDP_WALLET_SECRET;
  const accountName = process.env.CDP_REFEREE_ACCOUNT_NAME ?? "blink-duel-referee";

  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    throw new Error("Missing CDP server wallet credentials");
  }

  const cdp = new CdpClient({
    apiKeyId,
    apiKeySecret,
    walletSecret
  });

  const account = await cdp.evm.getOrCreateAccount({
    name: accountName
  });

  console.log(JSON.stringify({
    name: accountName,
    address: account.address
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
