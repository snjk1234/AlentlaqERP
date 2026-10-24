/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'src', 'components', 'CollapsiblePanel.tsx'), 'utf8');

function panel(side) {
  const state = [];
  let cursor;
  const timers = new Map();
  let timerId = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports,
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    require: id => id === 'react' ? {
      useEffect() {},
      useRef: initial => {
        const index = cursor++;
        if (state[index] === undefined) state[index] = { current: initial };
        return state[index];
      },
      useState: initial => {
      const index = cursor++;
      if (state[index] === undefined) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    } } : require(id)
  });
  const child = require('react').createElement('input', { defaultValue: 'Preserved cart data' });
  const render = () => {
    cursor = 0;
    return exports.default({ id: 'panel', title: 'Panel', side, width: side === 'right' ? 224 : 360, children: child });
  };
  return { render, child, timers, advance: () => {
    for (const [id, timer] of timers) { timers.delete(id); timer.callback(); }
  } };
}

function find(element, predicate) {
  if (!element || typeof element !== 'object') return undefined;
  if (predicate(element)) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
}
const button = (tree, label) => find(tree, element => element.type === 'button' && element.props['aria-label'] === label);

test('both panels collapse to free product width and reopen without unmounting their contents', () => {
  for (const side of ['right', 'left']) {
    const { render, child } = panel(side);
    let tree = render();
    assert.equal(tree.props.style.width, side === 'right' ? 224 : 360);
    assert.equal(button(tree, 'إلغاء تثبيت Panel').props['aria-pressed'], true);
    button(tree, 'طي Panel').props.onClick();
    tree = render();
    assert.equal(tree.props.style.width, 44);
    assert.equal(button(tree, 'فتح Panel').props['aria-expanded'], false);
    const content = find(tree, element => element.props?.id === 'panel');
    assert.equal(content.props.hidden, side !== 'right');
    assert.equal(content.props.children, child);
    button(tree, 'فتح Panel').props.onClick();
    tree = render();
    assert.equal(find(tree, element => element.props?.id === 'panel').props.hidden, false);
  }
});

test('unpinned panels float without reserving width and pinned panels stay open on pointer exit', () => {
  for (const side of ['right', 'left']) {
    const { render } = panel(side);
    let tree = render();
    tree.props.onMouseLeave();
    assert.equal(render().props.style.width, side === 'right' ? 224 : 360);
    button(tree, 'إلغاء تثبيت Panel').props.onClick();
    tree = render();
    assert.equal(tree.props.style.width, 44);
    assert.ok(tree.props.className.includes('panel-floating'));
    assert.ok(find(tree, element => element.props?.className?.includes(`panel-side-${side}`)));
    tree.props.onMouseLeave();
    tree = render();
    assert.equal(find(tree, element => element.props?.id === 'panel').props.hidden, side !== 'right');
    button(tree, 'فتح Panel').props.onClick();
    tree = render();
    button(tree, 'تثبيت Panel').props.onClick();
    tree = render();
    assert.equal(tree.props.style.width, side === 'right' ? 224 : 360);
    assert.ok(!tree.props.className.includes('panel-floating'));
  }
});

test('navigation and sales each use separate panel instances preserving actions and content', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'app', 'page.tsx'), 'utf8');
  assert.ok(page.includes('id="main-navigation" title="القائمة الرئيسية" side="right" width={224}'));
  assert.ok(page.includes('id="sales-quotation-panel" title="المبيعات والعروض" side="left" width={360}'));
  assert.equal((page.match(/<\/CollapsiblePanel>/g) || []).length, 2);
  assert.ok(page.includes('onClick={() => handleCheckout(false)}'));
  assert.ok(page.includes("onClick={() => setActiveTab('POS')}"));
});

test('right icons remain usable and expand after two seconds while left opens immediately', () => {
  for (const side of ['right', 'left']) {
    const { render, timers, advance } = panel(side);
    button(render(), 'طي Panel').props.onClick();
    let tree = render();
    tree.props.onMouseEnter();
    if (side === 'right') {
      assert.equal(button(render(), 'فتح Panel').props['aria-expanded'], false);
      assert.equal([...timers.values()][0].delay, 2000);
      tree.props.onMouseLeave();
      assert.equal(timers.size, 0);
      render().props.onMouseEnter();
      advance();
    }
    tree = render();
    assert.equal(tree.props.style.width, 44);
    assert.equal(find(tree, element => element.props?.id === 'panel').props.hidden, false);
    tree.props.onMouseLeave();
    tree = render();
    assert.equal(find(tree, element => element.props?.id === 'panel').props.hidden, side !== 'right');
    tree.props.onMouseEnter();
    advance();
    tree = render();
    button(tree, 'تثبيت Panel').props.onClick();
    tree = render();
    tree.props.onMouseLeave();
    assert.equal(find(render(), element => element.props?.id === 'panel').props.hidden, false);
  }
  const css = fs.readFileSync(path.join(root, 'src', 'app', 'globals.css'), 'utf8');
  assert.ok(css.includes('width 300ms ease-in-out'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
});
