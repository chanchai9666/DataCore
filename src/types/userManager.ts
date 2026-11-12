export interface DbUser {
  name: string;
  host?: string;
  isSuperuser: boolean;
  canLogin: boolean;
  canCreateDb: boolean;
  canCreateRole: boolean;
  validUntil?: string;
  roles?: string[];
}

export interface CreateUserOptions {
  name: string;
  host?: string;
  password?: string;
  isSuperuser?: boolean;
  canLogin?: boolean;
  canCreateDb?: boolean;
  canCreateRole?: boolean;
}
