import type { ModuleMap as _ModuleMap, FS } from "jest-haste-map";
import type { Path } from "types/Config";
import type HasteResolver from "jest-resolve";

export type HasteFS = FS;
export type ModuleMap = _ModuleMap;

export type HasteContext = {| hasteFS: HasteFS, moduleMap: ModuleMap, resolver: HasteResolver |};

export type FileMetaData = [/* id */
string, /* mtime */
number, /* visited */
0 | 1, /* dependencies */
Array<string>];

export type ModuleMetaData = [Path, /* type */
number];

type ModuleMapItem = { [platform: string]: ModuleMetaData };

export type FileData = { [filepath: Path]: FileMetaData };
export type MockData = { [id: string]: Path };
export type ModuleMapData = { [id: string]: ModuleMapItem };
export type WatchmanClocks = { [filepath: Path]: string };

export type InternalHasteMap = {| clocks: WatchmanClocks, files: FileData, map: ModuleMapData, mocks: MockData |};

export type HasteMap = {| hasteFS: HasteFS, moduleMap: ModuleMap, __hasteMapForTest?: ?InternalHasteMap |};

export type RawModuleMap = {| map: ModuleMapData, mocks: MockData |};

export type HType = {|
  ID: 0,
  MTIME: 1,
  VISITED: 2,
  DEPENDENCIES: 3,
  PATH: 0,
  TYPE: 1,
  MODULE: 0,
  PACKAGE: 1,
  GENERIC_PLATFORM: "g",
|};

export type HTypeValue = 0 | 1 | 2 | 3 | "g";
