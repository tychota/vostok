import mkdirp from "mkdirp";
import path from "path";

export const replacePathSepForRegex = (string: string) => {
  if (path.sep === "\\") {
    return string.replace(/(\/|\\(?!\.))/g, "\\\\");
  }
  return string;
};

export const createDirectory = (path: string) => {
  try {
    mkdirp.sync(path, "777");
  } catch (e) {
    if (e.code !== "EEXIST") {
      throw e;
    }
  }
};
