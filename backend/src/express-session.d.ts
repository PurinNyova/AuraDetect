import "express-session";

declare module "express-session" {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface SessionData {
    userId?: number;
  }
}
