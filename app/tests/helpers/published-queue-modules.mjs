import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
export function dashboardPublishedBindings(){
 const path='app/components/NexoFlowDashboard.tsx',source=fs.readFileSync(path,'utf8'),tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let row,gate;
 function walk(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='publishedQueuePreview')gate=node.initializer.getText(tree);
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='map'){
   const arg=node.arguments[0];
   if(arg&&ts.isArrowFunction(arg)&&arg.getText(tree).includes('PublishedQueueItem')&&node.expression.expression.getText(tree)==='Mr')row=arg.getText(tree);
  }
  ts.forEachChild(node,walk);
 }
 walk(tree);if(!row||!gate)throw Error('Published UI must be wired into the real dashboard mapping and gate');
 return {row,gate};
}
export function renderDashboardRow(context){
 const {row}=dashboardPublishedBindings();
 const js=ts.transpileModule('('+row+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 return vm.runInNewContext(js,context);
}
export function dashboardPublishedGate(context){return vm.runInNewContext(dashboardPublishedBindings().gate,context);}
