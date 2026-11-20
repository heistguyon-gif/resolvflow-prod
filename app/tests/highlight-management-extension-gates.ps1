$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent) -ErrorAction Stop
& node --test tests/highlight-management-extension.test.mjs tests/story-options-extension.test.mjs tests/story-rotation-extension.test.mjs 2>&1 | Tee-Object -FilePath .integration/extension-tests.log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
foreach ($name in @('background.js','instagram-highlight-management-page.js','highlight-management-runner.js')) {
  & node --check "extensions/story-bridge/$name"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& node ../../node_modules/eslint/bin/eslint.js extensions/story-bridge/background.js extensions/story-bridge/instagram-highlight-management-page.js extensions/story-bridge/highlight-management-runner.js tests/highlight-management-extension.test.mjs tests/helpers/highlight-management-page-fixture.mjs tests/story-options-extension.test.mjs tests/story-rotation-extension.test.mjs 2>&1 | Tee-Object -FilePath .integration/extension-lint.log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'HIGHLIGHT_MANAGEMENT_EXTENSION_GATES_PASS'
exit 0
