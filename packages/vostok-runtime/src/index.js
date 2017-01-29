// @flow
// this module is adapted from https://github.com/facebook/jest/blob/master/packages/jest-resolve/src/index.js
// part of Jest, licenced under the BSD licence

import type { Config, Path } from "types/Config";
import type { HasteContext } from "types/HasteMap";
import type { ModuleMap } from "jest-haste-map";

import HasteMap from "jest-haste-map";
import Resolver from "jest-resolve";

import fs from "graceful-fs";
import path from "path";
import stripBOM from "strip-bom";

import { createDirectory, replacePathSepForRegex } from "./utils";
import transform, { EVAL_RESULT_VARIABLE } from "./transform";

type Module = {|
  children?: Array<any>,
  exports: any,
  filename: string,
  id: string,
  parent?: Module,
  paths?: Array<Path>,
  require?: Function,
|};

type HasteMapOptions = {| console?: typeof console, maxWorkers: number, resetCache: boolean, watch?: boolean |};

type InternalModuleOptions = {| isInternalModule: boolean |};

const getModuleNameMapper = (config: Config) => {
  if (config.moduleNameMapper.length) {
    return config.moduleNameMapper.map(([ regex, moduleName ]) => {
      return { moduleName, regex: new RegExp(regex) };
    });
  }
  return null;
};

class Runtime {
  _config: Config;
  _currentlyExecutingModulePath: string;
  _environment: any;
  _moduleRegistry: { [key: string]: Module };
  _internalModuleRegistry: { [key: string]: Module };
  _resolver: Resolver;
  _typePattern: ?RegExp;
  _modelPattern: ?RegExp;
  _rolePattern: ?RegExp;

  constructor(config: Config, environment: any, resolver: Resolver) {
    this._moduleRegistry = Object.create(null);
    this._internalModuleRegistry = Object.create(null);
    this._config = config;
    this._environment = environment;
    this._resolver = resolver;

    this._currentlyExecutingModulePath = "";
    this._typePattern = config.typePattern ? new RegExp(replacePathSepForRegex(config.typePattern)) : null;
    this._modelPattern = config.modelPattern ? new RegExp(replacePathSepForRegex(config.modelPattern)) : null;
    this._rolePattern = config.rolePattern ? new RegExp(replacePathSepForRegex(config.rolePattern)) : null;

    this.resetModules();

    if (config.setupFiles.length) {
      for (let i = 0; i < config.setupFiles.length; i++) {
        this.requireModule(config.setupFiles[i]);
      }
    }
  }

  static createHasteContext(
    config: Config,
    options: { console?: typeof console, maxWorkers: number, watch?: boolean },
  ): Promise<HasteContext> {
    createDirectory(config.cacheDirectory);
    const instance = Runtime.createHasteMap(config, {
      console: options.console,
      maxWorkers: options.maxWorkers,
      resetCache: !config.cache,
      watch: options.watch,
    });
    return instance
      .build()
      .then(
        hasteMap => ({
          hasteFS: hasteMap.hasteFS,
          moduleMap: hasteMap.moduleMap,
          resolver: Runtime.createResolver(config, hasteMap.moduleMap),
        }),
        error => {
          throw error;
        },
      );
  }

  static createHasteMap(config: Config, options?: HasteMapOptions): HasteMap {
    const ignorePattern = new RegExp([ config.cacheDirectory ].concat(config.modulePathIgnorePatterns).join("|"));

    return new HasteMap({
      cacheDirectory: config.cacheDirectory,
      console: options && options.console,
      extensions: config.moduleFileExtensions,
      ignorePattern,
      maxWorkers: options && options.maxWorkers || 1,
      name: config.name,
      platforms: config.haste.platforms || [ "ios", "android" ],
      providesModuleNodeModules: config.haste.providesModuleNodeModules,
      resetCache: options && options.resetCache,
      retainAllFiles: false,
      roots: config.testPathDirs,
      useWatchman: config.watchman,
      watch: options && options.watch,
    });
  }

