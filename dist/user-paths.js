import { homedir } from "node:os";
import path from "node:path";








function userHome(options                 )         {
  const environment = options.environment ?? process.env;
  return options.home ?? environment.HOME ?? environment.USERPROFILE ?? homedir() ?? options.cwd ?? process.cwd();
}

export function userConfigDir(options                  = {})         {
  const environment = options.environment ?? process.env;
  if (environment.XDG_CONFIG_HOME) return path.join(environment.XDG_CONFIG_HOME, "k-teach");
  if ((options.platform ?? process.platform) === "win32" && environment.APPDATA) {
    return path.join(environment.APPDATA, "k-teach");
  }
  return path.join(userHome(options), ".config", "k-teach");
}

export function userCacheDir(options                  = {})         {
  const environment = options.environment ?? process.env;
  if (environment.XDG_CACHE_HOME) return path.join(environment.XDG_CACHE_HOME, "k-teach");
  if ((options.platform ?? process.platform) === "win32") {
    const local = environment.LOCALAPPDATA ?? environment.APPDATA;
    if (local) return path.join(local, "k-teach", "cache");
  }
  return path.join(userHome(options), ".cache", "k-teach");
}


//# sourceURL=k-teach/src/user-paths.ts