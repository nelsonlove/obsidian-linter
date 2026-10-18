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
    get: (target, prop: string) => prop in target ? target[prop] : class {},
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

function setUpPlugin(cachedText: string, editorText: string, lint: (text: string) => string) {
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
  plugin.activeFileChangeDebouncer = new Map([[file.path, {originalText: 'text when the timer started', isRunning: false}]]);

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
});
