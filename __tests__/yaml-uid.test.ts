import YamlUid, {isUsableUid, uuidV4, uuidV7, UidFormatValues} from '../src/rules/yaml-uid';
import dedent from 'ts-dedent';
import {ruleTest} from './common';

const fixedUid = (uid: string) => (_format: UidFormatValues, _timestampMs: number) => uid;
const echoTimestamp = (_format: UidFormatValues, timestampMs: number) => String(timestampMs);
const echoFormat = (format: UidFormatValues, _timestampMs: number) => format;

ruleTest({
  RuleBuilderClass: YamlUid,
  testCases: [
    {
      testName: 'Adds an id to a note that has none',
      before: dedent`
        ---
        created: 2026-05-21T23:00:00Z
        ---
        # Title
      `,
      after: dedent`
        ---
        created: 2026-05-21T23:00:00Z
        uid: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      options: {
        generateUid: fixedUid('019e697e-a3af-7fdb-bbcf-5ca69a5f7555'),
      },
    },
    {
      testName: 'Adds frontmatter and an id to a note with no frontmatter at all',
      before: dedent`
        # Title
      `,
      after: dedent`
        ---
        uid: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      options: {
        generateUid: fixedUid('019e697e-a3af-7fdb-bbcf-5ca69a5f7555'),
      },
    },
    {
      testName: 'An existing UUIDv7 is left alone',
      before: dedent`
        ---
        uid: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      options: {
        generateUid: fixedUid('00000000-0000-7000-8000-000000000000'),
      },
    },
    {
      testName: 'An existing UUIDv4 is left alone even though the format is UUIDv7',
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
      options: {
        format: 'uuid-v7',
        replaceUnusableValues: true,
        generateUid: fixedUid('00000000-0000-7000-8000-000000000000'),
      },
    },
    {
      testName: 'An existing UUIDv8 is left alone',
      before: dedent`
        ---
        uid: 01a01c88-6928-8a74-abbc-1b3c940fd536
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: 01a01c88-6928-8a74-abbc-1b3c940fd536
        ---
        # Title
      `,
      options: {
        replaceUnusableValues: true,
        generateUid: fixedUid('00000000-0000-7000-8000-000000000000'),
      },
    },
    {
      testName: 'An empty uid key is filled in',
      before: dedent`
        ---
        uid:
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      options: {
        generateUid: fixedUid('019e697e-a3af-7fdb-bbcf-5ca69a5f7555'),
      },
    },
    {
      testName: 'An unusable value is left alone by default',
      before: dedent`
        ---
        uid: "{{MACRO:uuidv7}}"
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: "{{MACRO:uuidv7}}"
        ---
        # Title
      `,
      options: {
        generateUid: fixedUid('019e697e-a3af-7fdb-bbcf-5ca69a5f7555'),
      },
    },
    {
      testName: 'An unusable value is replaced when the option is on',
      before: dedent`
        ---
        uid: "{{MACRO:uuidv7}}"
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      options: {
        replaceUnusableValues: true,
        generateUid: fixedUid('019e697e-a3af-7fdb-bbcf-5ca69a5f7555'),
      },
    },
    {
      testName: 'A nested key of the same name does not stand in for the note\'s own id',
      before: dedent`
        ---
        metadata:
          uid:
        uid: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      after: dedent`
        ---
        metadata:
          uid:
        uid: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      options: {
        generateUid: fixedUid('00000000-0000-7000-8000-000000000000'),
      },
    },
    {
      testName: 'The uid key is configurable',
      before: dedent`
        ---
        created: 2026-05-21T23:00:00Z
        ---
        # Title
      `,
      after: dedent`
        ---
        created: 2026-05-21T23:00:00Z
        note-id: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      options: {
        uidKey: 'note-id',
        generateUid: fixedUid('019e697e-a3af-7fdb-bbcf-5ca69a5f7555'),
      },
    },
    {
      testName: 'The created date supplies the timestamp, read from the configured created key',
      before: dedent`
        ---
        created: 2026-05-21T23:00:00Z
        ---
        # Title
      `,
      after: dedent`
        ---
        created: 2026-05-21T23:00:00Z
        uid: 1779404400000
        ---
        # Title
      `,
      options: {
        dateCreatedKey: 'created',
        fileCreatedTime: '2026-09-09T00:00:00Z',
        generateUid: echoTimestamp,
      },
    },
    {
      testName: 'The file system created time is used when the note has no created date',
      before: dedent`
        ---
        title: No created date here
        ---
        # Title
      `,
      after: dedent`
        ---
        title: No created date here
        uid: 1788912000000
        ---
        # Title
      `,
      options: {
        dateCreatedKey: 'created',
        fileCreatedTime: '2026-09-09T00:00:00Z',
        generateUid: echoTimestamp,
      },
    },
    {
      testName: 'An unparseable created date falls back rather than producing a broken id',
      before: dedent`
        ---
        created: not a date
        ---
        # Title
      `,
      after: dedent`
        ---
        created: not a date
        uid: 1788912000000
        ---
        # Title
      `,
      options: {
        dateCreatedKey: 'created',
        fileCreatedTime: '2026-09-09T00:00:00Z',
        generateUid: echoTimestamp,
      },
    },
    {
      testName: 'A regex metacharacter in the uid key cannot clobber an unrelated field',
      before: dedent`
        ---
        idXv2: some-unrelated-field-value
        other: keep-me
        ---
        # Title
      `,
      after: dedent`
        ---
        idXv2: some-unrelated-field-value
        other: keep-me
        id.v2: 019e697e-a3af-7fdb-bbcf-5ca69a5f7555
        ---
        # Title
      `,
      options: {
        uidKey: 'id.v2',
        replaceUnusableValues: true,
        generateUid: fixedUid('019e697e-a3af-7fdb-bbcf-5ca69a5f7555'),
      },
    },
    {
      testName: 'A colliding key earlier in the note cannot make a real id look unusable',
      before: dedent`
        ---
        idXv2: some-unrelated-value
        id.v2: 689ca1d9-f412-4a26-b798-98c52c9ed050
        ---
        # Title
      `,
      after: dedent`
        ---
        idXv2: some-unrelated-value
        id.v2: 689ca1d9-f412-4a26-b798-98c52c9ed050
        ---
        # Title
      `,
      options: {
        uidKey: 'id.v2',
        replaceUnusableValues: true,
        generateUid: fixedUid('11111111-1111-7111-8111-111111111111'),
      },
    },
    {
      testName: 'An anchored id is never replaced, so an alias elsewhere is not left dangling',
      before: dedent`
        ---
        uid: &myid 689ca1d9-f412-4a26-b798-98c52c9ed050
        other: *myid
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: &myid 689ca1d9-f412-4a26-b798-98c52c9ed050
        other: *myid
        ---
        # Title
      `,
      options: {
        replaceUnusableValues: true,
        generateUid: fixedUid('11111111-1111-7111-8111-111111111111'),
      },
    },
    {
      testName: 'A tagged id is never replaced',
      before: dedent`
        ---
        uid: !!str 689ca1d9-f412-4a26-b798-98c52c9ed050
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: !!str 689ca1d9-f412-4a26-b798-98c52c9ed050
        ---
        # Title
      `,
      options: {
        replaceUnusableValues: true,
        generateUid: fixedUid('11111111-1111-7111-8111-111111111111'),
      },
    },
    {
      testName: 'A quoted id is recognised and left alone even with replacement on',
      before: dedent`
        ---
        uid: "689ca1d9-f412-4a26-b798-98c52c9ed050"
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: "689ca1d9-f412-4a26-b798-98c52c9ed050"
        ---
        # Title
      `,
      options: {
        replaceUnusableValues: true,
        generateUid: fixedUid('11111111-1111-7111-8111-111111111111'),
      },
    },
    {
      testName: 'A single-quoted id is recognised and left alone',
      before: dedent`
        ---
        uid: '689ca1d9-f412-4a26-b798-98c52c9ed050'
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: '689ca1d9-f412-4a26-b798-98c52c9ed050'
        ---
        # Title
      `,
      options: {
        replaceUnusableValues: true,
        generateUid: fixedUid('11111111-1111-7111-8111-111111111111'),
      },
    },
    {
      testName: 'A block scalar id is never replaced, since its body cannot be read here',
      before: dedent`
        ---
        uid: |
          689ca1d9-f412-4a26-b798-98c52c9ed050
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: |
          689ca1d9-f412-4a26-b798-98c52c9ed050
        ---
        # Title
      `,
      options: {
        replaceUnusableValues: true,
        generateUid: fixedUid('11111111-1111-7111-8111-111111111111'),
      },
    },
    {
      testName: 'A folded scalar id is never replaced either',
      before: dedent`
        ---
        uid: >
          689ca1d9-f412-4a26-b798-98c52c9ed050
        ---
        # Title
      `,
      after: dedent`
        ---
        uid: >
          689ca1d9-f412-4a26-b798-98c52c9ed050
        ---
        # Title
      `,
      options: {
        replaceUnusableValues: true,
        generateUid: fixedUid('11111111-1111-7111-8111-111111111111'),
      },
    },
    {
      testName: 'A created date before 1970 falls back instead of aborting the lint of the file',
      before: dedent`
        ---
        created: 1965-01-01T00:00:00Z
        ---
        # Title
      `,
      after: dedent`
        ---
        created: 1965-01-01T00:00:00Z
        uid: 1788912000000
        ---
        # Title
      `,
      options: {
        dateCreatedKey: 'created',
        fileCreatedTime: '2026-09-09T00:00:00Z',
        generateUid: echoTimestamp,
      },
    },
    {
      testName: 'The configured format reaches the generator',
      before: dedent`
        ---
        created: 2026-05-21T23:00:00Z
        ---
        # Title
      `,
      after: dedent`
        ---
        created: 2026-05-21T23:00:00Z
        uid: uuid-v4
        ---
        # Title
      `,
      options: {
        format: 'uuid-v4',
        generateUid: echoFormat,
      },
    },
  ],
});

