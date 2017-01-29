// @flow
// this module is adapted from https://github.com/facebook/jest/blob/master/packages/jest-resolve/src/index.js
// part of Jest, licenced under the BSD licence

import type { Path } from "types/Config";
import type { ModuleMap } from "jest-haste-map";
const nodeModulesPaths = require("resolve/lib/node-modules-paths");
const path = require("path");
const resolve = require("resolve");

type ModuleNameMapperConfig = {| regex: RegExp, moduleName: string |};

type ResolverConfig = {|
  extensions: Array<string>,
  hasCoreModules: boolean,
  moduleDirectories: Array<string>,
  moduleNameMapper: ?Array<ModuleNameMapperConfig>,
  modulePaths: Array<Path>,
|};

type FindNodeModuleConfig = {|
  basedir: Path,
  browser?: boolean,
  extensions?: Array<string>,
  moduleDirectory?: Array<string>,
  paths?: Array<Path>,
|};

export type ResolveModuleConfig = {| skipNodeResolution?: boolean |};

const nodePaths = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : null;

class Resolver {
  _options: ResolverConfig;
  _moduleMap: ModuleMap;
  _moduleIDCache: { [key: string]: string };
  _moduleNameCache: { [name: string]: Path };
  _modulePathCache: { [path: Path]: Array<Path> };

  constructor(moduleMap: ModuleMap, options: ResolverConfig) {
    this._options = {
      extensions: options.extensions,
      hasCoreModules: options.hasCoreModules === undefined ? true : options.hasCoreModules,
      moduleDirectories: options.moduleDirectories || [ "node_modules" ],
      moduleNameMapper: options.moduleNameMapper,
      modulePaths: options.modulePaths,
    };
    this._moduleMap = moduleMap;
    this._moduleIDCache = Object.create(null);
    this._moduleNameCache = Object.create(null);
    this._modulePathCache = Object.create(null);
  }

  static findNodeModule(path: Path, options: FindNodeModuleConfig): ?Path {
    const paths = options.paths;
    try {
      return resolve.sync(path, {
        basedir: options.basedir,
        extensions: options.extensions,
        moduleDirectory: options.moduleDirectory,
        paths: paths ? (nodePaths || []).concat(paths) : nodePaths,
      });
    } catch (e) {
    }
    return null;
  }

  resolveModule(from: Path, moduleName: string, options?: ResolveModuleConfig): Path {
    const dirname = path.dirname(from);
    const paths = this._options.modulePaths;
    const moduleDirectory = this._options.moduleDirectories;
    const key = dirname + path.delimiter + moduleName;
    const extensions = this._options.extensions.slice();

    // 0. If we have already resolved this module for this directory name,
    //    return a value from the cache.
    if (this._moduleNameCache[key]) {
      return this._moduleNameCache[key];
    }

    // 1. Check if the module is a haste module.
    let module = this.getModule(moduleName);
    if (module) {
      return this._moduleNameCache[key] = module;
    }

    // 2. Check if the module is a node module and resolve it based on
    //    the node module resolution algorithm.
    if (!options || !options.skipNodeResolution) {
      module = Resolver.findNodeModule(moduleName, { basedir: dirname, extensions, moduleDirectory, paths });

      if (module) {
        return this._moduleNameCache[key] = module;
      }
    }

    // 3. Resolve "haste packages" which are `package.json` files outside of
    // `node_modules` folders anywhere in the file system.
    const parts = moduleName.split("/");
    module = this.getPackage(parts.shift());
    if (module) {
      try {
        return this._moduleNameCache[key] = require.resolve(
          path.join.apply(path, [ path.dirname(module) ].concat(parts)),
        );
      } catch (ignoredError) {
      }
    }

    // 4. Throw an error if the module could not be found. `resolve.sync`
    //    only produces an error based on the dirname but we have the actual
    //    current module name available.
    const relativePath = path.relative(dirname, from);
    const err = new Error(`Cannot find module '${moduleName}' from '${relativePath || "."}'`);
    (err: any).code = "MODULE_NOT_FOUND";
    throw err;
  }

  isCoreModule(moduleName: string): boolean {
    return this._options.hasCoreModules && (resolve.isCore(moduleName) || moduleName === "v8");
  }

  getModule(name: string): ?Path {
    return this._moduleMap.getModule(name);
  }

  getModulePath(from: Path, moduleName: string) {
    if (moduleName[0] !== "." || path.isAbsolute(moduleName)) {
      return moduleName;
    }
    return path.normalize(path.dirname(from) + "/" + moduleName);
  }

  getPackage(name: string): ?Path {
    return this._moduleMap.getPackage(name);
  }

  getModulePaths(from: Path): Array<Path> {
    if (!this._modulePathCache[from]) {
      const moduleDirectory = this._options.moduleDirectories;
      const paths = nodeModulesPaths(from, { moduleDirectory });
      if (paths[paths.length - 1] === undefined) {
        // circumvent node-resolve bug that adds `undefined` as last item.
        paths.pop();
      }
      this._modulePathCache[from] = paths;
    }
    return this._modulePathCache[from];
  }

  getModuleID(from: Path, _moduleName?: ?string): string {
    const moduleName = _moduleName || "";

    const key = from + path.delimiter + moduleName;
    if (this._moduleIDCache[key]) {
      return this._moduleIDCache[key];
    }

    const moduleType = this._getModuleType(moduleName);
    const absolutePath = this._getAbsolutPath(from, moduleName);

    const sep = path.delimiter;
    const id = moduleType + sep + (absolutePath ? absolutePath + sep : "");

    return this._moduleIDCache[key] = id;
  }

  _getModuleType(moduleName: string): "node" | "user" {
    return this.isCoreModule(moduleName) ? "node" : "user";
  }

  _getAbsolutPath(from: Path, moduleName: string): ?string {
    if (this.isCoreModule(moduleName)) {
      return moduleName;
    }
    return this.getModule(moduleName);
  }

  _isModuleResolved(from: Path, moduleName: string): boolean {
    return !!this.getModule(moduleName);
  }
}

export default Resolver;
