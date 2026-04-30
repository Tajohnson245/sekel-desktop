// Azure Artifact Signing hook for @electron/windows-sign.
// Required env vars (must be set as GitHub Secrets and passed through
// .github/workflows/release.yml on the windows-latest matrix entry):
//   AZURE_TENANT_ID      -- Entra tenant for the signing service principal
//   AZURE_CLIENT_ID      -- service principal app ID with Code Signing role
//   AZURE_CLIENT_SECRET  -- service principal client secret
// Build host requirement: AzureSignTool installed globally
//   dotnet tool install --global AzureSignTool
const { execFileSync } = require('child_process');

module.exports = function signFile({ path: filePath }) {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new Error(
      'Azure signing env vars missing (AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET) -- aborting unsigned build'
    );
  }
  execFileSync(
    'AzureSignTool',
    [
      'sign',
      '-kvu', 'https://eus.codesigning.azure.net/',
      '-kvc', 'sekel-public',
      '-kvi', AZURE_CLIENT_ID,
      '-kvs', AZURE_CLIENT_SECRET,
      '-kvt', AZURE_TENANT_ID,
      '-tr',  'http://timestamp.acs.microsoft.com',
      '-td',  'sha256',
      '-fd',  'sha256',
      '-d',   'Sekel',
      filePath,
    ],
    { stdio: 'inherit' }
  );
};
