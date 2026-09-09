import {moment} from 'obsidian';
import {Options, RuleType} from '../rules';
import RuleBuilder, {BooleanOptionBuilder, DropdownOptionBuilder, ExampleBuilder, OptionBuilderBase, TextOptionBuilder} from './rule-builder';
import dedent from 'ts-dedent';
import {formatYAML, getYamlSectionValue, initYAML} from '../utils/yaml';
import {escapeDollarSigns, escapeRegExp} from '../utils/regex';
import {insert} from '../utils/strings';

export type UidFormatValues = 'uuid-v7' | 'uuid-v4';

/**
 * Matches a well-formed UUID of any registered version with a correct RFC 9562 variant.
 * Deliberately version-agnostic: a v4 and a v7 are equally valid identities, so "usable" must
 * never mean "matches the configured format" — otherwise changing the format setting would
 * reclassify every existing id as garbage and rewrite it all on the next run.
 */
const USABLE_UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Strips one layer of matching YAML quotes so that a quoted id is judged on the id itself. Without
 * this a perfectly good `uid: "<uuid>"` reads as unusable and is destroyed.
 * @param {string} value The raw value as it appears after the key's colon.
 * @return {string} The value with a single matching pair of surrounding quotes removed.
 */
function unquote(value: string): string {
  const trimmedValue = value.trim();
  const firstCharacter = trimmedValue[0];
  if ((firstCharacter === '"' || firstCharacter === '\'') && trimmedValue.endsWith(firstCharacter) && trimmedValue.length > 1) {
    return trimmedValue.slice(1, -1).trim();
  }

  return trimmedValue;
}

/**
 * A block or folded scalar's body lives on the following lines, which the single-line value read
 * cannot see. Such a value can never be judged, so it must never be treated as replaceable.
 * @param {string} value The raw value as it appears after the key's colon.
 * @return {boolean} True when the value continues on later lines in a form that cannot be read here.
 */
function isUnreadableScalar(value: string): boolean {
  return /^[|>]/.test(value.trim());
}

