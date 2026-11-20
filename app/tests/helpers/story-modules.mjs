import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
export function loadStoryModule(file,mocks={},cache=new Map()) {
  const path=resolve(file);
  if(cache.has(path))return cache.get(path).exports;
  const source=readFileSync(path,'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const module={exports:{}};cache.set(path,module);
  const local=name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(!name.startsWith('.'))return require(name);
    const base=resolve(dirname(path),name),target=[base,base+'.ts',base+'.tsx'].find(existsSync);
    return loadStoryModule(target,mocks,cache);
  };
  new Function('require','module','exports',output)(local,module,module.exports);
  return module.exports;
}
