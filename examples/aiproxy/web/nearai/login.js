export const NEAR_AI_AUTH_OBJECT_STORAGE_KEY = "NearAIAuthObject";

export async function handleNearAILoginCallback() {
  const callbackparams = new URLSearchParams(location.hash);
  const accountId = callbackparams.get("#accountId");

  if (accountId) {
    const nearaiauthobject = JSON.parse(
      localStorage.getItem(NEAR_AI_AUTH_OBJECT_STORAGE_KEY),
    );
    nearaiauthobject.account_id = accountId;
    nearaiauthobject.signature = callbackparams.get("signature");
    nearaiauthobject.public_key = callbackparams.get("publicKey");
    localStorage.setItem(
      NEAR_AI_AUTH_OBJECT_STORAGE_KEY,
      JSON.stringify(nearaiauthobject),
    );
    location.hash = "";
  }
}

export async function nearAIlogin(wallet, message) {
  // Generate nonce based on current time in milliseconds
  const nonce = new String(Date.now());
  const nonceBuffer = Buffer.from(
    new TextEncoder().encode(nonce.padStart(32, "0")),
  );

  const recipient = "ai.near";
  const callbackUrl = location.href;

  const authObject = {
    message,
    nonce,
    recipient,
    callback_url: callbackUrl,
  };

  localStorage.setItem(
    NEAR_AI_AUTH_OBJECT_STORAGE_KEY,
    JSON.stringify(authObject),
  );
  const signedMessage = await wallet.signMessage({
    message,
    nonce: nonceBuffer,
    recipient,
    callbackUrl,
  });

  authObject.signature = signedMessage.signature;
  authObject.account_id = signedMessage.accountId;
  authObject.public_key = signedMessage.publicKey;

  localStorage.setItem(
    NEAR_AI_AUTH_OBJECT_STORAGE_KEY,
    JSON.stringify(authObject),
  );

  return authObject;
}
