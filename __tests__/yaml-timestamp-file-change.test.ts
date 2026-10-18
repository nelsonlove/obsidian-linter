import moment from 'moment';

// main.ts imports far more of the obsidian API than the shared mock provides. Every name the
// mock lacks becomes an empty class, and debounce runs the function at once, so the timer that
// updates timestamps after a file change can be driven directly.
jest.mock('obsidian', () => {
  const momentLib: unknown = jest.requireActual('moment');
  const known: Record<string, unknown> = {
    moment: momentLib,
    debounce: (fn: (...args: unknown[]) => unknown) => fn,
  };
  return new Proxy(known, {
    // 'then' and symbol keys stay undefined, so the module is never taken for a promise
    get: (target, prop: string | symbol) => typeof prop === 'symbol' || prop === 'then' ? undefined : prop in target ? target[prop] : class {},
  });
});

import LinterPlugin from '../src/main';
import {DEFAULT_SETTINGS} from '../src/settings-data';

type ProcessFn = (data: string) => string;

// the private members of LinterPlugin this test sets or calls
type PluginUnderTest = {
  createDebouncedFileUpdate(): (file: unknown, editor: unknown) => Promise<void>;
  updateEditor: (...args: unknown[]) => unknown;
  [member: string]: unknown;
};

function setUpPlugin(cachedText: string, editorText: string, lint: (text: string) => string, originalText = 'text when the timer started') {
  const plugin = Object.create(LinterPlugin.prototype) as PluginUnderTest;
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
  settings.ruleConfigs['yaml-timestamp'] = {'update-on-file-contents-updated': 'after 5 seconds'};
  plugin.settings = settings;
  plugin.momentLocale = 'en';
  plugin.rulesRunner = {runYAMLTimestampByItself: (options: {oldText: string}) => lint(options.oldText)};

  const file = {path: 'note.md', basename: 'note', stat: {ctime: moment().valueOf(), mtime: moment().valueOf()}};
  const processCalls: ProcessFn[] = [];
  plugin.app = {
    vault: {
      cachedRead: async () => cachedText,
      process: async (_file: unknown, fn: ProcessFn) => {
        processCalls.push(fn);
      },
    },
  };
  plugin.handleLintError = jest.fn();
  plugin.activeFileChangeDebouncer = new Map([[file.path, {originalText: originalText, isRunning: false}]]);

  const editor = {getValue: () => editorText};
  return {plugin, file, editor, processCalls};
}

describe('yaml-timestamp update after a file change', () => {
  it('lints the text vault.process hands it, not the earlier cached read', async () => {
    const lint = (text: string) => `linted(${text})`;
    const {plugin, file, editor, processCalls} = setUpPlugin('stale cached text', 'editor text', lint);

    await plugin.createDebouncedFileUpdate()(file, editor);

    expect(processCalls).toHaveLength(1);
    expect(processCalls[0]('current text on disk')).toBe('linted(current text on disk)');
  });

  it('leaves a file alone that is empty when vault.process reads it', async () => {
    const lint = jest.fn((text: string) => `---\ncreated: x\nmodified: y\n---\n${text}`);
    const {plugin, file, editor, processCalls} = setUpPlugin('stale cached text', 'editor text', lint);

    await plugin.createDebouncedFileUpdate()(file, editor);

    expect(processCalls).toHaveLength(1);
    expect(processCalls[0]('')).toBe('');
    expect(processCalls[0](' \n\t\n')).toBe(' \n\t\n');
    expect(lint).not.toHaveBeenCalled();
  });

  it('does not add frontmatter to an empty file shown in the editor', async () => {
    const lint = jest.fn((text: string) => `---\ncreated: x\nmodified: y\n---\n${text}`);
    const {plugin, file, editor, processCalls} = setUpPlugin('', '', lint);
    plugin.updateEditor = jest.fn();

    await plugin.createDebouncedFileUpdate()(file, editor);

    expect(lint).not.toHaveBeenCalled();
    expect(plugin.updateEditor).not.toHaveBeenCalled();
    expect(processCalls).toHaveLength(0);
  });

  it('writes nothing new when the file on disk is back to the text it had when the timer started', async () => {
    const lint = jest.fn((text: string) => `linted(${text})`);
    const {plugin, file, editor, processCalls} = setUpPlugin('stale cached text', 'editor text', lint, 'original text');

    await plugin.createDebouncedFileUpdate()(file, editor);

    expect(processCalls[0]('original text')).toBe('original text');
    expect(lint).not.toHaveBeenCalled();
  });

  it('clears the file\'s timer entry when the rule throws in the editor branch, so the timer can run again', async () => {
    const lint = () => {
      throw new Error('invalid date');
    };
    const {plugin, file, editor} = setUpPlugin('changed text', 'changed text', lint);
    const debouncer = plugin.activeFileChangeDebouncer as Map<string, {isRunning: boolean}>;
    const info = debouncer.get(file.path);

    await plugin.createDebouncedFileUpdate()(file, editor);

    expect(plugin.handleLintError).toHaveBeenCalled();
    expect(debouncer.has(file.path)).toBe(false);
    expect(info.isRunning).toBe(false);
  });

  it('clears the file\'s timer entry when vault.process rejects, so the timer can run again', async () => {
    const {plugin, file, editor} = setUpPlugin('stale cached text', 'editor text', (text: string) => text);
    (plugin.app as {vault: {process: () => Promise<void>}}).vault.process = () => Promise.reject(new Error('file was renamed'));
    const debouncer = plugin.activeFileChangeDebouncer as Map<string, {isRunning: boolean}>;
    const info = debouncer.get(file.path);

    await expect(plugin.createDebouncedFileUpdate()(file, editor)).rejects.toThrow('file was renamed');

    expect(debouncer.has(file.path)).toBe(false);
    expect(info.isRunning).toBe(false);
  });
});
