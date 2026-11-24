import ts from 'typescript';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const widgetNames = new Set(['TouchableOpacity', 'Pressable', 'Button', 'Switch', 'TextInput', 'button', 'input', 'select', 'textarea', 'a', 'audio', 'video']);
const eventNames = new Set(['onPress', 'onClick', 'onSubmit', 'onSubmitEditing', 'onValueChange', 'onChange', 'onChangeText']);
const walk = (node, fn) => { fn(node); ts.forEachChild(node, child => walk(child, fn)); };
const normalize = text => text.replace(/\s+/g, ' ').trim();

export function featureLinks(text) {
  const source = ts.createSourceFile('FeatureHub.jsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const links = [];
  walk(source, node => {
    if (!ts.isArrayLiteralExpression(node) || node.elements.length < 2) return;
    const [label, route] = node.elements;
    if (ts.isStringLiteralLike(label) && ts.isStringLiteralLike(route) && /^[A-Z][A-Za-z]+$/.test(route.text)) links.push({ label: label.text, route: route.text });
  });
  return links;
}

function strings(node, source) {
  if (!node) return [];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isJsxExpression(node)) return strings(node.expression, source);
  if (ts.isConditionalExpression(node)) return [...strings(node.whenTrue, source), ...strings(node.whenFalse, source)];
  if (ts.isJsxText(node)) return normalize(node.text) ? [normalize(node.text)] : [];
  if (ts.isJsxElement(node)) return node.children.flatMap(child => strings(child, source));
  if (ts.isTemplateExpression(node)) return [node.head.text + node.templateSpans.map(span => '${' + span.expression.getText(source) + '}' + span.literal.text).join('')];
  return ['{' + normalize(node.getText(source)).slice(0, 140) + '}'];
}

export function inspectControls(text, file = 'Screen.jsx') {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const symbols = new Map(), imports = new Map(), controls = [];
  walk(source, node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const values = symbols.get(node.name.text) || []; values.push(node.initializer); symbols.set(node.name.text, values);
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      const values = symbols.get(node.name.text) || []; values.push(node); symbols.set(node.name.text, values);
    }
    if (ts.isImportDeclaration(node) && node.importClause) {
      const module = node.moduleSpecifier.text;
      if (node.importClause.name) imports.set(node.importClause.name.text, module);
      for (const item of node.importClause.namedBindings?.elements || []) imports.set(item.name.text, module);
    }
  });
  function dependencies(node, seen = new Set()) {
    const refs = [];
    if (!node) return refs;
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      seen.add(node.text);
      if (imports.has(node.text)) refs.push({ kind: 'imported-handler', name: imports.get(node.text) + '#' + node.text });
      const matches = symbols.get(node.text);
      if (matches?.length === 1) refs.push(...dependencies(matches[0], seen));
    }
    walk(node, child => {
      if (!ts.isCallExpression(child)) return;
      const fn = child.expression, first = child.arguments[0];
      if (ts.isPropertyAccessExpression(fn)) {
        const method = fn.name.text, owner = fn.expression.getText(source);
        if (['from', 'rpc', 'navigate'].includes(method)) refs.push({ kind: method === 'from' ? owner.includes('storage') ? 'bucket' : 'table' : method === 'rpc' ? 'rpc' : 'route', name: first && ts.isStringLiteralLike(first) ? first.text : first?.getText(source) || 'dynamic' });
        if (owner.includes('.auth')) refs.push({ kind: 'auth', name: method });
        if (method === 'goBack') refs.push({ kind: 'local', name: 'navigation.goBack' });
      } else if (ts.isIdentifier(fn) && !seen.has(fn.text)) {
        seen.add(fn.text);
        if (imports.has(fn.text) && !['react', 'react-native'].includes(imports.get(fn.text))) refs.push({ kind: 'imported-handler', name: imports.get(fn.text) + '#' + fn.text });
        const matches = symbols.get(fn.text);
        if (matches?.length === 1) refs.push(...dependencies(matches[0], seen));
      }
    });
    return [...new Map(refs.map(ref => [ref.kind + ':' + ref.name, ref])).values()];
  }
  walk(source, node => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const tag = node.tagName.getText(source);
    if (!widgetNames.has(tag)) return;
    const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
    const attribute = name => attrs.find(attr => attr.name.getText(source) === name);
    const events = attrs.filter(attr => eventNames.has(attr.name.getText(source)));
    if (!events.length && !['audio', 'video', 'a'].includes(tag)) return;
    if (['audio', 'video'].includes(tag) && !attribute('controls')) return;
    const label = attribute('accessibilityLabel') || attribute('aria-label') || attribute('placeholder') || attribute('title');
    const parent = ts.isJsxOpeningElement(node) ? node.parent : null;
    const labels = label ? strings(label.initializer, source) : parent ? parent.children.flatMap(child => strings(child, source)) : [tag];
    const point = source.getLineAndCharacterOfPosition(node.getStart(source));
    const deps = events.flatMap(event => dependencies(ts.isJsxExpression(event.initializer) ? event.initializer.expression : event.initializer));
    const disabled = attribute('disabled');
    const disabledText = disabled ? disabled.initializer?.getText(source) || 'true' : 'false';
    controls.push({
      id: `${file}:${point.line + 1}:${point.character + 1}`, file, line: point.line + 1, widget: tag,
      labels: [...new Set(labels.map(normalize).filter(Boolean))],
      events: events.map(event => event.name.getText(source)),
      expectedAction: events.map(event => normalize(event.initializer?.getText(source) || '').slice(0, 1200)).join(' | ') || 'native media controls',
      declaredDependencies: [...new Map(deps.map(ref => [ref.kind + ':' + ref.name, ref])).values()],
      disabledExpression: disabledText,
      result: disabledText === 'true' || disabledText === '{true}' ? 'NOT IMPLEMENTED' : 'BLOCKED',
      evidence: null,
      limitation: 'Static definition only. Visibility, correct action, persistence and authorization require an independent action assertion. Dependencies are declared references, not observed API calls.'
    });
  });
  return controls;
}

