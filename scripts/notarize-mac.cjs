/**
 * notarize-mac.cjs
 *
 * electron-builder afterSign hook. Runs only on macOS when Apple credentials
 * are present. Safe to skip locally (unsigned dev builds) or via SKIP_NOTARIZE=1.
 *
 * Required env (store in .env.release on the Mac mini — never commit):
 *   APPLE_ID
 *   APPLE_APP_SPECIFIC_PASSWORD
 *   APPLE_TEAM_ID
 *
 * Signing identity is picked up from the login keychain (Developer ID Application)
 * or CSC_NAME / CSC_LINK if you use exported certs.
 */

const { notarize } = require("@electron/notarize");

/** @param {import('electron-builder').AfterSignContext} context */
exports.default = async function notarizeMac(context) {
  if (process.platform !== "darwin") return;
  if (process.env.SKIP_NOTARIZE === "1") {
    console.log("[notarize] skipped (SKIP_NOTARIZE=1)");
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(
      "[notarize] skipped — set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID in .env.release",
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  console.log("[notarize] submitting", appPath);
  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log("[notarize] complete");
};
