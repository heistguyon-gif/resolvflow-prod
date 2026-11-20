$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent) -ErrorAction Stop
& node --test tests/story-options-extension.test.mjs tests/story-rotation-extension.test.mjs 2>&1 | Tee-Object -FilePath tests/story-rotation-extension-evidence/tests.log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
foreach ($name in @('bridge-core.js','background.js','publisher.js','render.js')) {
  & node --check "extensions/story-bridge/$name"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& node ../../node_modules/eslint/bin/eslint.js extensions/story-bridge/bridge-core.js extensions/story-bridge/background.js extensions/story-bridge/publisher.js extensions/story-bridge/render.js tests/story-options-extension.test.mjs tests/story-rotation-extension.test.mjs 2>&1 | Tee-Object -FilePath tests/story-rotation-extension-evidence/lint.log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'STORY_ROTATION_EXTENSION_GATES_PASS'
exit 0
