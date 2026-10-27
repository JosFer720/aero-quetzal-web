import type { SessionUser } from "@aeroquetzal/api-contracts";
import type { AppRole } from "@aeroquetzal/domain";
import { Client, InvalidCredentialsError } from "ldapts";

import type { AuthConfig } from "./config.js";

export interface DirectoryIdentity {
  username: string;
  displayName: string;
  groups: string[];
}

export interface Directory {
  authenticate(username: string, password: string): Promise<DirectoryIdentity | null>;
}

export class DirectoryUnavailableError extends Error {
  constructor() {
    super("El directorio no está disponible");
  }
}

export const LDAP_GROUP_ROLES: Readonly<Record<string, AppRole>> = {
  ti: "admin",
  operadores: "operator",
  checkin: "checkin_agent",
  monitoreo: "viewer",
};

export function mapIdentity(identity: DirectoryIdentity): SessionUser | null {
  const roles = [...new Set(identity.groups.flatMap(
    (group) => Object.hasOwn(LDAP_GROUP_ROLES, group.toLowerCase())
      ? [LDAP_GROUP_ROLES[group.toLowerCase()]!]
      : [],
  ))];
  return roles.length ? {
    username: identity.username,
    displayName: identity.displayName,
    roles,
  } : null;
}

export function escapeFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (character) =>
    `\\${character.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

export class LdapDirectory implements Directory {
  constructor(
    private readonly config: AuthConfig,
    private readonly createClient = () => new Client({
      url: config.LDAP_URL,
      timeout: config.LDAP_TIMEOUT_MS,
      connectTimeout: config.LDAP_TIMEOUT_MS,
      tlsOptions: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    }),
  ) {}

  async authenticate(username: string, password: string): Promise<DirectoryIdentity | null> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(username) || !password) {
      return null;
    }
    const client = this.createClient();
    const userDn = `uid=${username},${this.config.LDAP_PEOPLE_OU},${this.config.LDAP_BASE_DN}`;
    try {
      await client.bind(userDn, password);
      const { searchEntries: users } = await client.search(userDn, {
        scope: "base",
        filter: "(objectClass=*)",
        attributes: ["displayName", "cn"],
        sizeLimit: 1,
      });
      const { searchEntries: groups } = await client.search(
        `${this.config.LDAP_GROUPS_OU},${this.config.LDAP_BASE_DN}`,
        {
          scope: "one",
          filter: `(|(member=${escapeFilter(userDn)})(uniqueMember=${escapeFilter(userDn)})(memberUid=${escapeFilter(username)}))`,
          attributes: ["cn"],
          sizeLimit: 100,
        },
      );
      const name = users[0]?.displayName ?? users[0]?.cn;
      return {
        username,
        displayName: (typeof name === "string" ? name : username).slice(0, 120),
        groups: groups.flatMap((group) => {
          const names = Array.isArray(group.cn) ? group.cn : [group.cn];
          return names.filter((name): name is string => typeof name === "string");
        }),
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) return null;
      throw new DirectoryUnavailableError();
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}

export class MockDirectory implements Directory {
  constructor(
    private readonly users: Readonly<Record<string, {
      password: string;
      displayName: string;
      groups: string[];
    }>>,
  ) {}

  async authenticate(username: string, password: string): Promise<DirectoryIdentity | null> {
    const user = Object.hasOwn(this.users, username) ? this.users[username] : undefined;
    return user && user.password === password
      ? { username, displayName: user.displayName, groups: [...user.groups] }
      : null;
  }
}
