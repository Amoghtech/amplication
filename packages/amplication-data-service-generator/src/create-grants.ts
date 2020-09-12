import difference from "@extra-set/difference";
import { FullEntity } from "./types";
import * as models from "./models";
import { Module } from "./util/module";

type Action =
  | "create:any"
  | "read:any"
  | "update:any"
  | "delete:any"
  | "create:own"
  | "read:own"
  | "update:own"
  | "delete:own";

/**
 * Defines grant for a role to apply an action for a resource with attributes
 * @see https://github.com/onury/accesscontrol#defining-all-grants-at-once
 */
export type Grant = {
  role: string;
  resource: string;
  action: Action;
  attributes: string;
};

/**
 * Matches all resource attributes (glob notation)
 */
export const ALL_ATTRIBUTES_MATCHER = "*";

// ACL actions
export const CREATE_ANY: Action = "create:any";
export const DELETE_ANY: Action = "delete:any";
export const READ_ANY: Action = "read:any";
export const UPDATE_ANY: Action = "update:any";
export const READ_OWN: Action = "read:own";

export const GRANTS_MODULE_PATH = "grants.json";

/**
 * Creates a grants module from given entities and roles.
 * @param entities entities to create grants according to
 * @param roles all the existing roles
 * @returns grants JSON module
 */
export function createGrantsModule(
  entities: FullEntity[],
  roles: models.AppRole[]
): Module {
  return {
    path: GRANTS_MODULE_PATH,
    code: JSON.stringify(createGrants(entities, roles), null, 2),
  };
}

export function createGrants(
  entities: FullEntity[],
  roles: models.AppRole[]
): Grant[] {
  const grants: Grant[] = [];
  for (const entity of entities) {
    for (const permission of entity.permissions) {
      if (permission.type === models.EnumEntityPermissionType.Disabled) {
        continue;
      }
      const roleToFields: Record<string, Set<string>> = {};
      const fieldsWithRoles = new Set<string>();
      if (permission.permissionFields) {
        for (const permissionField of permission.permissionFields) {
          if (!permissionField.permissionFieldRoles) {
            throw new Error("permissionFieldRoles must be an array");
          }
          for (const permissionFieldRole of permissionField.permissionFieldRoles) {
            const role = permissionFieldRole.appRole.name;
            if (!(role in roleToFields)) {
              roleToFields[role] = new Set();
            }
            const { field } = permissionField;
            roleToFields[role].add(field.name);
            fieldsWithRoles.add(field.name);
          }
        }
      }
      switch (permission.type) {
        case models.EnumEntityPermissionType.AllRoles: {
          for (const role of roles) {
            grants.push({
              role: role.name,
              resource: entity.name,
              action: actionToACLAction[permission.action],
              /** @todo */
              attributes: ALL_ATTRIBUTES_MATCHER,
            });
          }
          break;
        }
        case models.EnumEntityPermissionType.Granular: {
          if (!permission.permissionRoles) {
            throw new Error(
              "For granular permissions, permissionRoles must be defined"
            );
          }
          for (const { appRole } of permission.permissionRoles) {
            const fields = roleToFields[appRole.name] || new Set();
            /** Set of fields allowed other roles */
            const forbiddenFields = difference(fieldsWithRoles, fields);
            const attributes = createAttributes([
              ALL_ATTRIBUTES_MATCHER,
              ...Array.from(forbiddenFields, (field: string) =>
                createNegativeAttributeMatcher(field)
              ),
            ]);
            grants.push({
              role: appRole.name,
              resource: entity.name,
              action: actionToACLAction[permission.action],
              attributes,
            });
          }
          break;
        }
        default: {
          throw new Error(`Unexpected type: ${permission.type}`);
        }
      }
    }
  }
  return grants;
}

/** Combines attribute matchers to an attributes expression (glob notation) */
export function createAttributes(matchers: string[]): string {
  return matchers.join(",");
}

/**
 * @param attribute attribute name to exclude
 * @returns a matcher which unmatches a specific attribute (glob notation)
 */
export function createNegativeAttributeMatcher(attribute: string): string {
  return `!${attribute}`;
}

const actionToACLAction: { [key in models.EnumEntityAction]: Action } = {
  [models.EnumEntityAction.Create]: CREATE_ANY,
  [models.EnumEntityAction.Delete]: DELETE_ANY,
  [models.EnumEntityAction.Search]: READ_ANY,
  [models.EnumEntityAction.Update]: UPDATE_ANY,
  [models.EnumEntityAction.View]: READ_OWN,
};