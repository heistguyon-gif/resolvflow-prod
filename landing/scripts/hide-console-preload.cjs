'use strict';
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const { basename } = require('node:path');
const marker = Symbol.for('resolvflow.hide-console-preload');
if (!globalThis[marker]) {
  const original = childProcess.spawn;
  childProcess.spawn = function (file, args, options) {
    if (process.platform !== 'win32') return original.apply(this, arguments);
    const hasArgs = Array.isArray(args);
    const nextOptions = { ...(hasArgs ? options : args), windowsHide: true };
    if (process.env.RF_HIDE_CONSOLE_PROBE === '1') {
      process.stderr.write(JSON.stringify({ event: 'hide-console.spawn', file: basename(String(file)), windowsHide: true, stdio: nextOptions.stdio ?? null }) + '\n');
    }
    return hasArgs
      ? original.call(this, file, args, nextOptions)
      : original.call(this, file, nextOptions);
  };
  globalThis[marker] = true;
  syncBuiltinESMExports();
  if (process.env.RF_HIDE_CONSOLE_PROBE === '1') process.stderr.write('HIDE_CONSOLE_PRELOAD_APPLIED\n');
}