// Development-test instrumentation only. The Vite hook never runs on builds.
// Source IDs connect actual fixture interactions to definitions without logging
// field values, message bodies, tokens or contact details.
export function instrumentControls(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const definitions = new Set(inspectControls(text, file).map(row => row.id));
  const insertions = [];
  walk(source, node => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const point = source.getLineAndCharacterOfPosition(node.getStart(source));
    const id = `${file}:${point.line + 1}:${point.character + 1}`;
    if (!definitions.has(id)) return;
    const native = /^[a-z]/.test(node.tagName.getText(source));
    if (node.attributes.properties.some(p => ts.isJsxAttribute(p) && ['dataSet', 'data-qa-control'].includes(p.name.getText(source)))) return;
    insertions.push({ at: node.attributes.end, value: native ? ` data-qa-control={${JSON.stringify(id)}}` : ` dataSet={{qaControl:${JSON.stringify(id)}}}` });
  });
  for (const insertion of insertions.sort((a, b) => b.at - a.at)) text = text.slice(0, insertion.at) + insertion.value + text.slice(insertion.at);
  return text;
}

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.name.endsWith('.jsx')) result.push(path);
  }
  return result;
}
export async function createInventory(root) {
  const paths = [resolve(root, 'App.jsx'), ...await files(resolve(root, 'src'))].sort();
  const controls = [];
  for (const path of paths) controls.push(...inspectControls(await readFile(path, 'utf8'), relative(root, path)));
  return {
    scope: 'All JSX application source definitions; App registers .jsx screens. Legacy duplicate .js screens are excluded. Dynamic rows, native internal controls and conditional states are not a finite runtime-button count.',
    counting: 'One entry per source widget definition; reused dialog/list/tab templates may create many runtime controls. Merely rendering or finding a control never makes it PASS.',
    totals: { jsxFilesInspected: paths.length, staticDefinitions: controls.length }, controls
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(process.argv[2] || '.'), out = resolve(process.argv[3] || 'docs/field-testing/CONTROL_SOURCE_INVENTORY.json');
  const inventory = await createInventory(root);
  await mkdir(dirname(out), { recursive: true }); await writeFile(out, JSON.stringify(inventory, null, 2) + '\n');
  console.log(JSON.stringify(inventory.totals));
}