describe('yaml-uid', () => {
  it('generates a UUIDv7 whose leading bits are the supplied timestamp', () => {
    const timestamp = Date.UTC(2026, 4, 21, 23, 0, 0);
    const uid = uuidV7(timestamp);

    expect(isUsableUid(uid)).toBe(true);
    expect(uid[14]).toBe('7');
    expect(parseInt(uid.slice(0, 8) + uid.slice(9, 13), 16)).toBe(timestamp);
  });

  it('generates a well-formed UUIDv4', () => {
    const uid = uuidV4();

    expect(isUsableUid(uid)).toBe(true);
    expect(uid[14]).toBe('4');
  });

  it('generates a different id on each call', () => {
    const timestamp = Date.UTC(2026, 4, 21, 23, 0, 0);

    expect(uuidV7(timestamp)).not.toBe(uuidV7(timestamp));
    expect(uuidV4()).not.toBe(uuidV4());
  });

  it('treats every UUID version as usable and everything else as not', () => {
    expect(isUsableUid('019e697e-a3af-7fdb-bbcf-5ca69a5f7555')).toBe(true);
    expect(isUsableUid('689ca1d9-f412-4a26-b798-98c52c9ed050')).toBe(true);
    expect(isUsableUid('01a01c88-6928-8a74-abbc-1b3c940fd536')).toBe(true);
    expect(isUsableUid('{{MACRO:uuidv7}}')).toBe(false);
    expect(isUsableUid('toolu_01S8xpK1UJvhfmp1aTmkcdV4')).toBe(false);
    expect(isUsableUid('')).toBe(false);
    expect(isUsableUid(null)).toBe(false);
  });

  it('rejects a timestamp that cannot fit in a UUIDv7', () => {
    expect(() => uuidV7(-1)).toThrow(TypeError);
    expect(() => uuidV7(0x1000000000000)).toThrow(TypeError);
  });

  it('does not throw out of apply for a created date outside the UUIDv7 range', () => {
    const rule = YamlUid.getRule();

    expect(() => rule.apply('---\ncreated: 1965-01-01T00:00:00Z\n---\n# Title\n', {
      dateCreatedKey: 'created',
      uidKey: 'uid',
      format: 'uuid-v7',
      replaceUnusableValues: false,
    })).not.toThrow();
  });

  it('does not throw out of apply when the configured key is corrupted to null', () => {
    const rule = YamlUid.getRule();

    expect(() => rule.apply('---\ntitle: A note\n---\n# Title\n', {
      uidKey: null as unknown as string,
      format: 'uuid-v7',
      replaceUnusableValues: false,
    })).not.toThrow();
  });

  it('sees through YAML quoting when judging an id', () => {
    expect(isUsableUid('"689ca1d9-f412-4a26-b798-98c52c9ed050"')).toBe(true);
    expect(isUsableUid('\'689ca1d9-f412-4a26-b798-98c52c9ed050\'')).toBe(true);
    expect(isUsableUid('  689ca1d9-f412-4a26-b798-98c52c9ed050  ')).toBe(true);
    expect(isUsableUid('"not-a-uuid"')).toBe(false);
  });
});
