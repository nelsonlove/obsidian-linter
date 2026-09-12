import {Options, RuleType} from '../rules';
import RuleBuilder, {BooleanOptionBuilder, ExampleBuilder, OptionBuilderBase, TextOptionBuilder, DropdownOptionBuilder} from './rule-builder';
import dedent from 'ts-dedent';
import {escapeStringIfNecessaryAndPossible, formatYAML, getYamlSectionValue, initYAML, QuoteCharacter} from '../utils/yaml';
import {ignoreListOfTypes, IgnoreTypes} from '../utils/ignore-types';
import {escapeDollarSigns, getFirstHeaderOneText} from '../utils/regex';
import {insert} from '../utils/strings';

type YamlTitleModeValues = 'first-h1-or-filename-if-h1-missing' | 'filename' | 'first-h1';

class YamlTitleOptions implements Options {
  @RuleBuilder.noSettingControl()
    fileName: string;

  @RuleBuilder.noSettingControl()
    defaultEscapeCharacter?: QuoteCharacter = '"';

  titleKey?: string = 'title';

  mode?: YamlTitleModeValues = 'first-h1-or-filename-if-h1-missing';

  preserveExistingTitle?: boolean = false;
}

/**
 * Determines whether an existing title value represents no value. An absent value, whitespace,
 * and an explicitly empty string (`''` or `""`) all count as empty, since each leaves the note
 * without a usable title. The value must be read with `getYamlSectionValue` rather than from the
 * title line alone: a plain scalar may continue onto following indented lines, and such a title is
 * authored content that must not be treated as empty.
 * @param {string | null} rawValue The title key's value as returned by `getYamlSectionValue`.
 * @return {boolean} True when the existing title carries no usable value.
 */
function titleValueIsEmpty(rawValue: string | null): boolean {
  if (rawValue == null) {
    return true;
  }

  const trimmedValue = rawValue.trim();
  return trimmedValue === '' || trimmedValue === '\'\'' || trimmedValue === '""';
}

@RuleBuilder.register
export default class YamlTitle extends RuleBuilder<YamlTitleOptions> {
  constructor() {
    super({
      nameKey: 'rules.yaml-title.name',
      descriptionKey: 'rules.yaml-title.description',
      type: RuleType.YAML,
      hasSpecialExecutionOrder: true, // this rule must run after capitalize-headings in order to update the title correctly
    });
  }
  get OptionsClass(): new () => YamlTitleOptions {
    return YamlTitleOptions;
  }
  apply(text: string, options: YamlTitleOptions): string {
    text = initYAML(text);
    let title = '';
    switch (options.mode) {
      case 'filename':
        title = options.fileName;
        break;
      case 'first-h1':
        title = this.getFirstH1Header(text);
        break;
      default:
        title = this.getFirstH1Header(text);
        title = title || options.fileName;
    }

    title = escapeStringIfNecessaryAndPossible(title, options.defaultEscapeCharacter);

    return formatYAML(text, (text) => {
      const title_match_str = `\n${options.titleKey}:.*\n`;
      const title_match = new RegExp(title_match_str);
      if (title_match.test(text)) {
        // when preserving, an existing non-empty title is left exactly as the author wrote it
        // allowNestedKey is false so that a nested key of the same name cannot shadow the real
        // top-level title; that must agree with title_match, which only matches an unindented key
        if (options.preserveExistingTitle && !titleValueIsEmpty(getYamlSectionValue(text, options.titleKey, false))) {
          return text;
        }

        text = text.replace(
            title_match,
            escapeDollarSigns(`\n${options.titleKey}: ${title}\n`),
        );
      } else {
        const yaml_end = text.indexOf('\n---');
        text = insert(text, yaml_end, `\n${options.titleKey}: ${title}`);
      }

      return text;
    });
  }
  getFirstH1Header(text: string): string {
    return ignoreListOfTypes([IgnoreTypes.code, IgnoreTypes.math, IgnoreTypes.yaml, IgnoreTypes.tag], text, getFirstHeaderOneText);
  }
  get exampleBuilders(): ExampleBuilder<YamlTitleOptions>[] {
    return [
      new ExampleBuilder({
        description: 'Adds a header with the title from heading when `mode = \'First H1 or filename if H1 missing\'`.',
        before: dedent`
          # Obsidian
        `,
        after: dedent`
          ---
          title: Obsidian
          ---
          # Obsidian
        `,
        options: {
          fileName: 'Filename',
        },
      }),
      new ExampleBuilder({
        description: 'Adds a header with the title when `mode = \'First H1 or filename if H1 missing\'`.',
        before: dedent`
          ${''}
        `,
        after: dedent`
          ---
          title: Filename
          ---
          ${''}
        `,
        options: {
          fileName: 'Filename',
        },
      }),
      new ExampleBuilder({ // accounts for https://github.com/platers/obsidian-linter/issues/470
        description: 'Make sure that markdown links in headings are properly copied to the YAML as just the text when `mode = \'First H1 or filename if H1 missing\'`',
        before: dedent`
          # This is a [Heading](test heading.md)
        `,
        after: dedent`
          ---
          title: This is a Heading
          ---
          # This is a [Heading](test heading.md)
        `,
      }),
      new ExampleBuilder({
        description: 'When `mode = \'First H1\'`, title does not have a value if no H1 is present',
        before: dedent`
          ## This is a Heading
        `,
        after: dedent`
          ---
          title: ""
          ---
          ## This is a Heading
        `,
        options: {
          mode: 'first-h1',
          fileName: 'Filename',
        },
      }),
      new ExampleBuilder({
        description: 'When `mode = \'Filename\'`, title uses the filename ignoring all H1s. Note: the filename is "Filename" in this example.',
        before: dedent`
          # This is a Heading
        `,
        after: dedent`
          ---
          title: Filename
          ---
          # This is a Heading
        `,
        options: {
          mode: 'filename',
          fileName: 'Filename',
        },
      }),
    ];
  }
  get optionBuilders(): OptionBuilderBase<YamlTitleOptions>[] {
    return [
      new TextOptionBuilder({
        OptionsClass: YamlTitleOptions,
        nameKey: 'rules.yaml-title.title-key.name',
        descriptionKey: 'rules.yaml-title.title-key.description',
        optionsKey: 'titleKey',
      }),
      new BooleanOptionBuilder({
        OptionsClass: YamlTitleOptions,
        nameKey: 'rules.yaml-title.preserve-existing-title.name',
        descriptionKey: 'rules.yaml-title.preserve-existing-title.description',
        optionsKey: 'preserveExistingTitle',
      }),
      new DropdownOptionBuilder<YamlTitleOptions, YamlTitleModeValues>({
        OptionsClass: YamlTitleOptions,
        nameKey: 'rules.yaml-title.mode.name',
        descriptionKey: 'rules.yaml-title.mode.description',
        optionsKey: 'mode',
        records: [
          {
            value: 'first-h1-or-filename-if-h1-missing',
            description: 'Uses the first H1 in the file or the filename of the file if there is not H1',
          },
          {
            value: 'filename',
            description: 'Uses the filename as the title',
          },
          {
            value: 'first-h1',
            description: 'Uses the first H1 in the file as the title',
          },
        ],
      }),
    ];
  }
}