  static createResolver(config: Config, moduleMap: ModuleMap): Resolver {
    return new Resolver(moduleMap, {
      browser: config.browser,
      defaultPlatform: config.haste.defaultPlatform,
      extensions: config.moduleFileExtensions.map(extension => "." + extension),
      hasCoreModules: true,
      moduleDirectories: config.moduleDirectories,
      moduleNameMapper: getModuleNameMapper(config),
      modulePaths: config.modulePaths,
      platforms: config.haste.platforms,
    });
  }

  requireModule(from: Path, moduleName?: string, options: ?InternalModuleOptions) {
    let modulePath;

    const moduleRegistry = !options || !options.isInternalModule ? this._moduleRegistry : this._internalModuleRegistry;

    if (moduleName && this._resolver.isCoreModule(moduleName)) {
      // $FlowFixMe
      return require(moduleName);
    }

    if (!modulePath) {
      modulePath = this._resolveModule(from, moduleName);
    }

    if (!moduleRegistry[modulePath]) {
      // We must register the pre-allocated module object first so that any
      // circular dependencies that may arise while evaluating the module can
      // be satisfied.
      const localModule = { exports: {}, filename: modulePath, id: modulePath };
      moduleRegistry[modulePath] = localModule;
      if (path.extname(modulePath) === ".json") {
        localModule.exports = this._environment.global.JSON.parse(stripBOM(fs.readFileSync(modulePath, "utf8")));
      } else if (path.extname(modulePath) === ".node") {
        // $FlowFixMe
        localModule.exports = require(modulePath);
      } else {
        this._execModule(localModule, options);
      }
    }
    return moduleRegistry[modulePath].exports;
  }

  requireInternalModule(from: Path, to?: string) {
    return this.requireModule(from, to, { isInternalModule: true });
  }

  resetModules() {
    this._moduleRegistry = Object.create(null);

    if (this._environment && this._environment.global) {
      const envGlobal = this._environment.global;
      Object.keys(envGlobal).forEach(key => {
        const globalMock = envGlobal[key];
        if (typeof globalMock === "object" && globalMock !== null || typeof globalMock === "function") {
          globalMock._isMockFunction && globalMock.mockClear();
        }
      });

      if (envGlobal.mockClearTimers) {
        envGlobal.mockClearTimers();
      }
    }
  }

  getAllCoverageInfo() {
    return this._environment.global.__coverage__;
  }

  _resolveModule(from: Path, to?: ?string) {
    return to ? this._resolver.resolveModule(from, to) : from;
  }

  _execModule(localModule: Module, options: ?InternalModuleOptions) {
    // If the environment was disposed, prevent this module from being executed.
    if (!this._environment.global) {
      return;
    }

    const isInternalModule = !!(options && options.isInternalModule);
    const filename = localModule.filename;
    const lastExecutingModulePath = this._currentlyExecutingModulePath;
    this._currentlyExecutingModulePath = filename;

    const dirname = path.dirname(filename);
    localModule.children = [];
    localModule.paths = this._resolver.getModulePaths(dirname);
    localModule.require = this._createRequireImplementation(filename, options);

    const script = transform(filename, this._config, { isInternalModule });

    const wrapper = this._environment.runScript(script)[EVAL_RESULT_VARIABLE];
    wrapper.call(
      localModule.exports,
      // module context
      localModule,
      // module object
      localModule.exports,
      // module exports
      localModule.require,
      // require implementation
      dirname,
      // __dirname
      filename,
      // __filename
      this._environment.global,
      // global object
      // jest object
      this._createRuntimeFor(filename),
    );
    this._currentlyExecutingModulePath = lastExecutingModulePath;
  }

  _createRequireImplementation(from: Path, options: ?InternalModuleOptions) {
    const moduleRequire = options && options.isInternalModule
      ? (moduleName: string) => this.requireInternalModule(from, moduleName)
      : this.requireModule.bind(this, from);
    moduleRequire.cache = Object.create(null);
    moduleRequire.extensions = Object.create(null);
    moduleRequire.requireActual = this.requireModule.bind(this, from);
    moduleRequire.resolve = moduleName => this._resolveModule(from, moduleName);
    return moduleRequire;
  }

  _createRuntimeFor(from: Path) {
    const resetModules = () => {
      this.resetModules();
      return runtime;
    };
    const runtime = { resetModules };
    return runtime;
  }
}

module.exports = Runtime;