export function isUsableUid(value: string | null): boolean {
  return value != null && USABLE_UID.test(unquote(value));
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function randomBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * A UUIDv7 carries the timestamp in 48 bits, so only times from the epoch to about the year 10889
 * can be represented. Callers check before generating, since a date outside that range is a note
 * to fall back on rather than a reason to abort the file's lint.
 * @param {number} timestampMs Milliseconds since the epoch.
 * @return {boolean} True when the time can be packed into a UUIDv7.
 */
export function fitsInUuidV7(timestampMs: number): boolean {
  const timestamp = Math.trunc(timestampMs);
  return Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= 0xffffffffffff;
}

/**
 * Writes a 48-bit big-endian millisecond timestamp into the leading bytes and sets the version and
 * variant nibbles, leaving the remaining bytes as supplied.
 * @param {Uint8Array} bytes The sixteen bytes to lay the id out in.
 * @param {number} timestampMs Milliseconds since the epoch to embed in the id.
 * @return {string} A UUIDv7 string.
 */
function layOutUuidV7(bytes: Uint8Array, timestampMs: number): string {
  const timestamp = Math.trunc(timestampMs);
  if (!fitsInUuidV7(timestamp)) {
    throw new TypeError(`Invalid UUIDv7 timestamp: ${timestampMs}`);
  }

  const high = Math.floor(timestamp / 0x100000000);
  const low = timestamp >>> 0;

  bytes[0] = (high >>> 8) & 0xff;
  bytes[1] = high & 0xff;
  bytes[2] = (low >>> 24) & 0xff;
  bytes[3] = (low >>> 16) & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return bytesToUuid(bytes);
}

export function uuidV7(timestampMs: number): string {
  return layOutUuidV7(randomBytes(), timestampMs);
}

export function uuidV4(): string {
  const bytes = randomBytes();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

/**
 * Used by the documented examples, which must render the same output on every docs build.
 * @param {number} timestampMs Milliseconds since the epoch to embed in the id.
 * @return {string} A UUIDv7 whose random bits are all zero.
 */
function uuidV7WithoutRandomBits(timestampMs: number): string {
  return layOutUuidV7(new Uint8Array(16), timestampMs);
}

function defaultGenerateUid(format: UidFormatValues, timestampMs: number): string {
  return format === 'uuid-v4' ? uuidV4() : uuidV7(timestampMs);
}

class YamlUidOptions implements Options {
  @RuleBuilder.noSettingControl()
    fileCreatedTime?: string;

  @RuleBuilder.noSettingControl()
    dateCreatedKey?: string = 'date created';

  @RuleBuilder.noSettingControl()
    currentTime?: moment.Moment;

  /**
   * Injected so the rule can be exercised deterministically. Left undefined in normal use, where
   * the real generators run.
   */
  @RuleBuilder.noSettingControl()
    generateUid?: (format: UidFormatValues, timestampMs: number) => string;

  uidKey?: string = 'uid';

  format?: UidFormatValues = 'uuid-v7';

  replaceUnusableValues?: boolean = false;
}

@RuleBuilder.register
export default class YamlUid extends RuleBuilder<YamlUidOptions> {
  constructor() {
    super({
      nameKey: 'rules.yaml-uid.name',
      descriptionKey: 'rules.yaml-uid.description',
      type: RuleType.YAML,
    });
  }
  get OptionsClass(): new () => YamlUidOptions {
    return YamlUidOptions;
  }
  apply(text: string, options: YamlUidOptions): string {
    text = initYAML(text);

    return formatYAML(text, (text) => {
      // the key is user-configurable, so it must be escaped before it becomes a pattern: an
      // unescaped `.` in a key like `meta.id` matches any character and the replace below would
      // then rewrite a different field entirely
      const uid_match_str = `\n${escapeRegExp(options.uidKey)}:.*\n`;
      const uid_match = new RegExp(uid_match_str);
      const keyIsPresent = uid_match.test(text);

      if (keyIsPresent) {
        // read with allowNestedKey false so a same-named key nested under something else cannot be
        // mistaken for this note's own id
        const existingValue = getYamlSectionValue(text, options.uidKey, false);
        if (isUsableUid(existingValue)) {
          return text;
        }

        const valueIsEmpty = existingValue == null || existingValue.trim() === '';
        // a value that cannot be read in full is never replaced, whatever the setting says: the
        // body of a block scalar is on later lines, so replacing the key line alone would strand it
        if (!valueIsEmpty && (!options.replaceUnusableValues || isUnreadableScalar(existingValue))) {
          return text;
        }
      }

      const uid = this.buildUid(text, options);
      if (keyIsPresent) {
        return text.replace(uid_match, escapeDollarSigns(`\n${options.uidKey}: ${uid}\n`));
      }

      const yaml_end = text.indexOf('\n---');
      return insert(text, yaml_end, `\n${options.uidKey}: ${uid}`);
    });
  }
  buildUid(yamlText: string, options: YamlUidOptions): string {
    const generate = options.generateUid ?? defaultGenerateUid;
    return generate(options.format, this.createdTimestamp(yamlText, options));
  }
  /**
   * Picks the timestamp to embed in a UUIDv7. The note's own created date is preferred so that an
   * id added to an old note sorts by when the note was really written rather than when the lint
   * ran; the file system's created time and then the current time are the fallbacks.
   * @param {string} yamlText The note's YAML frontmatter.
   * @param {YamlUidOptions} options The rule's options.
   * @return {number} Milliseconds since the epoch.
   */
  createdTimestamp(yamlText: string, options: YamlUidOptions): number {
    const candidates = [getYamlSectionValue(yamlText, options.dateCreatedKey, false), options.fileCreatedTime];
    for (const candidate of candidates) {
      if (candidate == null || candidate.trim() === '') {
        continue;
      }

      const parsed = moment(candidate.trim(), moment.ISO_8601);
      // a date before 1970 or beyond the year 10889 parses fine but cannot be packed into a
      // UUIDv7, and throwing here would abort the whole lint of this file, silently, on every run
      if (parsed.isValid() && fitsInUuidV7(parsed.valueOf())) {
        return parsed.valueOf();
      }
    }

    const now = (options.currentTime ?? moment()).valueOf();
    return fitsInUuidV7(now) ? now : 0;
  }
  get exampleBuilders(): ExampleBuilder<YamlUidOptions>[] {
    return [
      new ExampleBuilder({
        description: 'A note with no id gets one, with the timestamp taken from its created date',
        before: dedent`
          ---
          created: 2026-05-21T23:00:00Z
          ---
          # Title
        `,
        after: dedent`
          ---
          created: 2026-05-21T23:00:00Z
          uid: 019e4cc4-6580-7000-8000-000000000000
          ---
          # Title
        `,
        options: {
          dateCreatedKey: 'created',
          generateUid: (_format: UidFormatValues, timestampMs: number) => uuidV7WithoutRandomBits(timestampMs),
        },
      }),
      new ExampleBuilder({
        description: 'An id that is already there is never regenerated, whichever UUID version it is',
        before: dedent`
          ---
          uid: 689ca1d9-f412-4a26-b798-98c52c9ed050
          ---
          # Title
        `,
        after: dedent`
          ---
          uid: 689ca1d9-f412-4a26-b798-98c52c9ed050
          ---
          # Title
        `,
      }),
    ];
  }
  get optionBuilders(): OptionBuilderBase<YamlUidOptions>[] {
    return [
      new TextOptionBuilder({
        OptionsClass: YamlUidOptions,
        nameKey: 'rules.yaml-uid.uid-key.name',
        descriptionKey: 'rules.yaml-uid.uid-key.description',
        optionsKey: 'uidKey',
      }),
      new DropdownOptionBuilder<YamlUidOptions, UidFormatValues>({
        OptionsClass: YamlUidOptions,
        nameKey: 'rules.yaml-uid.format.name',
        descriptionKey: 'rules.yaml-uid.format.description',
        optionsKey: 'format',
        records: [
          {
            value: 'uuid-v7',
            description: 'A UUIDv7, whose leading bits are the note\'s created time, so that ids sort by age',
          },
          {
            value: 'uuid-v4',
            description: 'A fully random UUIDv4, which carries no time information',
          },
        ],
      }),
      new BooleanOptionBuilder({
        OptionsClass: YamlUidOptions,
        nameKey: 'rules.yaml-uid.replace-unusable-values.name',
        descriptionKey: 'rules.yaml-uid.replace-unusable-values.description',
        optionsKey: 'replaceUnusableValues',
      }),
    ];
  }
}
